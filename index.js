const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Endpoint dengan path parameter
app.get('/check/proxy::proxy', async (req, res) => {
  const proxy = req.params.proxy;

  if (!proxy) {
    return res.status(400).json({ error: 'Proxy is required' });
  }

  try {
    const startTime = Date.now();

    // Test proxy dengan request ke httpbin.org/ip
    const response = await axios.get('https://httpbin.org/ip', {
      proxy: {
        host: proxy.split(':')[0],
        port: proxy.split(':')[1],
      },
      timeout: 5000, // 5 detik timeout
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    res.json({
      proxy,
      status: 'working',
      ip: response.data.origin,
      responseTime: `${responseTime} ms`,
    });
  } catch (error) {
    res.json({
      proxy,
      status: 'failed',
      error: error.message,
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Proxy Checker API is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
