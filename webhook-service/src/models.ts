import { ObjectId } from 'mongodb';

export interface EventDocument {
  _id?: ObjectId | string;
  event_id: string; // e.g. 'evt_123'
  type: string; // e.g. 'invoice.payment_failed'
  received_at: Date;
  acknowledged_at: Date;
  processed: boolean;
  expected_state_change: string; // e.g. 'subscription.status -> past_due'
  actual_state_change: string | null; // e.g. 'subscription.status -> past_due' or null (if skipped/failed)
  drift_detected: boolean | null; // null until checked by Django reconciliation service
}

export interface SubscriptionDocument {
  _id?: ObjectId | string;
  customer_id: string; // e.g. 'cust_123'
  status: 'active' | 'past_due' | 'unpaid' | 'canceled';
  plan_value: number; // monthly subscription value in USD
  last_updated_at: Date;
  at_risk: boolean; // flag showing billing issue (e.g. past_due)
}

export interface ReconciliationRunDocument {
  _id?: ObjectId | string;
  drift_count: number;
  drift_rate: number;
  dollars_at_risk: number;
  timestamp: Date;
}
