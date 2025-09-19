// index.js — versi ULTIMATE: proxy health + alerting + batch convert + full parser + template system

const express = require('express');
const net = require('net');
const cors = require('cors');
const fetch = require('node-fetch'); // Pastikan versi kompatibel
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.text());

// ✅ Logging
app.use((req, res, next) => {
  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  console.log(`[${now}] ${req.method} ${req.originalUrl}`);
  next();
});

// ✅ Global State
let totalRequests = 0;
let successCount = 0;
const startTime = Date.now();

// ✅ Telegram Alert
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("⚠️ Telegram alert disabled — token or chat_id not set");
    return;
  }

  try {
    // ✅ PERBAIKAN KRITIS — hapus spasi setelah /bot
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

// ✅ TCP Test with Retry
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

// ✅ Endpoint: /health
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

// ✅ Endpoint: /stats
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

// ✅ Endpoint: /metrics
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

// ✅ Endpoint: /ping
app.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'Alive',
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    time_wib: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
  });
});

// ================================
// 🔄 PARSER & CONVERTER — VLESS, VMess, Trojan, Shadowsocks (SUPPORT WS!)
// ================================

function parseSS(link) {
  if (!link.startsWith('ss://')) {
    throw new Error('Not a Shadowsocks link');
  }

  const clean = link.replace('ss://', '').split('#')[0];
  const [userinfo, hostport] = clean.split('@');
  const [host, portWithParams] = hostport.split(':');
  const [portPart, ...paramParts] = portWithParams.split('?');
  const port = parseInt(portPart, 10);

  let method = 'chacha20-ietf-poly1305';
  let password = '';
  try {
    const decoded = Buffer.from(userinfo, 'base64').toString('utf8');
    const [m, p] = decoded.split(':', 2);
    method = m;
    password = p;
  } catch (e) {
    throw new Error('Invalid Shadowsocks base64 encoding');
  }

  let plugin = '';
  let pluginOpts = '';
  let obfs = '';
  let obfsHost = '';

  if (paramParts.length > 0) {
    const params = new URLSearchParams(paramParts.join('?'));
    plugin = params.get('plugin') || '';
    if (plugin.includes(';')) {
      const [p, opts] = plugin.split(';', 2);
      plugin = p;
      pluginOpts = opts;
    }
    obfs = params.get('obfs') || '';
    obfsHost = params.get('obfs-host') || '';
  }

  return {
    type: 'ss',
    method,
    password,
    host,
    port,
    plugin,
    pluginOpts,
    obfs,
    obfsHost,
    name: link.includes('#') ? decodeURIComponent(link.split('#')[1]) : 'SS Server'
  };
}

function parseVLESS(link) {
  if (!link.startsWith('vless://')) {
    throw new Error('Bukan link VLESS');
  }

  const clean = link.replace('vless://', '');
  const [userinfo, rest] = clean.split('@');
  const [uuid] = userinfo.split(':'); // Potentially handle password if present

  const [hostport, paramString] = rest.split('?');
  const [host, port] = hostport.split(':');

  const params = {};
  let fragmentName = '';

  if (paramString) {
    // Split params and fragment
    const paramParts = paramString.split('#');
    const queryParams = paramParts[0];
    fragmentName = paramParts[1] ? decodeURIComponent(paramParts[1]) : '';

    if (queryParams) {
      queryParams.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        if (key) {
          params[decodeURIComponent(key)] = decodeURIComponent(value || '');
        }
      });
    }
  }

  // Prioritize fragment name, fallback to ps param if exists
  const name = fragmentName || params.ps || 'VLESS Server';

  return {
    type: 'vless',
    uuid,
    host,
    port: parseInt(port, 10),
    security: params.security || 'none', // none, tls, reality
    flow: params.flow || '',
    network: params.type || 'tcp', // Gunakan 'network' untuk konsistensi
    path: params.path || (params.type === 'ws' ? '/' : ''),
    host_header: params.host || '', // Simpan host header secara eksplisit
    sni: params.sni || params.host || host,
    fp: params.fp || '',
    pbk: params.pbk || '', // Public Key for REALITY
    sid: params.sid || '', // Short ID for REALITY
    spx: params.spx || '', // SpiderX for REALITY
    alpn: params.alpn || '',
    allowInsecure: params.allowInsecure === '1' || params.allowInsecure === 'true' || false,
    name: name
  };
}

