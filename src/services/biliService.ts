import { CommentUser, VideoInfo, ReplyData, BiliApiResponse } from '../../types';

// --- MOCK DATA FOR FALLBACK (Demo Mode) ---
const MOCK_OID = 999999;

const MOCK_VIDEO_INFO: VideoInfo = {
  aid: MOCK_OID,
  bvid: 'BV1MockDemo',
  title: '【演示模式】后端未连接 - 使用模拟数据',
  pic: 'https://images.unsplash.com/photo-1626544827763-d516dce335ca?q=80&w=800&auto=format&fit=crop',
  owner: {
    name: 'Vercel Preview',
    face: 'https://api.dicebear.com/7.x/avataaars/svg?seed=vercel'
  }
};

const MOCK_COMMENTS: CommentUser[] = Array.from({ length: 25 }).map((_, i) => ({
  mid: `mock_${i}`,
  uname: `测试用户 ${i + 1}`,
  message: `这是一个模拟评论 #${i + 1}。当前后端 API 不可用 (404)，系统已自动切换到演示模式。`,
  avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`,
  ctime: Date.now() / 1000 - i * 3600,
  level: Math.floor(Math.random() * 7) // Random level 0-6
}));

// --- HELPER ---

async function fetchJson<T>(url: string): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
       // Identify 404 specifically for fallback logic
       if (res.status === 404) throw new Error("API_NOT_FOUND");
       throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON response");
    }
  } catch (e: any) {
    throw e;
  }
}

// --- API METHODS ---

export async function getVideoInfo(bv: string): Promise<VideoInfo> {
  try {
    const json = await fetchJson<BiliApiResponse<VideoInfo>>(`/api/proxy?type=view&bvid=${bv}`);
    if (json.code === 0 && json.data?.aid) {
      return json.data; 
    }
    throw new Error(json.message || "Video not found");
  } catch (err: any) {
    // Fallback to mock data if API is missing (404) or Network Fail
    if (err.message === "API_NOT_FOUND" || err.message.includes("Failed to fetch")) {
      console.warn("Backend API unavailable. Switching to Mock Data mode.");
      return MOCK_VIDEO_INFO;
    }
    throw err;
  }
}

export async function getAllComments(
  oid: number, 
  onProgress?: (count: number, page: number) => void
): Promise<CommentUser[]> {
  // 1. If we are using the mock OID, return mock comments directly
  if (oid === MOCK_OID) {
     if (onProgress) onProgress(MOCK_COMMENTS.length, 1);
     await new Promise(resolve => setTimeout(resolve, 800)); // Simulate network delay
     return MOCK_COMMENTS;
  }

  // 2. Real API fetch
  let allComments: CommentUser[] = [];
  let page = 1;
  let isEnd = false;

  try {
    while (!isEnd) {
      const json = await fetchJson<BiliApiResponse<ReplyData>>(`/api/proxy?type=reply&oid=${oid}&next=${page}`);

      if (json.code !== 0) {
        console.warn(`Page ${page} failed: ${json.message}`);
        break;
      }

      const replies = json.data?.replies;
      const cursor = json.data?.cursor;

      if (replies && replies.length > 0) {
        const formatted: CommentUser[] = replies.map((r) => ({
          mid: r.member.mid,
          uname: r.member.uname,
          message: r.content.message,
          avatar: r.member.avatar,
          ctime: r.ctime,
          level: r.member.level_info.current_level
        }));
        
        allComments = [...allComments, ...formatted];
        
        if (onProgress) {
          onProgress(allComments.length, page);
        }
      } else {
        isEnd = true; 
      }

      if (cursor?.is_end) {
        isEnd = true;
      }

      page++;
      
      // Gentle throttling
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (err: any) {
     // If API fails mid-way with 404, fallback
     if (err.message === "API_NOT_FOUND") {
       console.warn("Backend API unavailable during fetch. Returning Mock Data.");
       if (onProgress) onProgress(MOCK_COMMENTS.length, 1);
       return MOCK_COMMENTS;
     }
     throw err;
  }

  return allComments;
}