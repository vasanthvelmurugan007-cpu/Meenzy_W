require('dotenv').config();

const { createClient, OAuthStrategy } = require('@wix/sdk');
const { checkout, currentCart } = require('@wix/ecom');
const { redirects } = require('@wix/redirects');

async function testWixSdk() {
  try {
    console.log('Testing Wix SDK Checkout...');
    
    // The App ID extracted from the API Key JWT payload
    const clientId = 'fa9b451d-c390-4820-a898-4a46b11e93e8'; 
    
    const wixClient = createClient({
      modules: { currentCart, redirects, checkout },
      auth: OAuthStrategy({ clientId })
    });

    console.log('Creating custom checkout...');
    const chk = await wixClient.checkout.createCheckout({
      channelType: 'WEB',
      lineItems: [
        {
          quantity: 1,
          catalogReference: {
            catalogItemId: '77a82b5f-7236-43bd-ab34-9f4e60b2749a',
            appId: '215238eb-22a5-4c36-9e7b-e7c08025e04e'
          }
        }
      ]
    });
    console.log('Checkout:', JSON.stringify(chk, null, 2));

    console.log('Generating redirect URL...');
    const redirectSession = await wixClient.redirects.createRedirectSession({
      ecomCheckout: { checkoutId: chk.checkoutId || chk.id || (chk.checkout ? chk.checkout.id : undefined) },
      callbacks: { postFlowUrl: 'https://meenzy.com/thank-you' }
    });

    console.log('Success! Redirect URL:', redirectSession.redirectSession.fullUrl);

  } catch (err) {
    console.error('Error:', err);
  }
}

testWixSdk();
