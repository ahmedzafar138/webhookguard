import { Worker } from 'bullmq';
import { connectDb, getDb } from './db';
import { connection, mockWorkerRegistry } from './queue';
import dotenv from 'dotenv';

dotenv.config();

const isMock = process.env.MOCK_SERVICES === 'true';

async function startWorker() {
  console.log('[Worker] Connecting to Database...');
  await connectDb();
  console.log('[Worker] Connected.');

  const db = getDb();
  const eventsCollection = db.collection('events');
  const subscriptionsCollection = db.collection('subscriptions');

  const handler = async (job: any) => {
    const { event, timestamp } = job.data;
    const eventId = event.id;
    const eventType = event.type;

    console.log(`[Worker] Processing event: ${eventId} (${eventType})`);

    // Determine customer_id from mock Stripe structure
    const customerId = event.data?.object?.customer || 'cust_unknown';
    const planValue = event.data?.object?.plan_value || 49; // Mock subscription plan price in $

    // Map Stripe event type to expected database changes and new status
    let expectedStateChange = 'unknown';
    let targetStatus = 'active';

    if (eventType === 'invoice.payment_failed') {
      expectedStateChange = 'subscription.status -> past_due';
      targetStatus = 'past_due';
    } else if (eventType === 'invoice.payment_succeeded') {
      expectedStateChange = 'subscription.status -> active';
      targetStatus = 'active';
    } else if (eventType === 'customer.subscription.deleted') {
      expectedStateChange = 'subscription.status -> canceled';
      targetStatus = 'canceled';
    }

    // Check if drift bug is simulated
    const simulateDrift = process.env.SIMULATE_DRIFT_BUG === 'true';
    const shouldTriggerBug = simulateDrift && eventType === 'invoice.payment_failed';

    let actualStateChange = null;

    if (shouldTriggerBug) {
      console.warn(
        `[Worker] [DRIFT BUG TRIGGERED] Event ${eventId}: skipping subscription update to simulating silent failure.`
      );
    } else {
      // Perform subscription state update
      const atRisk = targetStatus === 'past_due';
      await subscriptionsCollection.updateOne(
        { customer_id: customerId },
        {
          $set: {
            status: targetStatus,
            plan_value: planValue,
            last_updated_at: new Date(),
            at_risk: atRisk,
          },
        },
        { upsert: true }
      );
      actualStateChange = expectedStateChange;
      console.log(`[Worker] Updated subscription for customer ${customerId} to status "${targetStatus}"`);
    }

    // Save webhook execution details to MongoDB events collection
    await eventsCollection.insertOne({
      event_id: eventId,
      type: eventType,
      received_at: new Date(timestamp),
      acknowledged_at: new Date(),
      processed: true,
      expected_state_change: expectedStateChange,
      actual_state_change: actualStateChange,
      drift_detected: null, // Left null until reconciliation runs
    });

    console.log(`[Worker] Event ${eventId} logged successfully.`);
  };

  if (isMock) {
    mockWorkerRegistry.handler = handler;
    console.log('[Worker] Registered Mock in-memory queue listener.');
  } else {
    const worker = new Worker('webhook-queue', handler, { connection });
    worker.on('failed', (job, err) => {
      console.error(`[Worker] Job ${job?.id} failed:`, err);
    });
    console.log('[Worker] Worker listening for jobs in queue "webhook-queue"');
  }
}

startWorker().catch((err) => {
  console.error('[Worker Error] Startup failed:', err);
  process.exit(1);
});
