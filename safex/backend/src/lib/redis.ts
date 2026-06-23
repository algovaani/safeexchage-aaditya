import { Redis } from 'ioredis';

const url = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(url, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export async function connectRedis() {
  if (redis.status === 'ready') return;
  await redis.connect().catch(() => {
    console.warn('[redis] Unavailable — market cache disabled until Redis is up');
  });
}
