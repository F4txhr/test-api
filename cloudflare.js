const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const {
  addCloudflareConfig,
  getCloudflareConfig,
  getRawCloudflareConfig,
  deleteCloudflareConfig,
  decrypt,
  addWorkerStats,
  getWorkerStats,
  findExistingConfig,
} = require('./database');
const { sendTelegramAlert } = require('./telegram');

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36';

// --- Cloudflare API Verification ---
async function verifyCloudflareCredentials(api_token, account_id, { zone_id, worker_name }) {
  if (zone_id) {
    // GraphQL query for Zone verification
    const query = `query { viewer { accounts(filter: {accountTag: "${account_id}"}) { zones(filter: {zoneTag: "${zone_id}"}) { zoneTag } } } }`;
    try {
      const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api_token}`,
          'User-Agent': BROWSER_USER_AGENT
        },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      if (data.errors) {
        console.error('Cloudflare API Error:', data.errors);
        return { success: false, error: 'Invalid credentials or permissions for Zone.' };
      }
      const zones = data.data?.viewer?.accounts[0]?.zones;
      if (zones && zones.length > 0 && zones[0].zoneTag === zone_id) {
        return { success: true };
      } else {
        return { success: false, error: 'Account ID or Zone ID mismatch.' };
      }
    } catch (error) {
      console.error('Error verifying Cloudflare zone:', error);
      return { success: false, error: 'Failed to connect to Cloudflare API for zone verification.' };
    }
  } else if (worker_name) {
    // GraphQL query for Worker verification (less likely to be blocked)
    const query = `query { viewer { accounts(filter: {accountTag: "${account_id}"}) { workerScripts(filter: {scriptName: "${worker_name}"}) { scriptName } } } }`;
    try {
      const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api_token}`,
          'User-Agent': BROWSER_USER_AGENT
        },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      if (data.errors) {
        console.error('Cloudflare GraphQL Error:', data.errors);
        return { success: false, error: 'Invalid credentials or permissions for Worker (GraphQL).' };
      }
      const scripts = data.data?.viewer?.accounts[0]?.workersScripts;
      if (scripts && scripts.length > 0 && scripts[0].scriptName === worker_name) {
        return { success: true };
      } else {
        return { success: false, error: `Worker '${worker_name}' not found in account.` };
      }
    } catch (error) {
      console.error('Error verifying Cloudflare worker via GraphQL:', error);
      return { success: false, error: 'Failed to connect to Cloudflare API for worker verification (GraphQL).' };
    }
  }
  return { success: false, error: 'Internal error: No verification method available.' };
}

// --- Registration Handler ---
async function handleRegistration(req, res) {
  const { cf_api_token, cf_account_id, cf_zone_id, cf_worker_name } = req.body;

  // 1. Validasi Input Dasar
  if (!cf_api_token || !cf_account_id) {
    return res.status(400).json({
      success: false,
      error: 'Field `cf_api_token` dan `cf_account_id` wajib diisi.',
    });
  }

  // Memastikan setidaknya salah satu (zona atau worker) disediakan
  if (!cf_zone_id && !cf_worker_name) {
    return res.status(400).json({
      success: false,
      error: 'Harap sediakan `cf_zone_id` (untuk pemantauan bandwidth) atau `cf_worker_name` (untuk pemantauan worker).',
    });
  }

  // 2. Pemeriksaan Duplikat
  const existingConfig = findExistingConfig({ account_id: cf_account_id, zone_id: cf_zone_id, worker_name: cf_worker_name });
  if (existingConfig) {
    const { type, id } = existingConfig;
    const resourceName = type === 'worker' ? `Worker "${cf_worker_name}"` : `Zone ID "${cf_zone_id}"`;
    return res.status(409).json({ // 409 Conflict
      success: false,
      error: `Konfigurasi duplikat: ${resourceName} sudah terdaftar untuk akun ini dengan ID unik: ${id}.`,
      existing_unique_id: id,
    });
  }

  // 3. Verifikasi Kredensial dengan Cloudflare (opsional, tapi praktik yang baik)
  // Untuk saat ini, verifikasi dinonaktifkan sesuai logika sebelumnya.
  // const verification = await verifyCloudflareCredentials(cf_api_token, cf_account_id, { zone_id: cf_zone_id, worker_name: cf_worker_name });
  // if (!verification.success) {
  //   return res.status(403).json({ success: false, error: `Verifikasi Cloudflare gagal: ${verification.error}` });
  // }

  // 4. Buat Konfigurasi Baru
  const unique_id = uuidv4();
  const dbResult = addCloudflareConfig(unique_id, cf_api_token, cf_account_id, { zone_id: cf_zone_id, worker_name: cf_worker_name });

  if (!dbResult.success) {
    return res.status(500).json({ success: false, error: dbResult.error });
  }

  res.status(201).json({
    success: true,
    message: 'Registrasi berhasil. Gunakan ID unik ini untuk mengakses statistik Anda.',
    unique_id: unique_id,
  });
}

