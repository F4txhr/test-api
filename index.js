// index.js — versi ULTIMATE: proxy health + alerting + batch convert + full parser + template system

const express = require('express');
const net = require('net');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

app.use(cors());
app.use(express.json());
app.use(express.text());

// ✅ Rate Limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  skipFailedRequests: true,
  validate: { xForwardedForHeader: false }
});
app.use('/health', limiter);
app.use('/convert', limiter);
app.use('/convert-batch', limiter);

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
  const port = parseInt(portPart);

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
    throw new Error('Not a VLESS link');
  }

  const clean = link.replace('vless://', '');
  const [userinfo, rest] = clean.split('@');
  const [uuid] = userinfo.split(':');

  const [hostport, paramString] = rest.split('?');
  const [host, port] = hostport.split(':');

  const params = {};
  if (paramString) {
    paramString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
  }

  return {
    type: 'vless',
    uuid,
    host,
    port: parseInt(port),
    security: params.security || 'none',
    flow: params.flow || '',
    type: params.type || 'tcp',
    path: params.path || '/',
    host: params.host || params.sni || host,
    sni: params.sni || params.host || host,
    fp: params.fp || '',
    pbk: params.pbk || '',
    sid: params.sid || '',
    name: params['#'] ? decodeURIComponent(params['#']) : 'VLESS Server'
  };
}

function parseVMess(link) {
  if (!link.startsWith('vmess://')) {
    throw new Error('Not a VMess link');
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
      port: parseInt(obj.port),
      alterId: parseInt(obj.aid) || 0,
      security: obj.tls || 'none',
      network: obj.net || 'tcp',
      type: obj.type || 'none',
      path: obj.path || '/',
      host: obj.host || obj.add,
      sni: obj.sni || obj.host || obj.add,
      tls: obj.tls === 'tls',
      v: obj.v || '2',
      name: obj.ps || 'VMess Server'
    };
  } catch (e) {
    throw new Error('Invalid VMess base64 JSON');
  }
}

function parseTrojan(link) {
  if (!link.startsWith('trojan://')) {
    throw new Error('Not a Trojan link');
  }

  const clean = link.replace('trojan://', '');
  const [passwordWithParams, rest] = clean.split('@');
  const [hostport, paramString] = rest.split('?');
  const [host, port] = hostport.split(':');

  const params = {};
  if (paramString) {
    paramString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
  }

  return {
    type: 'trojan',
    password: passwordWithParams.split('?')[0],
    host,
    port: parseInt(port),
    security: params.security || 'tls',
    type: params.type || 'tcp',
    path: params.path || '/',
    host: params.host || host,
    sni: params.sni || params.host || host,
    name: params['#'] ? decodeURIComponent(params['#']) : 'Trojan Server'
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
      let vlessWsHeaders = '';
      if (config.type === 'ws' && config.host) {
        vlessWsHeaders = `  ws-headers:
    Host: ${config.host}`;
      }
      return `
- name: "${config.name.replace(/"/g, '\\"')}"
  type: vless
  server: ${config.host}
  port: ${config.port}
  uuid: ${config.uuid}
  tls: ${config.security !== 'none'}
  ${config.security !== 'none' ? `servername: ${config.sni}\n  ` : ''}
  ${config.flow ? `flow: ${config.flow}\n  ` : ''}
  ${config.type === 'ws' ? `network: ws\n  ws-path: ${config.path}\n${vlessWsHeaders}` : ''}
  udp: true
  skip-cert-verify: true
`.trim();

    case 'vmess':
      let vmessWsHeaders = '';
      if (config.network === 'ws' && config.host) {
        vmessWsHeaders = `  ws-headers:
    Host: ${config.host}`;
      }
      return `
- name: "${config.name.replace(/"/g, '\\"')}"
  type: vmess
  server: ${config.host}
  port: ${config.port}
  uuid: ${config.uuid}
  alterId: ${config.alterId}
  cipher: auto
  tls: ${config.tls}
  ${config.tls ? `servername: ${config.sni}\n  ` : ''}
  network: ${config.network}
  ${config.network === 'ws' ? `ws-path: ${config.path}\n${vmessWsHeaders}` : ''}
  udp: true
  skip-cert-verify: true
`.trim();

    case 'trojan':
      let trojanWsHeaders = '';
      if (config.type === 'ws' && config.host) {
        trojanWsHeaders = `  ws-headers:
    Host: ${config.host}`;
      }
      return `
- name: "${config.name.replace(/"/g, '\\"')}"
  type: trojan
  server: ${config.host}
  port: ${config.port}
  password: ${config.password}
  tls: true
  sni: ${config.sni}
  ${config.type === 'ws' ? `network: ws\n  ws-path: ${config.path}\n${trojanWsHeaders}` : ''}
  udp: true
  skip-cert-verify: true
`.trim();

    case 'ss':
      let pluginStr = '';
      if (config.plugin) {
        pluginStr = `  plugin: ${config.plugin}
  plugin-opts:
    mode: ${config.obfs || 'tls'}
    host: ${config.obfsHost || config.host}`;
      }
      return `
- name: "${config.name.replace(/"/g, '\\"')}"
  type: ss
  server: ${config.host}
  port: ${config.port}
  cipher: ${config.method}
  password: ${config.password}
  udp: true
${pluginStr}
`.trim();

    default:
      throw new Error(`Unsupported type for Clash: ${config.type}`);
  }
}

