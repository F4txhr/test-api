document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = "https://test-api.up.railway.app";

  // Elemen utama
  const select = document.getElementById('registration-select');
  const refreshBtn = document.getElementById('refresh-button');
  const addBtn = document.getElementById('add-new-button');
  const editBtn = document.getElementById('edit-button');
  const delBtn = document.getElementById('delete-button');
  const historyBtn = document.getElementById('history-button');
  const statsDisplay = document.getElementById('stats-display');
  const loading = document.getElementById('loading-indicator');
  const errorBox = document.getElementById('error-message');

  const modals = {
    registration: document.getElementById('registration-modal'),
    update: document.getElementById('update-modal'),
    delete: document.getElementById('delete-modal'),
    history: document.getElementById('history-modal')
  };

  function closeAllModals() {
    for (const key in modals) {
      if (modals.hasOwnProperty(key)) {
        modals[key].classList.add('hidden');
      }
    }
  }
  function openModal(key) {
    closeAllModals();
    modals[key].classList.remove('hidden');
  }

  // --- Fungsi Helper ---
  const delay = ms => new Promise(res => setTimeout(res, ms));

  async function fetchWithRetry(url, retries = 3, delayMs = 2000) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url);
        if (!res.headers.get('content-type')?.includes('application/json')) {
          throw new Error(`Respons server tidak valid (percobaan ${i + 1}/${retries})`);
        }
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Error HTTP: ${res.status}`);
        }
        return await res.json(); // Berhasil
      } catch (e) {
        console.error(e.message);
        if (i < retries - 1) {
          showLoading(true, `Menghubungi server... (${i + 2}/${retries})`);
          await delay(delayMs);
        } else {
          throw e; // Gagal setelah semua percobaan
        }
      }
    }
  }

  // Fetch daftar
  async function fetchRegistrations() {
    showLoading(true, "Menghubungi server... (1/3)");
    try {
      const data = await fetchWithRetry(`${API_BASE_URL}/statscf/registrations`);
      if (data.success) {
        populateSelect(data.data);
      } else {
        // Jika API mengembalikan success: false
        throw new Error(data.error || "Gagal mengambil daftar registrasi.");
      }
    } catch (e) {
      showError(e.message);
    } finally {
      showLoading(false);
    }
  }

  function populateSelect(items) {
    select.innerHTML = `<option value="">-- Silakan pilih --</option>`;
    items.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.unique_id;
      opt.textContent = r.name;
      select.appendChild(opt);
    });
  }

  async function fetchStats() {
    if (!select.value) {
      statsDisplay.classList.add('hidden');
      return;
    }
    showLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/statscf/data/${select.value}`);
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error("Respons server tidak valid. Coba lagi nanti.");
      }
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Gagal ambil statistik.");
      displayStats(data.data[0]);
    } catch (e) {
      showError(e.message);
    } finally {
      showLoading(false);
    }
  }

  function displayStats(d) {
    if (!d) {
      statsDisplay.innerHTML = "<p>Tidak ada data.</p>";
      statsDisplay.classList.remove('hidden');
      return;
    }
    let html = `<h2>Ringkasan Statistik</h2>`;
    if (d.global_stats) {
      html += `<div class="stat-card"><h3>Global</h3>
        <p><strong>Total Permintaan:</strong> ${d.global_stats.total_requests}</p></div>`;
    }
    if (d.zone_stats) {
      html += `<div class="stat-card"><h3>Zona</h3>
        <p><strong>Total Bandwidth:</strong> ${formatBytes(d.zone_stats.bandwidth_bytes)}</p></div>`;
    }
    if (d.worker_stats) {
      html += `<div class="stat-card"><h3>Worker</h3>
        <p><strong>Permintaan:</strong> ${d.worker_stats.requests}</p>
        <p><strong>Error:</strong> ${d.worker_stats.errors}</p></div>`;
    }
    statsDisplay.innerHTML = html;
    statsDisplay.classList.remove('hidden');
  }

  function formatBytes(b) {
    if (b === 0) return "0 B";
    const k = 1024;
    const i = Math.floor(Math.log(b)/Math.log(k));
    const sizes = ["B","KB","MB","GB","TB"];
    return (b/Math.pow(k,i)).toFixed(2) + " " + sizes[i];
  }

  function showLoading(x, message = "Memuat data...") {
    loading.textContent = message;
    loading.classList.toggle('hidden', !x);
    if (x) statsDisplay.classList.add('hidden');
  }
  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.toggle('hidden', !msg);
    if (msg) statsDisplay.classList.add('hidden');
  }

  // Submit handler
  document.getElementById('registration-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      const res = await fetch(`${API_BASE_URL}/statscf`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error("Respons server tidak valid. Coba lagi nanti.");
      }
      const out = await res.json();
      if (!res.ok || !out.success) throw new Error(out.error || "Gagal daftar.");
      closeAllModals(); fetchRegistrations();
    } catch (err) {
      document.getElementById('modal-error-message').textContent = err.message;
      document.getElementById('modal-error-message').classList.remove('hidden');
    }
  });

  document.getElementById('update-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!select.value) return;
    const data = Object.fromEntries(new FormData(e.target).entries());

    // Hapus field opsional yang kosong agar tidak menimpa data yang ada
    if (!data.cf_worker_name) delete data.cf_worker_name;
    if (!data.cf_zone_id) delete data.cf_zone_id;
    if (!data.error_threshold) delete data.error_threshold;

    try {
      const res = await fetch(`${API_BASE_URL}/statscf/${select.value}`, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error("Respons server tidak valid. Coba lagi nanti.");
      }
      const out = await res.json();
      if (!res.ok || !out.success) throw new Error(out.error || "Gagal update.");
      closeAllModals(); fetchRegistrations();
    } catch (err) {
      const box = document.getElementById('update-modal-error-message');
      box.textContent = err.message; box.classList.remove('hidden');
    }
  });

  document.getElementById('history-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errorDiv = document.getElementById('history-error');
    const resultsDiv = document.getElementById('history-results');
    errorDiv.classList.add('hidden');
    resultsDiv.classList.add('hidden');

    const formData = new FormData(e.target);
    const since = formData.get('since');
    const until = formData.get('until');
    const selectedId = select.value;

    if (!selectedId) {
      errorDiv.textContent = "Silakan pilih konfigurasi terlebih dahulu.";
      errorDiv.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/statscf/data/${selectedId}?since=${since}&until=${until}`);
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error("Respons server tidak valid. Coba lagi nanti.");
      }
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Gagal mengambil data riwayat.');
      }
      displayHistory(result.data);
    } catch (err) {
      errorDiv.textContent = err.message;
      errorDiv.classList.remove('hidden');
    }
  });

  function displayHistory(data) {
    const resultsContainer = document.getElementById('history-results');
    const { summary, daily_data } = data;

    if (!summary || !daily_data || daily_data.length === 0) {
      resultsContainer.innerHTML = '<p>Tidak ada data riwayat untuk rentang tanggal yang dipilih.</p>';
      resultsContainer.classList.remove('hidden');
      return;
    }

    // Bangun tabel HTML
    let html = `
      <h4>Ringkasan Periode</h4>
      <ul>
        <li><strong>Total Permintaan:</strong> ${summary.total_requests.toLocaleString('id-ID')}</li>
        <li><strong>Total Error:</strong> ${summary.total_errors.toLocaleString('id-ID')}</li>
        <li><strong>CPU Time P50 Rata-rata:</strong> ${summary.average_cpu_p50.toFixed(2)}µs</li>
      </ul>
      <h4>Data Harian</h4>
      <table style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr>
            <th style="border-bottom: 1px solid #ddd; padding: 8px;">Tanggal</th>
            <th style="border-bottom: 1px solid #ddd; padding: 8px;">Permintaan</th>
            <th style="border-bottom: 1px solid #ddd; padding: 8px;">Error</th>
          </tr>
        </thead>
        <tbody>
    `;

    daily_data.forEach(day => {
      html += `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${day.date}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${day.requests.toLocaleString('id-ID')}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${day.errors.toLocaleString('id-ID')}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    resultsContainer.innerHTML = html;
    resultsContainer.classList.remove('hidden');
  }

  document.getElementById('delete-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!select.value) return;
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      const res = await fetch(`${API_BASE_URL}/statscf/${select.value}`, {
        method: 'DELETE', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({cf_api_token:data.cf_api_token})
      });
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error("Respons server tidak valid. Coba lagi nanti.");
      }
      const out = await res.json();
      if (!res.ok || !out.success) throw new Error(out.error || "Gagal hapus.");
      closeAllModals(); fetchRegistrations(); statsDisplay.classList.add('hidden');
    } catch (err) {
      const box = document.getElementById('delete-modal-error-message');
      box.textContent = err.message; box.classList.remove('hidden');
    }
  });

  // Event binding
  select.addEventListener('change', () => {
    fetchStats();
    const isDisabled = !select.value;
    editBtn.disabled = isDisabled;
    delBtn.disabled = isDisabled;
    historyBtn.disabled = isDisabled;
  });
  refreshBtn.addEventListener('click', fetchStats);
  addBtn.addEventListener('click', () => openModal('registration'));
  editBtn.addEventListener('click', () => openModal('update'));
  delBtn.addEventListener('click', () => openModal('delete'));
  historyBtn.addEventListener('click', () => openModal('history'));
  document.querySelectorAll('.close-button').forEach(btn => btn.addEventListener('click', closeAllModals));
  window.addEventListener('click', e => { if (e.target.classList.contains('modal')) closeAllModals(); });

  // Init
  closeAllModals();
  fetchRegistrations();
  setInterval(()=>fetch(`${API_BASE_URL}/ping`).catch(()=>{}), 5*60*1000);
});