function parseVMess(link) {
  if (!link.startsWith('vmess://')) {
    throw new Error('Bukan link VMess');
  }

  const base64 = link.replace('vmess://', '');
  let jsonStr;
  try {
    jsonStr = Buffer.from(base64, 'base64').toString('utf8');
    const obj = JSON.parse(jsonStr);
    return {
      type: 'vmess',
      uuid: obj.id,
      host: obj.add,
      port: parseInt(obj.port, 10),
      alterId: parseInt(obj.aid, 10) || 0,
      security: obj.sc || obj.cipher || 'auto', // Prefer 'sc', fallback to 'cipher'
      network: obj.net || 'tcp', // Gunakan 'network' untuk konsistensi
      type: obj.type || 'none', // VMess specific type (e.g., for kcp)
      path: obj.path || (obj.net === 'ws' ? '/' : ''),
      host_header: obj.host || obj.add, // Simpan host header secara eksplisit
      sni: obj.sni || obj.host || obj.add,
      tls: obj.tls === 'tls',
      alpn: obj.alpn || '',
      fp: obj.fp || '',
      name: obj.ps || 'VMess Server'
    };
  } catch (e) {
    throw new Error('Invalid VMess base64 JSON');
  }
}

function parseTrojan(link) {
  if (!link.startsWith('trojan://')) {
    throw new Error('Bukan link Trojan');
  }

  const match = link.match(/^trojan:\/\/([^@]+)@([^#?]+)(\?[^#]+)?(#.*)?$/);
  if (!match) {
      throw new Error('Invalid Trojan link format');
  }

  const [_, userinfo, serverinfo, paramString, fragment] = match;

  const [host, port] = serverinfo.split(':');
  const params = {};

  if (paramString) {
    const queryParams = paramString.substring(1).split('#')[0]; // Remove leading '?'
    queryParams.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) {
        params[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    });
  }

  const name = fragment ? decodeURIComponent(fragment.substring(1)) : 'Trojan Server'; // Remove leading '#'

  return {
    type: 'trojan',
    password: userinfo,
    host,
    port: parseInt(port, 10),
    security: 'tls', // Trojan biasanya TLS
    network: params.type || 'tcp', // Gunakan 'network' untuk konsistensi
    path: params.path || (params.type === 'ws' ? '/' : ''),
    host_header: params.host || host, // Simpan host header secara eksplisit
    sni: params.sni || params.host || host,
    alpn: params.alpn || '',
    fp: params.fp || '',
    allowInsecure: params.allowInsecure === '1' || params.allowInsecure === 'true' || false,
    name,
  };
}


function parseAnyLink(link) {
  if (link.startsWith('vless://')) {
    return parseVLESS(link);
  } else if (link.startsWith('vmess://')) {
    return parseVMess(link);
  } else if (link.startsWith('trojan://')) {
    return parseTrojan(link);
  } else if (link.startsWith('ss://')) {
    return parseSS(link);
  } else {
    throw new Error('Unsupported link format. Supported: vless, vmess, trojan, ss');
  }
}

// ================================
// 🎯 CONVERTER — Clash, Surge, Quantumult, Sing-Box
// ================================

function toClash(config) {
  switch (config.type) {
    case 'vless':
      let vlessConfig = `- name: "${config.name.replace(/"/g, '\\"')}"
  type: vless
  server: ${config.host}
  port: ${config.port}
  uuid: ${config.uuid}
  udp: true
  skip-cert-verify: ${!!config.allowInsecure}
`;
      if (config.security === 'tls' || config.security === 'reality') {
        vlessConfig += `  tls: true\n`;
        if(config.sni) vlessConfig += `  servername: ${config.sni}\n`;
        if(config.alpn) vlessConfig += `  alpn: [${config.alpn.split(',').map(a => `"${a.trim()}"`).join(', ')}]\n`;
        if(config.fp) vlessConfig += `  fingerprint: ${config.fp}\n`;
        if(config.security === 'reality') {
            vlessConfig += `  client-fingerprint: ${config.fp}\n`;
            if(config.pbk) vlessConfig += `  public-key: ${config.pbk}\n`;
            if(config.sid) vlessConfig += `  short-id: ${config.sid}\n`;
            if(config.spx) vlessConfig += `  spider-x: ${config.spx}\n`;
        } else if (config.security === 'tls') {
             if (config.flow) vlessConfig += `  flow: ${config.flow}\n`;
        }
      } else {
        vlessConfig += `  tls: false\n`;
      }

      // Tangani berdasarkan network type
      if (config.network === 'ws') {
        vlessConfig += `  network: ws\n`;
        vlessConfig += `  ws-path: ${config.path || '/'}\n`;
        if (config.host_header) {
          vlessConfig += `  ws-headers:\n    host: ${config.host_header}\n`;
        }
      }
      // Untuk 'tcp' dan tipe lain yang tidak memerlukan konfigurasi khusus di Clash,
      // tidak perlu menambahkan baris apa pun. Clash akan menggunakan default (tcp).

      return vlessConfig;

    case 'vmess':
      let vmessConfig = `- name: "${config.name.replace(/"/g, '\\"')}"
  type: vmess
  server: ${config.host}
  port: ${config.port}
  uuid: ${config.uuid}
  alterId: ${config.alterId}
  cipher: ${config.security}
  udp: true
  skip-cert-verify: ${!!config.allowInsecure}
`;
      if (config.tls) {
        vmessConfig += `  tls: true\n`;
        if(config.sni) vmessConfig += `  servername: ${config.sni}\n`;
        if(config.alpn) vmessConfig += `  alpn: [${config.alpn.split(',').map(a => `"${a.trim()}"`).join(', ')}]\n`;
        if(config.fp) vmessConfig += `  fingerprint: ${config.fp}\n`;
      } else {
        vmessConfig += `  tls: false\n`;
      }

      if (config.network === 'ws') {
        vmessConfig += `  network: ws\n`;
        vmessConfig += `  ws-path: ${config.path || '/'}\n`;
        if (config.host_header) {
          vmessConfig += `  ws-headers:\n    host: ${config.host_header}\n`;
        }
      }

      return vmessConfig;

    case 'trojan':
      let trojanConfig = `- name: "${config.name.replace(/"/g, '\\"')}"
  type: trojan
  server: ${config.host}
  port: ${config.port}
  password: ${config.password}
  udp: true
  skip-cert-verify: ${!!config.allowInsecure}
  tls: true
`;
      // Trojan biasanya TLS
      if(config.sni) trojanConfig += `  sni: ${config.sni}\n`;
      if(config.alpn) trojanConfig += `  alpn: [${config.alpn.split(',').map(a => `"${a.trim()}"`).join(', ')}]\n`;
      if(config.fp) trojanConfig += `  fingerprint: ${config.fp}\n`;

      if (config.network === 'ws') {
        trojanConfig += `  network: ws\n`;
        trojanConfig += `  ws-path: ${config.path || '/'}\n`;
        if (config.host_header) {
          trojanConfig += `  ws-headers:\n    host: ${config.host_header}\n`;
        }
      }

      return trojanConfig;

    case 'ss':
      let ssConfig = `- name: "${config.name.replace(/"/g, '\\"')}"
  type: ss
  server: ${config.host}
  port: ${config.port}
  cipher: ${config.method}
  password: ${config.password}
  udp: true
`;
      if (config.plugin) {
        ssConfig += `  plugin: ${config.plugin}\n`;
        // Format plugin_opts untuk Clash
        if (config.plugin.includes('v2ray-plugin') || config.plugin.includes('obfs')) {
           const opts = {};
           if (config.plugin.includes(';')) {
              const parts = config.plugin.split(';');
              for (let i = 1; i < parts.length; i++) {
                 const [k, v] = parts[i].split('=');
                 if (k) opts[k.trim()] = v ? v.trim() : true;
              }
           }
           if (Object.keys(opts).length > 0) {
              ssConfig += `  plugin-opts:\n`;
              for (const [k, v] of Object.entries(opts)) {
                 if (k === 'mode' || k === 'host' || k === 'path') {
                    ssConfig += `    ${k}: ${v}\n`;
                 } else if (k === 'tls') {
                    ssConfig += `    ${k}: ${v === 'true' || v === true}\n`;
                 } else if (k === 'mux') {
                    ssConfig += `    ${k}: ${parseInt(v, 10) || 0}\n`;
                 } else {
                    ssConfig += `    ${k}: ${v}\n`;
                 }
              }
           } else if (config.obfs) {
              // Fallback jika pluginOpts tidak ada tapi ada obfs params
              ssConfig += `  plugin-opts:\n    mode: ${config.obfs}\n`;
              if (config.obfsHost) ssConfig += `    host: ${config.obfsHost}\n`;
           }
        } else {
           // Untuk plugin lain, mungkin perlu penanganan khusus
           ssConfig += `  plugin-opts: {}\n`; // Placeholder
        }
      }
      return ssConfig;

    default:
      // Pesan error yang lebih umum
      throw new Error(`Tidak dapat mengkonversi protokol '${config.type}' ke format Clash.`);
  }
}

function toSurge(config) {
  switch (config.type) {
    case 'vless':
      let vlessOpts = `skip-cert-verify=${!!config.allowInsecure}`;
      if (config.security === 'tls') {
         vlessOpts += `, tls=true, sni=${config.sni}`;
         if(config.alpn) vlessOpts += `, alpn=${config.alpn}`;
         if(config.fp) vlessOpts += `, server-cert-fingerprint-sha256=${config.fp}`;
      } else if (config.security === 'reality') {
         vlessOpts += `, tls=true, sni=${config.sni}`;
      }
      if (config.flow) vlessOpts += `, flow=${config.flow}`;
      if (config.network === 'ws') {
        vlessOpts += `, ws=true, ws-path=${config.path}`;
        if (config.host_header) vlessOpts += `, ws-headers=host:${config.host_header}`;
      }
      return `${config.name} = vless, ${config.host}, ${config.port}, username=${config.uuid}, ${vlessOpts}`;
    case 'vmess':
      let vmessOpts = `skip-cert-verify=${!!config.allowInsecure}`;
      if (config.tls) {
         vmessOpts += `, tls=true, sni=${config.sni}`;
         if(config.alpn) vmessOpts += `, alpn=${config.alpn}`;
         if(config.fp) vmessOpts += `, server-cert-fingerprint-sha256=${config.fp}`;
      }
      if (config.network === 'ws') {
        vmessOpts += `, ws=true, ws-path=${config.path}`;
        if (config.host_header) vmessOpts += `, ws-headers=host:${config.host_header}`;
      }
      return `${config.name} = vmess, ${config.host}, ${config.port}, username=${config.uuid}, ${vmessOpts}`;
    case 'trojan':
      let trojanOpts = `skip-cert-verify=${!!config.allowInsecure}`;
      trojanOpts += `, sni=${config.sni}`;
      if(config.alpn) trojanOpts += `, alpn=${config.alpn}`;
      if(config.fp) trojanOpts += `, server-cert-fingerprint-sha256=${config.fp}`;
      if (config.network === 'ws') {
        trojanOpts += `, ws=true, ws-path=${config.path}`;
        if (config.host_header) trojanOpts += `, ws-headers=host:${config.host_header}`;
      }
      return `${config.name} = trojan, ${config.host}, ${config.port}, password=${config.password}, ${trojanOpts}`;
    case 'ss':
      // Format Shadowsocks untuk Surge
      let ssOpts = `encrypt-method=${config.method}, password=${config.password}`;
      if (config.plugin) {
         // Surge biasanya menggunakan module untuk plugin
         // Contoh: custom, server, port, cipher, password, module-url
         // Untuk v2ray-plugin, mungkin perlu module khusus
         // Kita bisa membuat string placeholder atau mencoba memetakan parameter
         // Ini adalah contoh sederhana
         return `${config.name} = custom, ${config.host}, ${config.port}, ${config.method}, ${config.password}, https://raw.githubusercontent.com/ConnersHua/SSEncrypt/master/SSEncrypt.module`;
      } else {
         return `${config.name} = ss, ${config.host}, ${config.port}, ${config.method}, ${config.password}`;
      }
    default:
      throw new Error(`Unsupported type for Surge: ${config.type}`);
  }
}

function toQuantumult(config) {
  switch (config.type) {
    case 'vless':
      let vlessParams = `skip-cert-verify=${!!config.allowInsecure}`;
      if (config.security === 'tls') {
         vlessParams += `, tls=true, sni=${config.sni}`;
         if(config.alpn) vlessParams += `, alpn=${config.alpn}`;
         if(config.fp) vlessParams += `, tls-cert-sha256=${config.fp}`;
      } else if (config.security === 'reality') {
         vlessParams += `, tls=true, sni=${config.sni}`;
      }
      if (config.flow) vlessParams += `, flow=${config.flow}`;
      if (config.network === 'ws') {
        vlessParams += `, ws=true, ws-path=${config.path}`;
        if (config.host_header) vlessParams += `, ws-header=host:${config.host_header}`;
      }
      return `vmess=${config.host}:${config.port}, method=none, password=${config.uuid}, ${vlessParams}, tag=${config.name}`;
    case 'vmess':
      let vmessParams = `skip-cert-verify=${!!config.allowInsecure}`;
      if (config.tls) {
         vmessParams += `, tls=${config.tls}, sni=${config.sni}`;
         if(config.alpn) vmessParams += `, alpn=${config.alpn}`;
         if(config.fp) vmessParams += `, tls-cert-sha256=${config.fp}`;
      }
      if (config.network === 'ws') {
        vmessParams += `, ws=true, ws-path=${config.path}`;
        if (config.host_header) vmessParams += `, ws-header=host:${config.host_header}`;
      }
      return `vmess=${config.host}:${config.port}, method=none, password=${config.uuid}, ${vmessParams}, tag=${config.name}`;
    case 'trojan':
      let trojanParams = `skip-cert-verify=${!!config.allowInsecure}`;
      trojanParams += `, over-tls=true, tls-host=${config.sni}`;
      if(config.alpn) trojanParams += `, alpn=${config.alpn}`;
      if(config.fp) trojanParams += `, tls-cert-sha256=${config.fp}`;
      if (config.network === 'ws') {
        trojanParams += `, ws=true, ws-path=${config.path}`;
        if (config.host_header) trojanParams += `, ws-header=host:${config.host_header}`;
      }
      return `trojan=${config.host}:${config.port}, password=${config.password}, ${trojanParams}, tag=${config.name}`;
    case 'ss':
      let ssParams = `encrypt-method=${config.method}, password=${config.password}`;
      if (config.obfs) ssParams += `, obfs=${config.obfs}, obfs-host=${config.obfsHost}`;
      // Quantumult juga bisa menggunakan plugin, tapi formatnya berbeda
      // Kita fokus pada format dasar dulu
      return `shadowsocks=${config.host}:${config.port}, method=${config.method}, password=${config.password}, ${ssParams}, tag=${config.name}`;
    default:
      throw new Error(`Unsupported type for Quantumult: ${config.type}`);
  }
}

function toSingBox(config) {
  let base = {
    tag: config.name,
    type: config.type === 'ss' ? 'shadowsocks' : config.type,
    server: config.host,
    server_port: config.port
  };

  if (config.type === 'vless' || config.type === 'vmess') {
    base.uuid = config.uuid;
    if (config.type === 'vmess') base.alter_id = config.alterId;
    // Use network type for transport
    if (config.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: config.path || '/',
        headers: config.host_header ? { host: config.host_header } : {}
      };
    }
    // Add other transport types if needed (grpc, http, etc.)

    // TLS Configuration
    if (config.security === 'tls' || config.security === 'reality' || config.tls) {
      base.tls = {
        enabled: true,
        server_name: config.sni || config.host,
        insecure: !!config.allowInsecure
      };
      if (config.alpn) {
         base.tls.alpn = config.alpn.split(',').map(a => a.trim()).filter(a => a);
      }
      if (config.security === 'reality') {
          base.tls.utls = { enabled: true, fingerprint: config.fp || "chrome" };
          base.tls.reality = { enabled: true, public_key: config.pbk, short_id: config.sid };
          base.tls.flow = config.flow || "";
      } else if (config.security === 'tls') {
          base.tls.utls = { enabled: true, fingerprint: config.fp || "chrome" };
          if (config.flow) base.tls.flow = config.flow;
      }
    } else {
       base.tls = { enabled: false };
    }
    if (config.security === 'none' && !config.tls) {
        base.tls = { enabled: false };
    }

  } else if (config.type === 'trojan') {
    base.password = config.password;
    // Transport
    if (config.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: config.path || '/',
        headers: config.host_header ? { host: config.host_header } : {}
      };
    }
    // TLS for Trojan (usually implied)
    base.tls = {
      enabled: true,
      server_name: config.sni || config.host,
      insecure: !!config.allowInsecure,
      utls: { enabled: true, fingerprint: config.fp || "chrome" }
    };
    if (config.alpn) {
       base.tls.alpn = config.alpn.split(',').map(a => a.trim()).filter(a => a);
    }
    // Add other TLS params if needed

  } else if (config.type === 'ss') {
    base.method = config.method;
    base.password = config.password;
    // Plugin handling for sing-box
    if (config.plugin) {
       // Parse plugin string like: v2ray-plugin;tls;mode=websocket;host=...;path=...
       const pluginParts = config.plugin.split(';');
       const pluginName = pluginParts[0];
       if (pluginName.includes('v2ray-plugin') || pluginName.includes('obfs')) {
          base.plugin = pluginName.includes('v2ray-plugin') ? "v2ray-plugin" : "obfs-local";
          base.plugin_opts = {};
          for (let i = 1; i < pluginParts.length; i++) {
             const part = pluginParts[i];
             if (part.includes('=')) {
                const [k, v] = part.split('=');
                if (k === 'mode') base.plugin_opts.mode = v;
                else if (k === 'host') base.plugin_opts.host = v;
                else if (k === 'path') base.plugin_opts.path = v;
                else if (k === 'tls') base.plugin_opts.tls = v === 'true';
                else if (k === 'mux') base.plugin_opts.mux = parseInt(v, 10) || 0;
             } else {
                // Flag like 'tls'
                if (part === 'tls') base.plugin_opts.tls = true;
             }
          }
       }
       // Add more plugin conditions as needed
    } else if (config.obfs) {
        // Fallback untuk parameter obfs lama
        base.plugin = "obfs-local";
        base.plugin_opts = {
            mode: config.obfs,
            host: config.obfsHost || config.host
        };
    }
  }

  return JSON.stringify(base, null, 2);
}


