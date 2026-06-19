const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    // Check if AG-1234 exists, else pick any active agent
    let res = await pool.query("SELECT id FROM coexistence.delivery_agents LIMIT 1");
    let agentId;
    if (res.rows.length > 0) {
      agentId = res.rows[0].id;
    } else {
      console.log("No agent found! Please create one.");
      process.exit(1);
    }

    console.log(`Using agent ID: ${agentId}`);

    // Create 3 orders with valid Bangalore coordinates
    const locations = [
      { lat: 12.971598, lng: 77.594562, addr: "MG Road, Bangalore" }, // Center
      { lat: 12.925453, lng: 77.546757, addr: "Banashankari, Bangalore" }, // South
      { lat: 13.006822, lng: 77.581335, addr: "Malleswaram, Bangalore" } // North
    ];

    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      await pool.query(`
        INSERT INTO coexistence.ecosystem_orders (
          user_phone, total_price, status, address_line, lat, lng, assigned_agent_id, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW()
        )
      `, [
        '9999999999',
        500,
        'CREATED',
        loc.addr,
        loc.lat,
        loc.lng,
        agentId
      ]);
    }

    console.log("Successfully seeded 3 test orders and assigned them to agent!");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    pool.end();
  }
}

run();
