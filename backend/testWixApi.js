require('dotenv').config();

async function testWixCheckout() {
  try {
    console.log('Testing Wix Checkout API...');
    const wixApiKey = process.env.WIX_API_KEY;
    const siteId = process.env.WIX_SITE_ID;
    
    // Create checkout
    const checkoutRes = await fetch('https://www.wixapis.com/ecom/v1/checkouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': wixApiKey,
        'wix-site-id': siteId
      },
      body: JSON.stringify({
        channelType: 'WEB',
        lineItems: [
          {
            catalogReference: {
              catalogItemId: '77a82b5f-7236-43bd-ab34-9f4e60b2749a', // A valid ID from feed
              appId: '215238eb-22a5-4c36-9e7b-e7c08025e04e' // Wix Stores App ID
            },
            quantity: 1
          }
        ]
      })
    });
    
    const checkoutData = await checkoutRes.json();
    console.log('Checkout Response:', JSON.stringify(checkoutData, null, 2));
    
    if (checkoutData.checkout?.id) {
      // Create redirect session
      const redirectRes = await fetch('https://www.wixapis.com/redirects/v1/redirect-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': wixApiKey,
          'wix-site-id': siteId
        },
        body: JSON.stringify({
          ecomCheckout: {
            checkoutId: checkoutData.checkout.id
          },
          callbacks: {
            postFlowUrl: 'https://meenzy.com/thank-you'
          }
        })
      });
      
      const redirectData = await redirectRes.json();
      console.log('Redirect Response:', JSON.stringify(redirectData, null, 2));
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

testWixCheckout();
