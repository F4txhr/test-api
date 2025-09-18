// index.js — versi PRO: stats, alerting, auto-retry, metrics

const express = require('express');
const net = require('net');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ================================
// 📊 GLOBAL STATE (untuk /stats & /metrics)
// ================================
let totalRequests = 0;
let successCount = 0;
const startTime = Date.now();

// ================================
// 🤖 TELEGRAM ALERT SETUP
// ================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; // simpan di Railway Variables
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;     // simpan di Railway Variables

async function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("⚠️ Telegram alert disabled — token or chat_id not set");
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: `[PROXY DOWN ALERT]\n${message}`,
        parse_mode: 'Markdown',
      }),
    });
    console.log("✅ Telegram alert sent");
  } catch (error) {
    console.error("❌ Failed to send Telegram alert:", error.message);
  }
}

// ================================
// 🔁 AUTO-RETRY FUNCTION
// ================================
async function testTCPWithRetry(host, port, maxRetries = 2, baseTimeout = 5000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.createConnection(port, host);
        const timeout = baseTimeout + attempt * 1000; // tambah 1 detik tiap retry
        socket.setTimeout(timeout);

        socket.on('connect', () => {
          socket.end();
          resolve();
        });

        socket.on('error', (err) => {
          reject(err);
        });

        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error(`Timeout (${timeout}ms)`));
        });
      });
      return { success: true, attempt: attempt + 1, error: null };
    } catch (err) {
      if (attempt === maxRetries) {
        return { success: false, attempt: attempt + 1, error: err.message };
      }
      // Tunggu sebentar sebelum retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// ================================
// 🔍 ENDPOINT: /health?proxy=IP:PORT
// → TCP check + auto-retry + alerting + stats tracking
// ================================
app.get('/health', async (req, res) => {
  totalRequests++; // 👈 track for /stats

  const { proxy } = req.query;

  if (!proxy) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameter "proxy". Example: ?proxy=1.1.1.1:8080',
    });
  }

  const parts = proxy.includes(':') ? proxy.split(':') : [proxy, '80'];
  const host = parts[0];
  const port = parts[1];

  if (!host || !port || isNaN(port)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid proxy format. Use IP:PORT',
    });
  }

  const portNum = parseInt(port, 10);
  const testStart = Date.now();

  // 🔁 AUTO-RETRY (default: 2 retries)
  const maxRetries = parseInt(req.query.retries) || 2;
  const result = await testTCPWithRetry(host, portNum, maxRetries);

  const latency = Date.now() - testStart;
  const success = result.success;

  if (success) {
    successCount++;
  } else {
    // 🚨 ALERT ke Telegram jika proxy down (hanya jika env di-set)
    const alertMsg = `Proxy DOWN: ${proxy}\nLatency: ${latency}ms\nAttempt: ${result.attempt}\nError: ${result.error}\nTime: ${new Date().toISOString()}`;
    sendTelegramAlert(alertMsg);
  }

  const response = {
    success: success,
    proxy: proxy,
    status: success ? 'UP' : 'DOWN',
    latency_ms: latency,
    attempt: result.attempt,
    timestamp: new Date().toISOString(),
  };

  if (!success) {
    response.error = result.error;
  }

  res.status(success ? 200 : 503).json(response);
});

// ================================
// 📈 ENDPOINT: /stats
// → Lihat statistik penggunaan
// ================================
app.get('/stats', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const successRate = totalRequests > 0 ? ((successCount / totalRequests) * 100).toFixed(2) : 0;

  res.json({
    service: "Vortex-Api",
    uptime_seconds: uptimeSeconds,
    total_requests: totalRequests,
    success_count: successCount,
    failure_count: totalRequests - successCount,
    success_rate_percent: parseFloat(successRate),
    start_time: new Date(startTime).toISOString(),
  });
});

// ================================
// 🩺 ENDPOINT: /metrics (Prometheus format — untuk monitoring)
// ================================
app.get('/metrics', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const successRate = totalRequests > 0 ? (successCount / totalRequests) : 0;

  const metrics = `
Uptime: ${uptimeSeconds}

Total request ${totalRequests}

Success count ${successCount}

Success rate ${successRate}
  `.trim();

  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics);
});

// ================================
// 🧪 ENDPOINT: /ping (health check untuk load balancer/monitoring eksternal)
// ================================
app.get('/ping', (req, res) => {
  res.status(200).json({ status: 'Alive', uptime: Math.floor((Date.now() - startTime) / 1000) });
});

// Fallback
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found. Use /health?proxy=IP:PORT',
  });
});

app.listen(PORT, () => {
  console.log(`✅ Proxy Health Checker running on port ${PORT}`);
  console.log(`📊 Stats: /stats`);
  console.log(`🩺 Metrics: /metrics`);
  console.log(`🏓 Ping: /ping`);
});
