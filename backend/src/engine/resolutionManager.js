async function handleOrderResolutionFlow(client, phone, account, btnId, insertPendingRow, enqueueSend) {
  try {
    const normalizedPhone = String(phone).replace(/\D/g, '');
    
    // 1. Initial Cancel Request
    if (btnId.startsWith('cancel_wix_order_')) {
      const orderId = btnId.replace('cancel_wix_order_', '');
      const payload = {
        type: "button",
        body: { text: `We're sorry to see you cancel your order! How would you like us to handle this?` },
        action: {
          buttons: [
            { type: "reply", reply: { id: `resolution_refund_${orderId}`, title: "Refund 💸" } },
            { type: "reply", reply: { id: `resolution_swap_${orderId}`, title: "Swap Fish 🐟" } },
            { type: "reply", reply: { id: `resolution_postpone_${orderId}`, title: "Postpone 🗓️" } }
          ]
        }
      };
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'interactive', messageBody: 'Sent cancellation resolution options' });
      await enqueueSend({ kind: 'interactive', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { interactive: payload } });
      return;
    }

    // 2. Refund Option Selected
    if (btnId.startsWith('resolution_refund_')) {
      const orderId = btnId.replace('resolution_refund_', '');
      const payload = {
        type: "button",
        body: { text: "To help us improve, could you please provide a reason for the refund?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: `reason_refund_${orderId}_mistake`, title: "Bought by mistake" } },
            { type: "reply", reply: { id: `reason_refund_${orderId}_price`, title: "Found better price" } },
            { type: "reply", reply: { id: `reason_refund_${orderId}_delay`, title: "Delayed delivery" } }
          ]
        }
      };
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'interactive', messageBody: 'Sent refund reason options' });
      await enqueueSend({ kind: 'interactive', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { interactive: payload } });
      return;
    }

    // 3. Refund Reason Selected (Finalizing Refund)
    if (btnId.startsWith('reason_refund_')) {
      // Format: reason_refund_<orderId>_<reason>
      const parts = btnId.replace('reason_refund_', '').split('_');
      const orderId = parts[0];
      const reason = parts[1];
      
      const humanReason = reason === 'mistake' ? 'Bought by mistake' : (reason === 'price' ? 'Found better price' : 'Delayed delivery');

      if (orderId !== 'PREORDER') {
        await client.query(`UPDATE coexistence.ecosystem_orders SET status = 'CANCELLED_REFUND', notes = COALESCE(notes, '') || '\nRefund Reason: ' || $2 WHERE id = $1`, [orderId, humanReason]).catch(()=>null);
      }
      await client.query(`UPDATE coexistence.meenzy_preorders SET order_status = 'CANCELLED', notes = COALESCE(notes, '') || '\nRefund Reason: ' || $2 WHERE customer_phone = $1`, [normalizedPhone, humanReason]).catch(()=>null);
      
      const msg = `Your order has been cancelled. If you already paid, the refund will be initiated to your original payment method in 3-5 business days.`;
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'text', messageBody: msg });
      await enqueueSend({ kind: 'text', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { body: msg, previewUrl: false } });
      return;
    }

    // 4. Swap Fish Option Selected
    if (btnId.startsWith('resolution_swap_')) {
      const orderId = btnId.replace('resolution_swap_', '');
      const payload = {
        type: "list",
        body: { text: "Which fish would you like to swap your order to?" },
        action: {
          button: "Select Fish",
          sections: [
            {
              title: "Available Options",
              rows: [
                { id: `swap_fish_${orderId}_rohu`, title: "Rohu", description: "Fresh River Fish" },
                { id: `swap_fish_${orderId}_seer`, title: "Seer Fish / Vanjaram", description: "Premium Sea Fish" },
                { id: `swap_fish_${orderId}_pomfret`, title: "Pomfret", description: "Fresh White Pomfret" },
                { id: `swap_fish_${orderId}_prawns`, title: "White Prawns", description: "Fresh Sea Prawns" }
              ]
            }
          ]
        }
      };
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'interactive', messageBody: 'Sent swap fish options' });
      await enqueueSend({ kind: 'interactive', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { interactive: payload } });
      return;
    }

    // 5. Swap Fish Item Selected
    if (btnId.startsWith('swap_fish_')) {
      const parts = btnId.replace('swap_fish_', '').split('_');
      const orderId = parts[0];
      const fishCode = parts[1];
      
      let newFish = 'Unknown';
      if (fishCode === 'rohu') newFish = 'Rohu';
      if (fishCode === 'seer') newFish = 'Seer Fish / Vanjaram';
      if (fishCode === 'pomfret') newFish = 'Pomfret';
      if (fishCode === 'prawns') newFish = 'White Prawns / Iral';

      // Update the DB
      if (orderId !== 'PREORDER') {
        await client.query(`UPDATE coexistence.ecosystem_orders SET status = 'SWAPPED' WHERE id = $1`, [orderId]).catch(()=>null);
        await client.query(`UPDATE coexistence.ecosystem_order_items SET product_name = $1 WHERE order_id = $2`, [newFish, orderId]).catch(()=>null);
      }
      await client.query(`UPDATE coexistence.meenzy_preorders SET ordered_item = $1, order_status = 'SWAPPED' WHERE customer_phone = $2`, [newFish, normalizedPhone]).catch(()=>null);
      
      const msg = `✅ *Swap Successful!*\n\nWe have updated your order to *${newFish}*. Our team has been notified and we will deliver it shortly! 🐟`;
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'text', messageBody: msg });
      await enqueueSend({ kind: 'text', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { body: msg, previewUrl: false } });
      return;
    }

    // 6. Postpone Option Selected
    if (btnId.startsWith('resolution_postpone_')) {
      const orderId = btnId.replace('resolution_postpone_', '');
      const payload = {
        type: "button",
        body: { text: "No problem! When would you like us to deliver your order?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: `postpone_date_${orderId}_tomorrow`, title: "Tomorrow 🌅" } },
            { type: "reply", reply: { id: `postpone_date_${orderId}_2days`, title: "In 2 Days ⏳" } },
            { type: "reply", reply: { id: `postpone_date_${orderId}_weekend`, title: "Next Weekend 🎉" } }
          ]
        }
      };
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'interactive', messageBody: 'Sent postpone date options' });
      await enqueueSend({ kind: 'interactive', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { interactive: payload } });
      return;
    }

    // 7. Postpone Date Selected
    if (btnId.startsWith('postpone_date_')) {
      const parts = btnId.replace('postpone_date_', '').split('_');
      const orderId = parts[0];
      const timeFrame = parts[1];
      
      const humanDate = timeFrame === 'tomorrow' ? 'Tomorrow' : (timeFrame === '2days' ? 'In 2 days' : 'Next Weekend');

      // Calculate actual SQL Date
      const d = new Date();
      if (timeFrame === 'tomorrow') d.setDate(d.getDate() + 1);
      else if (timeFrame === '2days') d.setDate(d.getDate() + 2);
      else if (timeFrame === 'weekend') {
        // Move to next Saturday
        const day = d.getDay();
        const diff = day <= 5 ? 6 - day : 6;
        d.setDate(d.getDate() + diff);
      }
      const sqlDate = d.toISOString().split('T')[0];

      if (orderId !== 'PREORDER') {
        await client.query(`UPDATE coexistence.ecosystem_orders SET status = 'POSTPONED', delivery_instructions = COALESCE(delivery_instructions, '') || '\nPostponed to: ' || $2 WHERE id = $1`, [orderId, humanDate]).catch(()=>null);
      }
      await client.query(`UPDATE coexistence.meenzy_preorders SET order_status = 'POSTPONED', delivery_date = $2 WHERE customer_phone = $1`, [normalizedPhone, sqlDate]).catch(()=>null);

      const msg = `Perfect! Your order has been placed on hold and scheduled for delivery ${humanDate.toLowerCase()}. We'll remind you before dispatching! 🚚`;
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'text', messageBody: msg });
      await enqueueSend({ kind: 'text', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { body: msg, previewUrl: false } });
      return;
    }

  } catch (err) {
    console.error('[resolutionManager] Error handling flow:', err);
  }
}

module.exports = { handleOrderResolutionFlow };
