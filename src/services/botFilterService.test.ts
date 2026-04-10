import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUserDynamics, verifyCandidateByUid } from './botFilterService';
import { DEFAULT_BOT_FILTER_CONFIG } from '../utils/botFilterStorage';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchUserDynamics', () => {
  it('returns normalized items from the proxy', async () => {
    const now = 1710000000;
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        message: 'OK',
        data: {
          items: [
            { id: 'dyn-1', type: 'DYNAMIC_TYPE_FORWARD', text: '互动抽奖', createdAt: now }
          ],
          hasMore: false,
          offset: ''
        }
      })
    } as Response);

    const result = await fetchUserDynamics('12345', 20);

    expect(result.items[0].text).toBe('互动抽奖');
    expect(result.visible).toBe(true);
    vi.useRealTimers();
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

  it('keeps paging until it covers the last 3 days of dynamics', async () => {
    const now = 1710000000;
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: 'OK',
          data: {
            items: [
              { id: 'dyn-1', type: 'DYNAMIC_TYPE_FORWARD', text: '1', createdAt: now - 60 },
              { id: 'dyn-2', type: 'DYNAMIC_TYPE_FORWARD', text: '2', createdAt: now - 24 * 60 * 60 }
            ],
            hasMore: true,
            offset: 'next-page'
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          message: 'OK',
          data: {
            items: [
              { id: 'dyn-3', type: 'DYNAMIC_TYPE_FORWARD', text: '3', createdAt: now - 2 * 24 * 60 * 60 },
              { id: 'dyn-4', type: 'DYNAMIC_TYPE_FORWARD', text: '4', createdAt: now - 4 * 24 * 60 * 60 }
            ],
            hasMore: false,
            offset: ''
          }
        })
      } as Response);

    const result = await fetchUserDynamics('12345', 20);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(result.items.map((item) => item.id)).toEqual(['dyn-1', 'dyn-2', 'dyn-3']);
  });

  it('fails verification when bilibili returns 412 instead of defaulting to pass', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ code: -1, message: 'Bilibili upstream error: 412 Precondition Failed', data: null })
    } as Response);

    const result = await verifyCandidateByUid(
      {
        commentId: '1',
        mid: '1001',
        uname: 'candidate',
        message: 'test',
        avatar: '',
        ctime: 1,
        level: 4
      },
      DEFAULT_BOT_FILTER_CONFIG
    );

    expect(result.passed).toBe(false);
    expect(result.reasonCodes).toContain('UPSTREAM_BLOCKED');
  });
});
