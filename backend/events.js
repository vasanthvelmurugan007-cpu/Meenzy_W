import { fetch } from 'wix-fetch';
import crypto from 'crypto'; // Supported in Velo Backend

/**
 * Wix Velo Backend - events.js
 * Triggered automatically when a new order is created in Wix Stores.
 * Pushes the payload to the ForgeChat Delivery Ecosystem Webhook.
 */
export async function wixStores_onOrderCreated(event) {
  const payloadString = JSON.stringify(event);
  const WEBHOOK_URL = 'https://here-batman-plans-fitted.trycloudflare.com/api/webhook/wix-order';
  const SECRET = 'YOUR_WIX_WEBHOOK_SECRET'; // Must match WIX_WEBHOOK_SECRET in ForgeChat env
  
  // Generate HMAC signature for verification
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payloadString);
  const signature = hmac.digest('base64');

  // Retry Wrapper
  const maxRetries = 3;
  let attempt = 0;
  let success = false;

  while (attempt < maxRetries && !success) {
    attempt++;
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wix-signature': signature
        },
        body: payloadString
      });

      if (response.ok) {
        success = true;
        console.log(`[Webhook] Successfully sent order ${event.orderId} to ecosystem.`);
      } else {
        throw new Error(`Server returned ${response.status}: ${await response.text()}`);
      }
    } catch (error) {
      console.error(`[Webhook] Attempt ${attempt} failed:`, error.message);
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  if (!success) {
    console.error(`[Webhook] CRITICAL: Failed to send order ${event.orderId} after ${maxRetries} attempts.`);
  }
}
