require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@forgecrm-db:5432/postgres' });
pool.query("SELECT id, lat, lng FROM coexistence.ecosystem_orders").then(r => { console.log(r.rows); process.exit(0); }).catch(err => { console.error(err); process.exit(1); });
