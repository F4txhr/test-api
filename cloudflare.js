const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { addCloudflareConfig, getCloudflareConfig } = require('./database');

// --- Cloudflare API Verification ---
async function verifyCloudflareCredentials(api_token, account_id, zone_id) {
  const query = `
    query {
      viewer {
        accounts(filter: {accountTag: "${account_id}"}) {
          zones(filter: {zoneTag: "${zone_id}"}) {
            zoneTag
          }
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_token}`,
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();

    if (data.errors) {
      console.error('Cloudflare API Error:', data.errors);
      return { success: false, error: 'Invalid credentials or permissions.' };
    }

    const zones = data.data?.viewer?.accounts[0]?.zones;
    if (zones && zones.length > 0 && zones[0].zoneTag === zone_id) {
      return { success: true };
    } else {
      return { success: false, error: 'Account ID or Zone ID mismatch.' };
    }
  } catch (error) {
    console.error('Error verifying Cloudflare credentials:', error);
    return { success: false, error: 'Failed to connect to Cloudflare API.' };
  }
}

// --- Registration Handler ---
async function handleRegistration(req, res) {
  const { cf_api_token, cf_account_id, cf_zone_id } = req.body;

  if (!cf_api_token || !cf_account_id || !cf_zone_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: cf_api_token, cf_account_id, cf_zone_id',
    });
  }

  // Verify credentials with Cloudflare
  const verificationResult = await verifyCloudflareCredentials(cf_api_token, cf_account_id, cf_zone_id);
  if (!verificationResult.success) {
    return res.status(401).json({ success: false, error: verificationResult.error });
  }

  // Generate a unique ID and save to the database
  const unique_id = uuidv4();
  const dbResult = addCloudflareConfig(unique_id, cf_api_token, cf_account_id, cf_zone_id);

  if (!dbResult.success) {
    return res.status(500).json({ success: false, error: dbResult.error });
  }

  res.status(201).json({
    success: true,
    message: 'Successfully registered. Use this ID to access your stats.',
    unique_id: unique_id,
  });
}

// --- GraphQL Query for Cloudflare Analytics ---
function getAnalyticsQuery(zone_id, since, until) {
  return `
    query {
      viewer {
        zones(filter: { zoneTag: "${zone_id}" }) {
          httpRequestsAdaptiveGroups(
            filter: {
              date_geq: "${since}",
              date_lt: "${until}"
            },
            limit: 1,
            orderBy: [date_ASC]
          ) {
            sum {
              requests
              bytes
            }
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

  const query = getAnalyticsQuery(config.cf_zone_id, today, tomorrowStr);

  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.cf_api_token}`,
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();

    if (data.errors) {
      console.error('Cloudflare API Error:', data.errors);
      return res.status(500).json({ success: false, error: 'Failed to fetch data from Cloudflare.' });
    }

    const zoneData = data.data.viewer.zones[0];
    const analytics = zoneData.httpRequestsAdaptiveGroups[0]?.sum || { requests: 0, bytes: 0 };

    res.status(200).json({
      success: true,
      data: {
        total_requests_today: analytics.requests,
        total_bandwidth_today_bytes: analytics.bytes,
        note: 'Bandwidth per worker is not available via the Cloudflare Analytics API.',
      },
    });

  } catch (error) {
    console.error('Error fetching Cloudflare data:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}


module.exports = {
  handleRegistration,
  handleDataRequest,
};