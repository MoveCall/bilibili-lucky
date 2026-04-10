export interface UserDynamicItem {
  id: string;
  type: string;
  text: string;
  createdAt: number;
}

export interface BotFilterConfig {
  enabled: boolean;
  minLevel: number;
  forwardRatioLimit: number;
  keywordRatioLimit: number;
  retryLimit: number;
  privatePolicy: 'reject' | 'allow';
  dynamicSampleSize: number;
}

export interface BotReviewMetrics {
  level: number;
  dynamicCount: number;
  forwardRatio: number;
  keywordRatio: number;
  burstCount: number;
  privateDynamics: boolean;
}

export interface BotReviewResult {
  passed: boolean;
  score: number;
  reasonCodes: string[];
  metrics: BotReviewMetrics;
}

const LOTTERY_KEYWORDS = ['互动抽奖', '抽奖', '中奖', '开奖', '转发抽奖', '平台开奖', '抽个', '打钱'];
const BURST_WINDOW_SECONDS = 5 * 60;
const BURST_TRIGGER_COUNT = 3;

function buildResult(overrides: Partial<BotReviewResult> & { metrics: BotReviewMetrics }): BotReviewResult {
  return {
    passed: true,
    score: 0,
    reasonCodes: [],
    ...overrides
  };
}

function getBurstCount(dynamics: UserDynamicItem[]) {
  const sorted = [...dynamics].sort((a, b) => b.createdAt - a.createdAt);
  let burstCount = 0;

  for (let index = 0; index + BURST_TRIGGER_COUNT - 1 < sorted.length; index += 1) {
    const start = sorted[index];
    const end = sorted[index + BURST_TRIGGER_COUNT - 1];
    if (
      start.type === 'DYNAMIC_TYPE_FORWARD' &&
      end.type === 'DYNAMIC_TYPE_FORWARD' &&
      start.createdAt - end.createdAt <= BURST_WINDOW_SECONDS
    ) {
      burstCount += 1;
    }
  }

  return burstCount;
}

export function reviewCandidate({
  level,
  dynamics,
  dynamicsVisible,
  config
}: {
  level: number;
  dynamics: UserDynamicItem[];
  dynamicsVisible: boolean;
  config: BotFilterConfig;
}): BotReviewResult {
  const baseMetrics: BotReviewMetrics = {
    level,
    dynamicCount: dynamics.length,
    forwardRatio: 0,
    keywordRatio: 0,
    burstCount: 0,
    privateDynamics: !dynamicsVisible
  };

  if (!config.enabled) {
    return buildResult({
      metrics: baseMetrics
    });
  }

  if (level < config.minLevel) {
    return buildResult({
      passed: false,
      score: 100,
      reasonCodes: ['LOW_LEVEL'],
      metrics: baseMetrics
    });
  }

  if (!dynamicsVisible && config.privatePolicy === 'reject') {
    return buildResult({
      passed: false,
      score: 100,
      reasonCodes: ['PRIVATE_DYNAMICS'],
      metrics: {
        ...baseMetrics,
        privateDynamics: true
      }
    });
  }

  if (!dynamicsVisible) {
    return buildResult({
      metrics: {
        ...baseMetrics,
        privateDynamics: true
      }
    });
  }

  const dynamicCount = Math.max(dynamics.length, 1);
  const repostCount = dynamics.filter((item) => item.type === 'DYNAMIC_TYPE_FORWARD').length;
  const keywordCount = dynamics.filter((item) => LOTTERY_KEYWORDS.some((keyword) => item.text.includes(keyword))).length;
  const burstCount = getBurstCount(dynamics);
  const forwardRatio = repostCount / dynamicCount;
  const keywordRatio = keywordCount / dynamicCount;

  let score = 0;
  if (forwardRatio > config.forwardRatioLimit) {
    score += 35;
  }
  if (keywordRatio > config.keywordRatioLimit) {
    score += 35;
  }
  if (burstCount > 0) {
    score += Math.min(30, burstCount * 15);
  }

  return buildResult({
    passed: score < 60,
    score,
    reasonCodes: [
      ...(forwardRatio > config.forwardRatioLimit ? ['HIGH_FORWARD_RATIO'] : []),
      ...(keywordRatio > config.keywordRatioLimit ? ['HIGH_KEYWORD_RATIO'] : []),
      ...(burstCount > 0 ? ['SUSPICIOUS_BURST'] : [])
    ],
    metrics: {
      level,
      dynamicCount: dynamics.length,
      forwardRatio,
      keywordRatio,
      burstCount,
      privateDynamics: false
    }
  });
}
