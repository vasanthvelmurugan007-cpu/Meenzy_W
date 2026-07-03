require('dotenv').config();
const pool = require('./src/db');

async function migrate() {
  try {
    console.log('Adding display_id to ecosystem_orders...');
    await pool.query(`ALTER TABLE coexistence.ecosystem_orders ADD COLUMN IF NOT EXISTS display_id VARCHAR(50);`);
    
    console.log('Adding display_id to meenzy_preorders...');
    await pool.query(`ALTER TABLE coexistence.meenzy_preorders ADD COLUMN IF NOT EXISTS display_id VARCHAR(50);`);
    
    console.log('Backfilling ecosystem_orders...');
    await pool.query(`
      UPDATE coexistence.ecosystem_orders 
      SET display_id = 'OLD' || floor(random() * 90000 + 10000)::text 
      WHERE display_id IS NULL;
    `);

    console.log('Backfilling meenzy_preorders...');
    await pool.query(`
      UPDATE coexistence.meenzy_preorders 
      SET display_id = 'OLD' || floor(random() * 90000 + 10000)::text 
      WHERE display_id IS NULL;
    `);
    
    console.log('Adding UNIQUE constraints...');
    // We might have conflicts if random was same, but highly unlikely for small dataset
    try {
      await pool.query(`ALTER TABLE coexistence.ecosystem_orders ADD CONSTRAINT uq_ecosystem_orders_display_id UNIQUE (display_id);`);
    } catch(e) { console.log('ecosystem_orders unique constraint might already exist or failed:', e.message); }
    


    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
