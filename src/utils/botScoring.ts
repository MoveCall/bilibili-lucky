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
  recentForwardCount24hMax: number;
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
const LOOKBACK_WINDOW_SECONDS = 3 * 24 * 60 * 60;
const FORWARD_OR_SHARED_VIDEO_LIMIT_24H = 5;
const VIDEO_SHARE_TYPES = new Set(['DYNAMIC_TYPE_AV', 'DYNAMIC_TYPE_UGC_SEASON']);

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

function getRecentForwardCount24hMax(dynamics: UserDynamicItem[]) {
  const cutoff = Math.floor(Date.now() / 1000) - LOOKBACK_WINDOW_SECONDS;
  const forwards = dynamics
    .filter((item) => item.type === 'DYNAMIC_TYPE_FORWARD' && item.createdAt >= cutoff)
    .sort((a, b) => a.createdAt - b.createdAt);

  let maxCount = 0;
  let left = 0;

  for (let right = 0; right < forwards.length; right += 1) {
    while (forwards[right].createdAt - forwards[left].createdAt > 24 * 60 * 60) {
      left += 1;
    }

    maxCount = Math.max(maxCount, right - left + 1);
  }

  return maxCount;
}

function getRecentForwardOrSharedVideoCount24hMax(dynamics: UserDynamicItem[]) {
  const cutoff = Math.floor(Date.now() / 1000) - LOOKBACK_WINDOW_SECONDS;
  const matchedItems = dynamics
    .filter((item) => (
      item.createdAt >= cutoff &&
      (
        item.type === 'DYNAMIC_TYPE_FORWARD' ||
        VIDEO_SHARE_TYPES.has(item.type) ||
        item.text.includes('分享视频')
      )
    ))
    .sort((a, b) => a.createdAt - b.createdAt);

  let maxCount = 0;
  let left = 0;

  for (let right = 0; right < matchedItems.length; right += 1) {
    while (matchedItems[right].createdAt - matchedItems[left].createdAt > 24 * 60 * 60) {
      left += 1;
    }

    maxCount = Math.max(maxCount, right - left + 1);
  }

  return maxCount;
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
    recentForwardCount24hMax: 0,
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
  const recentForwardCount24hMax = getRecentForwardCount24hMax(dynamics);
  const recentForwardOrSharedVideoCount24hMax = getRecentForwardOrSharedVideoCount24hMax(dynamics);
  const forwardRatio = repostCount / dynamicCount;
  const keywordRatio = keywordCount / dynamicCount;

  if (recentForwardOrSharedVideoCount24hMax >= FORWARD_OR_SHARED_VIDEO_LIMIT_24H) {
    return buildResult({
      passed: false,
      score: 100,
      reasonCodes: ['FORWARD_OR_SHARED_VIDEO_LIMIT_24H'],
      metrics: {
        level,
        dynamicCount: dynamics.length,
        forwardRatio,
        keywordRatio,
        burstCount,
        recentForwardCount24hMax,
        privateDynamics: false
      }
    });
  }

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
      recentForwardCount24hMax,
      privateDynamics: false
    }
  });
}
