import { Redis } from '@upstash/redis';
import { createProxyPayload } from './biliProxy.js';

let redis = null;

const VISITOR_TIMEOUT = 60;

function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
  }

  return redis;
}

function hasRedis() {
  return getRedis() !== null;
}

async function handleOnline(visitorId) {
  const client = getRedis();
  if (!client) {
    return { online: -1, hasRedis: false };
  }

  const key = 'online_visitors';
  const now = Date.now();

  await client.zadd(key, { score: now, member: visitorId });
  await client.zremrangebyscore(key, '-inf', now - VISITOR_TIMEOUT * 1000);

  const count = await client.zcard(key);
  return { online: count, hasRedis: true };
}

async function getOnlineCount() {
  const client = getRedis();
  if (!client) {
    return -1;
  }

  const key = 'online_visitors';
  const now = Date.now();
  await client.zremrangebyscore(key, '-inf', now - VISITOR_TIMEOUT * 1000);
  return await client.zcard(key);
}

function getFallbackOnlinePayload(hasRedisFlag) {
  return {
    online: -1,
    hasRedis: hasRedisFlag
  };
}

export async function createAppProxyPayload(
  params,
  {
    createProxyPayloadFn = createProxyPayload,
    getOnlineCountFn = getOnlineCount,
    handleOnlineFn = handleOnline,
    hasRedisFn = hasRedis
  } = {}
) {
  const { type, visitorId } = params ?? {};

  if (type === 'online') {
    try {
      return {
        status: 200,
        body: {
          code: 0,
          message: 'OK',
          data: await handleOnlineFn(visitorId || `v_${Date.now()}_${Math.random().toString(36).slice(2)}`)
        }
      };
    } catch {
      return {
        status: 200,
        body: {
          code: 0,
          message: 'OK',
          data: getFallbackOnlinePayload(hasRedisFn())
        }
      };
    }
  }

  if (type === 'status') {
    const base = await createProxyPayloadFn({ type: 'status' });

    let online = -1;
    try {
      online = await getOnlineCountFn();
    } catch {}

    return {
      status: base.status,
      body: {
        ...base.body,
        data: {
          ...base.body.data,
          online,
          hasRedis: hasRedisFn()
        }
      }
    };
  }

  return createProxyPayloadFn(params ?? {});
}
