const pool = require('../src/db');

async function generateUserCohorts() {
  console.log('[cohorts] Starting cohort generation...');
  try {
    const { rows } = await pool.query(`
      SELECT customer_phone, 
             array_agg(ordered_item) as items, 
             count(*) as order_count 
      FROM coexistence.meenzy_preorders 
      GROUP BY customer_phone
    `);

    for (const user of rows) {
      let tags = new Set();
      const joinedItems = user.items.join(' ').toLowerCase();
      
      if (joinedItems.match(/prawn|crab|squid|lobster/)) tags.add('Shellfish_Lover');
      if (joinedItems.match(/salmon|tuna|seer/)) tags.add('Premium_Cuts');
      if (user.order_count > 5) tags.add('Loyal_Customer');

      await pool.query(`
        UPDATE coexistence.contacts 
        SET cohort_tags = $1::jsonb 
        WHERE contact_number = $2
      `, [JSON.stringify(Array.from(tags)), user.customer_phone]);
    }
    console.log(`[cohorts] Successfully updated cohorts for ${rows.length} users.`);
  } catch(e) {
    console.error('[cohorts] Error generating cohorts:', e.message);
  } finally {
    process.exit(0);
  }
}

generateUserCohorts();
