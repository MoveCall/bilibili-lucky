import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('fetchBiliApi spaceDynamic', () => {
  it('builds a signed space dynamic request and normalizes items', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            wbi_img: {
              img_url: 'https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyzabcdef.png',
              sub_url: 'https://i0.hdslb.com/bfs/wbi/1234567890abcdefghijklmnopqrstuvwxyzabcd.png'
            }
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            items: [
              {
                id_str: 'dyn-1',
                type: 'DYNAMIC_TYPE_FORWARD',
                modules: {
                  module_dynamic: {
                    desc: { text: '互动抽奖' }
                  },
                  module_author: { pub_ts: 1710000000 }
                }
              }
            ],
            has_more: false,
            offset: ''
          }
        })
      });

    const { fetchBiliApi } = await import('./biliProxy.js');
    const result = await fetchBiliApi({ type: 'spaceDynamic', host_mid: '12345', sampleSize: '20' });

    expect(result.code).toBe(0);
    expect(result.data.items[0]).toEqual({
      id: 'dyn-1',
      type: 'DYNAMIC_TYPE_FORWARD',
      text: '互动抽奖',
      createdAt: 1710000000
    });
  });

  it('retries 412 responses for space dynamic requests before succeeding', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            wbi_img: {
              img_url: 'https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyzabcdef.png',
              sub_url: 'https://i0.hdslb.com/bfs/wbi/1234567890abcdefghijklmnopqrstuvwxyzabcd.png'
            }
          }
        })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 412,
        statusText: 'Precondition Failed'
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 412,
        statusText: 'Precondition Failed'
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            items: [
              {
                id_str: 'dyn-1',
                type: 'DYNAMIC_TYPE_FORWARD',
                modules: {
                  module_dynamic: {
                    desc: { text: '互动抽奖' }
                  },
                  module_author: { pub_ts: 1710000000 }
                }
              }
            ],
            has_more: false,
            offset: ''
          }
        })
      });

    const { fetchBiliApi } = await import('./biliProxy.js');
    const resultPromise = fetchBiliApi({ type: 'spaceDynamic', host_mid: '12345', sampleSize: '5' });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.code).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});
