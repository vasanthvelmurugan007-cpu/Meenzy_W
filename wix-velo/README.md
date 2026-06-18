# Wix Velo — WhatsApp-to-Cart Setup Guide

These files are **reference code** to be copy-pasted into the **Wix Editor** with Dev Mode enabled.
They do NOT run in this Node.js project.

---

## Step 1: Create the `WhatsAppCarts` CMS Collection

1. Go to your **Wix Dashboard → CMS → Collections**
2. Click **"Create Collection"**
3. Name it exactly: `WhatsAppCarts`
4. Add these fields:

| Field Name | Field ID (key) | Type         | Notes                                              |
|------------|----------------|--------------|----------------------------------------------------|
| Token      | `token`        | Text         | Unique cart identifier (auto-generated)             |
| Items      | `items`        | JSON/Object  | Array: `[{ "productId": "WIX_ID", "quantity": 2 }]` |
| Phone      | `phone`        | Text         | Customer's WhatsApp number                          |

5. Set collection permissions:
   - **Read**: Site Member or Admin
   - **Write**: Admin only (backend http-functions run as admin)

---

## Step 2: Add the Backend HTTP Function

1. Open **Wix Editor** → Enable **Dev Mode** (top menu bar)
2. In the left sidebar, expand **Public & Backend**
3. Create a file: `backend/http-functions.js`
4. Paste the contents of `http-functions.js` from this folder
5. **Publish** your site to activate the endpoint

**Endpoint URL:** `https://meenzy.com/_functions/createWhatsAppCart`

### Test with curl:
```bash
curl -X POST https://meenzy.com/_functions/createWhatsAppCart \
  -H "Content-Type: application/json" \
  -d '{"phone":"919845444003","items":[{"productId":"YOUR_WIX_PRODUCT_ID","quantity":1}]}'
```

---

## Step 3: Create the Cart Sync Page

1. In the **Wix Editor**, click **Add Page** (Pages panel)
2. Name it: `Cart Sync`
3. Set the URL slug to: `/cart-sync`
4. **Hide** the page from navigation (right-click → Hide from Menu)
5. Click on the page, expand the **Code Panel** at the bottom
6. Paste the contents of `cart-sync-page.js` from this folder
7. **Publish** your site

### Customer URL format:
```
https://meenzy.com/cart-sync?cart_token=TOKEN_HERE
```

---

## Step 4: Get Your Wix Product IDs

1. Go to **Wix Dashboard → Store Products**
2. Click on a product
3. The URL will contain the Product ID, e.g.:
   `https://manage.wix.com/.../store/product/77a82b5f-7236-43bd-ab34-9f4e60b2749a`
4. Use these IDs in the `items[].productId` field when calling the endpoint

---

## Important Notes

- **Wix Stores App ID**: The code uses `215238eb-22a5-4c36-9e7b-41cce8e2a9e8` which is the
  standard Wix Stores internal App ID. Do NOT change this unless Wix changes it.
- **Token Cleanup**: Consider adding a Wix Automation to delete `WhatsAppCarts` records
  older than 24 hours to prevent stale data accumulation.
- The backend `wixCartService.js` in this project handles calling the Wix endpoint and
  generating cart links from your Node.js server.
