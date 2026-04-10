import { describe, expect, it, vi } from 'vitest';
import { createAppProxyPayload } from '../appProxy.js';

describe('createAppProxyPayload', () => {
  it('degrades status responses when online count fails', async () => {
    const payload = await createAppProxyPayload(
      { type: 'status' },
      {
        createProxyPayloadFn: vi.fn().mockResolvedValue({
          status: 200,
          body: { code: 0, message: 'OK', data: { hasConfiguredCookie: true } }
        }),
        getOnlineCountFn: vi.fn().mockRejectedValue(new Error('redis down')),
        handleOnlineFn: vi.fn(),
        hasRedisFn: vi.fn().mockReturnValue(true)
      }
    );

    expect(payload).toEqual({
      status: 200,
      body: {
        code: 0,
        message: 'OK',
        data: {
          hasConfiguredCookie: true,
          online: -1,
          hasRedis: true
        }
      }
    });
  });

  it('handles online heartbeat requests without requiring bilibili params', async () => {
    const handleOnlineFn = vi.fn().mockResolvedValue({ online: 3, hasRedis: true });

    const payload = await createAppProxyPayload(
      { type: 'online', visitorId: 'visitor-1' },
      {
        createProxyPayloadFn: vi.fn(),
        getOnlineCountFn: vi.fn(),
        handleOnlineFn,
        hasRedisFn: vi.fn().mockReturnValue(true)
      }
    );

    expect(handleOnlineFn).toHaveBeenCalledWith('visitor-1');
    expect(payload).toEqual({
      status: 200,
      body: { code: 0, message: 'OK', data: { online: 3, hasRedis: true } }
    });
  });

  it('routes spaceDynamic requests through the upstream proxy', async () => {
    const createProxyPayloadFn = vi.fn().mockResolvedValue({
      status: 200,
      body: {
        code: 0,
        message: 'OK',
        data: {
          items: [
            { id: 'dyn-1', type: 'DYNAMIC_TYPE_FORWARD', text: '互动抽奖', createdAt: 1710000000 }
          ],
          hasMore: false,
          offset: ''
        }
      }
    });

    const payload = await createAppProxyPayload(
      { type: 'spaceDynamic', host_mid: '12345', sampleSize: '20' },
      {
        createProxyPayloadFn,
        getOnlineCountFn: vi.fn(),
        handleOnlineFn: vi.fn(),
        hasRedisFn: vi.fn().mockReturnValue(false)
      }
    );

    expect(createProxyPayloadFn).toHaveBeenCalledWith({
      type: 'spaceDynamic',
      host_mid: '12345',
      sampleSize: '20'
    });
    expect(payload.body.data.items).toHaveLength(1);
  });
});
