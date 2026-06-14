const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgres://forgecrm_db_user:f6e9t9i4o8n4@localhost:5432/forgecrm_db', // I don't have the password, wait!
});
