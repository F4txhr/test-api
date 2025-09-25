const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { addCloudflareConfig, getCloudflareConfig } = require('./database');

// --- Cloudflare API Verification ---
async function verifyCloudflareCredentials(api_token, account_id, { zone_id, worker_name }) {
  if (zone_id) {
    // GraphQL query for Zone verification
    const query = `query { viewer { accounts(filter: {accountTag: "${account_id}"}) { zones(filter: {zoneTag: "${zone_id}"}) { zoneTag } } } }`;
    try {
      const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api_token}` },
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
    // REST API call for Worker verification
    const url = `https://api.cloudflare.com/client/v4/accounts/${account_id}/workers/scripts/${worker_name}`;
    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${api_token}` }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        return { success: true };
      } else {
        console.error('Cloudflare API Error:', data.errors);
        return { success: false, error: `Worker '${worker_name}' not found or invalid permissions.` };
      }
    } catch (error) {
      console.error('Error verifying Cloudflare worker:', error);
      return { success: false, error: 'Failed to connect to Cloudflare API for worker verification.' };
    }
  }
  return { success: false, error: 'Internal error: No verification method available.' };
}

// --- Registration Handler ---
async function handleRegistration(req, res) {
  const { cf_api_token, cf_account_id, cf_zone_id, cf_worker_name } = req.body;

  if (!cf_api_token || !cf_account_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: cf_api_token, cf_account_id',
    });
  }

  if (!cf_zone_id && !cf_worker_name) {
    return res.status(400).json({
      success: false,
      error: 'Please provide either cf_zone_id or cf_worker_name',
    });
  }

  // Verify credentials with Cloudflare
  const verificationResult = await verifyCloudflareCredentials(cf_api_token, cf_account_id, { zone_id: cf_zone_id, worker_name: cf_worker_name });
  if (!verificationResult.success) {
    return res.status(401).json({ success: false, error: verificationResult.error });
  }

  // Generate a unique ID and save to the database
  const unique_id = uuidv4();
  const dbResult = addCloudflareConfig(unique_id, cf_api_token, cf_account_id, { zone_id: cf_zone_id, worker_name: cf_worker_name });

  if (!dbResult.success) {
    return res.status(500).json({ success: false, error: dbResult.error });
  }

  res.status(201).json({
    success: true,
    message: 'Successfully registered. Use this ID to access your stats.',
    unique_id: unique_id,
  });
}

// --- GraphQL Queries for Cloudflare Analytics ---
function getZoneAnalyticsQuery(zone_id, since, until) {
  return `
    query {
      viewer {
        zones(filter: { zoneTag: "${zone_id}" }) {
          httpRequestsAdaptiveGroups(
            filter: { date_geq: "${since}", date_lt: "${until}" },
            limit: 1
          ) {
            sum { requests, bytes }
          }
        }
      }
    }
  `;
}

function getWorkerAnalyticsQuery(account_id, worker_name, since, until) {
  return `
    query {
      viewer {
        accounts(filter: { accountTag: "${account_id}" }) {
          workersInvocationsAdaptive(
            filter: {
              datetime_geq: "${since}T00:00:00Z",
              datetime_lt: "${until}T00:00:00Z",
              scriptName: "${worker_name}"
            },
            limit: 1
          ) {
            sum { requests, subrequests }
          }
        }
      }
    }
  `;
}

// --- Data Fetching Handler ---
async function handleDataRequest(req, res) {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Missing unique ID.' });
  }

  const config = getCloudflareConfig(id);
  if (!config) {
    return res.status(404).json({ success: false, error: 'ID not found.' });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  let query;
  if (config.cf_zone_id) {
    query = getZoneAnalyticsQuery(config.cf_zone_id, today, tomorrowStr);
  } else if (config.cf_worker_name) {
    query = getWorkerAnalyticsQuery(config.cf_account_id, config.cf_worker_name, today, tomorrowStr);
  } else {
    return res.status(500).json({ success: false, error: 'Invalid configuration found.' });
  }

  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.cf_api_token}` },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();

    if (data.errors) {
      console.error('Cloudflare API Error:', data.errors);
      return res.status(500).json({ success: false, error: 'Failed to fetch data from Cloudflare.' });
    }

    let responseData;
    if (config.cf_zone_id) {
      const analytics = data.data.viewer.zones[0].httpRequestsAdaptiveGroups[0]?.sum || { requests: 0, bytes: 0 };
      responseData = {
        type: 'zone',
        zone_id: config.cf_zone_id,
        total_requests_today: analytics.requests,
        total_bandwidth_today_bytes: analytics.bytes,
      };
    } else {
      const analytics = data.data.viewer.accounts[0].workersInvocationsAdaptive[0]?.sum || { requests: 0, subrequests: 0 };
      responseData = {
        type: 'worker',
        worker_name: config.cf_worker_name,
        total_requests_today: analytics.requests,
        total_subrequests_today: analytics.subrequests,
        note: 'Bandwidth data is not available for worker-level analytics.',
      };
    }

    res.status(200).json({ success: true, data: responseData });

  } catch (error) {
    console.error('Error fetching Cloudflare data:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}


module.exports = {
  handleRegistration,
  handleDataRequest,
};