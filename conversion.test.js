const { toClash, toSurge, toQuantumult, toSingBox } = require('./converter');

// Mock data for a parsed VLESS configuration
const mockVlessConfig = {
  type: 'vless',
  uuid: '12345678-1234-1234-1234-1234567890ab',
  host: 'example.com',
  port: 443,
  security: 'tls',
  flow: '',
  network: 'ws',
  path: '/ws-path',
  host_header: 'vless.cdn.com',
  sni: 'vless.cdn.com',
  fp: 'chrome',
  allowInsecure: false,
  name: 'My-VLESS-Server',
};

// Mock data for a parsed Trojan configuration
const mockTrojanConfig = {
  type: 'trojan',
  password: 'test-password',
  host: 'trojan.example.com',
  port: 443,
  security: 'tls',
  network: 'tcp',
  path: '',
  host_header: 'trojan.example.com',
  sni: 'trojan.example.com',
  alpn: 'h2,http/1.1',
  fp: 'safari',
  allowInsecure: true,
  name: 'My-Trojan-Server',
};

describe('Conversion Functions', () => {
  describe('toClash', () => {
    it('should convert a VLESS config to a Clash-compatible YAML string', () => {
      const result = toClash(mockVlessConfig);
      const expectedYaml = `
- name: My-VLESS-Server
  type: vless
  server: example.com
  port: 443
  udp: true
  skip-cert-verify: false
  uuid: 12345678-1234-1234-1234-1234567890ab
  tls: true
  servername: vless.cdn.com
  fingerprint: chrome
  network: ws
  ws-path: /ws-path
  ws-headers:
    host: vless.cdn.com
`.trim();
      expect(result).toBe(expectedYaml);
    });

    it('should convert a Trojan config to a Clash-compatible YAML string', () => {
      const result = toClash(mockTrojanConfig);
      const expectedYaml = `
- name: My-Trojan-Server
  type: trojan
  server: trojan.example.com
  port: 443
  udp: true
  skip-cert-verify: true
  password: test-password
  tls: true
  sni: trojan.example.com
  alpn:
    - h2
    - http/1.1
  fingerprint: safari
  network: tcp
`.trim();
      expect(result).toBe(expectedYaml);
    });
  });

  describe('toSurge', () => {
    it('should convert a VLESS config to a Surge-compatible string', () => {
      const result = toSurge(mockVlessConfig);
      const expected = 'My-VLESS-Server = vless, example.com, 443, username=12345678-1234-1234-1234-1234567890ab, skip-cert-verify=false, tls=true, sni=vless.cdn.com, server-cert-fingerprint-sha256=chrome, ws=true, ws-path=/ws-path, ws-headers=host:vless.cdn.com';
      expect(result).toBe(expected);
    });

    it('should convert a Trojan config to a Surge-compatible string', () => {
      const result = toSurge(mockTrojanConfig);
      const expected = 'My-Trojan-Server = trojan, trojan.example.com, 443, password=test-password, skip-cert-verify=true, sni=trojan.example.com, alpn=h2,http/1.1, server-cert-fingerprint-sha256=safari';
      expect(result).toBe(expected);
    });
  });

  describe('toQuantumult', () => {
    it('should convert a VLESS config to a Quantumult-compatible string', () => {
      const result = toQuantumult(mockVlessConfig);
      const expected = 'vmess=example.com:443, method=none, password=12345678-1234-1234-1234-1234567890ab, skip-cert-verify=false, tls=true, sni=vless.cdn.com, tls-cert-sha256=chrome, ws=true, ws-path=/ws-path, ws-header=host:vless.cdn.com, tag=My-VLESS-Server';
      expect(result).toBe(expected);
    });

    it('should convert a Trojan config to a Quantumult-compatible string', () => {
      const result = toQuantumult(mockTrojanConfig);
      const expected = 'trojan=trojan.example.com:443, password=test-password, skip-cert-verify=true, over-tls=true, tls-host=trojan.example.com, alpn=h2,http/1.1, tls-cert-sha256=safari, tag=My-Trojan-Server';
      expect(result).toBe(expected);
    });
  });

  describe('toSingBox', () => {
    it('should convert a VLESS config to a SingBox-compatible JSON object', () => {
      const result = JSON.parse(toSingBox(mockVlessConfig));
      const expected = {
        tag: 'My-VLESS-Server',
        type: 'vless',
        server: 'example.com',
        server_port: 443,
        uuid: '12345678-1234-1234-1234-1234567890ab',
        transport: {
          type: 'ws',
          path: '/ws-path',
          headers: { host: 'vless.cdn.com' }
        },
        tls: {
          enabled: true,
          server_name: 'vless.cdn.com',
          insecure: false,
          utls: {
            enabled: true,
            fingerprint: 'chrome'
          }
        }
      };
      expect(result).toEqual(expected);
    });

    it('should convert a Trojan config to a SingBox-compatible JSON object', () => {
      const result = JSON.parse(toSingBox(mockTrojanConfig));
      const expected = {
        tag: 'My-Trojan-Server',
        type: 'trojan',
        server: 'trojan.example.com',
        server_port: 443,
        password: 'test-password',
        tls: {
          enabled: true,
          server_name: 'trojan.example.com',
          insecure: true,
          utls: {
            enabled: true,
            fingerprint: 'safari'
          },
          alpn: ['h2', 'http/1.1']
        }
      };
      expect(result).toEqual(expected);
    });
  });
});