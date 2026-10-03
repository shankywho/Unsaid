import IORedis from 'ioredis';
import { env } from './config/env';

/** Shared command connection. BullMQ needs maxRetriesPerRequest=null. */
export function createRedis(): IORedis {
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
export const redis = createRedis();
