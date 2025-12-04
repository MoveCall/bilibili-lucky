import { CommentUser, VideoInfo, ReplyData, BiliApiResponse } from '../../types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  
  if (!res.ok) {
     // Specific hint for the common 404 issue in local dev
     if (res.status === 404) {
        throw new Error(`API 404 Not Found. (Hint: Run 'vercel dev' to start the backend, not just 'vite')`);
     }
     throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  
  try {
    const data = JSON.parse(text);
    return data;
  } catch (e) {
    console.error("API Parse Error. Received body:", text);
    const snippet = text.slice(0, 50).replace(/\n/g, ' ');
    throw new Error(`Backend Error: Received invalid response (${snippet}...)`);
  }
}

export async function getVideoInfo(bv: string): Promise<VideoInfo> {
  const json = await fetchJson<BiliApiResponse<VideoInfo>>(`/api/proxy?type=view&bvid=${bv}`);

  if (json.code === 0 && json.data?.aid) {
    return json.data; 
  } else {
    throw new Error(json.message || "Video not found");
  }
}

export async function getAllComments(
  oid: number, 
  onProgress?: (count: number, page: number) => void
): Promise<CommentUser[]> {
  let allComments: CommentUser[] = [];
  let page = 1;
  let isEnd = false;

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
    
    // Throttle
    await new Promise(r => setTimeout(r, 200));
  }

  return allComments;
}
