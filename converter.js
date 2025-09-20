// converter.js
const fs = require('fs').promises;
const path = require('path');

// --- Fungsi Ekstraksi Link SEDERHANA untuk GET ---
// Karena sekarang kita fokus pada POST, fungsi ini bisa disederhanakan atau dihapus
// Tapi tetap dipertahankan untuk kompatibilitas endpoint GET
async function extractLinks(rawInput) {
  console.log("--- DEBUG: Mulai proses ekstraksi link (Metode GET - Sederhana) ---");
  console.log("Panjang input 'link' dari user:", rawInput.length);

  if (!rawInput || typeof rawInput !== 'string') {
      console.log("DEBUG: Input tidak valid atau kosong.");
      throw new Error('Input link tidak valid.');
  }

  // Untuk metode GET, kita asumsikan input adalah satu link atau beberapa link dipisah koma
  // Ini adalah versi sederhana dan tidak sefleksibel versi regex sebelumnya
  const potentialLinks = rawInput.split(',').map(l => l.trim()).filter(l => l.length > 0);

  const extractedLinks = [];
  for (let i = 0; i < potentialLinks.length; i++) {
      const link = potentialLinks[i];
      // Validasi sederhana awal
      if (link.length > 30 && (link.includes('@') || link.includes('#'))) {
          console.log(`DEBUG: Link ${i+1} lolos validasi awal (GET).`);
          extractedLinks.push(link);
      } else {
          console.warn(`DEBUG: Link ${i+1} diabaikan karena tidak lulus validasi awal (GET). Panjang: ${link.length}`);
      }
  }

  console.log("DEBUG: Link yang berhasil diekstrak (GET):", extractedLinks.map(l => l.substring(0, 50) + (l.length > 50 ? "..." : "")));
  console.log("--- DEBUG: Akhir proses ekstraksi link (GET) ---");

  if (extractedLinks.length === 0) {
      throw new Error('Tidak ditemukan link VPN yang valid dalam input GET.');
  }

  return extractedLinks;
}
// --- Akhir Fungsi Ekstraksi Link Sederhana ---


// ================================
// 🔄 PARSER & CONVERTER — VLESS, VMess, Trojan, Shadowsocks (SUPPORT WS!)
// ================================

// --- Fungsi Parsing Shadowsocks (Diperbaiki untuk Plugin) ---
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

  // --- Perubahan Utama: Jangan pisah plugin string di sini ---
  // Simpan seluruh string plugin apa adanya
  let plugin = ''; // Ini akan menyimpan seluruh string plugin dari query string
  let pluginOpts = ''; // Ini tidak akan digunakan, tapi tetap dibiarkan untuk kompatibilitas
  let obfs = '';
  let obfsHost = '';
  // --- Akhir Perubahan ---

  if (paramParts.length > 0) {
      const params = new URLSearchParams(paramParts.join('?'));
      // --- Perubahan Utama: Ambil plugin string penuh ---
      plugin = params.get('plugin') || ''; // Contoh: "v2ray-plugin;tls;mux=0;mode=websocket;..."
      // --- Akhir Perubahan ---
      if (plugin.includes(';')) {
          const [p, opts] = plugin.split(';', 2);
          // plugin = p; // JANGAN TIMPA plugin dengan hanya nama plugin-nya
          pluginOpts = opts; // Simpan bagian opsinya jika diperlukan untuk hal lain
      }
      obfs = params.get('obfs') || '';
      obfsHost = params.get('obfs-host') || '';
  }

  // Pastikan name/tag diambil dari fragment
  let name = 'SS Server';
  if (link.includes('#')) {
      try {
          name = decodeURIComponent(link.split('#')[1]);
      } catch (e) {
          console.warn("Gagal decode fragment untuk SS link:", e.message);
          name = link.split('#')[1] || name;
      }
  }

  return {
      type: 'ss',
      method,
      password,
      host,
      port,
      plugin, // <-- Sekarang berisi string plugin lengkap
      pluginOpts, // <-- Tetap ada, walau tidak digunakan oleh toSingBox
      obfs,
      obfsHost,
      name: name
  };
}
// --- Akhir Fungsi Parsing Shadowsocks (Diperbaiki) ---

