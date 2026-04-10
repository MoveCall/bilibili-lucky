import { afterEach, describe, expect, it, vi } from 'vitest';
import { reviewCandidate } from './botScoring';

const baseConfig = {
  enabled: true,
  minLevel: 3,
  forwardRatioLimit: 0.8,
  keywordRatioLimit: 0.6,
  retryLimit: 30,
  privatePolicy: 'reject' as const,
  dynamicSampleSize: 20
};

afterEach(() => {
  vi.useRealTimers();
});

describe('reviewCandidate', () => {
  it('hard-fails low-level accounts', () => {
    const result = reviewCandidate({
      level: 1,
      dynamics: [],
      dynamicsVisible: true,
      config: baseConfig
    });

    expect(result.passed).toBe(false);
    expect(result.reasonCodes).toContain('LOW_LEVEL');
  });

  it('fails private dynamics when policy is reject', () => {
    const result = reviewCandidate({
      level: 4,
      dynamics: [],
      dynamicsVisible: false,
      config: baseConfig
    });

    expect(result.passed).toBe(false);
    expect(result.reasonCodes).toContain('PRIVATE_DYNAMICS');
  });

  it('passes private dynamics when policy is allow', () => {
    const result = reviewCandidate({
      level: 4,
      dynamics: [],
      dynamicsVisible: false,
      config: { ...baseConfig, privatePolicy: 'allow' }
    });

    expect(result.passed).toBe(true);
  });

  it('fails repost-heavy lottery accounts', () => {
    const result = reviewCandidate({
      level: 4,
      dynamicsVisible: true,
      config: baseConfig,
      dynamics: Array.from({ length: 10 }, (_, index) => ({
        id: `d-${index}`,
        type: 'DYNAMIC_TYPE_FORWARD',
        text: '互动抽奖 中奖 开奖',
        createdAt: 1710000000 - index * 60
      }))
    });

    expect(result.passed).toBe(false);
    expect(result.metrics.forwardRatio).toBe(1);
    expect(result.metrics.keywordRatio).toBe(1);
  });

  it('fails accounts with more than 3 forwards in any rolling 24-hour window', () => {
    const now = 1710000000;
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);

    const result = reviewCandidate({
      level: 5,
      dynamicsVisible: true,
      config: baseConfig,
      dynamics: [
        { id: 'd-1', type: 'DYNAMIC_TYPE_FORWARD', text: '转发 1', createdAt: now },
        { id: 'd-2', type: 'DYNAMIC_TYPE_FORWARD', text: '转发 2', createdAt: now - 60 * 60 },
        { id: 'd-3', type: 'DYNAMIC_TYPE_FORWARD', text: '转发 3', createdAt: now - 2 * 60 * 60 },
        { id: 'd-4', type: 'DYNAMIC_TYPE_FORWARD', text: '转发 4', createdAt: now - 3 * 60 * 60 },
        { id: 'd-5', type: 'DYNAMIC_TYPE_WORD', text: '原创内容', createdAt: now - 5 * 24 * 60 * 60 }
      ]
    });

    expect(result.passed).toBe(false);
    expect(result.reasonCodes).toContain('FORWARD_LIMIT_24H');
  });

  it('fails accounts that shared videos within the last 3 days', () => {
    const now = 1710000000;
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);

    const result = reviewCandidate({
      level: 5,
      dynamicsVisible: true,
      config: baseConfig,
      dynamics: [
        { id: 'd-1', type: 'DYNAMIC_TYPE_AV', text: '分享视频', createdAt: now - 60 },
        { id: 'd-2', type: 'DYNAMIC_TYPE_WORD', text: '原创内容', createdAt: now - 2 * 60 * 60 }
      ]
    });

    expect(result.passed).toBe(false);
    expect(result.reasonCodes).toContain('SHARED_VIDEO_DYNAMIC');
  });
});