function toSurge(config) {
  switch (config.type) {
    case 'vless':
      let vlessOpts = `tls=true, sni=${config.sni}`;
      if (config.flow) vlessOpts += `, flow=${config.flow}`;
      if (config.type === 'ws') vlessOpts += `, ws=true, ws-path=${config.path}, ws-headers=Host:${config.host}`;
      return `${config.name} = vless, ${config.host}, ${config.port}, username=${config.uuid}, ${vlessOpts}`;
    case 'vmess':
      let vmessOpts = `tls=${config.tls}, ws=true, ws-path=${config.path}`;
      if (config.host) vmessOpts += `, ws-headers=Host:${config.host}`;
      return `${config.name} = vmess, ${config.host}, ${config.port}, username=${config.uuid}, ${vmessOpts}`;
    case 'trojan':
      let trojanOpts = `sni=${config.sni}`;
      if (config.type === 'ws') trojanOpts += `, ws=true, ws-path=${config.path}, ws-headers=Host:${config.host}`;
      return `${config.name} = trojan, ${config.host}, ${config.port}, password=${config.password}, ${trojanOpts}`;
    case 'ss':
      return `${config.name} = custom, ${config.host}, ${config.port}, ${config.method}, ${config.password}, https://raw.githubusercontent.com/ConnersHua/SSEncrypt/master/SSEncrypt.module`;
    default:
      throw new Error(`Unsupported type for Surge: ${config.type}`);
  }
}

function toQuantumult(config) {
  switch (config.type) {
    case 'vless':
      let vlessParams = `tls=true, sni=${config.sni}`;
      if (config.flow) vlessParams += `, flow=${config.flow}`;
      if (config.type === 'ws') vlessParams += `, ws=true, ws-path=${config.path}, ws-header=Host:${config.host}`;
      return `vmess=${config.host}:${config.port}, method=none, password=${config.uuid}, ${vlessParams}, tag=${config.name}`;
    case 'vmess':
      let vmessParams = `tls=${config.tls}, ws=true, ws-path=${config.path}`;
      if (config.host) vmessParams += `, ws-header=Host:${config.host}`;
      return `vmess=${config.host}:${config.port}, method=none, password=${config.uuid}, ${vmessParams}, tag=${config.name}`;
    case 'trojan':
      let trojanParams = `over-tls=true, tls-host=${config.sni}`;
      if (config.type === 'ws') trojanParams += `, ws=true, ws-path=${config.path}, ws-header=Host:${config.host}`;
      return `trojan=${config.host}:${config.port}, password=${config.password}, ${trojanParams}, tag=${config.name}`;
    case 'ss':
      let ssParams = `encrypt-method=${config.method}`;
      if (config.obfs) ssParams += `, obfs=${config.obfs}, obfs-host=${config.obfsHost}`;
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
    base.tls = {
      enabled: config.security !== 'none' || config.tls,
      server_name: config.sni
    };
    if (config.flow) base.flow = config.flow;
    if (config.type === 'ws' || config.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: config.path,
        headers: { Host: config.host }
      };
    }
  } else if (config.type === 'trojan') {
    base.password = config.password;
    base.tls = {
      enabled: true,
      server_name: config.sni
    };
    if (config.type === 'ws') {
      base.transport = {
        type: 'ws',
        path: config.path,
        headers: { Host: config.host }
      };
    }
  } else if (config.type === 'ss') {
    base.method = config.method;
    base.password = config.password;
    if (config.plugin) {
      base.plugin = config.plugin;
      base.plugin_opts = config.pluginOpts;
    }
  }

  return JSON.stringify(base, null, 2);
}

// ================================
// 🧩 TEMPLATE SYSTEM — Load from files
// ================================

