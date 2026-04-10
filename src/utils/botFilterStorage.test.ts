// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BOT_FILTER_CONFIG, loadBotFilterConfig, saveBotFilterConfig } from './botFilterStorage';

describe('botFilterStorage', () => {
  beforeEach(() => localStorage.clear());

  it('returns defaults when storage is empty', () => {
    expect(loadBotFilterConfig()).toEqual(DEFAULT_BOT_FILTER_CONFIG);
  });

  it('persists and restores config', () => {
    const config = { ...DEFAULT_BOT_FILTER_CONFIG, forwardRatioLimit: 0.7, retryLimit: 20 };

    saveBotFilterConfig(config);

    expect(loadBotFilterConfig()).toEqual(config);
  });
});