function parseVLESS(link) {
  // ... (kode parseVLESS tetap sama)
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
      fragmentName = paramParts[1] ? paramParts[1] : '';

      if (queryParams) {
          queryParams.split('&').forEach(pair => {
              const [key, value] = pair.split('=');
              if (key) {
                  params[decodeURIComponent(key)] = decodeURIComponent(value || '');
              }
          });
      }
  }

  // Decode fragment name/tag
  let name = 'VLESS Server';
  if (fragmentName) {
      try {
          name = decodeURIComponent(fragmentName);
      } catch (e) {
          console.warn("Gagal decode fragment untuk VLESS link:", e.message);
          name = fragmentName;
      }
  }

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
  // ... (kode parseVMess tetap sama)
  if (!link.startsWith('vmess://')) {
      throw new Error('Bukan link VMess');
  }

  const base64 = link.replace('vmess://', '');
  let jsonStr;
  try {
      jsonStr = Buffer.from(base64, 'base64').toString('utf8');
      const obj = JSON.parse(jsonStr);
      // Decode name/tag dari ps
      let name = 'VMess Server';
      if (obj.ps) {
          try {
              name = decodeURIComponent(obj.ps);
          } catch (e) {
              console.warn("Gagal decode 'ps' untuk VMess link:", e.message);
              name = obj.ps;
          }
      }
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
          name: name
      };
  } catch (e) {
      throw new Error('Invalid VMess base64 JSON');
  }
}