async function loadTemplate(format) {
  try {
    const templatePath = path.join(__dirname, 'templates', `${format}.json`);
    const data = await fs.readFile(templatePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Gagal load template ${format}:`, error.message);
    throw new Error(`Template ${format} tidak ditemukan`);
  }
}

async function loadTemplateText(format) {
  try {
    const ext = format === 'clash' ? 'yaml' : 'conf';
    const templatePath = path.join(__dirname, 'templates', `${format}.${ext}`);
    return await fs.readFile(templatePath, 'utf8');
  } catch (error) {
    console.error(`Gagal load template ${format}:`, error.message);
    throw new Error(`Template ${format} tidak ditemukan`);
  }
}

async function generateSingBoxConfig(results) {
  const template = await loadTemplate('singbox');
  const validProxies = results.filter(r => !r.error).map(r => JSON.parse(r.formats.singbox));

  template.outbounds[0].outbounds.push(...validProxies.map(p => p.tag));
  template.outbounds.push(...validProxies);

  return JSON.stringify(template, null, 2);
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
// 🔄 ENDPOINT CONVERT — SINGLE & BATCH
// ================================

app.get('/convert/clash', async (req, res) => {
  const { link } = req.query;
  if (!link) return res.status(400).json({ error: "Missing 'link'" });
  try {
    const parsed = parseAnyLink(link);
    const formats = {
      clash: toClash(parsed),
      surge: toSurge(parsed),
      quantumult: toQuantumult(parsed),
      singbox: toSingBox(parsed)
    };
    const config = await generateClashConfig([{ original: parsed, formats, link }]);
    res.set('Content-Type', 'text/yaml');
    res.set('Content-Disposition', 'attachment; filename="proxies.yaml"');
    res.send(config);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/convert/surge', async (req, res) => {
  const { link } = req.query;
  if (!link) return res.status(400).json({ error: "Missing 'link'" });
  try {
    const parsed = parseAnyLink(link);
    const formats = {
      clash: toClash(parsed),
      surge: toSurge(parsed),
      quantumult: toQuantumult(parsed),
      singbox: toSingBox(parsed)
    };
    const config = await generateSurgeConfig([{ original: parsed, formats, link }]);
    res.set('Content-Type', 'text/plain');
    res.set('Content-Disposition', 'attachment; filename="proxies.conf"');
    res.send(config);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/convert/quantumult', async (req, res) => {
  const { link } = req.query;
  if (!link) return res.status(400).json({ error: "Missing 'link'" });
  try {
    const parsed = parseAnyLink(link);
    const formats = {
      clash: toClash(parsed),
      surge: toSurge(parsed),
      quantumult: toQuantumult(parsed),
      singbox: toSingBox(parsed)
    };
    const config = await generateQuantumultConfig([{ original: parsed, formats, link }]);
    res.set('Content-Type', 'text/plain');
    res.set('Content-Disposition', 'attachment; filename="proxies.conf"');
    res.send(config);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/convert/singbox', async (req, res) => {
  const { link } = req.query;
  if (!link) return res.status(400).json({ error: "Missing 'link'" });
  try {
    const parsed = parseAnyLink(link);
    const formats = {
      clash: toClash(parsed),
      surge: toSurge(parsed),
      quantumult: toQuantumult(parsed),
      singbox: toSingBox(parsed)
    };
    const config = await generateSingBoxConfig([{ original: parsed, formats, link }]);
    res.set('Content-Type', 'application/json');
    res.set('Content-Disposition', 'attachment; filename="proxies.json"');
    res.send(config);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/convert', async (req, res) => {
  const { format, links } = req.query;
  if (!format || !['clash', 'surge', 'quantumult', 'singbox'].includes(format)) {
    return res.status(400).json({ error: "Parameter 'format' wajib: clash, surge, quantumult, singbox" });
  }
  if (!links) return res.status(400).json({ error: "Parameter 'links' wajib diisi" });

  const linkArray = links.split(',').map(l => l.trim()).filter(l => l.length > 0);
  if (linkArray.length === 0) return res.status(400).json({ error: "Tidak ada link valid ditemukan" });

  try {
    const results = [];
    for (const link of linkArray) {
      try {
        const parsed = parseAnyLink(link);
        const formats = {
          clash: toClash(parsed),
          surge: toSurge(parsed),
          quantumult: toQuantumult(parsed),
          singbox: toSingBox(parsed)
        };
        results.push({ original: parsed, formats, link });
      } catch (error) {
        results.push({ error: error.message, link });
      }
    }

    let config = '';
    switch (format) {
      case 'clash': config = await generateClashConfig(results); break;
      case 'surge': config = await generateSurgeConfig(results); break;
      case 'quantumult': config = await generateQuantumultConfig(results); break;
      case 'singbox': config = await generateSingBoxConfig(results); break;
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
        const formats = {
          clash: toClash(parsed),
          surge: toSurge(parsed),
          quantumult: toQuantumult(parsed),
          singbox: toSingBox(parsed)
        };
        results.push({ original: parsed, formats, link });
      } catch (error) {
        results.push({ error: error.message, link });
      }
    }

    let config = '';
    switch (format) {
      case 'clash': config = await generateClashConfig(results); break;
      case 'surge': config = await generateSurgeConfig(results); break;
      case 'quantumult': config = await generateQuantumultConfig(results); break;
      case 'singbox': config = await generateSingBoxConfig(results); break;
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
    error: 'Endpoint not found. Use /health?proxy=IP:PORT or /convert?format=clash&links=...',
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

// ✅ Error Handler
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});
