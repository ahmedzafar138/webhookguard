import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const isMock = process.env.MOCK_SERVICES === 'true';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Registry to link mock queue enqueuer with mock worker consumer
export const mockWorkerRegistry = {
  handler: null as ((job: any) => Promise<void>) | null,
};

export const connection = isMock
  ? (new class MockRedis {
      private store = new Map<string, string>();
      async get(key: string) {
        return this.store.get(key) || null;
      }
      async set(key: string, value: string, mode?: string, duration?: number) {
        this.store.set(key, value);
        if (duration) {
          setTimeout(() => this.store.delete(key), duration * 1000);
        }
        return 'OK';
      }
    }() as any)
  : new IORedis(redisUrl, { maxRetriesPerRequest: null });

export const webhookQueue = isMock
  ? ({
      add: async (name: string, data: any) => {
        console.log(`[Mock Queue] Job added: ${name}`);
        setTimeout(async () => {
          if (mockWorkerRegistry.handler) {
            try {
              await mockWorkerRegistry.handler({ data });
            } catch (err) {
              console.error('[Mock Worker] Job failed:', err);
            }
          } else {
            console.warn('[Mock Queue] No mock worker handler registered.');
          }
        }, 50);
        return { id: `mock_job_${Math.random().toString(36).substr(2, 9)}` };
      },
    } as any)
  : new Queue('webhook-queue', { connection });
