const { meenzySessions } = require('./automationEngine');

// Static catalog for the "simple" swap list (used as fallback if DB lookup fails).
// These names must match exactly what's in your meenzy_catalog table.
const STATIC_FISH_OPTIONS = [
  { code: 'rohu',    name: 'Rohu',                 description: 'Fresh River Fish' },
  { code: 'seer',    name: 'Seer Fish / Vanjaram',  description: 'Premium Sea Fish' },
  { code: 'pomfret', name: 'Pomfret',               description: 'Fresh White Pomfret' },
  { code: 'prawns',  name: 'White Prawns / Iral',   description: 'Fresh Sea Prawns' },
];

async function handleOrderResolutionFlow(client, phone, account, btnId, insertPendingRow, enqueueSend) {
  try {
    const normalizedPhone = String(phone).replace(/\D/g, '');

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. Initial Cancel Request (from Wix order cancel button)
    // ─────────────────────────────────────────────────────────────────────────────
    if (btnId.startsWith('cancel_wix_order_')) {
      const orderId = btnId.replace('cancel_wix_order_', '');
      const payload = {
        type: 'button',
        body: { text: `We're sorry to see you cancel your order! How would you like us to handle this?` },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `resolution_refund_${orderId}`, title: 'Refund 💸' } },
            { type: 'reply', reply: { id: `resolution_postpone_${orderId}`, title: 'Postpone 🗓️' } },
          ],
        },
      };
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'interactive', messageBody: 'Sent cancellation resolution options' });
      await enqueueSend({ kind: 'interactive', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { interactive: payload } });
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. Refund Option Selected
    // ─────────────────────────────────────────────────────────────────────────────
    if (btnId.startsWith('resolution_refund_')) {
      const orderId = btnId.replace('resolution_refund_', '');
      const payload = {
        type: 'button',
        body: { text: 'To help us improve, could you please provide a reason for the refund?' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `reason_refund_${orderId}_mistake`, title: 'Bought by mistake' } },
            { type: 'reply', reply: { id: `reason_refund_${orderId}_price`,   title: 'Found better price' } },
            { type: 'reply', reply: { id: `reason_refund_${orderId}_delay`,   title: 'Delayed delivery' } },
          ],
        },
      };
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'interactive', messageBody: 'Sent refund reason options' });
      await enqueueSend({ kind: 'interactive', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { interactive: payload } });
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. Refund Reason Selected (Finalising Refund)
    // ─────────────────────────────────────────────────────────────────────────────
    if (btnId.startsWith('reason_refund_')) {
      // Format: reason_refund_<orderId>_<reason>
      const parts = btnId.replace('reason_refund_', '').split('_');
      const orderId   = parts[0];
      const reason    = parts[1];
      const humanReason = reason === 'mistake' ? 'Bought by mistake' : (reason === 'price' ? 'Found better price' : 'Delayed delivery');

      let itemName    = 'Unknown Item';
      let refundAmount = 0;

      if (orderId !== 'PREORDER') {
        const orderRes = await client.query(
          `SELECT o.total_price, i.product_name
           FROM coexistence.ecosystem_orders o
           JOIN coexistence.ecosystem_order_items i ON o.id = i.order_id
           WHERE o.id = $1 LIMIT 1`, [orderId]
        ).catch(() => ({ rows: [] }));
        if (orderRes.rows.length > 0) {
          itemName     = orderRes.rows[0].product_name;
          refundAmount = orderRes.rows[0].total_price || 0;
        }
        await client.query(
          `UPDATE coexistence.ecosystem_orders SET status = 'CANCELLED_REFUND', notes = COALESCE(notes,'') || '\nRefund Reason: ' || $2 WHERE id = $1`,
          [orderId, humanReason]
        ).catch(() => null);
      } else {
        const preRes = await client.query(
          `SELECT ordered_item FROM coexistence.meenzy_preorders WHERE customer_phone = $1 ORDER BY created_at DESC LIMIT 1`,
          [normalizedPhone]
        ).catch(() => ({ rows: [] }));
        if (preRes.rows.length > 0) itemName = preRes.rows[0].ordered_item;
      }

      await client.query(
        `UPDATE coexistence.meenzy_preorders SET order_status = 'CANCELLED', notes = COALESCE(notes,'') || '\nRefund Reason: ' || $2 WHERE customer_phone = $1`,
        [normalizedPhone, humanReason]
      ).catch(() => null);

      await client.query(
        `INSERT INTO coexistence.meenzy_refunds (customer_phone, item_name, refund_amount, refund_status) VALUES ($1, $2, $3, 'PENDING')`,
        [normalizedPhone, `${itemName} (${humanReason})`, refundAmount]
      ).catch(e => console.error('Failed to insert refund log:', e));

      const msg = `Your order has been cancelled. If you already paid, the refund will be initiated to your original payment method in 3-5 business days.`;
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'text', messageBody: msg });
      await enqueueSend({ kind: 'text', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { body: msg, previewUrl: false } });
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 4. Swap Fish Option Selected  →  show priced list from DB catalog
    // ─────────────────────────────────────────────────────────────────────────────
    if (btnId.startsWith('resolution_swap_')) {
      const orderId = btnId.replace('resolution_swap_', '');

      // Look up the customer's latest active preorder to get quantity & original price
      const preRes = await client.query(
        `SELECT id, ordered_item, quantity, total_price
         FROM coexistence.meenzy_preorders
         WHERE customer_phone = $1
           AND order_status NOT IN ('CANCELLED', 'SWAPPED', 'DELIVERED')
         ORDER BY created_at DESC LIMIT 1`,
        [normalizedPhone]
      ).catch(() => ({ rows: [] }));

      const preorder        = preRes.rows[0] || null;
      const preorderId      = preorder ? preorder.id      : null;
      const oldFishName     = preorder ? preorder.ordered_item : 'your fish';
      const quantity        = preorder ? parseFloat(preorder.quantity) || 1 : 1;
      const oldTotal        = preorder ? parseFloat(preorder.total_price) || 0 : 0;
      const oldFishPricePerKg = quantity > 0 ? parseFloat((oldTotal / quantity).toFixed(2)) : 0;

      // Try to fetch replacement options from catalog
      let catalogRows = [];
      try {
        const catRes = await client.query(
          `SELECT item_name, price_in_inr FROM coexistence.meenzy_catalog
           WHERE item_name NOT ILIKE $1 AND is_available = TRUE
           ORDER BY price_in_inr ASC LIMIT 8`,
          [`%${oldFishName}%`]
        );
        catalogRows = catRes.rows;
      } catch (_) {}

      // Build the list rows
      let rows;
      if (catalogRows.length > 0) {
        rows = catalogRows.map((c, idx) => {
          const calcTotal = parseFloat((quantity * parseFloat(c.price_in_inr)).toFixed(2));
          return {
            id:          `swap_fish_${orderId}_cat_${idx}`,
            title:       c.item_name.substring(0, 24),
            description: `₹${c.price_in_inr}/Kg | Total: ₹${calcTotal}`,
          };
        });

        // Store session so the price-diff confirmation can work
        meenzySessions[normalizedPhone] = {
          state:              'RESOLUTION_SWAP_PENDING',
          preorderId,
          originalItem:       oldFishName,
          originalQuantity:   quantity,
          originalItemPrice:  oldFishPricePerKg,
          catalogRows,        // keep catalog so we can look up price by idx
        };
      } else {
        // Fallback to static list (no price data)
        rows = STATIC_FISH_OPTIONS.map(f => ({
          id:          `swap_fish_${orderId}_${f.code}`,
          title:       f.name,
          description: f.description,
        }));
      }

      const catalogUrl = 'https://www.meenzy.in';
      const bodyText = preorder
        ? `Your order: *${quantity} Kg* of *${oldFishName}* (₹${oldTotal}).\n\nWhich fish would you like to swap to?\n\nBrowse more: ${catalogUrl}`
        : `Which fish would you like to swap your order to?\n\nBrowse more: ${catalogUrl}`;

      const payload = {
        type:   'list',
        body:   { text: bodyText },
        action: { button: 'Select Fish', sections: [{ title: 'Available Options', rows }] },
      };

      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'interactive', messageBody: 'Sent swap fish options' });
      await enqueueSend({ kind: 'interactive', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { interactive: payload } });
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 5. Swap Fish Item Selected  (swap_fish_<orderId>_cat_<idx>  OR  legacy code)
    // ─────────────────────────────────────────────────────────────────────────────
    if (btnId.startsWith('swap_fish_')) {
      // Parse the button ID: swap_fish_<orderId>_<cat|code>_<value>
      const withoutPrefix = btnId.replace('swap_fish_', '');
      // Split only on the last two underscores to get orderId, type, value
      const firstUnderscore = withoutPrefix.indexOf('_');
      const rest            = withoutPrefix.substring(firstUnderscore + 1); // cat_0  OR  rohu
      const orderId         = withoutPrefix.substring(0, firstUnderscore);

      // Detect if it's a catalog-based or legacy-code selection
      const isCatalog = rest.startsWith('cat_');
      const session   = meenzySessions[normalizedPhone];

      let newFishName;
      let newFishPricePerKg = 0;
      let oldFishName       = 'your fish';
      let oldFishPricePerKg = 0;
      let quantity          = 1;
      let preorderId        = null;

      if (isCatalog && session && session.catalogRows) {
        // Catalog-based swap
        const catIdx   = parseInt(rest.replace('cat_', ''), 10);
        const catEntry = session.catalogRows[catIdx];
        if (!catEntry) {
          console.warn(`[resolutionManager] Invalid catalog index ${catIdx} for ${normalizedPhone}`);
          return;
        }
        newFishName       = catEntry.item_name;
        newFishPricePerKg = parseFloat(catEntry.price_in_inr) || 0;
        oldFishName       = session.originalItem       || 'your fish';
        oldFishPricePerKg = session.originalItemPrice  || 0;
        quantity          = session.originalQuantity   || 1;
        preorderId        = session.preorderId;
      } else {
        // Legacy static-code swap (rohu / seer / pomfret / prawns)
        const code = rest; // e.g. 'rohu'
        const entry = STATIC_FISH_OPTIONS.find(f => f.code === code);
        newFishName = entry ? entry.name : code;

        // Try to look up price from catalog
        try {
          const priceRes = await client.query(
            `SELECT price_in_inr FROM coexistence.meenzy_catalog WHERE item_name ILIKE $1 LIMIT 1`,
            [`%${newFishName}%`]
          );
          if (priceRes.rows.length > 0) newFishPricePerKg = parseFloat(priceRes.rows[0].price_in_inr) || 0;
        } catch (_) {}

        // If we have a session, use its data
        if (session) {
          oldFishName       = session.originalItem      || 'your fish';
          oldFishPricePerKg = session.originalItemPrice || 0;
          quantity          = session.originalQuantity  || 1;
          preorderId        = session.preorderId;
        } else {
          // Last resort: fetch from DB
          const preRes = await client.query(
            `SELECT id, ordered_item, quantity, total_price FROM coexistence.meenzy_preorders
             WHERE customer_phone = $1 AND order_status NOT IN ('CANCELLED','SWAPPED','DELIVERED')
             ORDER BY created_at DESC LIMIT 1`,
            [normalizedPhone]
          ).catch(() => ({ rows: [] }));
          if (preRes.rows.length > 0) {
            preorderId        = preRes.rows[0].id;
            oldFishName       = preRes.rows[0].ordered_item;
            quantity          = parseFloat(preRes.rows[0].quantity) || 1;
            const oldTotal    = parseFloat(preRes.rows[0].total_price) || 0;
            oldFishPricePerKg = quantity > 0 ? parseFloat((oldTotal / quantity).toFixed(2)) : 0;
          }
        }
      }

      const oldTotal  = parseFloat((oldFishPricePerKg * quantity).toFixed(2));
      const newTotal  = parseFloat((newFishPricePerKg * quantity).toFixed(2));
      const priceDiff = parseFloat((newTotal - oldTotal).toFixed(2));

      // Lookup payment status
      let paymentStatus = 'PENDING';
      if (preorderId) {
        try {
          const ecoRes = await client.query(
            `SELECT o.payment_status FROM coexistence.ecosystem_orders o
             JOIN coexistence.meenzy_preorders p ON RIGHT(regexp_replace(o.user_phone,'\\D','','g'),10) = RIGHT(p.customer_phone,10)
             WHERE p.id = $1 ORDER BY o.created_at DESC LIMIT 1`,
            [preorderId]
          );
          if (ecoRes.rows.length > 0) paymentStatus = ecoRes.rows[0].payment_status || 'PENDING';
        } catch (_) {}
      }

      // ── If price changed, ask for confirmation ──────────────────────────────
      if (priceDiff !== 0 && (oldFishPricePerKg > 0 || newFishPricePerKg > 0)) {
        // Store intent in session
        meenzySessions[normalizedPhone] = {
          ...(session || {}),
          state:                 'RESOLUTION_SWAP_CONFIRM',
          pendingNewFishName:    newFishName,
          pendingNewFishPrice:   newFishPricePerKg,
          originalItem:          oldFishName,
          originalItemPrice:     oldFishPricePerKg,
          originalQuantity:      quantity,
          preorderId,
          orderId,
          paymentStatus,
        };

        let confirmText = `You have selected *${newFishName}* to replace *${oldFishName}*.\n\n`;
        if (priceDiff > 0) {
          confirmText += `⚠️ This item costs *more* (₹${newFishPricePerKg}/Kg vs ₹${oldFishPricePerKg}/Kg).\n`;
          confirmText += `• Your original total: *₹${oldTotal}*\n`;
          confirmText += `• Your new total: *₹${newTotal}*\n`;
          if (paymentStatus === 'PAID' || paymentStatus === 'COLLECTED') {
            confirmText += `• Balance to pay on delivery: *₹${priceDiff}*`;
          } else {
            confirmText += `• Extra amount on COD: *₹${priceDiff}*`;
          }
        } else {
          const saved = Math.abs(priceDiff);
          confirmText += `✅ This item is *cheaper* (₹${newFishPricePerKg}/Kg vs ₹${oldFishPricePerKg}/Kg)!\n`;
          confirmText += `• Your original total: *₹${oldTotal}*\n`;
          confirmText += `• Your new total: *₹${newTotal}*\n`;
          if (paymentStatus === 'PAID' || paymentStatus === 'COLLECTED') {
            confirmText += `• Refund/credit: *₹${saved}*`;
          } else {
            confirmText += `• You save: *₹${saved}*`;
          }
        }
        confirmText += `\n\nDo you accept this change?`;

        const interactivePayload = {
          type: 'button',
          body: { text: confirmText },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'resolution_swap_confirm_yes', title: 'Yes, Confirm ✅' } },
              { type: 'reply', reply: { id: 'resolution_swap_confirm_no',  title: 'No, Go Back ❌' } },
            ],
          },
        };

        const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'interactive', messageBody: `Swap price confirmation for ${newFishName}` });
        await enqueueSend({ kind: 'interactive', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { interactive: interactivePayload } });
        return;
      }

      // ── No price difference, or no price data → just confirm the swap ───────
      await _executeSwap({ client, normalizedPhone, preorderId, orderId, newFishName, newFishPricePerKg, oldFishName, oldFishPricePerKg, quantity, priceDiff, oldTotal, newTotal, insertPendingRow, enqueueSend, account });
      delete meenzySessions[normalizedPhone];
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 6. Swap Confirmation: YES
    // ─────────────────────────────────────────────────────────────────────────────
    if (btnId === 'resolution_swap_confirm_yes') {
      const session = meenzySessions[normalizedPhone];
      if (!session || session.state !== 'RESOLUTION_SWAP_CONFIRM') {
        const msg = `Sorry, your swap session has expired. Please start over by clicking the Swap Fish button again.`;
        const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'text', messageBody: msg });
        await enqueueSend({ kind: 'text', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { body: msg, previewUrl: false } });
        return;
      }

      const { pendingNewFishName, pendingNewFishPrice, originalItem, originalItemPrice, originalQuantity, preorderId, orderId } = session;
      const quantity  = parseFloat(originalQuantity) || 1;
      const oldTotal  = parseFloat((parseFloat(originalItemPrice) * quantity).toFixed(2));
      const newTotal  = parseFloat((parseFloat(pendingNewFishPrice) * quantity).toFixed(2));
      const priceDiff = parseFloat((newTotal - oldTotal).toFixed(2));

      await _executeSwap({ client, normalizedPhone, preorderId, orderId, newFishName: pendingNewFishName, newFishPricePerKg: pendingNewFishPrice, oldFishName: originalItem, oldFishPricePerKg: originalItemPrice, quantity, priceDiff, oldTotal, newTotal, insertPendingRow, enqueueSend, account });
      delete meenzySessions[normalizedPhone];
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 7. Swap Confirmation: NO → go back to fish list
    // ─────────────────────────────────────────────────────────────────────────────
    if (btnId === 'resolution_swap_confirm_no') {
      const session = meenzySessions[normalizedPhone];
      if (session) {
        // Go back to the catalog list
        session.state = 'RESOLUTION_SWAP_PENDING';
        delete session.pendingNewFishName;
        delete session.pendingNewFishPrice;
      }

      const msg = `No problem! Please select another fish to swap your order to.\n\nBrowse our full catalogue: https://www.meenzy.in`;
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'text', messageBody: msg });
      await enqueueSend({ kind: 'text', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { body: msg, previewUrl: false } });
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 8. Postpone Option Selected
    // ─────────────────────────────────────────────────────────────────────────────
    if (btnId.startsWith('resolution_postpone_')) {
      const orderId = btnId.replace('resolution_postpone_', '');
      const payload = {
        type: 'button',
        body: { text: 'No problem! When would you like us to deliver your order?' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `postpone_date_${orderId}_tomorrow`, title: 'Tomorrow 🌅' } },
            { type: 'reply', reply: { id: `postpone_date_${orderId}_2days`,    title: 'In 2 Days ⏳' } },
            { type: 'reply', reply: { id: `postpone_date_${orderId}_weekend`,  title: 'Next Weekend 🎉' } },
          ],
        },
      };
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'interactive', messageBody: 'Sent postpone date options' });
      await enqueueSend({ kind: 'interactive', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { interactive: payload } });
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 9. Postpone Date Selected
    // ─────────────────────────────────────────────────────────────────────────────
    if (btnId.startsWith('postpone_date_')) {
      const parts    = btnId.replace('postpone_date_', '').split('_');
      const orderId  = parts[0];
      const timeFrame = parts[1];
      const humanDate = timeFrame === 'tomorrow' ? 'Tomorrow' : (timeFrame === '2days' ? 'In 2 days' : 'Next Weekend');

      const d = new Date();
      if (timeFrame === 'tomorrow')   d.setDate(d.getDate() + 1);
      else if (timeFrame === '2days') d.setDate(d.getDate() + 2);
      else if (timeFrame === 'weekend') {
        const day = d.getDay();
        const diff = day <= 5 ? 6 - day : 6;
        d.setDate(d.getDate() + diff);
      }
      const sqlDate = d.toISOString().split('T')[0];

      if (orderId !== 'PREORDER') {
        await client.query(
          `UPDATE coexistence.ecosystem_orders SET status = 'POSTPONED', delivery_instructions = COALESCE(delivery_instructions,'') || '\nPostponed to: ' || $2 WHERE id = $1`,
          [orderId, humanDate]
        ).catch(() => null);
      }
      await client.query(
        `UPDATE coexistence.meenzy_preorders SET order_status = 'POSTPONED', delivery_date = $2 WHERE customer_phone = $1`,
        [normalizedPhone, sqlDate]
      ).catch(() => null);

      const msg = `Perfect! Your order has been placed on hold and scheduled for delivery ${humanDate.toLowerCase()}. We'll remind you before dispatching! 🚚`;
      const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'text', messageBody: msg });
      await enqueueSend({ kind: 'text', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { body: msg, previewUrl: false } });
      return;
    }

  } catch (err) {
    console.error('[resolutionManager] Error handling flow:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: execute the actual swap and send confirmation message
// ─────────────────────────────────────────────────────────────────────────────
async function _executeSwap({ client, normalizedPhone, preorderId, orderId, newFishName, newFishPricePerKg, oldFishName, oldFishPricePerKg, quantity, priceDiff, oldTotal, newTotal, insertPendingRow, enqueueSend, account }) {
  // Update preorder
  if (preorderId) {
    await client.query(
      `UPDATE coexistence.meenzy_preorders SET ordered_item = $1, order_status = 'SWAPPED' WHERE id = $2`,
      [newFishName, preorderId]
    ).catch(() => null);
  } else {
    await client.query(
      `UPDATE coexistence.meenzy_preorders SET ordered_item = $1, order_status = 'SWAPPED' WHERE customer_phone = $2`,
      [newFishName, normalizedPhone]
    ).catch(() => null);
  }

  // Update ecosystem_orders if applicable
  if (orderId && orderId !== 'PREORDER') {
    await client.query(`UPDATE coexistence.ecosystem_orders SET status = 'SWAPPED' WHERE id = $1`, [orderId]).catch(() => null);
    await client.query(`UPDATE coexistence.ecosystem_order_items SET product_name = $1, price = $2 WHERE order_id = $3`, [newFishName, newTotal, orderId]).catch(() => null);
    if (priceDiff !== 0) {
      await client.query(
        `UPDATE coexistence.ecosystem_orders SET total_price = total_price + $1 WHERE id = $2`,
        [priceDiff, orderId]
      ).catch(() => null);
    }
  } else {
    // Try matching by phone
    try {
      const ecoRes = await client.query(
        `SELECT i.id AS item_id, o.id AS order_id, o.total_price
         FROM coexistence.ecosystem_order_items i
         JOIN coexistence.ecosystem_orders o ON o.id = i.order_id
         WHERE RIGHT(regexp_replace(o.user_phone,'\\D','','g'),10) = RIGHT($1,10)
           AND i.product_name ILIKE $2
         ORDER BY o.created_at DESC LIMIT 1`,
        [normalizedPhone, `%${oldFishName}%`]
      );
      if (ecoRes.rows.length > 0) {
        const { item_id, order_id, total_price } = ecoRes.rows[0];
        await client.query(`UPDATE coexistence.ecosystem_order_items SET product_name = $1, price = $2 WHERE id = $3`, [newFishName, newTotal, item_id]).catch(() => null);
        const adjustedTotal = parseFloat((parseFloat(total_price) + priceDiff).toFixed(2));
        await client.query(`UPDATE coexistence.ecosystem_orders SET total_price = $1 WHERE id = $2`, [adjustedTotal, order_id]).catch(() => null);
      }
    } catch (_) {}
  }

  // Build the reply message
  let swapMsg;
  if (priceDiff > 0) {
    swapMsg =
      `🔄 *Swap Confirmed!*\n\n` +
      `You've swapped *${oldFishName}* → *${newFishName}*.\n\n` +
      `📦 *Order Summary:*\n` +
      `• Item: ${newFishName} (${quantity} Kg)\n` +
      `• Rate: ₹${newFishPricePerKg}/Kg\n` +
      `• Previous total: ₹${oldTotal}\n` +
      `• Extra charge: *₹${priceDiff}*\n` +
      `• *New total to pay: ₹${newTotal}*\n\n` +
      `Our team will collect the balance at delivery. Thank you for choosing Meenzy! 🌊`;
  } else if (priceDiff < 0) {
    const saved = Math.abs(priceDiff);
    swapMsg =
      `🔄 *Swap Confirmed!*\n\n` +
      `You've swapped *${oldFishName}* → *${newFishName}*.\n\n` +
      `📦 *Order Summary:*\n` +
      `• Item: ${newFishName} (${quantity} Kg)\n` +
      `• Rate: ₹${newFishPricePerKg}/Kg\n` +
      `• Previous total: ₹${oldTotal}\n` +
      `• You save: *₹${saved}*\n` +
      `• *New total: ₹${newTotal}*\n\n` +
      `Your order has been updated. Thank you for your patience! 🐟`;
  } else {
    swapMsg =
      `🔄 *Swap Confirmed!*\n\n` +
      `You've swapped *${oldFishName}* → *${newFishName}*.\n\n` +
      `✅ Same price — no extra charge! (₹${newFishPricePerKg}/Kg)\n\n` +
      `Your order has been updated. We'll deliver fresh as scheduled! 🌊`;
  }

  const localId = await insertPendingRow({ account, toNumber: normalizedPhone, messageType: 'text', messageBody: swapMsg });
  await enqueueSend({ kind: 'text', accountId: account.id, to: normalizedPhone, localMessageId: localId, payload: { body: swapMsg, previewUrl: false } });
}

module.exports = { handleOrderResolutionFlow };
