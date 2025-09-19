// server.js

const express = require('express');
const net = require('net');
const cors = require('cors');
const fetch = require('node-fetch');
const {
  parseAnyLink,
  toClash,
  toSurge,
  toQuantumult,
  toSingBox
} = require('./converter'); // Import modul converter

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.text());

let totalRequests = 0;
let successCount = 0;
const startTime = Date.now();

// --- Telegram Alert ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message })
    });
  } catch (e) {
    console.error("Telegram alert failed:", e.message);
  }
}

// --- TCP test ---
async function testTCP(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, host);
    socket.setTimeout(5000);

    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });

    socket.on('error', reject);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// --- Routes ---
app.get('/health', async (req, res) => {
  totalRequests++;
  const { proxy } = req.query;
  if (!proxy) return res.status(400).json({ error: 'Missing ?proxy=' });

  const [host, port] = proxy.split(':');
  const start = Date.now();
  try {
    await testTCP(host, parseInt(port, 10));
    successCount++;
    res.json({ status: 'UP', proxy, latency: Date.now() - start });
  } catch (err) {
    sendTelegramAlert(`Proxy DOWN: ${proxy} (${err.message})`);
    res.status(503).json({ status: 'DOWN', proxy, error: err.message });
  }
});

app.get('/stats', (req, res) => {
  res.json({
    uptime: Math.floor((Date.now() - startTime) / 1000),
    total_requests: totalRequests,
    success_count: successCount,
    failure_count: totalRequests - successCount
  });
});

app.get('/metrics', (req, res) => {
  res.type('text/plain').send(`
# HELP proxy_uptime_seconds Service uptime
proxy_uptime_seconds ${Math.floor((Date.now() - startTime) / 1000)}
# HELP proxy_total_requests Total requests
proxy_total_requests ${totalRequests}
# HELP proxy_success_count Success count
proxy_success_count ${successCount}
# HELP proxy_failure_count Failure count
proxy_failure_count ${totalRequests - successCount}
  `);
});

app.get('/ping', (req, res) => {
  res.json({ status: 'Alive', time: new Date().toISOString() });
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
