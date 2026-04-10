// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('canvas-confetti', () => ({
  default: vi.fn()
}));

import App from './App';
import * as biliService from './services/biliService';
import * as botFilterService from './services/botFilterService';

describe('App bot filter flow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, message: 'OK', data: { online: -1 } })
    } as Response);
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips a failed candidate and finalizes the next passing winner', async () => {
    vi.spyOn(biliService, 'getVideoInfo').mockResolvedValue({
      aid: 1,
      bvid: 'BV1xx411c7mD',
      title: 'demo',
      pic: '',
      owner: { name: 'up', face: '' }
    });
    vi.spyOn(biliService, 'getAllComments').mockResolvedValue({
      comments: [
        { commentId: '1', mid: '1001', uname: 'bot', message: '抽奖', avatar: '', ctime: 1, level: 4 },
        { commentId: '2', mid: '1002', uname: 'human', message: '支持', avatar: '', ctime: 2, level: 5 }
      ],
      rootCountEstimate: 2,
      usedConfiguredCookie: true
    });
    vi.spyOn(botFilterService, 'verifyCandidateByUid')
      .mockResolvedValueOnce({
        passed: false,
        score: 90,
        reasonCodes: ['HIGH_FORWARD_RATIO'],
        metrics: { level: 4, dynamicCount: 10, forwardRatio: 1, keywordRatio: 1, burstCount: 0, privateDynamics: false }
      })
      .mockResolvedValueOnce({
        passed: true,
        score: 10,
        reasonCodes: [],
        metrics: { level: 5, dynamicCount: 10, forwardRatio: 0.1, keywordRatio: 0, burstCount: 0, privateDynamics: false }
      });

    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /加载评论数据/i }));
    await screen.findByRole('button', { name: /开始抽奖/i });

    await userEvent.click(screen.getByRole('button', { name: /开始抽奖/i }));
    await userEvent.click(await screen.findByRole('button', { name: /锁定当前结果/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/human/).length).toBeGreaterThan(0);
    });

    expect(await screen.findByText(/当前会话已自动跳过 1 个高风险账号/i)).not.toBeNull();
  });
});