function parseTrojan(link) {
  // ... (kode parseTrojan tetap sama)
  if (!link.startsWith('trojan://')) {
      throw new Error('Bukan link Trojan');
  }

  // Perbaikan ekstraksi yang lebih robust
  const cleanLink = link.substring('trojan://'.length);

  const paramStartIndex = cleanLink.indexOf('?');
  const fragmentStartIndex = cleanLink.indexOf('#');

  let userinfo_and_serverinfo = '';
  let paramString = '';
  let fragment = '';

  if (paramStartIndex === -1 && fragmentStartIndex === -1) {
      userinfo_and_serverinfo = cleanLink;
  } else if (paramStartIndex !== -1 && fragmentStartIndex === -1) {
      userinfo_and_serverinfo = cleanLink.substring(0, paramStartIndex);
      paramString = cleanLink.substring(paramStartIndex + 1);
  } else if (paramStartIndex === -1 && fragmentStartIndex !== -1) {
      userinfo_and_serverinfo = cleanLink.substring(0, fragmentStartIndex);
      fragment = cleanLink.substring(fragmentStartIndex + 1);
  } else {
      userinfo_and_serverinfo = cleanLink.substring(0, paramStartIndex);
      if (fragmentStartIndex > paramStartIndex) {
          paramString = cleanLink.substring(paramStartIndex + 1, fragmentStartIndex);
          fragment = cleanLink.substring(fragmentStartIndex + 1);
      } else {
          paramString = cleanLink.substring(paramStartIndex + 1);
      }
  }

  const [userinfo, serverinfo] = userinfo_and_serverinfo.split('@');
  if (!userinfo || !serverinfo) {
      throw new Error('Invalid Trojan link format: Missing userinfo or serverinfo');
  }

  const [host, portStr] = serverinfo.split(':');
  const port = parseInt(portStr, 10);
  if (isNaN(port)) {
      throw new Error('Invalid Trojan link format: Invalid port');
  }

  const params = {};
  if (paramString) {
      paramString.split('&').forEach(pair => {
          if (pair) {
              const [key, value = ''] = pair.split('=');
              if (key) {
                  params[decodeURIComponent(key)] = decodeURIComponent(value);
              }
          }
      });
  }

  let name = 'Trojan Server';
  if (fragment) {
      try {
          name = decodeURIComponent(fragment);
      } catch (e) {
          console.warn("Gagal mendecode fragment/tag untuk Trojan link:", e.message);
          name = fragment || name;
      }
  }

  return {
      type: 'trojan',
      password: userinfo,
      host,
      port: port,
      security: 'tls', // Trojan biasanya TLS
      network: params.type || 'tcp',
      path: params.path || (params.type === 'ws' ? '/' : ''),
      host_header: params.host || host,
      sni: params.sni || params.host || host,
      alpn: params.alpn || '',
      fp: params.fp || '',
      allowInsecure: params.allowInsecure === '1' || params.allowInsecure === 'true' || false,
      name: name,
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
  // ... (kode toClash tetap sama)
  switch (config.type) {
      case 'vless':
          let vlessConfig = `- name: "${config.name.replace(/"/g, '\\"')}"`
              + `\n  type: vless`
              + `\n  server: ${config.host}`
              + `\n  port: ${config.port}`
              + `\n  uuid: ${config.uuid}`
              + `\n  udp: true`
              + `\n  skip-cert-verify: ${!!config.allowInsecure}`
              ;
          if (config.security === 'tls' || config.security === 'reality') {
              vlessConfig += `\n  tls: true`;
              if(config.sni) vlessConfig += `\n  servername: ${config.sni}`;
              if(config.alpn) vlessConfig += `\n  alpn: [${config.alpn.split(',').map(a => `"${a.trim()}"`).join(', ')}]`;
              if(config.fp) vlessConfig += `\n  fingerprint: ${config.fp}`;
              if(config.security === 'reality') {
                  vlessConfig += `\n  client-fingerprint: ${config.fp}`;
                  if(config.pbk) vlessConfig += `\n  public-key: ${config.pbk}`;
                  if(config.sid) vlessConfig += `\n  short-id: ${config.sid}`;
                  if(config.spx) vlessConfig += `\n  spider-x: ${config.spx}`;
              } else if (config.security === 'tls') {
                  if (config.flow) vlessConfig += `\n  flow: ${config.flow}`;
              }
          } else {
              vlessConfig += `\n  tls: false`;
          }

          if (config.network === 'ws') {
              vlessConfig += `\n  network: ws`;
              vlessConfig += `\n  ws-path: ${config.path || '/'}`;
              if (config.host_header) {
                  vlessConfig += `\n  ws-headers:`
                      + `\n    host: ${config.host_header}`;
              }
          }
          return vlessConfig;

      case 'vmess':
          let vmessConfig = `- name: "${config.name.replace(/"/g, '\\"')}"`
              + `\n  type: vmess`
              + `\n  server: ${config.host}`
              + `\n  port: ${config.port}`
              + `\n  uuid: ${config.uuid}`
              + `\n  alterId: ${config.alterId}`
              + `\n  cipher: ${config.security}`
              + `\n  udp: true`
              + `\n  skip-cert-verify: ${!!config.allowInsecure}`
              ;
          if (config.tls) {
              vmessConfig += `\n  tls: true`;
              if(config.sni) vmessConfig += `\n  servername: ${config.sni}`;
              if(config.alpn) vmessConfig += `\n  alpn: [${config.alpn.split(',').map(a => `"${a.trim()}"`).join(', ')}]`;
              if(config.fp) vmessConfig += `\n  fingerprint: ${config.fp}`;
          } else {
              vmessConfig += `\n  tls: false`;
          }

          if (config.network === 'ws') {
              vmessConfig += `\n  network: ws`;
              vmessConfig += `\n  ws-path: ${config.path || '/'}`;
              if (config.host_header) {
                  vmessConfig += `\n  ws-headers:`
                      + `\n    host: ${config.host_header}`;
              }
          }

          return vmessConfig;

      case 'trojan':
          let trojanConfig = `- name: "${config.name.replace(/"/g, '\\"')}"`
              + `\n  type: trojan`
              + `\n  server: ${config.host}`
              + `\n  port: ${config.port}`
              + `\n  password: ${config.password}`
              + `\n  udp: true`
              + `\n  skip-cert-verify: ${!!config.allowInsecure}`
              + `\n  tls: true`
              ;
          // Trojan biasanya TLS
          if(config.sni) trojanConfig += `\n  sni: ${config.sni}`;
          if(config.alpn) trojanConfig += `\n  alpn: [${config.alpn.split(',').map(a => `"${a.trim()}"`).join(', ')}]`;
          if(config.fp) trojanConfig += `\n  fingerprint: ${config.fp}`;

          if (config.network === 'ws') {
              trojanConfig += `\n  network: ws`;
              trojanConfig += `\n  ws-path: ${config.path || '/'}`;
              if (config.host_header) {
                  trojanConfig += `\n  ws-headers:`
                      + `\n    host: ${config.host_header}`;
              }
          }

          return trojanConfig;

      case 'ss':
          let ssConfig = `- name: "${config.name.replace(/"/g, '\\"')}"`
              + `\n  type: ss`
              + `\n  server: ${config.host}`
              + `\n  port: ${config.port}`
              + `\n  cipher: ${config.method}`
              + `\n  password: ${config.password}`
              + `\n  udp: true`
              ;
          if (config.plugin) {
              ssConfig += `\n  plugin: ${config.plugin}`;
              if (config.plugin.includes('v2ray-plugin') || config.plugin.includes('obfs')) {
                  const opts = {};
                  if (config.plugin.includes(';')) {
                      const parts = config.plugin.split(';');
                      for (let i = 1; i < parts.length; i++) {
                          const [k, v] = parts[i].split('=');
                          if (k) opts[decodeURIComponent(k.trim())] = v ? decodeURIComponent(v.trim()) : true;
                      }
                  }
                  if (Object.keys(opts).length > 0) {
                      ssConfig += `\n  plugin-opts:`;
                      for (const [k, v] of Object.entries(opts)) {
                          if (k === 'mode' || k === 'host' || k === 'path') {
                              ssConfig += `\n    ${k}: ${v}`;
                          } else if (k === 'tls') {
                              ssConfig += `\n    ${k}: ${v === 'true' || v === true}`;
                          } else if (k === 'mux') {
                              ssConfig += `\n    ${k}: ${parseInt(v, 10) || 0}`;
                          } else {
                              ssConfig += `\n    ${k}: ${v}`;
                          }
                      }
                  } else if (config.obfs) {
                      ssConfig += `\n  plugin-opts:`
                          + `\n    mode: ${config.obfs}`;
                      if (config.obfsHost) ssConfig += `\n    host: ${config.obfsHost}`;
                  }
              } else {
                  ssConfig += `\n  plugin-opts: {}`;
              }
          }
          return ssConfig;

      default:
          // Pesan error yang lebih umum
          throw new Error(`Tidak dapat mengkonversi protokol '${config.type}' ke format Clash.`);
  }
}

function toSurge(config) {
  // ... (kode toSurge tetap sama)
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
          if (config.plugin) {
              return `${config.name} = custom, ${config.host}, ${config.port}, ${config.method}, ${config.password}, https://raw.githubusercontent.com/ConnersHua/SSEncrypt/master/SSEncrypt.module`;
          } else {
              return `${config.name} = ss, ${config.host}, ${config.port}, ${config.method}, ${config.password}`;
          }
      default:
          throw new Error(`Unsupported type for Surge: ${config.type}`);
  }
}

