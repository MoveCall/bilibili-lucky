import { describe, expect, it } from 'vitest';
import { buildExportPayload } from './exportPayload';
import { DEFAULT_BOT_FILTER_CONFIG } from './botFilterStorage';

const video = {
  aid: 1,
  bvid: 'BV1xx411c7mD',
  title: 'test video',
  pic: '',
  owner: { name: 'up', face: '' }
};

const winner = {
  commentId: 'c1',
  mid: '1001',
  uname: 'Alice',
  message: 'hello',
  avatar: 'https://example.com/a.png',
  ctime: 123,
  level: 5,
  drawTime: '2026-04-10 10:00:00'
};

describe('buildExportPayload', () => {
  it('uses recorded draw rounds instead of current UI filters', () => {
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
          botFilterConfig: DEFAULT_BOT_FILTER_CONFIG,
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

    expect(payload.filters).toEqual({
      keyword: 'old keyword',
      removeDuplicates: true,
      minLevel: 3
    });
    expect(payload.summary.eligibleCandidates).toBe(12);
    expect(payload.drawRounds[0].filters.keyword).toBe('old keyword');
    expect(payload.botFilter.skippedCandidates).toHaveLength(1);
    expect(payload.drawRounds[0].botFilterConfig?.enabled).toBe(true);
    expect(payload.drawRounds[0].reviewResult?.score).toBe(12);
  });
});
