const Razorpay = require('razorpay');

let razorpayInstance = null;

function getRazorpay() {
  if (!razorpayInstance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.warn('[razorpayService] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set in env variables!');
    }
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_dummyKeyId',
      key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummyKeySecret'
    });
  }
  return razorpayInstance;
}

/**
 * Creates a Razorpay Payment Link
 * @param {Object} params
 * @param {number} params.amount - Amount in INR
 * @param {string} params.phone - Customer phone number
 * @param {string} params.description - Payment description
 * @param {string} params.referenceId - Order ID or reference
 */
async function createPaymentLink({ amount, phone, description, referenceId }) {
  const rzp = getRazorpay();
  
  // Razorpay expects amount in paise (1 INR = 100 paise)
  const amountInPaise = Math.round(amount * 100);

  const payload = {
    amount: amountInPaise,
    currency: 'INR',
    accept_partial: false,
    description: description || 'Meenzy Order Payment',
    customer: {
      contact: `+${phone}`
    },
    notify: {
      sms: false,
      email: false
    },
    reminder_enable: true,
    reference_id: referenceId,
    notes: {
      order_id: referenceId
    }
  };

  try {
    const paymentLink = await rzp.paymentLink.create(payload);
    return {
      ok: true,
      id: paymentLink.id,
      short_url: paymentLink.short_url,
      status: paymentLink.status
    };
  } catch (error) {
    console.error('[razorpayService] Error creating payment link:', error);
    return { ok: false, error: error.message };
  }
}

module.exports = {
  createPaymentLink
};
