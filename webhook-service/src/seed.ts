import { connectDb, getDb } from './db';
import dotenv from 'dotenv';

dotenv.config();

export async function seedData() {
  await connectDb();
  const db = getDb();
  const subscriptionsCollection = db.collection('subscriptions');

  console.log('[Seed] Clearing subscriptions collection...');
  try {
    await subscriptionsCollection.deleteMany({});
  } catch (err) {
    console.log('[Seed] Collection clear skipped or failed.');
  }

  const mockSubscriptions = [
    { customer_id: 'cust_stripe_alice', status: 'active', plan_value: 49, last_updated_at: new Date(), at_risk: false },
    { customer_id: 'cust_stripe_bob', status: 'active', plan_value: 99, last_updated_at: new Date(), at_risk: false },
    { customer_id: 'cust_stripe_charlie', status: 'active', plan_value: 19, last_updated_at: new Date(), at_risk: false },
    { customer_id: 'cust_stripe_david', status: 'past_due', plan_value: 49, last_updated_at: new Date(), at_risk: true },
    { customer_id: 'cust_stripe_eve', status: 'active', plan_value: 149, last_updated_at: new Date(), at_risk: false },
    { customer_id: 'cust_stripe_frank', status: 'active', plan_value: 49, last_updated_at: new Date(), at_risk: false },
    { customer_id: 'cust_stripe_grace', status: 'active', plan_value: 99, last_updated_at: new Date(), at_risk: false },
  ];

  await subscriptionsCollection.insertMany(mockSubscriptions);
  console.log(`[Seed] Successfully seeded ${mockSubscriptions.length} subscriptions.`);
}

// Support running this script directly
if (require.main === module) {
  seedData()
    .then(() => {
      console.log('[Seed] Completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed Error] Failed:', err);
      process.exit(1);
    });
}
