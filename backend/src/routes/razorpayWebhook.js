const { Router } = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { resolveAccount, insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');

const router = Router();

router.post('/', async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'meenzy_rzp_secret';
    
    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');

    if (digest !== req.headers['x-razorpay-signature']) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body.event;
    
    if (event === 'payment_link.paid') {
      const paymentLink = req.body.payload.payment_link.entity;
      const orderId = paymentLink.reference_id; // we passed this in creation
      const customerPhone = paymentLink.customer.contact.replace('+', '');
      const paymentId = paymentLink.id;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Look up the cart that has this orderId
        const cartRes = await client.query(`
          SELECT * FROM coexistence.meenzy_carts 
          WHERE current_state = 'CART_REVIEW' 
          AND state_context->>'native_state' = 'AWAITING_PAYMENT'
          AND state_context->>'paymentLinkId' = $1
        `, [paymentId]);

        if (cartRes.rows.length > 0) {
          const cart = cartRes.rows[0];
          const context = cart.state_context;
          const address = context.address;
          const items = context.items || [];
          
          let totalAmount = 0;

          // Insert into meenzy_preorders and ecosystem_orders
          for (const item of items) {
            totalAmount += item.qty * item.pricePerKg;
            const cutText = item.selectedCut ? ` (${item.selectedCut})` : '';
            const itemName = `${item.name}${cutText}`;
            
            // 1. Insert into preorders
            try {
              await client.query('SAVEPOINT check_col');
              await client.query(`
                INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status, address_line, payment_status)
                VALUES ($1, $2, $3, 'CONFIRMED', $4, 'ONLINE')
              `, [customerPhone, itemName, item.qty, address]);
              await client.query('RELEASE SAVEPOINT check_col');
            } catch (insertErr) {
              await client.query('ROLLBACK TO SAVEPOINT check_col');
              if (insertErr.code === '42703') { // undefined_column
                await client.query(`
                  INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status, address_line)
                  VALUES ($1, $2, $3, 'CONFIRMED', $4)
                `, [customerPhone, itemName, item.qty, address]);
              } else {
                throw insertErr;
              }
            }
          }

          // 2. Insert into ecosystem_orders for unified dashboard
          const orderItemsJson = JSON.stringify(items.map(i => ({
             product_id: i.name,
             name: i.name,
             quantity: i.qty,
             price: i.pricePerKg,
             cut: i.selectedCut
          })));

          const { geocodeAddress } = require('../services/geocoder');
          const geo = await geocodeAddress(address);
          const lat = geo ? geo.lat : null;
          const lng = geo ? geo.lng : null;

          let ecoOrderId = null;
          try {
            await client.query('SAVEPOINT check_eco');
            const ecoRes = await client.query(`
              INSERT INTO coexistence.ecosystem_orders 
              (user_phone, total_price, status, payment_status, source, address_line, order_items, lat, lng)
              VALUES ($1, $2, 'CONFIRMED', 'PAID', 'WHATSAPP_NATIVE', $3, $4::jsonb, $5, $6)
              RETURNING id
            `, [customerPhone, totalAmount, address, orderItemsJson, lat, lng]);
            ecoOrderId = ecoRes.rows[0].id;
            await client.query('RELEASE SAVEPOINT check_eco');
          } catch (ecoErr) {
            await client.query('ROLLBACK TO SAVEPOINT check_eco');
            if (ecoErr.code === '42703') { // undefined_column
              await client.query(`
                INSERT INTO coexistence.ecosystem_orders 
                (user_phone, total_price, status, address_line, lat, lng)
                VALUES ($1, $2, 'CONFIRMED', $3, $4, $5)
                RETURNING id
              `, [customerPhone, totalAmount, address, lat, lng]);
              ecoOrderId = ecoRes.rows[0].id;
            } else {
              throw ecoErr;
            }
          }

          if (ecoOrderId) {
            const io = require('../socket').getIO();
            if (io) {
              io.to('delivery-agents').emit('new_order', {
                id: ecoOrderId,
                user_phone: customerPhone,
                total_price: totalAmount,
                status: 'CONFIRMED',
                address_line: address,
                lat: lat,
                lng: lng
              });
            }
          }

          // 3. Mark cart as CHECKOUT
          await client.query(`
            UPDATE coexistence.meenzy_carts 
            SET current_state = 'CHECKOUT', status = 'converted', updated_at = NOW()
            WHERE whatsapp_id = $1 AND current_state = 'CART_REVIEW' AND state_context->>'native_state' = 'AWAITING_PAYMENT'
          `, [customerPhone]);

          await client.query('COMMIT');

          // Send confirmation message to user
          const { account } = await resolveAccount({});
          if (account) {
             const successMsg = `🎉 *Payment Successful!*\n\nYour order #${orderId} is confirmed and will be delivered to:\n_${address}_\n\nThank you for choosing Meenzy Fresh Seafood! 🐟`;
             const localId = await insertPendingRow({ account, toNumber: customerPhone, messageType: 'text', messageBody: successMsg });
             await enqueueSend({ kind: 'text', accountId: account.id, to: String(customerPhone).replace(/\D/g, ''), localMessageId: localId, payload: { body: successMsg, previewUrl: false } });
          }
        } else {
          await client.query('ROLLBACK');
          console.warn('[razorpayWebhook] Payment received but no active AWAITING_PAYMENT cart found for:', paymentId);
        }
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('[razorpayWebhook] DB Error processing payment:', err);
      } finally {
        client.release();
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('[razorpayWebhook] Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
