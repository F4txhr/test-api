// Mock must be at the top
jest.mock('better-sqlite3', () => {
  const RealDatabase = jest.requireActual('better-sqlite3');
  // Create a new in-memory database for the entire test file run.
  const db = new RealDatabase(':memory:');
  // The mock constructor will always return this single instance.
  return jest.fn(() => db);
});

// Now, we can import things. These will use the mocked 'better-sqlite3'.
const Database = require('better-sqlite3');
const { initializeDatabase, addCloudflareConfig, getCloudflareConfig } = require('./database');

describe('Database Functions', () => {
  let db;

  // Before each test, get a handle to the single db instance
  // and ensure the schema is fresh.
  beforeEach(() => {
    db = new Database(); // This just returns the singleton from the mock.
    // Drop the table if it exists to ensure a clean state.
    db.exec('DROP TABLE IF EXISTS cloudflare_configs');
    // Initialize the database (which creates the table).
    initializeDatabase();
  });

  it('should create the cloudflare_configs table', () => {
    const tableInfo = db.pragma('table_info(cloudflare_configs)');
    const columns = tableInfo.map(col => col.name);

    expect(columns).toContain('id');
    expect(columns).toContain('unique_id');
    expect(columns).toContain('cf_api_token');
    expect(columns).toContain('cf_account_id');
    expect(columns).toContain('cf_zone_id');
    expect(columns).toContain('cf_worker_name');
  });

  it('should add a new config and retrieve it correctly', () => {
    const unique_id = 'test-id-1';
    const api_token = 'my-secret-token';
    const account_id = 'my-account-id';
    const details = { zone_id: 'my-zone-id', worker_name: 'my-worker' };

    const addResult = addCloudflareConfig(unique_id, api_token, account_id, details);
    expect(addResult.success).toBe(true);

    const retrievedConfig = getCloudflareConfig(unique_id);
    expect(retrievedConfig).not.toBeNull();
    expect(retrievedConfig.unique_id).toBe(unique_id);
    expect(retrievedConfig.cf_api_token).toBe(api_token); // Should be decrypted
    expect(retrievedConfig.cf_account_id).toBe(account_id);
    expect(retrievedConfig.cf_zone_id).toBe(details.zone_id);
    expect(retrievedConfig.cf_worker_name).toBe(details.worker_name);
  });

  it('should return an error when adding a config with a duplicate unique_id', () => {
    const unique_id = 'test-id-2';
    const api_token = 'token1';
    const account_id = 'acc1';
    const details = { zone_id: 'zone1', worker_name: 'worker1' };

    addCloudflareConfig(unique_id, api_token, account_id, details);
    const addResult = addCloudflareConfig(unique_id, 'token2', 'acc2', {});

    expect(addResult.success).toBe(false);
    expect(addResult.error).toBe('Unique ID already exists.');
  });

  it('should return null when getting a non-existent config', () => {
    const retrievedConfig = getCloudflareConfig('non-existent-id');
    expect(retrievedConfig).toBeNull();
  });
});