function toQuantumult(config) {
  // ... (kode toQuantumult tetap sama)
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
          return `shadowsocks=${config.host}:${config.port}, method=${config.method}, password=${config.password}, ${ssParams}, tag=${config.name}`;
      default:
          throw new Error(`Unsupported type for Quantumult: ${config.type}`);
  }
}

// --- Fungsi toSingBox dengan Perbaikan plugin_opts (String) dan Log Debugging ---
function toSingBox(config) {
  // --- Tambahkan log ini untuk debugging ---
  console.log("--- DEBUG: Memulai toSingBox untuk config ---");
  console.log("DEBUG: config.type:", config.type);
  console.log("DEBUG: config.name (tag):", config.name);
  console.log("DEBUG: config.network:", config.network);
  console.log("DEBUG: config.host_header:", config.host_header);
  console.log("DEBUG: config.path:", config.path);
  console.log("DEBUG: config.plugin:", config.plugin);
  // --- Akhir log debugging ---

  let base = {
      tag: config.name,
      type: config.type === 'ss' ? 'shadowsocks' : config.type,
      server: config.host,
      server_port: config.port
  };

  if (config.type === 'vless' || config.type === 'vmess') {
      base.uuid = config.uuid;
      if (config.type === 'vmess') base.alter_id = config.alterId;
      // --- Tambahkan log ini ---
      console.log("DEBUG: Memeriksa network untuk vless/vmess:", config.network);
      if (config.network === 'ws') {
          console.log("DEBUG: Membuat transport WS untuk vless/vmess");
          base.transport = {
              type: 'ws',
              path: config.path || '/',
              headers: config.host_header ? { host: config.host_header } : {}
          };
          console.log("DEBUG: Transport WS dibuat:", JSON.stringify(base.transport, null, 2));
      }
      // --- Akhir log debugging ---

      if (config.network === 'grpc') {
          base.transport = {
              type: 'grpc',
              service_name: config.serviceName || ''
          };
      }

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
      // --- Tambahkan log ini ---
      console.log("DEBUG: Memeriksa network untuk trojan:", config.network);
      if (config.network === 'ws') {
          console.log("DEBUG: Membuat transport WS untuk trojan");
          base.transport = {
              type: 'ws',
              path: config.path || '/',
              headers: config.host_header ? { host: config.host_header } : {}
          };
          console.log("DEBUG: Transport WS dibuat:", JSON.stringify(base.transport, null, 2));
      }
      // --- Akhir log debugging ---

      base.tls = {
          enabled: true,
          server_name: config.sni || config.host,
          insecure: !!config.allowInsecure,
          utls: { enabled: true, fingerprint: config.fp || "chrome" }
      };
      if (config.alpn) {
          base.tls.alpn = config.alpn.split(',').map(a => a.trim()).filter(a => a);
      }

  } else if (config.type === 'ss') {
      base.method = config.method;
      base.password = config.password;

      // --- Perbaikan dan Log Debugging untuk Plugin SS (STRING) ---
      console.log("DEBUG (SS Plugin): Memeriksa config.plugin:", JSON.stringify(config.plugin));

      if (config.plugin) {
          console.log("DEBUG (SS Plugin): Plugin string ditemukan, menggunakan string langsung untuk plugin_opts.");
          // --- Perubahan Utama: Gunakan string plugin langsung sebagai plugin_opts ---
          // Ini menghasilkan format string seperti yang diinginkan client SagerNet
          // Contoh: "tls;mux=0;mode=websocket;path=/...;host=..."
          base.plugin = "v2ray-plugin"; // Atau "obfs-local" jika sesuai
          base.plugin_opts = config.plugin; // <-- String plugin lengkap dari parseSS
          console.log("DEBUG (SS Plugin): Plugin dan plugin_opts (STRING) akhir:", JSON.stringify({ plugin: base.plugin, plugin_opts: base.plugin_opts }, null, 2));
      }
      // --- Akhir Perbaikan dan Log Debugging untuk Plugin SS (STRING) ---

  }

  const result = JSON.stringify(base, null, 2);
  console.log("DEBUG: Hasil akhir toSingBox (potongan):", result.substring(0, 200) + (result.length > 200 ? "..." : ""));
  console.log("--- DEBUG: Akhir toSingBox ---");
  return result;
}


