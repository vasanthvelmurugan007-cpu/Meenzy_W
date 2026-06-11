const pool = require('./src/db');

async function runPipeline() {
  console.log('--- STARTING DELIVERY PIPELINE E2E TEST ---');
  let orderId, jobId;
  
  try {
    // 1. Seed a mock PENDING_VERIFICATION order
    console.log('[1] Seeding mock order in PENDING_VERIFICATION state...');
    const { rows: orderRows } = await pool.query(`
      INSERT INTO coexistence.ecosystem_orders (wix_order_id, user_phone, total_price, status, address_line)
      VALUES ($1, $2, $3, 'PENDING_VERIFICATION', $4)
      RETURNING id
    `, [`mock_${Date.now()}`, '9999999999', 500.00, 'Test Address 123']);
    orderId = orderRows[0].id;
    console.log(`    -> Order ID: ${orderId}`);

    // Seed mock verification
    await pool.query(`
      INSERT INTO coexistence.ecosystem_verifications (order_id, status, otp_expires_at)
      VALUES ($1, 'SENT', NOW() + INTERVAL '10 minutes')
    `, [orderId]);

    // 2. Advance to VERIFIED_READY
    console.log('[2] Simulating OTP Verification -> advancing to VERIFIED_READY');
    await pool.query(`UPDATE coexistence.ecosystem_verifications SET status = 'VERIFIED' WHERE order_id = $1`, [orderId]);
    await pool.query(`UPDATE coexistence.ecosystem_orders SET status = 'VERIFIED_READY' WHERE id = $1`, [orderId]);

    // 3. Advance to PACKED
    console.log('[3] Simulating Packing -> advancing to PACKED');
    await pool.query(`UPDATE coexistence.ecosystem_orders SET status = 'PACKED' WHERE id = $1`, [orderId]);

    // 4. Advance to DISPATCHED_TO_3PL
    console.log('[4] Simulating Dispatch -> advancing to DISPATCHED_TO_3PL and creating DeliveryJob');
    await pool.query(`UPDATE coexistence.ecosystem_orders SET status = 'DISPATCHED_TO_3PL' WHERE id = $1`, [orderId]);
    const { rows: jobRows } = await pool.query(`
      INSERT INTO coexistence.ecosystem_delivery_jobs (order_id, status, provider_job_id, rider_name)
      VALUES ($1, 'DISPATCHED', 'SFX-9999', 'Test Rider')
      RETURNING id
    `, [orderId]);
    jobId = jobRows[0].id;
    console.log(`    -> Job ID: ${jobId}`);

    // 5. Simulate HTTP POST to /api/shipping/report-issue
    console.log('[5] Simulating 3PL Exception Webhook (CANNOT_LOCATE_CUSTOMER)');
    // Since we are running outside the express server process or without fetch easily available in older Node, 
    // we'll simulate the route handler's logic via DB calls for this exact script, or we can use native fetch (Node 18+)
    const res = await fetch('http://localhost:3001/api/shipping/report-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, jobId, issueReason: 'CANNOT_LOCATE_CUSTOMER' })
    });
    const data = await res.json();
    console.log(`    -> Webhook Response:`, data);

    // 6. Assert DB State
    console.log('[6] Asserting Database is locked at DELIVERY_FAILED_DISPUTED');
    const { rows: checkOrder } = await pool.query(`SELECT status FROM coexistence.ecosystem_orders WHERE id = $1`, [orderId]);
    if (checkOrder[0].status === 'DELIVERY_FAILED_DISPUTED') {
      console.log('    ✅ Assertion Passed: Order status is DELIVERY_FAILED_DISPUTED');
    } else {
      console.error(`    ❌ Assertion Failed: Order status is ${checkOrder[0].status}`);
    }

  } catch (err) {
    console.error('Pipeline Error:', err);
  } finally {
    // 7. Cleanup
    console.log('[7] Cleaning up database to maintain idempotency...');
    if (orderId) {
      await pool.query(`DELETE FROM coexistence.ecosystem_orders WHERE id = $1`, [orderId]);
    }
    console.log('--- E2E TEST COMPLETE ---');
    process.exit(0);
  }
}

runPipeline();
