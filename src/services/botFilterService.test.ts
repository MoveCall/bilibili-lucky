import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUserDynamics } from './botFilterService';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchUserDynamics', () => {
  it('returns normalized items from the proxy', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        message: 'OK',
        data: {
          items: [
            { id: 'dyn-1', type: 'DYNAMIC_TYPE_FORWARD', text: '互动抽奖', createdAt: 1710000000 }
          ],
          hasMore: false,
          offset: ''
        }
      })
    } as Response);

    const result = await fetchUserDynamics('12345', 20);

    expect(result.items[0].text).toBe('互动抽奖');
    expect(result.visible).toBe(true);
  });

  it('treats private dynamics as not visible', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ code: -1, message: '动态不可见', data: null })
    } as Response);

    const result = await fetchUserDynamics('12345', 20);

    expect(result.visible).toBe(false);
    expect(result.items).toEqual([]);
  });
});
