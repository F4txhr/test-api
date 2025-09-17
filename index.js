// ================================
// 🔍 ENDPOINT: /health?proxy=IP:PORT
// → HANYA cek TCP (default, tanpa perlu parameter tambahan)
// → Tidak ada HTTP check
// ================================
app.get('/health', async (req, res) => {
  const { proxy } = req.query;

  if (!proxy) {
    return res.status(400).json({
      error: 'Parameter "proxy" wajib. Contoh: /health?proxy=1.1.1.1:8080',
    });
  }

  // Pisahkan host dan port
  const [host, port] = proxy.includes(':') ? proxy.split(':') : [proxy, '80'];

  if (!host || !port || isNaN(port)) {
    return res.status(400).json({
      error: 'Format proxy salah. Gunakan: IP:PORT (contoh: 1.1.1.1:8080)',
    });
  }

  const portNum = parseInt(port, 10);

  // === TCP CHECK ===
  const tcpStart = Date.now();
  let tcpSuccess = false;
  let tcpError = '';

  try {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection(portNum, host);

      socket.setTimeout(5000); // timeout 5 detik

      socket.on('connect', () => {
        tcpSuccess = true;
        socket.end(); // tutup koneksi setelah sukses
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
    if (!tcpError) tcpError = err.message;
  }

  const tcpLatency = Date.now() - tcpStart;

  // === Response Akhir ===
  const status = tcpSuccess ? 'UP' : 'DOWN';

  res.status(tcpSuccess ? 200 : 503).json({
    proxy: proxy,
    status: status,
    tcp: {
      success: tcpSuccess,
      latency_ms: tcpLatency,
      error: tcpSuccess ? null : tcpError,
    },
    note: "TCP-only check. HTTP validation disabled for universal port support.",
    timestamp: new Date().toISOString(),
  });
});
