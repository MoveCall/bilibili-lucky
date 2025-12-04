import { BilibiliComment } from '../types';

/**
 * 获取评论逻辑 (Vercel Serverless 版)
 * 前端直接请求 /api/proxy，由后端函数负责与 B 站通信。
 */
export const fetchCommentsByBV = async (bvId: string, onLog: (msg: string) => void = console.log): Promise<BilibiliComment[]> => {
  onLog(`[System] 正在通过 Vercel 云函数连接 B 站 (BV: ${bvId})...`);
  
  // 第一步：获取 OID (AV号)
  const oid = await fetchOidByBv(bvId, onLog);
  if (!oid) {
    throw new Error(`无法解析 BV 号: ${bvId}。请确认视频是否存在。`);
  }
  onLog(`[Info] 解析成功: BV=${bvId} => OID=${oid}`);

  // 第二步：分页拉取评论
  return await fetchCommentsByOid(oid, bvId, onLog);
};

// 辅助：通过 BV 获取 OID (调用 /api/proxy?type=view)
async function fetchOidByBv(bvId: string, onLog: (msg: string) => void): Promise<string | null> {
  try {
    const res = await fetch(`/api/proxy?type=view&bvid=${bvId}`);
    if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
    
    const json = await res.json();
    if (json.code === 0 && json.data?.aid) {
      return json.data.aid.toString();
    }
    return null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

// 辅助：通过 OID 拉取评论 (调用 /api/proxy?type=reply)
async function fetchCommentsByOid(oid: string, bvId: string, onLog: (msg: string) => void): Promise<BilibiliComment[]> {
  let allComments: BilibiliComment[] = [];
  let page = 1;
  let totalPage = 1; 
  const MAX_PAGES = 50; 
  let emptyPageCount = 0; // 连续空页计数器

  while (page <= totalPage && page <= MAX_PAGES) {
    try {
      onLog(`[Fetch] 正在抓取第 ${page}/${page === 1 ? '?' : totalPage} 页...`);
      
      // 将 bvid 也传过去，用于后端伪造 Referer
      const res = await fetch(`/api/proxy?type=reply&oid=${oid}&bvid=${bvId}&pn=${page}`);
      if (!res.ok) throw new Error(`Proxy network error: ${res.status}`);

      const json = await res.json();

      if (json.code === 0 && json.data) {
        // 1. 更新分页信息
        if (page === 1 && json.data.page) {
            const count = json.data.page.count;
            const size = json.data.page.size;
            if (size > 0) {
                totalPage = Math.ceil(count / size);
                onLog(`[Info] 视频共有 ${count} 条评论，预计 ${totalPage} 页`);
            }
        }

        // 2. 收集评论
        const replies = json.data.replies;
        if (replies && Array.isArray(replies) && replies.length > 0) {
          allComments = [...allComments, ...replies];
          emptyPageCount = 0; // 重置空页计数
        } else {
          // B站 API 有时在中间页返回空，如果不严重则继续
          emptyPageCount++;
          if (page === 1) {
             onLog(`[Warn] 第 1 页未返回数据 (可能触发了游客限制)`);
          } else {
             onLog(`[Warn] 第 ${page} 页无更多数据`);
          }
          
          // 如果连续3页都空，且已经抓了一些数据，或者总页数还是1，就停止
          if (emptyPageCount >= 3) {
             onLog(`[Info] 连续多页为空，提前结束抓取`);
             break;
          }
        }
      } else {
        if (json.code === -352) {
             throw new Error("触发 B 站风控 (-352)。Vercel 代理也遇到了挑战，请稍后再试。");
        }
        onLog(`[Warn] API 返回异常: code=${json.code}`);
      }
    } catch (error: any) {
      onLog(`[Error] 第 ${page} 页抓取失败: ${error.message}`);
    }

    page++;
    // 简单的限流
    await new Promise(r => setTimeout(r, 500));
  }

  onLog(`[Complete] 抓取完成，共 ${allComments.length} 条评论`);
  return allComments;
}