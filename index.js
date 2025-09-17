// index.js — versi lengkap dengan /health real test

const express = require('express');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const net = require('net'); // untuk test koneksi TCP langsung
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ================================
// 🔍 ENDPOINT: /health?proxy=IP:PORT
// → Benar-benar mencoba koneksi ke proxy (TCP + HTTP)
// ================================
app.get('/health', async (req, res) => {
  const { proxy } = req.query;

  if (!proxy) {
    return res.status(400).json({
      error: 'Parameter "proxy" wajib. Contoh: /health?proxy=1.1.1.1:8080',
    });
  }

  // Pisahkan IP dan port
  const [host, port] = proxy.includes(':') ? proxy.split(':') : [proxy, '80'];

  if (!host || !port || isNaN(port)) {
    return res.status(400).json({
      error: 'Format proxy salah. Gunakan: IP:PORT (contoh: 1.1.1.1:8080)',
    });
  }

  const portNum = parseInt(port, 10);

  // === Tahap 1: Cek koneksi TCP ke proxy ===
  const tcpStart = Date.now();
  let tcpSuccess = false;
  let tcpError = '';

  try {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection(portNum, host);

      socket.setTimeout(5000); // timeout 5 detik

      socket.on('connect', () => {
        tcpSuccess = true;
        socket.end();
        resolve();
      });

      socket.on('error', (err) => {
        tcpError = err.message;
        reject(err);
      });

      socket.on('timeout', () => {
        tcpError = 'TCP Timeout (5s)';
        socket.destroy();
        reject(new Error('TCP Timeout'));
      });
    });
  } catch (err) {
    tcpSuccess = false;
    if (!tcpError) tcpError = err.message;
  }

  const tcpLatency = Date.now() - tcpStart;

  // Jika TCP gagal, skip HTTP test
  if (!tcpSuccess) {
    return res.status(503).json({
      proxy: proxy,
      status: 'DOWN',
      tcp: {
        success: false,
        latency_ms: tcpLatency,
        error: tcpError,
      },
      http: {
        success: false,
        error: 'Skipped — TCP failed',
      },
    });
  }

  // === Tahap 2: Cek HTTP via proxy (opsional, bisa skip jika hanya mau TCP) ===
  const testUrl = 'https://httpbin.org/ip';
  const fullProxyUrl = `http://${host}:${portNum}`;
  const agent = new HttpsProxyAgent(fullProxyUrl);

  const httpStart = Date.now();
  let httpSuccess = false;
  let httpError = '';
  let responseData = null;

  try {
    const response = await axios.get(testUrl, {
      httpsAgent: agent,
      httpAgent: agent,
      timeout: 10000,
      headers: { 'User-Agent': 'ProxyHealthCheck/1.0' },
    });

    httpSuccess = response.status === 200;
    responseData = response.data;
  } catch (err) {
    httpSuccess = false;
    httpError = err.code === 'ECONNABORTED'
      ? 'HTTP Timeout (10s)'
      : err.message || 'Unknown HTTP error';
  }

  const httpLatency = Date.now() - httpStart;

  // === Final Response ===
  const isProxyHealthy = tcpSuccess && httpSuccess;

  res.status(isProxyHealthy ? 200 : 503).json({
    proxy: proxy,
    status: isProxyHealthy ? 'UP' : 'DOWN',
    tcp: {
      success: tcpSuccess,
      latency_ms: tcpLatency,
      error: tcpSuccess ? null : tcpError,
    },
    http: {
      success: httpSuccess,
      latency_ms: httpSuccess ? httpLatency : null,
      error: httpSuccess ? null : httpError,
      data: responseData,
    },
    timestamp: new Date().toISOString(),
  });
});

// ================================
// 🧪 ENDPOINT: /check (tetap ada, untuk test lengkap)
// ================================
app.get('/check', async (req, res) => {
  const { proxy, target = 'https://httpbin.org/ip' } = req.query;

  if (!proxy) {
    return res.status(400).json({
      error: 'Parameter "proxy" wajib diisi.',
    });
  }

  if (!proxy.startsWith('http://') && !proxy.startsWith('https://')) {
    return res.status(400).json({
      error: 'Format proxy harus dimulai dengan http:// atau https://',
    });
  }

  const agent = new HttpsProxyAgent(proxy);
  const startTime = Date.now();

  try {
    const response = await axios.get(target, {
      httpsAgent: agent,
      httpAgent: agent,
      timeout: 10000,
      headers: { 'User-Agent': 'ProxyChecker/1.0' },
    });

    const endTime = Date.now();

    res.status(200).json({
      success: true,
      proxy: proxy,
      target: target,
      status: response.status,
      response_time_ms: endTime - startTime,
      data: response.data,
      headers: Object.fromEntries(Object.entries(response.headers).slice(0, 5)),
    });

  } catch (error) {
    const endTime = Date.now();
    let errorMsg = error.message;

    if (error.code === 'ECONNABORTED') errorMsg = 'Timeout: Proxy tidak merespon dalam 10 detik';
    else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') errorMsg = 'Proxy tidak bisa dijangkau';

    res.status(502).json({
      success: false,
      proxy: proxy,
      target: target,
      error: errorMsg,
      response_time_ms: endTime - startTime,
      details: error.code || 'unknown_error',
    });
  }
});

// Handle route lain
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Gunakan:\n- /health?proxy=IP:PORT\n- /check?proxy=http://IP:PORT&target=URL',
  });
});

app.listen(PORT, () => {
  console.log(`✅ Proxy Checker API running on port ${PORT}`);
});