// --- GraphQL Query Builder ---
function getComprehensiveAnalyticsQuery(config, since, until) {
  const { cf_account_id, cf_zone_id, cf_worker_name } = config;

  // Bagian kueri untuk statistik global akun (selalu ada)
  const accountGlobalStats = `
    accountRequests: httpRequests1dGroups(
      limit: 1,
      filter: { date_geq: "${since}", date_lt: "${until}" }
    ) {
      sum { requests }
    }
  `;

  // Bagian kueri untuk statistik zona (jika zone_id ada)
  const zoneStats = cf_zone_id ? `
    zone: zones(filter: { zoneTag: "${cf_zone_id}" }) {
      zoneBandwidth: httpRequestsAdaptiveGroups(
        filter: { date_geq: "${since}", date_lt: "${until}" },
        limit: 1
      ) {
        sum { edgeResponseBytes }
      }
    }
  ` : '';

  // Bagian kueri untuk statistik worker (jika worker_name ada)
  const workerStats = cf_worker_name ? `
    workerInvocations: workersInvocationsAdaptive(
      filter: {
        datetime_geq: "${since}T00:00:00Z",
        datetime_lt: "${until}T00:00:00Z",
        scriptName: "${cf_worker_name}"
      },
      limit: 1
    ) {
      sum { requests, subrequests, errors }
      quantiles { cpuTimeP50, cpuTimeP90, cpuTimeP99 }
    }
  ` : '';

  // Gabungkan semua bagian menjadi satu kueri
  return `
    query {
      viewer {
        accounts(filter: { accountTag: "${cf_account_id}" }) {
          ${accountGlobalStats}
          ${workerStats}
          ${zoneStats}
        }
      }
    }
  `;
}

// --- Data Fetching Handler ---
async function handleDataRequest(req, res) {
  const { id } = req.params;
  const { since, until } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Missing unique ID.' });
  }

  const config = getCloudflareConfig(id);
  if (!config) {
    return res.status(404).json({ success: false, error: 'ID not found.' });
  }

  const today = new Date().toISOString().slice(0, 10);

  // --- Logika Histori (Hanya Worker) ---
  if (since && until && until < today) {
    if (!config.cf_worker_name) {
      return res.status(400).json({ success: false, error: 'Historical data is only available for workers.' });
    }
    const historicalData = getWorkerStats(config.id, since, until);
    return res.status(200).json({
      success: true,
      data_source: 'database_history',
      period: { since, until },
      data: historicalData,
    });
  }

  // --- Pengambilan Data Langsung dari API ---
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const query = getComprehensiveAnalyticsQuery(config, today, tomorrowStr);

  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.cf_api_token}` },
      body: JSON.stringify({ query }),
    });

    const result = await response.json();
    if (result.errors) {
      console.error('Cloudflare API Error:', JSON.stringify(result.errors, null, 2));
      return res.status(500).json({
        success: false,
        error: 'Gagal mengambil data dari Cloudflare. Cek log server untuk detail teknis.'
      });
    }

    const accountData = result.data.viewer.accounts[0] || {};
    const zoneData = result.data.viewer.zone || {};

    // Inisialisasi objek respons
    const responseData = {
      global_stats: {
        total_requests: accountData.accountRequests?.[0]?.sum?.requests || 0,
      },
    };

    // Tambahkan data zona jika ada
    if (config.cf_zone_id && zoneData.zoneBandwidth) {
      responseData.zone_stats = {
        bandwidth_bytes: zoneData.zoneBandwidth[0]?.sum?.edgeResponseBytes || 0,
      };
    }

    // Tambahkan data worker jika ada
    if (config.cf_worker_name && accountData.workerInvocations) {
      const invocation = accountData.workerInvocations[0] || {};
      const sum = invocation.sum || {};
      const quantiles = invocation.quantiles || {};

      const workerStats = {
        requests: sum.requests || 0,
        subrequests: sum.subrequests || 0,
        errors: sum.errors || 0,
        cpu_time_p50: quantiles.cpuTimeP50,
        cpu_time_p90: quantiles.cpuTimeP90,
        cpu_time_p99: quantiles.cpuTimeP99,
      };
      responseData.worker_stats = workerStats;

      // Simpan histori & kirim notifikasi untuk worker
      addWorkerStats(config.id, today, workerStats);
      const ERROR_THRESHOLD = 100;
      if (workerStats.errors > ERROR_THRESHOLD) {
        const message = `Worker "${config.cf_worker_name}" has recorded ${workerStats.errors} errors today.`;
        sendTelegramAlert(message, true);
      }
    }

    res.status(200).json({
      success: true,
      data_source: 'cloudflare_api',
      period: { since: today, until: today },
      data: [responseData],
    });

  } catch (error) {
    console.error('Error fetching Cloudflare data:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}


// --- Deletion Handler ---
async function handleDeleteRegistration(req, res) {
  const { id } = req.params;
  const { cf_api_token } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Missing unique ID.' });
  }
  if (!cf_api_token) {
    return res.status(400).json({ success: false, error: 'Missing cf_api_token for verification.' });
  }

  // 1. Get the raw config with the encrypted token
  const rawConfig = getRawCloudflareConfig(id);
  if (!rawConfig) {
    return res.status(404).json({ success: false, error: 'ID not found.' });
  }

  // 2. Decrypt the stored token
  const storedToken = decrypt(rawConfig.cf_api_token);

  // 3. Securely compare the provided token with the decrypted stored token
  if (storedToken !== cf_api_token) {
    return res.status(403).json({ success: false, error: 'Invalid API token. Deletion denied.' });
  }

  // 4. Proceed with deletion if tokens match
  const result = deleteCloudflareConfig(id);

  if (result.success) {
    res.status(200).json({ success: true, message: 'Registration and all associated data deleted successfully.' });
  } else {
    res.status(500).json({ success: false, error: result.error || 'Failed to delete registration.' });
  }
}

module.exports = {
  handleRegistration,
  handleDataRequest,
  handleDeleteRegistration,
};