import type { CommentUser } from '../../types';
import { reviewCandidate, type BotFilterConfig, type BotReviewResult, type UserDynamicItem } from '../utils/botScoring';

interface UserDynamicsResult {
  visible: boolean;
  items: UserDynamicItem[];
}

export async function fetchUserDynamics(hostMid: string, sampleSize: number): Promise<UserDynamicsResult> {
  const params = new URLSearchParams({
    type: 'spaceDynamic',
    host_mid: hostMid,
    sampleSize: String(sampleSize)
  });

  const response = await fetch(`/api/proxy?${params.toString()}`);
  const payload = await response.json();

  if (payload.code !== 0) {
    if (payload.message?.includes('动态不可见')) {
      return {
        visible: false,
        items: []
      };
    }

    throw new Error(payload.message || '获取用户动态失败');
  }

  return {
    visible: true,
    items: payload.data?.items ?? []
  };
}

export async function verifyCandidateByUid(candidate: CommentUser, config: BotFilterConfig): Promise<BotReviewResult> {
  const dynamics = await fetchUserDynamics(candidate.mid, config.dynamicSampleSize);

  return reviewCandidate({
    level: candidate.level,
    dynamics: dynamics.items,
    dynamicsVisible: dynamics.visible,
    config
  });
}
