import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const SIGNING_SECRET = process.env.WEBHOOK_SIGNING_SECRET || 'whsec_mocksecret123456';
const PORT = process.env.PORT || 3001;
const TARGET_URL = `http://localhost:${PORT}/webhooks/stripe`;

async function sendEvent(id: string, type: string, customer: string, planValue: number) {
  const payload = {
    id,
    type,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        customer,
        plan_value: planValue,
      },
    },
  };

  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const signatureHeader = `t=${timestamp},v1=${signature}`;

  console.log(`Sending mock event ${id} (${type}) to ${TARGET_URL}...`);

  try {
    const response = await fetch(TARGET_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signatureHeader,
      },
      body: rawBody,
    });

    const status = response.status;
    const body = await response.json();

    console.log(`[Response] Status: ${status}`, body);
  } catch (err: any) {
    console.error('[Error] Failed to send request:', err.message);
  }
}

async function run() {
  // Test 1: Send payment succeeded
  await sendEvent('evt_succ_001', 'invoice.payment_succeeded', 'cust_123', 99);

  // Test 2: Send payment failed (should update subscription to past_due)
  await sendEvent('evt_fail_002', 'invoice.payment_failed', 'cust_123', 99);

  // Test 3: Send duplicate event to check idempotency
  await sendEvent('evt_fail_002', 'invoice.payment_failed', 'cust_123', 99);
}

run().catch(console.error);
