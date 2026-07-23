import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const isMock = process.env.MOCK_SERVICES === 'true';
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/webhookguard';

class MockCollection {
  private static stores: { [name: string]: any[] } = {};
  private name: string;

  constructor(name: string) {
    this.name = name;
    if (!MockCollection.stores[name]) {
      MockCollection.stores[name] = [];
    }
  }

  async insertOne(doc: any) {
    const newDoc = { ...doc, _id: doc._id || `mock_${Math.random().toString(36).substr(2, 9)}` };
    MockCollection.stores[this.name].push(newDoc);
    console.log(`[Mock MongoDB] [${this.name}] Inserted document:`, newDoc);
    return { acknowledged: true, insertedId: newDoc._id };
  }

  async updateOne(query: any, update: any, options?: any) {
    const store = MockCollection.stores[this.name];
    
    // Simple filter by customer_id or event_id
    let index = store.findIndex(item => {
      for (const key in query) {
        if (item[key] !== query[key]) return false;
      }
      return true;
    });

    if (index === -1 && options?.upsert) {
      const newDoc = { ...query };
      if (update.$set) {
        Object.assign(newDoc, update.$set);
      }
      store.push(newDoc);
      console.log(`[Mock MongoDB] [${this.name}] Upserted document:`, newDoc);
      return { acknowledged: true, modifiedCount: 0, upsertedCount: 1, upsertedId: newDoc._id };
    }

    if (index !== -1) {
      if (update.$set) {
        Object.assign(store[index], update.$set);
      }
      console.log(`[Mock MongoDB] [${this.name}] Updated document:`, store[index]);
      return { acknowledged: true, modifiedCount: 1, upsertedCount: 0 };
    }

    return { acknowledged: true, modifiedCount: 0, upsertedCount: 0 };
  }

  async insertMany(docs: any[]) {
    const insertedIds: { [key: number]: string } = {};
    docs.forEach((doc, index) => {
      const newDoc = { ...doc, _id: doc._id || `mock_${Math.random().toString(36).substr(2, 9)}` };
      MockCollection.stores[this.name].push(newDoc);
      insertedIds[index] = newDoc._id;
    });
    console.log(`[Mock MongoDB] [${this.name}] Inserted ${docs.length} documents.`);
    return { acknowledged: true, insertedCount: docs.length, insertedIds };
  }

  async countDocuments(query: any = {}) {
    const store = MockCollection.stores[this.name];
    const results = store.filter(item => {
      for (const key in query) {
        if (item[key] !== query[key]) return false;
      }
      return true;
    });
    return results.length;
  }

  async deleteMany(query: any = {}) {
    const store = MockCollection.stores[this.name];
    const initialCount = store.length;
    if (Object.keys(query).length === 0) {
      MockCollection.stores[this.name] = [];
    } else {
      MockCollection.stores[this.name] = store.filter(item => {
        for (const key in query) {
          if (item[key] === query[key]) return false;
        }
        return true;
      });
    }
    const deletedCount = initialCount - MockCollection.stores[this.name].length;
    console.log(`[Mock MongoDB] [${this.name}] Deleted ${deletedCount} documents.`);
    return { acknowledged: true, deletedCount };
  }

  find(query: any = {}) {
    const store = MockCollection.stores[this.name];
    const results = store.filter(item => {
      for (const key in query) {
        if (item[key] !== query[key]) return false;
      }
      return true;
    });

    return {
      toArray: async () => results,
      limit: (n: number) => {
        return {
          toArray: async () => results.slice(0, n),
        };
      },
    };
  }
}

let realClient: MongoClient | null = null;

export async function connectDb() {
  if (isMock) {
    console.log('[Mock MongoDB] In-memory database initialized.');
    return;
  }
  if (!realClient) {
    realClient = new MongoClient(mongoUri);
    await realClient.connect();
    console.log('[MongoDB] Connected to real database.');
  }
}

export function getDb() {
  if (isMock) {
    return {
      collection: (name: string) => new MockCollection(name),
    } as any;
  }
  if (!realClient) {
    throw new Error('Database not connected. Call connectDb() first.');
  }
  return realClient.db();
}
