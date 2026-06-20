const { Pool } = require('pg');

function buildPool() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return new Pool({
      connectionString,
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      application_name: 'forgecrm-backend',
    });
  }

  // Fallback to individual env vars (Docker Compose pattern)
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: 'forgecrm-backend',
  });
}

const pool = buildPool();

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// Automatically run simple migrations/schema checks
pool.query(`
  ALTER TABLE coexistence.meenzy_preorders 
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS feedback_sent BOOLEAN DEFAULT false
`).catch(err => {
  console.log('[DB] Note: Could not add payment_status/feedback_sent column to preorders.', err.message);
});

pool.query(`
  ALTER TABLE coexistence.ecosystem_orders 
  ADD COLUMN IF NOT EXISTS feedback_sent BOOLEAN DEFAULT false
`).catch(err => {
  console.log('[DB] Note: Could not add feedback_sent column to orders.', err.message);
});

pool.query(`
  ALTER TYPE coexistence.user_state ADD VALUE IF NOT EXISTS 'COMPLETED'
`).catch(err => {
  console.log('[DB] Note: Could not add COMPLETED to user_state.', err.message);
});

module.exports = pool;
