const { parseTrojan, parseVLESS, parseVMess, parseSS, parseAnyLink } = require('./converter');

describe('parseTrojan', () => {
  it('should correctly decode a percent-encoded password', () => {
    const link = 'trojan://p%40ss%23word@example.com:443#MyTrojan';
    const result = parseTrojan(link);
    expect(result.password).toBe('p@ss#word');
  });

  it('should parse a basic Trojan link', () => {
    const link = 'trojan://password@example.com:443';
    const result = parseTrojan(link);
    expect(result).toEqual({
      type: 'trojan',
      password: 'password',
      host: 'example.com',
      port: 443,
      security: 'tls',
      network: 'tcp',
      path: '',
      host_header: 'example.com',
      sni: 'example.com',
      alpn: '',
      fp: '',
      allowInsecure: false,
      name: 'Trojan Server',
    });
  });

  it('should parse a Trojan link with a name fragment', () => {
    const link = 'trojan://password@example.com:443#MyServer';
    const result = parseTrojan(link);
    expect(result.name).toBe('MyServer');
  });

  it('should parse a Trojan link with query parameters', () => {
    const link = 'trojan://password@example.com:443?sni=google.com&type=ws&path=%2Fws&host=my.host.com';
    const result = parseTrojan(link);
    expect(result.sni).toBe('google.com');
    expect(result.network).toBe('ws');
    expect(result.path).toBe('/ws');
    expect(result.host_header).toBe('my.host.com');
  });

  it('should throw an error for an invalid Trojan link', () => {
    expect(() => parseTrojan('trojan://invalid-link')).toThrow('Invalid Trojan link format: Missing userinfo or serverinfo');
  });
});

describe('parseVLESS', () => {
  it('should parse a basic VLESS link', () => {
    const link = 'vless://uuid@example.com:443?security=tls&sni=google.com#MyVLESS';
    const result = parseVLESS(link);
    expect(result).toEqual({
      type: 'vless',
      uuid: 'uuid',
      host: 'example.com',
      port: 443,
      security: 'tls',
      flow: '',
      network: 'tcp',
      path: '',
      host_header: '',
      sni: 'google.com',
      fp: '',
      pbk: '',
      sid: '',
      spx: '',
      alpn: '',
      allowInsecure: false,
      name: 'MyVLESS',
    });
  });

  it('should handle ws parameters', () => {
    const link = 'vless://uuid@example.com:80?type=ws&path=%2Fws-path&host=my.cdn.com#VLESS-WS';
    const result = parseVLESS(link);
    expect(result.network).toBe('ws');
    expect(result.path).toBe('/ws-path');
    expect(result.host_header).toBe('my.cdn.com');
    expect(result.sni).toBe('my.cdn.com');
  });

  it('should throw an error for a non-VLESS link', () => {
    expect(() => parseVLESS('http://example.com')).toThrow('Bukan link VLESS');
  });
});

describe('parseVMess', () => {
  it('should parse a basic VMess link', () => {
    const vmessData = {
      "ps": "MyVMess",
      "add": "example.com",
      "port": "443",
      "id": "uuid",
      "aid": "0",
      "net": "tcp",
      "type": "none",
      "host": "example.com",
      "path": "/",
      "tls": "tls",
      "sni": "google.com"
    };
    const base64Vmess = Buffer.from(JSON.stringify(vmessData)).toString('base64');
    const link = `vmess://${base64Vmess}`;
    const result = parseVMess(link);
    expect(result).toEqual({
      type: 'vmess',
      uuid: 'uuid',
      host: 'example.com',
      port: 443,
      alterId: 0,
      security: 'auto',
      network: 'tcp',
      headerType: 'none',
      path: '/',
      host_header: 'example.com',
      sni: 'google.com',
      tls: true,
      alpn: '',
      fp: '',
      name: 'MyVMess',
    });
  });

  it('should throw an error for invalid base64', () => {
    const link = 'vmess://invalid-base64';
    expect(() => parseVMess(link)).toThrow('Invalid VMess base64 JSON');
  });
});

describe('parseSS', () => {
  it('should parse a basic SS link', () => {
    const userInfo = Buffer.from('chacha20-ietf-poly1305:password').toString('base64');
    const link = `ss://${userInfo}@example.com:8388#MySS`;
    const result = parseSS(link);
    expect(result).toEqual({
      type: 'ss',
      method: 'chacha20-ietf-poly1305',
      password: 'password',
      host: 'example.com',
      port: 8388,
      plugin: '',
      plugin_opts: '',
      obfs: '',
      obfsHost: '',
      name: 'MySS',
    });
  });

  it('should parse an SS link with plugin options', () => {
    const userInfo = Buffer.from('aes-256-gcm:password').toString('base64');
    // Note: URL-encoded value for "plugin" parameter: v2ray-plugin;path=/ws;host=my.host.com;tls
    const link = `ss://${userInfo}@example.com:8388?plugin=v2ray-plugin%3Bpath%3D%2Fws%3Bhost%3Dmy.host.com%3Btls#MySS-v2ray`;
    const result = parseSS(link);
    expect(result.plugin).toBe('v2ray-plugin');
    expect(result.plugin_opts).toBe('path=/ws;host=my.host.com;tls');
  });
});

describe('parseAnyLink', () => {
  it('should identify and parse a VLESS link', () => {
    const link = 'vless://uuid@example.com:443#test';
    const result = parseAnyLink(link);
    expect(result.type).toBe('vless');
  });

  it('should identify and parse a VMess link', () => {
    const vmessData = { ps: 'test', add: 'example.com', port: '443', id: 'uuid', aid: '0', net: 'tcp' };
    const base64Vmess = Buffer.from(JSON.stringify(vmessData)).toString('base64');
    const link = `vmess://${base64Vmess}`;
    const result = parseAnyLink(link);
    expect(result.type).toBe('vmess');
  });

  it('should identify and parse a Trojan link', () => {
    const link = 'trojan://password@example.com:443#test';
    const result = parseAnyLink(link);
    expect(result.type).toBe('trojan');
  });

  it('should identify and parse a SS link', () => {
    const userInfo = Buffer.from('chacha20-ietf-poly1305:password').toString('base64');
    const link = `ss://${userInfo}@example.com:8388#test`;
    const result = parseAnyLink(link);
    expect(result.type).toBe('ss');
  });

  it('should throw an error for an unsupported protocol', () => {
    const link = 'http://example.com';
    expect(() => parseAnyLink(link)).toThrow('Unsupported protocol. Supported: vless, vmess, trojan, ss');
  });

  it('should throw an error for an empty link', () => {
    expect(() => parseAnyLink('')).toThrow('Link must be a non-empty string');
  });

  it('should throw an error for a very long link', () => {
    const longString = 'a'.repeat(2001);
    expect(() => parseAnyLink(longString)).toThrow('Link is too long');
  });
});