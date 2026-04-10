import { createAppProxyPayload } from '../server/appProxy.js';

export default async function handler(req, res) {
  const payload = await createAppProxyPayload(req.query ?? {});
  res.status(payload.status).json(payload.body);
}
