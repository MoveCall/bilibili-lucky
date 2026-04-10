import type { BotFilterConfig } from './botScoring';

export const DEFAULT_BOT_FILTER_CONFIG: BotFilterConfig = {
  enabled: true,
  minLevel: 3,
  forwardRatioLimit: 0.8,
  keywordRatioLimit: 0.6,
  retryLimit: 30,
  privatePolicy: 'reject',
  dynamicSampleSize: 20
};

const STORAGE_KEY = 'bilibili-lucky:bot-filter-config';

export function loadBotFilterConfig(): BotFilterConfig {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_BOT_FILTER_CONFIG;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_BOT_FILTER_CONFIG;
    }

    return {
      ...DEFAULT_BOT_FILTER_CONFIG,
      ...JSON.parse(raw)
    };
  } catch {
    return DEFAULT_BOT_FILTER_CONFIG;
  }
}

export function saveBotFilterConfig(config: BotFilterConfig) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