// ================================
// 🧩 TEMPLATE SYSTEM & GENERATORS
// ================================

// Simple in-memory cache for templates
const templateCache = {};

async function loadTemplateText(format) {
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

// --- Fungsi Generate Config dengan Template ---

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

// Fungsi khusus untuk Sing-Box dengan URL Test Otomatis dari Template
async function generateSingBoxConfig(results) {
  const templatePath = path.join(__dirname, 'templates', `singbox.json`);
  let template;
  try {
      template = JSON.parse(await fs.readFile(templatePath, 'utf8'));
  } catch (e) {
      console.warn(`Template singbox.json tidak ditemukan, menggunakan template default.`);
      template = {
          log: { level: "info", timestamp: true },
          inbounds: [
              {
                  type: "tun",
                  tag: "tun-in",
                  interface_name: "tun0",
                  address: "172.19.0.1/30",
                  auto_route: true,
                  strict_route: true,
                  sniff: true
              }
          ],
          outbounds: [
              {
                  type: "selector",
                  tag: "🚀 PROXY",
                  outbounds: ["direct"]
              },
              {
                  type: "direct",
                  tag: "direct"
              },
              {
                  type: "block",
                  tag: "block"
              }
          ]
      };
  }

  const validProxies = results
      .filter(r => !r.error)
      .map(r => {
          try {
              return JSON.parse(r.formats.singbox);
          } catch (e) {
              console.error("Gagal parse konfigurasi singbox untuk:", r.link, e.message);
              return null;
          }
      })
      .filter(p => p !== null);

  if (template.outbounds && Array.isArray(template.outbounds)) {
      const selectorOutbound = template.outbounds.find(ob => ob.type === 'selector');
      if (selectorOutbound) {
          const proxyTags = validProxies.map(p => p.tag);
          const currentOutbounds = selectorOutbound.outbounds || [];
          const newOutboundsSet = new Set([...currentOutbounds, ...proxyTags]);
          selectorOutbound.outbounds = Array.from(newOutboundsSet);
      } else {
          template.outbounds.unshift({
              type: "selector",
              tag: "🚀 PROXY",
              outbounds: ["direct", ...validProxies.map(p => p.tag)]
          });
      }
      template.outbounds.push(...validProxies);
  } else {
      template.outbounds = [
          { type: "selector", tag: "🚀 PROXY", outbounds: ["direct", ...validProxies.map(p => p.tag)] },
          { type: "direct", tag: "direct" },
          { type: "block", tag: "block" },
          ...validProxies
      ];
  }

  // --- Perubahan Utama: Tambahkan Outbound URL Test Otomatis ---
  // Kita asumsikan template memiliki placeholder atau struktur tertentu.
  // Misalnya, template memiliki outbound urltest kosong yang siap diisi:
  /*
  {
    "type": "urltest",
    "tag": "Best Latency 🚀",
    "outbounds": [],
    "url": "https://www.gstatic.com/generate_204",
    "interval": "1m"
  }
  */
  // Atau, kita bisa mencari outbound dengan tag tertentu dan mengisinya.
  // Untuk fleksibilitas, kita cari semua outbound urltest dan isi `outbounds` mereka.
  if (template.outbounds && Array.isArray(template.outbounds)) {
      const urlTestOutbounds = template.outbounds.filter(ob => ob.type === 'urltest');
      if (urlTestOutbounds.length > 0) {
          console.log(`DEBUG (SingBox URL Test Otomatis): Menemukan ${urlTestOutbounds.length} outbound urltest di template. Mengisi dengan proxy yang valid...`);
          const validProxyTags = validProxies.map(p => p.tag);
          urlTestOutbounds.forEach(ut => {
              // Isi `outbounds` dengan semua proxy yang valid jika masih kosong
              if (!ut.outbounds || ut.outbounds.length === 0) {
                  ut.outbounds = [...validProxyTags];
                  console.log(`DEBUG (SingBox URL Test Otomatis): Outbound '${ut.tag}' diisi dengan semua proxy.`);
              } else {
                  // Jika sudah ada daftar, pastikan hanya berisi proxy yang valid
                  ut.outbounds = ut.outbounds.filter(tag => validProxyTags.includes(tag));
                  console.log(`DEBUG (SingBox URL Test Otomatis): Outbound '${ut.tag}' difilter. Sekarang berisi ${ut.outbounds.length} proxy.`);
              }
          });
      } else {
          console.log("DEBUG (SingBox URL Test Otomatis): Tidak ditemukan outbound urltest di template. Tidak ada yang ditambahkan.");
      }
  }
  // --- Akhir Perubahan Utama: Tambahkan Outbound URL Test Otomatis ---

  return JSON.stringify(template, null, 2);
}


// ================================
// 🔄 ENDPOINT CONVERT HANDLERS — GET & POST
// (Bagian ini tetap SAMA seperti sebelumnya, kecuali pemanggilan generateSingBoxConfig)
// ================================

// --- Handler untuk GET /convert/:format ---
async function handleConvertRequest(req, res) {
  const format = req.params.format.toLowerCase();
  const { link } = req.query;

  if (!['clash', 'surge', 'quantumult', 'singbox'].includes(format)) {
      return res.status(400).send(`Error: Format tidak didukung. Gunakan: clash, surge, quantumult, singbox`);
  }

  if (!link) {
      return res.status(400).send(`Error: Parameter 'link' wajib diisi`);
  }

  try {
      // --- 1. Ekstrak Link (Metode GET - Sederhana) ---
      const extractedLinks = await extractLinks(link);

      // --- 2. Proses Konversi untuk Semua Link yang Terdeteksi ---
      const results = [];
      for (let i = 0; i < extractedLinks.length; i++) {
          const singleLink = extractedLinks[i];

          if (!singleLink.startsWith('vless://') && !singleLink.startsWith('vmess://') &&
              !singleLink.startsWith('trojan://') && !singleLink.startsWith('ss://')) {
              console.warn(`Link diabaikan (bukan VPN yang dikenali): ${singleLink.substring(0, 50)}...`);
              results.push({ error: "Bukan link VPN yang dikenali (vless, vmess, trojan, ss)", link: singleLink });
              continue;
          }

          try {
              const parsed = parseAnyLink(singleLink);
              const originalName = parsed.name || "Proxy Server";
              // Tambahkan suffix nomor urut dan identifier unik
              const configName = `${originalName}-${i + 1} [vortexVpn]`;

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
              results.push({ original: config, formats, link: singleLink });
          } catch (convertError) {
              console.error(`Gagal konversi link (${singleLink.substring(0, 50)}...):`, convertError.message);
              results.push({ error: convertError.message, link: singleLink });
          }
      }

      // --- 3. Filter hasil dan tentukan response ---
      const successfulResults = results.filter(r => !r.hasOwnProperty('error'));
      const failedResults = results.filter(r => r.hasOwnProperty('error'));

      const mimeTypes = {
          clash: 'text/yaml',
          surge: 'text/plain',
          quantumult: 'text/plain',
          singbox: 'application/json'
      };

      if (successfulResults.length > 0) {
          let config = '';
          switch (format) {
              case 'clash':
                  config = await generateClashConfig(successfulResults);
                  break;
              case 'surge':
                  config = await generateSurgeConfig(successfulResults);
                  break;
              case 'quantumult':
                  config = await generateQuantumultConfig(successfulResults);
                  break;
              case 'singbox':
                  // --- Perubahan: Gunakan fungsi generate yang baru ---
                  config = await generateSingBoxConfig(successfulResults);
                  // --- Akhir Perubahan ---
                  break;
          }

          res.set('Content-Type', mimeTypes[format]);
          // Opsional: Tambahkan header informasi
          res.set('X-Proxies-Processed', successfulResults.length.toString());
          if (failedResults.length > 0) {
              res.set('X-Proxies-Failed', failedResults.length.toString());
          }
          return res.send(config);

      } else {
          const errorMessages = failedResults.map(r => `Link: ${r.link}\nError: ${r.error}`).join('\n\n');
          res.set('Content-Type', 'text/plain');
          return res.status(400).send(`Semua link gagal dikonversi:\n\n${errorMessages}`);
      }

  } catch (error) {
      // Tangkap error dari extractLinks atau error lainnya
      console.error("Error di handleConvertRequest (GET):", error);
      res.status(400).send(`Error: ${error.message}`);
  }
}

// --- Handler untuk POST /convert/:format ---
async function handleConvertPostRequest(req, res) {
  const format = req.params.format?.toLowerCase();
  // --- Perubahan Utama: Terima data dari body ---
  // Harap kirim dalam bentuk { "links": ["link1", "link2", ...] }
  const { links } = req.body;
  // --- Akhir Perubahan ---

  if (!format || !['clash', 'surge', 'quantumult', 'singbox'].includes(format)) {
      return res.status(400).send(`Error: Format tidak didukung. Gunakan: clash, surge, quantumult, singbox`);
  }

  // --- Perubahan Utama: Validasi body POST ---
  if (!links || !Array.isArray(links) || links.length === 0) {
      return res.status(400).send(`Error: Body permintaan harus berisi array 'links' yang tidak kosong. Contoh: { "links": ["link1", "link2"] }`);
  }
  // --- Akhir Perubahan ---

  // --- Logika konversi tetap sama seperti GET, tapi data sumbernya berbeda ---
  try {
      const results = [];
      for (let i = 0; i < links.length; i++) {
          const singleLink = links[i];

          if (!singleLink.startsWith('vless://') && !singleLink.startsWith('vmess://') &&
              !singleLink.startsWith('trojan://') && !singleLink.startsWith('ss://')) {
              console.warn(`Link diabaikan (bukan VPN yang dikenali): ${singleLink.substring(0, 50)}...`);
              results.push({ error: "Bukan link VPN yang dikenali (vless, vmess, trojan, ss)", link: singleLink });
              continue;
          }

          try {
              const parsed = parseAnyLink(singleLink);
              const originalName = parsed.name || "Proxy Server";
              const configName = `${originalName}-${i + 1} [vortexVpn]`;

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
              results.push({ original: config, formats, link: singleLink });
          } catch (convertError) {
              console.error(`Gagal konversi link (${singleLink.substring(0, 50)}...):`, convertError.message);
              results.push({ error: convertError.message, link: singleLink });
          }
      }

      const successfulResults = results.filter(r => !r.hasOwnProperty('error'));
      const failedResults = results.filter(r => r.hasOwnProperty('error'));

      const mimeTypes = {
          clash: 'text/yaml',
          surge: 'text/plain',
          quantumult: 'text/plain',
          singbox: 'application/json'
      };

      if (successfulResults.length > 0) {
          let config = '';
          switch (format) {
              case 'clash':
                  config = await generateClashConfig(successfulResults);
                  break;
              case 'surge':
                  config = await generateSurgeConfig(successfulResults);
                  break;
              case 'quantumult':
                  config = await generateQuantumultConfig(successfulResults);
                  break;
              case 'singbox':
                  // --- Perubahan: Gunakan fungsi generate yang baru ---
                  config = await generateSingBoxConfig(successfulResults);
                  // --- Akhir Perubahan ---
                  break;
          }

          res.set('Content-Type', mimeTypes[format]);
          res.set('X-Proxies-Processed', successfulResults.length.toString());
          if (failedResults.length > 0) {
              res.set('X-Proxies-Failed', failedResults.length.toString());
          }
          return res.send(config);

      } else {
          const errorMessages = failedResults.map(r => `Link: ${r.link}\nError: ${r.error}`).join('\n\n');
          res.set('Content-Type', 'text/plain');
          return res.status(400).send(`Semua link gagal dikonversi:\n\n${errorMessages}`);
      }

  } catch (error) {
      console.error("Error di handleConvertPostRequest:", error);
      res.status(500).send(`Error: ${error.message}`);
  }
}
// --- Akhir Handler POST ---

// Ekspor fungsi yang dibutuhkan oleh server.js
module.exports = {
  handleConvertRequest, // Untuk GET
  handleConvertPostRequest // Untuk POST
};
