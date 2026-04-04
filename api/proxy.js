import { createProxyPayload } from '../server/biliProxy.js';

export default async function handler(req, res) {
  const payload = await createProxyPayload(req.query ?? {});
  res.status(payload.status).json(payload.body);
}