// ================================
// 🧩 TEMPLATE SYSTEM — Load from files
// ================================

// Simple in-memory cache for templates
const templateCache = {};

async function loadTemplateText(format) {
  // Check cache first
  if (templateCache[format]) {
    return templateCache[format];
  }

  try {
    const ext = format === 'clash' ? 'yaml' : 'conf';
    const templatePath = path.join(__dirname, 'templates', `${format}.${ext}`);
    const content = await fs.readFile(templatePath, 'utf8');
    // Store in cache
    templateCache[format] = content;
    return content;
  } catch (error) {
    console.error(`Gagal load template ${format}:`, error.message);
    throw new Error(`Template ${format} tidak ditemukan`);
  }
}

async function generateClashConfig(results) {
  let template = await loadTemplateText('clash');
  const validProxies = results.filter(r => !r.error);

  const proxyConfigs = validProxies.map(r => r.formats.clash).join('\n');
  template = template.replace('# PROXY_PLACEHOLDER', proxyConfigs);

  const proxyNames = validProxies.map(r => `      - "${r.original.name.replace(/"/g, '\\"')}"`).join('\n');
  template = template.replace('# PROXY_NAMES_PLACEHOLDER', proxyNames);

  return template;
}

async function generateSurgeConfig(results) {
  let template = await loadTemplateText('surge');
  const validProxies = results.filter(r => !r.error);

  const proxyConfigs = validProxies.map(r => r.formats.surge).join('\n');
  template = template.replace('# PROXY_PLACEHOLDER', proxyConfigs);

  const proxyNames = validProxies.map(r => r.original.name).join(', ');
  template = template.replace('🚀 PROXY = select, DIRECT', `🚀 PROXY = select, DIRECT, ${proxyNames}`);

  return template;
}

