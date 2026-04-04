import {
  BiliApiResponse,
  BiliReplyItem,
  CommentUser,
  ReplyData,
  SubReplyData,
  VideoInfo
} from '../../types';

const SUB_REPLY_PAGE_SIZE = 20;
const ROOT_COMMENT_BATCH_SIZE = 20;

export interface ProxyStatus {
  hasConfiguredCookie: boolean;
}

export interface CommentFetchResult {
  comments: CommentUser[];
  rootCountEstimate: number;
  usedConfiguredCookie: boolean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAssetUrl(url: string | undefined) {
  if (!url) {
    return 'https://i0.hdslb.com/bfs/face/member/noface.jpg';
  }

  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }

  return url;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();

  if (payload?.code === -1 && payload?.message) {
    throw new Error(payload.message);
  }

  return payload as T;
}

export async function getProxyStatus(): Promise<ProxyStatus> {
  const json = await fetchJson<BiliApiResponse<ProxyStatus>>('/api/proxy?type=status');
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message || '无法获取代理状态');
  }

  return json.data;
}

function toCommentUser(reply: BiliReplyItem): CommentUser {
  return {
    commentId: String(reply.rpid),
    mid: reply.member?.mid ?? '',
    uname: reply.member?.uname ?? '匿名用户',
    message: reply.content?.message ?? '',
    avatar: normalizeAssetUrl(reply.member?.avatar),
    ctime: reply.ctime,
    level: reply.member?.level_info?.current_level ?? 0
  };
}

function appendUniqueComments(target: Map<string, CommentUser>, comments: CommentUser[]) {
  for (const comment of comments) {
    if (!comment.message) {
      continue;
    }

    const key = comment.commentId || `${comment.mid}:${comment.ctime}:${comment.message}`;
    if (!target.has(key)) {
      target.set(key, comment);
    }
  }
}

async function getSubReplies(oid: number, root: number): Promise<CommentUser[]> {
  const commentsById = new Map<string, CommentUser>();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const params = new URLSearchParams({
      type: 'subReply',
      oid: String(oid),
      root: String(root),
      pn: String(page),
      ps: String(SUB_REPLY_PAGE_SIZE)
    });

    const json = await fetchJson<BiliApiResponse<SubReplyData>>(`/api/proxy?${params.toString()}`);
    if (json.code !== 0) {
      throw new Error(json.message || '获取子评论失败');
    }

    const replies = json.data?.replies ?? [];
    appendUniqueComments(commentsById, replies.map(toCommentUser));

    const count = json.data?.page?.count ?? replies.length;
    totalPages = Math.max(1, Math.ceil(count / SUB_REPLY_PAGE_SIZE));
    page += 1;

    if (page <= totalPages) {
      await sleep(120);
    }
  }

  return Array.from(commentsById.values());
}

export async function getVideoInfo(bvid: string): Promise<VideoInfo> {
  const params = new URLSearchParams({
    type: 'view',
    bvid
  });

  const json = await fetchJson<BiliApiResponse<VideoInfo>>(`/api/proxy?${params.toString()}`);
  if (json.code !== 0 || !json.data?.aid) {
    throw new Error(json.message || '未找到该视频信息');
  }

  return json.data;
}

export async function getAllComments(
  oid: number,
  onProgress?: (count: number, page: number) => void
): Promise<CommentFetchResult> {
  const commentsById = new Map<string, CommentUser>();
  let next = 0;
  let paginationOffset = '';
  let page = 1;
  let hasMore = true;
  let rootCountEstimate = 0;
  const proxyStatus = await getProxyStatus();

  while (hasMore) {
    const params = new URLSearchParams({
      type: 'reply',
      mode: '2',
      oid: String(oid),
      plat: '1',
      web_location: '1315875'
    });

    if (page === 1) {
      params.set('seek_rpid', '');
      params.set('next', '0');
    } else {
      params.set('next', String(next));
      params.set('pagination_str', JSON.stringify({
        offset: paginationOffset
      }));
    }

    const json = await fetchJson<BiliApiResponse<ReplyData>>(`/api/proxy?${params.toString()}`);
    if (json.code !== 0) {
      throw new Error(json.message || `第 ${page} 页评论获取失败`);
    }

    const replies = json.data?.replies ?? [];
    if (replies.length === 0) {
      break;
    }

    rootCountEstimate = Math.max(rootCountEstimate, json.data?.cursor?.all_count ?? replies.length);

    for (const reply of replies) {
      appendUniqueComments(commentsById, [toCommentUser(reply)]);

      const previewReplies = (reply.replies ?? []).map(toCommentUser);
      appendUniqueComments(commentsById, previewReplies);

      const previewCount = previewReplies.length;
      const totalSubReplyCount = reply.rcount ?? previewCount;
      if (totalSubReplyCount > previewCount) {
        const nestedReplies = await getSubReplies(oid, reply.rpid);
        appendUniqueComments(commentsById, nestedReplies);
      }
    }

    onProgress?.(commentsById.size, page);

    const cursor = json.data?.cursor;
    const nextOffset = cursor?.pagination_reply?.next_offset ?? '';
    const nextCursor = cursor?.next ?? next;

    const exhausted =
      replies.length < ROOT_COMMENT_BATCH_SIZE ||
      !nextOffset ||
      nextCursor === next;

    hasMore = !exhausted;
    next = nextCursor;
    paginationOffset = nextOffset;
    page += 1;

    if (hasMore) {
      await sleep(180);
    }
  }

  return {
    comments: Array.from(commentsById.values()).sort((a, b) => (a.ctime ?? 0) - (b.ctime ?? 0)),
    rootCountEstimate,
    usedConfiguredCookie: proxyStatus.hasConfiguredCookie
  };
}
