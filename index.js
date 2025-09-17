// index.js — versi FINAL: TCP-only, output rapi, stabil di Railway

const express = require('express');
const net = require('net');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Uptime tracker
const startTime = Date.now();

// ================================
// 🔍 ENDPOINT: /health?proxy=IP:PORT
// → HANYA cek TCP — output rapi & minimalis
// ================================
app.get('/health', async (req, res) => {
  const { proxy } = req.query;

  // Validasi input
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
      error: 'Invalid proxy format. Use IP:PORT (e.g., 8.8.8.8:53)',
    });
  }

  const portNum = parseInt(port, 10);
  const testStart = Date.now();

  // Cek TCP
  let isAlive = false;
  let error = null;

  try {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection(portNum, host);
      socket.setTimeout(5000); // 5 detik timeout

      socket.on('connect', () => {
        isAlive = true;
        socket.end();
        resolve();
      });

      socket.on('error', (err) => {
        error = err.message;
        reject(err);
      });

      socket.on('timeout', () => {
        error = 'Connection timeout (5s)';
        socket.destroy();
        reject(new Error('Timeout'));
      });
    });
  } catch (err) {
    if (!error) error = err.message;
  }

  const latency = Date.now() - testStart;
  const success = isAlive;

  // Response akhir
  const response = {
    success: success,
    proxy: proxy,
    status: success ? 'UP' : 'DOWN',
    latency_ms: latency,
    timestamp: new Date().toISOString(),
  };

  // Tambah error hanya jika gagal
  if (!success) {
    response.error = error;
  }

  res.status(success ? 200 : 503).json(response);
});

// Endpoint info — opsional
app.get('/info', (req, res) => {
  res.json({
    service: "TCP Proxy Health Checker",
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    node_version: process.version,
    environment: process.env.NODE_ENV || 'production',
  });
});

// Handle route tidak dikenal
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found. Use /health?proxy=IP:PORT',
  });
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🚀 Test: /health?proxy=1.1.1.1:80`);
});
