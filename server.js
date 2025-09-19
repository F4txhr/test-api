// server.js
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const net = require('net');

// --- Perubahan Penting: Impor handler POST ---
// Sebelumnya hanya mengimpor handleConvertRequest untuk GET
// Sekarang kita impor kedua handler
const { handleConvertRequest, handleConvertPostRequest } = require('./converter');
// --- Akhir Perubahan ---

const app = express();
const PORT = process.env.PORT || 3000;

// --- Global State ---
let totalRequests = 0;
let successCount = 0;
const startTime = Date.now();

// --- Middleware ---
app.use(cors());
// Middleware untuk parsing JSON dan teks biasa dari body request
app.use(express.json({ limit: '10mb' })); // Naikkan limit jika perlu
app.use(express.text({ type: 'text/*', limit: '10mb' })); // Untuk teks mentah

// --- Logging Middleware ---
app.use((req, res, next) => {
  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  console.log(`[${now}] ${req.method} ${req.originalUrl}`);
  next();
});

// --- Telegram Alert ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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
        text: `[🚨 PROXY DOWN ALERT]\n${message}`,
        parse_mode: 'Markdown',
      }),
    });
    console.log("✅ Telegram alert sent");
  } catch (error) {
    console.error("❌ Failed to send Telegram alert:", error.message);
  }
}

// --- TCP Test with Retry ---
async function testTCPWithRetry(host, port, maxRetries = 2, baseTimeout = 5000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.createConnection(port, host);
        const timeout = baseTimeout + attempt * 1000;
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
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// --- Endpoint: /health ---
app.get('/health', async (req, res) => {
  totalRequests++;

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
  if (portNum < 1 || portNum > 65535) {
    return res.status(400).json({
      success: false,
      error: 'Port must be between 1 and 65535',
    });
  }

  const testStart = Date.now();
  const maxRetries = parseInt(req.query.retries) || 2;
  const result = await testTCPWithRetry(host, portNum, maxRetries);
  const latency = Date.now() - testStart;
  const success = result.success;

  if (success) {
    successCount++;
  } else {
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

// --- Endpoint: /stats ---
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

// --- Endpoint: /metrics ---
app.get('/metrics', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const failureCount = totalRequests - successCount;

  const metrics = `
# HELP vortex_uptime_seconds Service uptime in seconds
# TYPE vortex_uptime_seconds gauge
vortex_uptime_seconds ${uptimeSeconds}

# HELP vortex_total_requests Total number of health check requests
# TYPE vortex_total_requests counter
vortex_total_requests ${totalRequests}

# HELP vortex_success_count Number of successful proxy checks
# TYPE vortex_success_count counter
vortex_success_count ${successCount}

# HELP vortex_failure_count Number of failed proxy checks
# TYPE vortex_failure_count counter
vortex_failure_count ${failureCount}

# HELP vortex_success_rate_ratio Success rate (0.0 to 1.0)
# TYPE vortex_success_rate_ratio gauge
vortex_success_rate_ratio ${totalRequests > 0 ? (successCount / totalRequests) : 0}
  `.trim();

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics);
});

// --- Endpoint: /ping ---
app.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'Alive',
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    time_wib: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
  });
});

// ================================
// 🔄 ENDPOINT CONVERT — GET & POST
// ================================

// --- Endpoint GET (tetap ada untuk kompatibilitas) ---
app.get('/convert/:format', handleConvertRequest);

// --- Endpoint POST (baru untuk fleksibilitas tinggi) ---
// Menerima array link dalam body JSON: { "links": ["link1", "link2", ...] }
app.post('/convert/:format', handleConvertPostRequest);

// --- Fallback ---
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found. Use /health?proxy=IP:PORT, /convert/:format?link=..., or POST /convert/:format with { "links": [...] }',
  });
});

// --- Graceful Shutdown ---
const server = app.listen(PORT, () => {
  console.log(`✅ Proxy Health Checker + Converter (Server) running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed gracefully.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  server.close(() => {
    console.log('✅ Server closed.');
    process.exit(0);
  });
});

// --- Error Handler ---
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

module.exports = { app }; // Untuk keperluan testing jika diperlukan