async function generateQuantumultConfig(results) {
  let template = await loadTemplateText('quantumult');
  const validProxies = results.filter(r => !r.error);

  const serverConfigs = validProxies.map(r => r.formats.quantumult).join('\n');
  template = template.replace('// PROXY_PLACEHOLDER', serverConfigs);

  const serverNames = validProxies.map(r => r.original.name).join(', ');
  template = template.replace('🚀 PROXY = direct', `🚀 PROXY = direct, ${serverNames}`);

  return template;
}

// ================================
// 🔄 ENDPOINT CONVERT — SINGLE & BATCH (Tampil Langsung, Bukan Download)
// Modifikasi untuk menghasilkan array/list konfigurasi jika parameter 'links' digunakan
// ================================

app.get('/convert/:format', async (req, res) => {
  const format = req.params.format.toLowerCase();
  const { link, links } = req.query; // Terima kedua parameter

  // 1. Validasi Format
  if (!['clash', 'surge', 'quantumult', 'singbox'].includes(format)) {
    return res.status(400).send(`Error: Format tidak didukung. Gunakan: clash, surge, quantumult, singbox`);
  }

  // 2. Tentukan jenis permintaan: single atau batch
  let isBatch = false;
  let linkArray = [];

  if (links) {
    // Jika parameter 'links' ada, ini adalah permintaan batch
    isBatch = true;
    linkArray = links.split(',').map(l => l.trim()).filter(l => l.length > 0);
  } else if (link) {
    // Jika hanya parameter 'link' ada, ini adalah permintaan single
    isBatch = false;
    linkArray = [link.trim()];
  } else {
    return res.status(400).send(`Error: Parameter 'link' atau 'links' wajib diisi`);
  }

  if (linkArray.length === 0) {
     return res.status(400).send(`Error: Tidak ada link valid ditemukan`);
  }

  try {
    // 3. Proses Konversi
    const results = [];
    for (const singleLink of linkArray) {
      try {
        const parsed = parseAnyLink(singleLink);
        // Gunakan nama tag dari link asli jika tersedia
        const configName = parsed.name || "Proxy Server";

        // Buat objek config dengan semua parameter yang diperlukan
        const config = {
          ...parsed,
          name: configName,
          network: parsed.network || 'tcp' // Jika tidak ada, default tcp
        };

        let convertedConfig = '';
        switch (format) {
          case 'clash': convertedConfig = toClash(config); break;
          case 'surge': convertedConfig = toSurge(config); break;
          case 'quantumult': convertedConfig = toQuantumult(config); break;
          case 'singbox': convertedConfig = toSingBox(config); break;
          default: throw new Error(`Format tidak dikenali: ${format}`);
        }
        results.push({
            original_link: singleLink,
            parsed_config: config,
            converted: convertedConfig
        });
      } catch (convertError) {
        console.error(`Gagal konversi link (${singleLink}):`, convertError.message);
        results.push({
            original_link: singleLink,
            error: convertError.message
        });
      }
    }

    // 4. Tentukan MIME type berdasarkan format
    const mimeTypes = {
      clash: 'text/yaml', // atau application/yaml
      surge: 'text/plain',
      quantumult: 'text/plain',
      singbox: 'application/json'
    };

    // 5. Tentukan Respon Berdasarkan Jenis Permintaan dan Hasil
    const allSuccessful = results.every(r => !r.hasOwnProperty('error'));

    if (allSuccessful) {
        
        if (isBatch) {
            // --- Jika BATCH (menggunakan parameter 'links') ---
            // Kembalikan array/list konfigurasi sesuai format
            res.set('Content-Type', mimeTypes[format]);
            
            if (format === 'singbox') {
                // Untuk singbox, kembalikan array JSON
                const arrayOfConfigs = results.map(r => JSON.parse(r.converted));
                return res.send(JSON.stringify(arrayOfConfigs, null, 2));
            } else if (format === 'clash') {
                // Untuk clash, kembalikan sebagai array string konfigurasi individu
                const arrayOfYAMLStrings = results.map(r => r.converted);
                res.set('Content-Type', 'application/json'); // Ubah ke JSON karena array
                return res.send(JSON.stringify(arrayOfYAMLStrings, null, 2));
                
            } else {
                // Untuk surge & quantumult, kembalikan sebagai array JSON dari string konfigurasi
                const arrayOfConfigStrings = results.map(r => r.converted);
                res.set('Content-Type', 'application/json'); // Ubah ke JSON karena array
                return res.send(JSON.stringify(arrayOfConfigStrings, null, 2));
            }
            
        } else {
            // --- Jika SINGLE (menggunakan parameter 'link') ---
            // Kembalikan konfigurasi tunggal seperti sebelumnya
            res.set('Content-Type', mimeTypes[format]);
            return res.send(results[0].converted);
        }
        
    } else {
        // Jika ada yang gagal
        if (isBatch) {
             // Untuk batch, tetap tampilkan error dalam format teks
             const errorMessages = results.filter(r => r.error).map(r => `Link: ${r.original_link}\nError: ${r.error}`).join('\n\n');
             res.set('Content-Type', 'text/plain');
             return res.status(400).send(`Beberapa link gagal dikonversi:\n\n${errorMessages}`);
        } else {
             // Untuk single, tampilkan error sederhana
             res.set('Content-Type', 'text/plain');
             return res.status(400).send(`Gagal konversi link: ${results[0].error}`);
        }
    }

  } catch (error) {
    console.error("Error internal di /convert/:format:", error);
    res.status(500).send(`Error: Terjadi kesalahan internal server saat memproses permintaan.`);
  }
});

