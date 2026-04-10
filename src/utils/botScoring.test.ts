import { describe, expect, it } from 'vitest';
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
});
