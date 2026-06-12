async function handleOrderResolutionFlow(client, phone, account, btnId, insertPendingRow, enqueueSend) {
  try {
    const normalizedPhone = String(phone).replace(/\D/g, '');
    
    // 1. Initial Cancel Request
    if (btnId.startsWith('cancel_wix_order_')) {
      const orderId = btnId.replace('cancel_wix_order_', '');
      const payload = {
        type: "button",
        body: { text: `We're sorry to see you cancel Order #${orderId}! How would you like us to handle this?` },
        action: {
          buttons: [
            { type: "reply", reply: { id: `resolution_refund_${orderId}`, title: "Refund 💸" } },
            { type: "reply", reply: { id: `resolution_replace_${orderId}`, title: "Replace Item 🔄" } },
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
      
      await client.query(`UPDATE coexistence.ecosystem_orders SET status = 'CANCELLED_REFUND' WHERE id = $1`, [orderId]).catch(()=>null);
      await client.query(`UPDATE coexistence.meenzy_preorders SET order_status = 'CANCELLED' WHERE customer_phone = $1`, [normalizedPhone]).catch(()=>null);
      
      const msg = `Your order #${orderId} has been cancelled. If you already paid, the refund will be initiated to your original payment method in 3-5 business days.`;
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'text', messageBody: msg });
      await enqueueSend({ kind: 'text', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { body: msg, previewUrl: false } });
      return;
    }

    // 4. Replace Option Selected
    if (btnId.startsWith('resolution_replace_')) {
      const orderId = btnId.replace('resolution_replace_', '');
      
      await client.query(`UPDATE coexistence.ecosystem_orders SET status = 'PENDING_REPLACEMENT' WHERE id = $1`, [orderId]).catch(()=>null);
      // Flag human needed
      await client.query(`UPDATE coexistence.contacts SET tags = tags || '[{"id": 998, "name": "Human_Needed", "color": "#f59e0b"}]'::jsonb WHERE contact_number = $1`, [normalizedPhone]).catch(()=>null);
      
      const catalogUrl = 'https://www.meenzy.in';
      const msg = `We've paused your order #${orderId}. A human agent will message you shortly to help you pick a replacement item! 🧑‍💼\n\nIn the meantime, feel free to browse our live catalog: ${catalogUrl}`;
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'text', messageBody: msg });
      await enqueueSend({ kind: 'text', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { body: msg, previewUrl: true } });
      return;
    }

    // 5. Postpone Option Selected
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

    // 6. Postpone Date Selected
    if (btnId.startsWith('postpone_date_')) {
      const parts = btnId.replace('postpone_date_', '').split('_');
      const orderId = parts[0];
      const timeFrame = parts[1];
      
      await client.query(`UPDATE coexistence.ecosystem_orders SET status = 'POSTPONED' WHERE id = $1`, [orderId]).catch(()=>null);
      await client.query(`UPDATE coexistence.meenzy_preorders SET order_status = 'POSTPONED' WHERE customer_phone = $1`, [normalizedPhone]).catch(()=>null);

      const msg = `Perfect! Your order #${orderId} has been placed on hold and scheduled for delivery ${timeFrame === 'tomorrow' ? 'tomorrow' : timeFrame === '2days' ? 'in 2 days' : 'next weekend'}. We'll remind you before dispatching! 🚚`;
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'text', messageBody: msg });
      await enqueueSend({ kind: 'text', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { body: msg, previewUrl: false } });
      return;
    }

  } catch (err) {
    console.error('[resolutionManager] Error handling flow:', err);
  }
}

module.exports = { handleOrderResolutionFlow };
