const Database = require('better-sqlite3');
const CryptoJS = require('crypto-js');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

const db = new Database(path.join(dbDir, 'vortex.db'));

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-secret-key-that-is-long-enough';

// --- Schema Initialization ---
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cloudflare_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unique_id TEXT NOT NULL UNIQUE,
      cf_api_token TEXT NOT NULL,
      cf_account_id TEXT NOT NULL,
      cf_zone_id TEXT,
      cf_worker_name TEXT,
      error_threshold INTEGER DEFAULT 100,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add cf_worker_name column if it doesn't exist (for migration)
  try {
    db.prepare('SELECT cf_worker_name FROM cloudflare_configs LIMIT 1').get();
  } catch (e) {
    db.exec('ALTER TABLE cloudflare_configs ADD COLUMN cf_worker_name TEXT');
    console.log('Migrated database: Added cf_worker_name column.');
  }

  // Add error_threshold column if it doesn't exist (for migration)
  try {
    db.prepare('SELECT error_threshold FROM cloudflare_configs LIMIT 1').get();
  } catch (e) {
    db.exec('ALTER TABLE cloudflare_configs ADD COLUMN error_threshold INTEGER DEFAULT 100');
    console.log('Migrated database: Added error_threshold column.');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS worker_stats_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      requests INTEGER DEFAULT 0,
      subrequests INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      cpu_time_p50 REAL DEFAULT 0,
      cpu_time_p90 REAL DEFAULT 0,
      cpu_time_p99 REAL DEFAULT 0,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (config_id) REFERENCES cloudflare_configs (id) ON DELETE CASCADE,
      UNIQUE (config_id, date)
    );
  `);

  // Add cf_worker_name column if it doesn't exist (for migration)
  try {
    db.prepare('SELECT cf_worker_name FROM cloudflare_configs LIMIT 1').get();
  } catch (e) {
    db.exec('ALTER TABLE cloudflare_configs ADD COLUMN cf_worker_name TEXT');
    console.log('Migrated database: Added cf_worker_name column.');
  }

  console.log('Database, cloudflare_configs, and worker_stats_history tables initialized.');
}

// --- Encryption/Decryption ---
function encrypt(text) {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

function decrypt(ciphertext) {
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// --- Database Functions ---
function addCloudflareConfig(unique_id, api_token, account_id, { zone_id, worker_name, error_threshold }) {
  const encryptedToken = encrypt(api_token);
  const stmt = db.prepare(
    'INSERT INTO cloudflare_configs (unique_id, cf_api_token, cf_account_id, cf_zone_id, cf_worker_name, error_threshold) VALUES (?, ?, ?, ?, ?, ?)'
  );
  try {
    // Gunakan nilai default 100 jika tidak disediakan
    const threshold = error_threshold === undefined ? 100 : error_threshold;
    stmt.run(unique_id, encryptedToken, account_id, zone_id, worker_name, threshold);
    return { success: true };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { success: false, error: 'Unique ID already exists.' };
    }
    console.error('Failed to add Cloudflare config:', error);
    return { success: false, error: 'Database error' };
  }
}

function getCloudflareConfig(unique_id) {
  try {
    const stmt = db.prepare('SELECT * FROM cloudflare_configs WHERE unique_id = ?');
    const row = stmt.get(unique_id);
    if (!row) {
      return null;
    }
    return {
      ...row,
      cf_api_token: decrypt(row.cf_api_token),
    };
  } catch (error) {
    console.error('Failed to get Cloudflare config:', error);
    return null;
  }
}

function getRawCloudflareConfig(unique_id) {
  try {
    const stmt = db.prepare('SELECT * FROM cloudflare_configs WHERE unique_id = ?');
    return stmt.get(unique_id);
  } catch (error) {
    console.error('Failed to get raw Cloudflare config:', error);
    return null;
  }
}

// --- Worker Stats Functions ---
function addWorkerStats(config_id, date, stats) {
  const stmt = db.prepare(`
    INSERT INTO worker_stats_history (config_id, date, requests, subrequests, errors, cpu_time_p50, cpu_time_p90, cpu_time_p99)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(config_id, date) DO UPDATE SET
      requests = excluded.requests,
      subrequests = excluded.subrequests,
      errors = excluded.errors,
      cpu_time_p50 = excluded.cpu_time_p50,
      cpu_time_p90 = excluded.cpu_time_p90,
      cpu_time_p99 = excluded.cpu_time_p99,
      recorded_at = CURRENT_TIMESTAMP;
  `);
  try {
    stmt.run(
      config_id,
      date,
      stats.requests || 0,
      stats.subrequests || 0,
      stats.errors || 0,
      stats.cpu_time_p50 || 0,
      stats.cpu_time_p90 || 0,
      stats.cpu_time_p99 || 0
    );
    return { success: true };
  } catch (error) {
    console.error('Failed to add worker stats:', error);
    return { success: false, error: 'Database error while saving stats' };
  }
}

function getWorkerStats(config_id, since, until) {
  try {
    const stmt = db.prepare(`
      SELECT * FROM worker_stats_history
      WHERE config_id = ? AND date >= ? AND date <= ?
      ORDER BY date ASC
    `);
    return stmt.all(config_id, since, until);
  } catch (error) {
    console.error('Failed to get worker stats:', error);
    return [];
  }
}

function deleteCloudflareConfig(unique_id) {
  try {
    // We need the config id for deleting associated stats, although ON DELETE CASCADE should handle it.
    const config = getCloudflareConfig(unique_id);
    if (!config) {
      return { success: false, error: 'ID not found.' };
    }

    const stmt = db.prepare('DELETE FROM cloudflare_configs WHERE unique_id = ?');
    const result = stmt.run(unique_id);

    return { success: result.changes > 0 };
  } catch (error) {
    console.error('Failed to delete Cloudflare config:', error);
    return { success: false, error: 'Database error' };
  }
}

function findExistingConfig({ account_id, zone_id, worker_name }) {
  try {
    const stmt = db.prepare(`
      SELECT unique_id FROM cloudflare_configs
      WHERE cf_account_id = ? AND (
        (cf_zone_id IS NOT NULL AND cf_zone_id = ?) OR
        (cf_worker_name IS NOT NULL AND cf_worker_name = ?)
      )
    `);
    const row = stmt.get(account_id, zone_id, worker_name);
    return row;
  } catch (error) {
    console.error('Gagal memeriksa konfigurasi yang ada:', error);
    return null;
  }
}

function updateCloudflareConfig(unique_id, { zone_id, worker_name, error_threshold }) {
  const fields = [];
  const params = [];

  if (zone_id !== undefined) {
    fields.push('cf_zone_id = ?');
    params.push(zone_id);
  }
  if (worker_name !== undefined) {
    fields.push('cf_worker_name = ?');
    params.push(worker_name);
  }
  if (error_threshold !== undefined) {
    fields.push('error_threshold = ?');
    params.push(error_threshold);
  }

  if (fields.length === 0) {
    return { success: false, error: 'No fields to update.' };
  }

  params.push(unique_id);

  try {
    const stmt = db.prepare(`
      UPDATE cloudflare_configs
      SET ${fields.join(', ')}
      WHERE unique_id = ?
    `);
    const result = stmt.run(...params);
    return { success: result.changes > 0 };
  } catch (error) {
    console.error('Failed to update Cloudflare config:', error);
    return { success: false, error: 'Database error during update.' };
  }
}

module.exports = {
  initializeDatabase,
  addCloudflareConfig,
  getCloudflareConfig,
  getRawCloudflareConfig,
  updateCloudflareConfig,
  addWorkerStats,
  getWorkerStats,
  deleteCloudflareConfig,
  findExistingConfig,
  decrypt, // Export decrypt for token verification before deletion
};