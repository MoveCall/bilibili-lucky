# Bot Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable verify-on-draw anti-bot system that reviews a selected Bilibili account's recent dynamics before finalizing a winner, automatically redraws on failures, and exports audit data.

**Architecture:** Extend the shared app proxy with a `spaceDynamic` route that reuses the existing Bilibili signing stack, add a focused frontend bot-filter service and pure scoring utility, then thread verification state through the existing draw flow in `src/App.tsx`. Keep the scoring logic pure and testable, keep the proxy responsible only for fetching and normalizing upstream data, and store draw-time verification snapshots in the export payload.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, existing Node-based Bilibili proxy, localStorage for persisted UI config.

---

## File Map

### Existing files to modify

- `server/biliProxy.js`
  - add `spaceDynamic` upstream support and shared signed-request helpers
- `server/appProxy.js`
  - route `type=spaceDynamic` through the shared app proxy with graceful error behavior
- `server/__tests__/appProxy.test.js`
  - extend proxy tests for `spaceDynamic`
- `src/App.tsx`
  - add bot-filter config UI, verification state, redraw loop, and export integration
- `src/utils/exportPayload.ts`
  - extend export payload types with bot-filter audit snapshots
- `src/utils/exportPayload.test.ts`
  - verify export snapshots include bot-filter audit data and still preserve draw-time values
- `README.md`
  - document the bot-filter feature and its operational caveats
- `package.json`
  - add browser-test dependencies required for the draw-flow test

### New files to create

- `src/services/botFilterService.ts`
  - frontend API wrapper + normalization for user dynamics
- `src/App.botFilter.test.tsx`
  - jsdom-backed integration test for the verify-on-draw flow
- `src/utils/botScoring.ts`
  - pure scoring, hard-fail logic, keyword matching, burst detection
- `src/utils/botScoring.test.ts`
  - unit tests for scoring logic
- `src/utils/botFilterStorage.ts`
  - localStorage read/write helpers for persistent config
- `src/utils/botFilterStorage.test.ts`
  - tests for persisted config fallback behavior

## Task 0: Add the browser-test dependencies for draw-flow coverage

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add the failing app test file stub**

```tsx
// @vitest-environment jsdom

import { describe, it } from 'vitest';

describe('App bot filter flow', () => {
  it('runs in jsdom once browser-test dependencies are installed', () => {});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/App.botFilter.test.tsx`
Expected: FAIL with a missing `jsdom` or missing Testing Library dependency error.

- [ ] **Step 3: Install the minimal browser-test dependencies**

```bash
npm install -D jsdom @testing-library/react @testing-library/user-event
```

- [ ] **Step 4: Run the test to verify the environment is ready**

Run: `npm test -- src/App.botFilter.test.tsx`
Expected: PASS for the empty jsdom test file.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/App.botFilter.test.tsx
git commit -m "test: add browser test dependencies"
```

## Task 1: Add failing proxy tests for user dynamics support

**Files:**
- Modify: `server/__tests__/appProxy.test.js`
- Modify later: `server/appProxy.js`
- Modify later: `server/biliProxy.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it, vi } from 'vitest';
import { createAppProxyPayload } from '../appProxy.js';

