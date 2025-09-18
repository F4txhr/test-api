// index.js — versi PRO+ FINAL: stats, alerting, auto-retry, metrics, graceful shutdown, env validation, TIMEZONE FIX

const express = require('express');
const net = require('net');
const cors = require('cors');
const fetch = require('node-fetch'); // ✅ Untuk Node.js < 18

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
// 🤖 TELEGRAM ALERT SETUP — DIPERBAIKI!
// ================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; // simpan di Railway Variables
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;     // simpan di Railway Variables

// ✅ Validasi environment variables
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn("⚠️ Telegram alert disabled — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in environment variables.");
}

// ✅ Fungsi kirim alert dengan ZONA WAKTU LOKAL (Asia/Jakarta)
async function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("⚠️ Telegram alert skipped — token or chat_id not set");
    return;
  }

  try {
    // ✅ PERBAIKAN KRITIS: HAPUS SPASI SETELAH /bot
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    // ✅ Dapatkan waktu lokal (WIB)
    const localTime = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour12: false
    });

    const fullMessage = `[🚨 PROXY DOWN ALERT - WIB]\n${localTime}\n\n${message}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: fullMessage,
        parse_mode: 'Markdown',
      }),
    });

    if (response.ok) {
      console.log("✅ [TELEGRAM] Alert berhasil dikirim");
    } else {
      const errorText = await response.text();
      console.error("❌ [TELEGRAM] Gagal kirim alert:", errorText);
    }
  } catch (error) {
    console.error("❌ [TELEGRAM] Error saat kirim alert:", error.message);
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

// ================================
// 🔍 ENDPOINT: /health?proxy=IP:PORT — DIPERBAIKI!
// → TCP check + auto-retry + alerting + stats tracking
// ================================
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

  // ✅ Validasi port range
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
    // ✅ Kirim alert dengan detail
    const alertMsg = `Proxy: ${proxy}\nLatency: ${latency}ms\nAttempt: ${result.attempt}\nError: ${result.error}`;
    sendTelegramAlert(alertMsg);
  }

  const response = {
    success: success,
    proxy: proxy,
    status: success ? 'UP' : 'DOWN',
    latency_ms: latency,
    attempt: result.attempt,
    timestamp: new Date().toISOString(), // Tetap UTC untuk konsistensi API
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
// 🩺 ENDPOINT: /metrics (Prometheus format)
// ================================
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

// ================================
// 🧪 ENDPOINT: /ping
// ================================
app.get('/ping', (req, res) => {
  res.status(200).json({ 
    status: 'Alive', 
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    time_wib: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) // ✅ Tambahkan waktu lokal
  });
});

// Fallback
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found. Use /health?proxy=IP:PORT',
  });
});

// ✅ Graceful shutdown
const server = app.listen(PORT, () => {
  console.log(`✅ [WIB] Proxy Health Checker running on port ${PORT} — ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
  console.log(`📊 Stats: /stats`);
  console.log(`🩺 Metrics: /metrics`);
  console.log(`🏓 Ping: /ping`);
});

process.on('SIGTERM', () => {
  console.log('✅ [WIB] SIGTERM received — shutting down gracefully... ', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  server.close(() => {
    console.log('✅ Server closed gracefully.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('✅ [WIB] SIGINT received — shutting down... ', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
  server.close(() => {
    console.log('✅ Server closed.');
    process.exit(0);
  });
});
