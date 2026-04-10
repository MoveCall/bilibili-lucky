import { CommentUser, VideoInfo } from '../../types';
import type { BotFilterConfig, BotReviewResult } from './botScoring';

export interface DrawFiltersSnapshot {
  keyword: string;
  removeDuplicates: boolean;
  minLevel: number;
}

export interface DrawRoundRecord {
  round: number;
  drawnAt: string;
  filters: DrawFiltersSnapshot;
  eligibleCandidateCount: number;
  winnerMid: string;
  botFilterConfig?: BotFilterConfig;
  reviewResult?: BotReviewResult | null;
}

export interface SkippedCandidateRecord {
  mid: string;
  uname: string;
  skippedAt: string;
  reviewResult: BotReviewResult;
}

interface BuildExportPayloadOptions {
  videoInfo: VideoInfo;
  allCommentsCount: number;
  currentUiFilters: DrawFiltersSnapshot;
  currentEligibleCount: number;
  winners: CommentUser[];
  drawRounds: DrawRoundRecord[];
  skippedCandidates?: SkippedCandidateRecord[];
}

export function buildExportPayload({
  videoInfo,
  allCommentsCount,
  currentUiFilters,
  currentEligibleCount,
  winners,
  drawRounds,
  skippedCandidates = []
}: BuildExportPayloadOptions) {
  const primaryRound = drawRounds[0];
  const exportFilters = primaryRound?.filters ?? currentUiFilters;
  const eligibleCandidates = primaryRound?.eligibleCandidateCount ?? currentEligibleCount;
  const hasMultipleDrawConfigs = drawRounds.some((round) => (
    round.filters.keyword !== exportFilters.keyword ||
    round.filters.removeDuplicates !== exportFilters.removeDuplicates ||
    round.filters.minLevel !== exportFilters.minLevel ||
    round.eligibleCandidateCount !== eligibleCandidates
  ));

  return {
    exportedAt: new Date().toISOString(),
    video: {
      bvid: videoInfo.bvid,
      aid: videoInfo.aid,
      title: videoInfo.title
    },
    filters: exportFilters,
    summary: {
      totalComments: allCommentsCount,
      eligibleCandidates,
      winnerCount: winners.length,
      hasMultipleDrawConfigs
    },
    botFilter: {
      skippedCandidates,
      totalVerificationAttempts: drawRounds.length + skippedCandidates.length
    },
    drawRounds,
    winners
  };
}