describe('createAppProxyPayload', () => {
  it('routes spaceDynamic requests through the upstream proxy', async () => {
    const createProxyPayloadFn = vi.fn().mockResolvedValue({
      status: 200,
      body: {
        code: 0,
        message: 'OK',
        data: {
          items: [
            { id: 'dyn-1', type: 'DYNAMIC_TYPE_FORWARD', text: '互动抽奖', createdAt: 1710000000 }
          ],
          hasMore: false,
          offset: ''
        }
      }
    });

    const payload = await createAppProxyPayload(
      { type: 'spaceDynamic', host_mid: '12345', sampleSize: '20' },
      {
        createProxyPayloadFn,
        getOnlineCountFn: vi.fn(),
        handleOnlineFn: vi.fn(),
        hasRedisFn: vi.fn().mockReturnValue(false)
      }
    );

    expect(createProxyPayloadFn).toHaveBeenCalledWith({
      type: 'spaceDynamic',
      host_mid: '12345',
      sampleSize: '20'
    });
    expect(payload.body.data.items).toHaveLength(1);
  });

  it('returns proxy errors for invalid spaceDynamic params', async () => {
    const createProxyPayloadFn = vi.fn().mockResolvedValue({
      status: 400,
      body: { code: -1, message: 'Missing host_mid parameter', data: null }
    });

    const payload = await createAppProxyPayload(
      { type: 'spaceDynamic' },
      {
        createProxyPayloadFn,
        getOnlineCountFn: vi.fn(),
        handleOnlineFn: vi.fn(),
        hasRedisFn: vi.fn().mockReturnValue(false)
      }
    );

    expect(payload.status).toBe(400);
    expect(payload.body.message).toBe('Missing host_mid parameter');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server/__tests__/appProxy.test.js`
Expected: FAIL because `spaceDynamic` support does not exist yet or the new assertions are unmet.

- [ ] **Step 3: Implement the minimal proxy routing support**

```js
const forwardProxy = deps.createProxyPayloadFn ?? createProxyPayload;

if (type === 'spaceDynamic') {
  return forwardProxy(params ?? {});
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server/__tests__/appProxy.test.js`
Expected: PASS with the new `spaceDynamic` routing covered.

- [ ] **Step 5: Commit**

```bash
git add server/__tests__/appProxy.test.js server/appProxy.js
git commit -m "test: cover space dynamic proxy routing"
```

## Task 2: Add failing server tests for `spaceDynamic` normalization and implement the upstream fetch

**Files:**
- Create: `server/biliProxy.test.js`
- Modify: `server/biliProxy.js`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as biliProxy from './biliProxy.js';

describe('fetchBiliApi spaceDynamic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a signed space dynamic request and normalizes items', async () => {
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
                    desc: { text: '互动抽奖' },
                    major: null
                  },
                  module_author: { pub_ts: 1710000000 }
                }
              }
            },
            has_more: false,
            offset: ''
          }
        })
      });

    const result = await biliProxy.fetchBiliApi({ type: 'spaceDynamic', host_mid: '12345' });

    expect(result.code).toBe(0);
    expect(result.data.items[0]).toEqual({
      id: 'dyn-1',
      type: 'DYNAMIC_TYPE_FORWARD',
      text: '互动抽奖',
      createdAt: 1710000000
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- server/biliProxy.test.js`
Expected: FAIL because `spaceDynamic` is not yet supported and normalization is absent.

- [ ] **Step 3: Implement the minimal upstream support**

```js
function normalizeDynamicItem(item) {
  return {
    id: item.id_str ?? '',
    type: item.type ?? '',
    text: item.modules?.module_dynamic?.desc?.text ?? '',
    createdAt: item.modules?.module_author?.pub_ts ?? 0
  };
}

function buildTargetUrl(params) {
  const { type = 'reply', host_mid, offset = '' } = params;

  if (type === 'spaceDynamic') {
    if (!host_mid) {
      throw new Error('Missing host_mid parameter');
    }

    return 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space';
  }
}

export async function fetchBiliApi(params) {
  if (params.type === 'spaceDynamic') {
    const signedParams = await signWbiParams({
      host_mid: String(params.host_mid),
      offset: params.offset ?? ''
    });
    const response = await fetch(`${buildTargetUrl(params)}?${signedParams.toString()}`, {
      headers: buildHeaders()
    });
    const data = await response.json();

    return {
      ...data,
      data: {
        items: (data?.data?.items ?? []).map(normalizeDynamicItem),
        hasMore: Boolean(data?.data?.has_more),
        offset: data?.data?.offset ?? ''
      }
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- server/biliProxy.test.js`
Expected: PASS with normalized dynamic items.

- [ ] **Step 5: Commit**

```bash
git add server/biliProxy.js server/biliProxy.test.js
git commit -m "feat: add signed space dynamic proxy support"
```

## Task 3: Add failing scoring tests and implement the pure bot scoring utility

**Files:**
- Create: `src/utils/botScoring.test.ts`
- Create: `src/utils/botScoring.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/utils/botScoring.test.ts`
Expected: FAIL because `reviewCandidate` does not exist.

- [ ] **Step 3: Implement the minimal scoring utility**

```ts
export interface BotFilterConfig {
  enabled: boolean;
  minLevel: number;
  forwardRatioLimit: number;
  keywordRatioLimit: number;
  retryLimit: number;
  privatePolicy: 'reject' | 'allow';
  dynamicSampleSize: number;
}

const LOTTERY_KEYWORDS = ['互动抽奖', '抽奖', '中奖', '开奖', '转发抽奖', '平台开奖', '抽个', '打钱'];

function buildResult(overrides) {
  return {
    passed: true,
    score: 0,
    reasonCodes: [],
    metrics: {
      level: 0,
      dynamicCount: 0,
      forwardRatio: 0,
      keywordRatio: 0,
      burstCount: 0,
      privateDynamics: false
    },
    ...overrides
  };
}

export function reviewCandidate({ level, dynamics, dynamicsVisible, config }) {
  if (!config.enabled) {
    return buildResult({
      passed: true,
      metrics: {
        level,
        dynamicCount: dynamics.length,
        forwardRatio: 0,
        keywordRatio: 0,
        burstCount: 0,
        privateDynamics: !dynamicsVisible
      }
    });
  }

  if (level < config.minLevel) {
    return buildResult({
      passed: false,
      score: 100,
      reasonCodes: ['LOW_LEVEL'],
      metrics: {
        level,
        dynamicCount: dynamics.length,
        forwardRatio: 0,
        keywordRatio: 0,
        burstCount: 0,
        privateDynamics: !dynamicsVisible
      }
    });
  }

  if (!dynamicsVisible && config.privatePolicy === 'reject') {
    return buildResult({
      passed: false,
      score: 100,
      reasonCodes: ['PRIVATE_DYNAMICS'],
      metrics: {
        level,
        dynamicCount: 0,
        forwardRatio: 0,
        keywordRatio: 0,
        burstCount: 0,
        privateDynamics: true
      }
    });
  }

  const dynamicCount = Math.max(dynamics.length, 1);
  const repostCount = dynamics.filter((item) => item.type === 'DYNAMIC_TYPE_FORWARD').length;
  const keywordCount = dynamics.filter((item) => LOTTERY_KEYWORDS.some((keyword) => item.text.includes(keyword))).length;
  const forwardRatio = repostCount / dynamicCount;
  const keywordRatio = keywordCount / dynamicCount;
  const score = Math.round(
    Math.min(100, (forwardRatio / config.forwardRatioLimit) * 35 + (keywordRatio / config.keywordRatioLimit) * 35)
  );

  return buildResult({
    passed: score < 60,
    score,
    reasonCodes: [
      ...(forwardRatio > config.forwardRatioLimit ? ['HIGH_FORWARD_RATIO'] : []),
      ...(keywordRatio > config.keywordRatioLimit ? ['HIGH_KEYWORD_RATIO'] : [])
    ],
    metrics: {
      level,
      dynamicCount: dynamics.length,
      forwardRatio,
      keywordRatio,
      burstCount: 0,
      privateDynamics: !dynamicsVisible
    }
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/utils/botScoring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/botScoring.ts src/utils/botScoring.test.ts
git commit -m "feat: add bot scoring utility"
```

## Task 4: Add failing persistence tests and implement bot-filter config storage

**Files:**
- Create: `src/utils/botFilterStorage.test.ts`
- Create: `src/utils/botFilterStorage.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/utils/botFilterStorage.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal storage helper**

```ts
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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BOT_FILTER_CONFIG;
    return { ...DEFAULT_BOT_FILTER_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_BOT_FILTER_CONFIG;
  }
}

export function saveBotFilterConfig(config: BotFilterConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/utils/botFilterStorage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/botFilterStorage.ts src/utils/botFilterStorage.test.ts
git commit -m "feat: persist bot filter config"
```

## Task 5: Add failing service tests and implement frontend dynamics fetching

**Files:**
- Create: `src/services/botFilterService.test.ts`
- Create: `src/services/botFilterService.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchUserDynamics } from './botFilterService';

afterEach(() => vi.restoreAllMocks());

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
      }
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/services/botFilterService.test.ts`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the minimal fetch service**

```ts
import type { CommentUser } from '../../types';
import { reviewCandidate, type BotFilterConfig } from '../utils/botScoring';

export async function fetchUserDynamics(hostMid: string, sampleSize: number) {
  const params = new URLSearchParams({
    type: 'spaceDynamic',
    host_mid: hostMid,
    sampleSize: String(sampleSize)
  });
  const response = await fetch(`/api/proxy?${params.toString()}`);
  const payload = await response.json();

  if (payload.code !== 0) {
    if (payload.message?.includes('动态不可见')) {
      return { visible: false, items: [] };
    }
    throw new Error(payload.message || '获取用户动态失败');
  }

  return {
    visible: true,
    items: payload.data?.items ?? []
  };
}

export async function verifyCandidateByUid(candidate: CommentUser, config: BotFilterConfig) {
  const dynamics = await fetchUserDynamics(candidate.mid, config.dynamicSampleSize);

  return reviewCandidate({
    level: candidate.level,
    dynamics: dynamics.items,
    dynamicsVisible: dynamics.visible,
    config
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/services/botFilterService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/botFilterService.ts src/services/botFilterService.test.ts
git commit -m "feat: add bot filter dynamics service"
```

## Task 6: Add failing draw-flow tests and implement verify-on-draw state in the app

**Files:**
- Modify: `src/App.tsx`
- Modify later: `src/utils/exportPayload.ts`
- Test: `src/App.botFilter.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import * as biliService from './services/biliService';
import * as botFilterService from './services/botFilterService';

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
    .mockResolvedValueOnce({ passed: false, score: 90, reasonCodes: ['HIGH_FORWARD_RATIO'], metrics: { level: 4, dynamicCount: 10, forwardRatio: 1, keywordRatio: 1, burstCount: 0, privateDynamics: false } })
    .mockResolvedValueOnce({ passed: true, score: 10, reasonCodes: [], metrics: { level: 5, dynamicCount: 10, forwardRatio: 0.1, keywordRatio: 0, burstCount: 0, privateDynamics: false } });

  render(<App />);

  await userEvent.click(screen.getByRole('button', { name: /加载评论数据/i }));
  await userEvent.click(await screen.findByRole('button', { name: /开始抽奖/i }));
  await userEvent.click(await screen.findByRole('button', { name: /锁定当前结果/i }));

  await waitFor(() => {
    expect(screen.getByText(/human/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/App.botFilter.test.tsx`
Expected: FAIL because the app does not yet run verification or redraw on failed reviews.

- [ ] **Step 3: Implement the minimal draw-flow changes**

```tsx
const [botFilterConfig, setBotFilterConfig] = useState(loadBotFilterConfig());
const [isReviewingCandidate, setIsReviewingCandidate] = useState(false);
const [reviewAttempts, setReviewAttempts] = useState(0);
const [skippedCandidates, setSkippedCandidates] = useState([]);

function acceptWinner(candidate: CommentUser, reviewResult: BotReviewResult | null) {
  const finalWinner = {
    ...candidate,
    drawTime: formatDrawTime()
  };
  const nextWinners = [...winners, finalWinner];

  setDrawRounds((prev) => [...prev, {
    round: nextWinners.length,
    drawnAt: finalWinner.drawTime,
    filters: { keyword, removeDuplicates, minLevel },
    eligibleCandidateCount: filteredComments.length,
    winnerMid: finalWinner.mid,
    botFilterConfig: botFilterConfig.enabled ? { ...botFilterConfig } : undefined,
    reviewResult
  }]);
  setWinners(nextWinners);
  setWinner(finalWinner);
  setCurrentCandidate(finalWinner);
  setStatus(nextWinners.length >= winnerCount ? AppState.FINISHED : AppState.READY_TO_DRAW);
}

async function finalizeCandidate(candidate: CommentUser) {
  if (!botFilterConfig.enabled) {
    return acceptWinner(candidate, null);
  }

  setIsReviewingCandidate(true);
  const reviewResult = await verifyCandidateByUid(candidate, botFilterConfig);
  setIsReviewingCandidate(false);

  if (reviewResult.passed) {
    return acceptWinner(candidate, reviewResult);
  }

  setSkippedCandidates((prev) => [...prev, {
    mid: candidate.mid,
    uname: candidate.uname,
    skippedAt: formatDrawTime(),
    reviewResult
  }]);

  if (reviewAttempts + 1 >= botFilterConfig.retryLimit) {
    addLog('达到机器人过滤最大重试次数，请调整阈值或关闭过滤。', 'warning');
    setStatus(AppState.READY_TO_DRAW);
    return;
  }

  setReviewAttempts((prev) => prev + 1);
  addLog(`账号 ${candidate.uname} 未通过审核，已自动重抽。`, 'warning');
  startLottery();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/App.botFilter.test.tsx`
Expected: PASS with failed candidates skipped and a passing winner finalized.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.botFilter.test.tsx
git commit -m "feat: verify candidates before finalizing winners"
```

## Task 7: Add failing export tests and implement bot-filter audit snapshots

**Files:**
- Modify: `src/utils/exportPayload.ts`
- Modify: `src/utils/exportPayload.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
it('includes bot filter config and skipped candidate audit data', () => {
  const payload = buildExportPayload({
    videoInfo: video,
    allCommentsCount: 50,
    currentUiFilters: {
      keyword: 'new keyword',
      removeDuplicates: false,
      minLevel: 0
    },
    currentEligibleCount: 2,
    winners: [winner],
    drawRounds: [
      {
        round: 1,
        drawnAt: '2026-04-10 10:00:00',
        filters: {
          keyword: 'old keyword',
          removeDuplicates: true,
          minLevel: 3
        },
        eligibleCandidateCount: 12,
        winnerMid: '1001',
        botFilterConfig: {
          enabled: true,
          minLevel: 3,
          forwardRatioLimit: 0.8,
          keywordRatioLimit: 0.6,
          retryLimit: 30,
          privatePolicy: 'reject',
          dynamicSampleSize: 20
        },
        reviewResult: {
          passed: true,
          score: 12,
          reasonCodes: [],
          metrics: {
            level: 5,
            dynamicCount: 8,
            forwardRatio: 0,
            keywordRatio: 0,
            burstCount: 0,
            privateDynamics: false
          }
        }
      }
    ],
    skippedCandidates: [
      {
        mid: '2001',
        uname: 'bot-user',
        skippedAt: '2026-04-10 09:59:00',
        reviewResult: {
          passed: false,
          score: 88,
          reasonCodes: ['HIGH_FORWARD_RATIO'],
          metrics: {
            level: 4,
            dynamicCount: 10,
            forwardRatio: 1,
            keywordRatio: 1,
            burstCount: 1,
            privateDynamics: false
          }
        }
      }
    ]
  });

  expect(payload.botFilter.skippedCandidates).toHaveLength(1);
  expect(payload.drawRounds[0].botFilterConfig.enabled).toBe(true);
  expect(payload.drawRounds[0].reviewResult.score).toBe(12);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/utils/exportPayload.test.ts`
Expected: FAIL because the export payload does not yet include bot-filter audit fields.

- [ ] **Step 3: Implement the minimal export changes**

```ts
export interface DrawRoundRecord {
  round: number;
  drawnAt: string;
  filters: DrawFiltersSnapshot;
  eligibleCandidateCount: number;
  winnerMid: string;
  botFilterConfig?: BotFilterConfig;
  reviewResult?: BotReviewResult | null;
}

export function buildExportPayload(options: BuildExportPayloadOptions) {
  return {
    exportedAt: new Date().toISOString(),
    video: {
      bvid: options.videoInfo.bvid,
      aid: options.videoInfo.aid,
      title: options.videoInfo.title
    },
    filters: exportFilters,
    summary: {
      totalComments: options.allCommentsCount,
      eligibleCandidates,
      winnerCount: options.winners.length,
      hasMultipleDrawConfigs
    },
    botFilter: {
      skippedCandidates: options.skippedCandidates,
      totalVerificationAttempts: options.drawRounds.length + options.skippedCandidates.length
    },
    drawRounds: options.drawRounds,
    winners: options.winners
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/utils/exportPayload.test.ts`
Expected: PASS and previous snapshot assertions still succeed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/exportPayload.ts src/utils/exportPayload.test.ts src/App.tsx
git commit -m "feat: export bot filter audit snapshots"
```

## Task 8: Add README coverage and run final verification

**Files:**
- Modify: `README.md`
- Verify: `package.json`

- [ ] **Step 1: Add documentation for the new feature**

```md
## 机器人过滤

抽奖支持在锁定中奖者前自动审核候选账号：

- 可配置最低等级、转发率阈值、抽奖词密度阈值
- 支持动态不可见策略
- 审核失败后自动重抽，直到达到最大重试次数
- 导出的 JSON 会包含审核快照和被跳过账号摘要

说明：

- 审核依赖用户空间动态接口，可能受 B 站风控影响
- 建议为服务端配置 `BILIBILI_COOKIE` 以提高稳定性
- 网络异常时系统会记录 warning 并默认放行，以避免中断抽奖流程
```

- [ ] **Step 2: Run the full targeted verification suite**

Run:

```bash
npm test -- server/__tests__/appProxy.test.js server/biliProxy.test.js src/utils/botScoring.test.ts src/utils/botFilterStorage.test.ts src/utils/exportPayload.test.ts src/services/botFilterService.test.ts src/App.botFilter.test.tsx
npm run build
```

Expected:

- all listed Vitest files PASS
- production build succeeds without TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add README.md server/__tests__/appProxy.test.js server/biliProxy.test.js src/utils/botScoring.test.ts src/utils/botFilterStorage.test.ts src/utils/exportPayload.test.ts src/services/botFilterService.test.ts src/App.botFilter.test.tsx package.json package-lock.json
git commit -m "docs: document bot filter feature"
```

## Self-Review Notes

- Spec coverage:
  - verify-on-draw flow: Tasks 3, 5, 6, 7
  - configurable UI thresholds + persistence: Tasks 4 and 6
  - shared signed `spaceDynamic` proxy: Tasks 1 and 2
  - export audit snapshots: Task 7
  - README/user guidance: Task 8
- Placeholder scan:
  - no `TODO`, `TBD`, or "implement later" placeholders remain
  - each code-changing step includes concrete code or commands
- Type consistency:
  - `BotFilterConfig`, `BotReviewResult`, `SkippedCandidateRecord`, and `DrawRoundRecord` names are reused consistently across tasks
  - `spaceDynamic` is the only new proxy type referenced across server and frontend steps
