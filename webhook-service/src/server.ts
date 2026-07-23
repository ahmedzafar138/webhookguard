import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { connection, webhookQueue } from './queue';
import { connectDb, getDb } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const SIGNING_SECRET = process.env.WEBHOOK_SIGNING_SECRET || 'whsec_mocksecret123456';

// Captures raw body in req.rawBody
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

/**
 * Verifies the mock Stripe signature.
 * Format: t=TIMESTAMP,v1=SIGNATURE
 * Signed data is: TIMESTAMP.RAW_BODY
 */
function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(',');
  const tPart = parts.find((p) => p.startsWith('t='));
  const v1Part = parts.find((p) => p.startsWith('v1='));

  if (!tPart || !v1Part) return false;

  const timestamp = tPart.split('=')[1];
  const signature = v1Part.split('=')[1];

  if (!timestamp || !signature) return false;

  // Prevent replay attacks (5 minutes tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    console.error('[Signature] Webhook signature timestamp skew too large');
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (e) {
    return false;
  }
}

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Route for Stripe webhook verification
app.post('/webhooks/stripe', async (req: any, res) => {
  const signatureHeader = req.headers['stripe-signature'] || req.headers['x-stripe-signature'];
  const rawBody = req.rawBody;

  if (!signatureHeader || !rawBody) {
    console.error('[Receiver] Webhook payload missing signature or body');
    return res.status(400).json({ error: 'Missing signature or body' });
  }

  const isValid = verifyStripeSignature(rawBody, signatureHeader as string, SIGNING_SECRET);
  if (!isValid) {
    console.error('[Receiver] Webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const eventId = payload.id;
  if (!eventId) {
    return res.status(400).json({ error: 'Missing event ID (id)' });
  }

  try {
    const idempotencyKey = `idempotency:${eventId}`;
    const exists = await connection.get(idempotencyKey);

    if (exists) {
      console.log(`[Receiver] Duplicate event detected (idempotent): ${eventId}`);
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Set idempotency key with TTL of 1 hour (3600 seconds)
    await connection.set(idempotencyKey, 'pending', 'EX', 3600);

    // Enqueue event for async processing
    await webhookQueue.add('process-webhook', {
      event: payload,
      timestamp: Date.now(),
    });

    console.log(`[Receiver] Webhook accepted & queued: ${eventId} (${payload.type})`);
    return res.status(200).json({ received: true, duplicate: false });
  } catch (err: any) {
    console.error(`[Receiver Error] Failed to queue event ${eventId}:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/events - Retrieve webhook event history (paginated)
app.get('/api/events', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const skip = (page - 1) * limit;

    const db = getDb();
    const events = await db.collection('events').find({}).toArray();
    const total = events.length;
    // Show newest first
    const paginated = [...events].reverse().slice(skip, skip + limit);

    return res.status(200).json({
      data: paginated,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('[API Error] Failed to fetch events:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/subscriptions - Retrieve active customer subscriptions (paginated)
app.get('/api/subscriptions', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const skip = (page - 1) * limit;

    const db = getDb();
    const subscriptions = await db.collection('subscriptions').find({}).toArray();
    const total = subscriptions.length;
    const paginated = subscriptions.slice(skip, skip + limit);

    return res.status(200).json({
      data: paginated,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('[API Error] Failed to fetch subscriptions:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

async function bootstrap() {
  await connectDb();

  if (process.env.MOCK_SERVICES === 'true') {
    console.log('[Receiver] Mock mode active. Starting worker inline...');
    await import('./worker');
    console.log('[Receiver] Auto-seeding mock database...');
    const { seedData } = await import('./seed');
    await seedData();
  }

  app.listen(PORT, () => {
    console.log(`[Receiver] Webhook Receiver listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Receiver] Bootstrap failed:', err);
  process.exit(1);
});