// Endpoint untuk konversi batch dengan template lengkap dan DOWNLOAD
app.get('/convert/template/:format', async (req, res) => {
  const format = req.params.format;
  const { links } = req.query;

  if (!['clash', 'surge', 'quantumult', 'singbox'].includes(format)) {
    return res.status(400).json({ error: "Format tidak didukung. Gunakan: clash, surge, quantumult, singbox" });
  }

  if (!links) return res.status(400).json({ error: "Parameter 'links' wajib diisi" });

  const linkArray = links.split(',').map(l => l.trim()).filter(l => l.length > 0);
  if (linkArray.length === 0) return res.status(400).json({ error: "Tidak ada link valid ditemukan" });

  try {
    const results = [];
    for (const link of linkArray) {
      try {
        const parsed = parseAnyLink(link);
        // Gunakan nama tag dari link asli jika tersedia
        const configName = parsed.name || "Proxy Server";
        const config = {
          ...parsed,
          name: configName,
          network: parsed.network || 'tcp'
        };
        const formats = {
          clash: toClash(config),
          surge: toSurge(config),
          quantumult: toQuantumult(config),
          singbox: toSingBox(config)
        };
        results.push({ original: config, formats, link });
      } catch (error) {
        results.push({ error: error.message, link });
      }
    }

    let config = '';
    switch (format) {
      case 'clash': config = await generateClashConfig(results); break;
      case 'surge': config = await generateSurgeConfig(results); break;
      case 'quantumult': config = await generateQuantumultConfig(results); break;
      case 'singbox':
        // Special handling for singbox full config
        const templatePath = path.join(__dirname, 'templates', `singbox.json`);
        let template;
        try {
            template = JSON.parse(await fs.readFile(templatePath, 'utf8'));
        } catch (e) {
            template = { outbounds: [{ tag: "proxy", type: "selector", outbounds: [] }] }; // Default template
        }
        const validProxies = results.filter(r => !r.error).map(r => JSON.parse(r.formats.singbox));
        template.outbounds[0].outbounds.push(...validProxies.map(p => p.tag));
        template.outbounds.push(...validProxies);
        config = JSON.stringify(template, null, 2);
        break;
    }

    const mimeTypes = {
      clash: 'text/yaml',
      surge: 'text/plain',
      quantumult: 'text/plain',
      singbox: 'application/json'
    };

    const extensions = {
      clash: 'yaml',
      surge: 'conf',
      quantumult: 'conf',
      singbox: 'json'
    };

    res.set('Content-Type', mimeTypes[format]);
    res.set('Content-Disposition', `attachment; filename="proxies.${extensions[format]}"`);
    res.send(config);
  } catch (error) {
    console.error("Error di /convert/template/:format:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint POST untuk batch convert (opsional, jika ingin body JSON)
app.post('/convert/batch', async (req, res) => {
  const { format, links } = req.body;
  if (!Array.isArray(links) || links.length === 0) {
    return res.status(400).json({ error: "Parameter 'links' harus array dan tidak kosong" });
  }
  if (!format || !['clash', 'surge', 'quantumult', 'singbox'].includes(format)) {
    return res.status(400).json({ error: "Parameter 'format' wajib: clash, surge, quantumult, singbox" });
  }

  try {
    const results = [];
    for (const link of links) {
      try {
        const parsed = parseAnyLink(link);
        // Gunakan nama tag dari link asli jika tersedia
        const configName = parsed.name || "Proxy Server";
        const config = {
          ...parsed,
          name: configName,
          network: parsed.network || 'tcp'
        };
        const formats = {
          clash: toClash(config),
          surge: toSurge(config),
          quantumult: toQuantumult(config),
          singbox: toSingBox(config)
        };
        results.push({ original: config, formats, link });
      } catch (error) {
        results.push({ error: error.message, link });
      }
    }

    let config = '';
    switch (format) {
      case 'clash': config = await generateClashConfig(results); break;
      case 'surge': config = await generateSurgeConfig(results); break;
      case 'quantumult': config = await generateQuantumultConfig(results); break;
      case 'singbox':
        const templatePath = path.join(__dirname, 'templates', `singbox.json`);
        let template;
        try {
            template = JSON.parse(await fs.readFile(templatePath, 'utf8'));
        } catch (e) {
            template = { outbounds: [{ tag: "proxy", type: "selector", outbounds: [] }] };
        }
        const validProxies = results.filter(r => !r.error).map(r => JSON.parse(r.formats.singbox));
        template.outbounds[0].outbounds.push(...validProxies.map(p => p.tag));
        template.outbounds.push(...validProxies);
        config = JSON.stringify(template, null, 2);
        break;
    }

    const mimeTypes = {
      clash: 'text/yaml',
      surge: 'text/plain',
      quantumult: 'text/plain',
      singbox: 'application/json'
    };

    const extensions = {
      clash: 'yaml',
      surge: 'conf',
      quantumult: 'conf',
      singbox: 'json'
    };

    res.set('Content-Type', mimeTypes[format]);
    res.set('Content-Disposition', `attachment; filename="proxies.${extensions[format]}"`);
    res.send(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Fallback
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found. Use /health?proxy=IP:PORT or /convert/:format?link=... or /convert/:format?links=...',
  });
});

// ✅ Graceful Shutdown
const server = app.listen(PORT, () => {
  console.log(`✅ Proxy Health Checker + Converter running on port ${PORT}`);
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

// ✅ Error Handler (Harus ditempatkan paling bawah)
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});
