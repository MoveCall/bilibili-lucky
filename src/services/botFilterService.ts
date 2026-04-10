import type { CommentUser } from '../../types';
import { reviewCandidate, type BotFilterConfig, type BotReviewResult, type UserDynamicItem } from '../utils/botScoring';

interface UserDynamicsResult {
  visible: boolean;
  items: UserDynamicItem[];
}

const MAX_DYNAMIC_PAGES = 5;

async function fetchDynamicsPage(hostMid: string, sampleSize: number, offset = '') {
  const params = new URLSearchParams({
    type: 'spaceDynamic',
    host_mid: hostMid,
    sampleSize: String(sampleSize)
  });

  if (offset) {
    params.set('offset', offset);
  }

  const response = await fetch(`/api/proxy?${params.toString()}`);
  return response.json();
}

export async function fetchUserDynamics(hostMid: string, sampleSize: number): Promise<UserDynamicsResult> {
  const items: UserDynamicItem[] = [];
  const targetCount = Math.min(Math.max(sampleSize, 1), 5);
  let offset = '';

  for (let page = 0; page < MAX_DYNAMIC_PAGES; page += 1) {
    const payload = await fetchDynamicsPage(hostMid, targetCount, offset);

    if (payload.code !== 0) {
      if (payload.message?.includes('动态不可见')) {
        return {
          visible: false,
          items: []
        };
      }

      throw new Error(payload.message || '获取用户动态失败');
    }

    const pageItems = payload.data?.items ?? [];
    items.push(...pageItems);

    if (items.length >= targetCount || !payload.data?.hasMore || !payload.data?.offset) {
      break;
    }

    offset = payload.data.offset;
  }

  return {
    visible: true,
    items: items.slice(0, targetCount)
  };
}

export async function verifyCandidateByUid(candidate: CommentUser, config: BotFilterConfig): Promise<BotReviewResult> {
  try {
    const dynamics = await fetchUserDynamics(candidate.mid, config.dynamicSampleSize);

    return reviewCandidate({
      level: candidate.level,
      dynamics: dynamics.items,
      dynamicsVisible: dynamics.visible,
      config
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取用户动态失败';
    if (message.includes('412 Precondition Failed')) {
      return {
        passed: false,
        score: 100,
        reasonCodes: ['UPSTREAM_BLOCKED'],
        metrics: {
          level: candidate.level,
          dynamicCount: 0,
          forwardRatio: 0,
          keywordRatio: 0,
          burstCount: 0,
          recentForwardCount24hMax: 0,
          privateDynamics: false
        }
      };
    }

    throw error;
  }
}
