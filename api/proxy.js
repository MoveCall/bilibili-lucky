import { createProxyPayload } from '../server/biliProxy.js';
import { Redis } from '@upstash/redis';

let redis = null;

function getRedis() {
  if (!redis && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
  }
  return redis;
}

const VISITOR_TIMEOUT = 60;

async function handleOnline(visitorId) {
  const r = getRedis();
  if (!r) {
    return { online: -1, hasRedis: false };
  }

  const key = 'online_visitors';
  const now = Date.now();

  await r.zadd(key, { score: now, member: visitorId });
  await r.zremrangebyscore(key, '-inf', now - VISITOR_TIMEOUT * 1000);

  const count = await r.zcard(key);
  return { online: count, hasRedis: true };
}

async function getOnlineCount() {
  const r = getRedis();
  if (!r) {
    return -1;
  }

  const key = 'online_visitors';
  const now = Date.now();
  await r.zremrangebyscore(key, '-inf', now - VISITOR_TIMEOUT * 1000);
  return await r.zcard(key);
}

export default async function handler(req, res) {
  const { type, visitorId } = req.query ?? {};

  if (type === 'online') {
    const result = await handleOnline(visitorId || `v_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    res.status(200).json({ code: 0, message: 'OK', data: result });
    return;
  }

  if (type === 'status') {
    const base = await createProxyPayload({ type: 'status' });
    const onlineCount = await getOnlineCount();
    res.status(base.status).json({
      ...base.body,
      data: {
        ...base.body.data,
        online: onlineCount,
        hasRedis: getRedis() !== null
      }
    });
    return;
  }

  const payload = await createProxyPayload(req.query ?? {});
  res.status(payload.status).json(payload.body);
}
