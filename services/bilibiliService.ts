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
    if (!res.ok) throw new Error(`Proxy network error: ${res.status}`);
    
    const json = await res.json();
    if (json.code === 0 && json.data?.aid) {
      return json.data.aid.toString();
    } else {
      onLog(`[Error] 解析 OID 失败: ${json.message || json.code}`);
    }
    return null;
  } catch (e: any) {
    onLog(`[Error] OID 请求异常: ${e.message}`);
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
      
      const res = await fetch(`/api/proxy?type=reply&oid=${oid}&bvid=${bvId}&pn=${page}`);
      
      if (!res.ok) {
        onLog(`[Error] 代理服务响应错误: HTTP ${res.status}`);
        break;
      }

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
          emptyPageCount++;
          if (page === 1) {
             onLog(`[Warn] 第 1 页未返回数据 (API 返回空列表)`);
          } else {
             onLog(`[Warn] 第 ${page} 页无数据`);
          }
          
          // 如果连续3页都空，停止
          if (emptyPageCount >= 3) {
             onLog(`[Info] 连续空页，结束抓取`);
             break;
          }
        }
      } else {
        if (json.code === -352) {
             throw new Error("触发 B 站风控 (-352)。当前环境被 B 站限制，请稍后再试。");
        }
        onLog(`[Warn] API 返回业务错误: code=${json.code}, message=${json.message}`);
      }
    } catch (error: any) {
      onLog(`[Error] 第 ${page} 页抓取异常: ${error.message}`);
    }

    page++;
    await new Promise(r => setTimeout(r, 600)); // 稍作延时
  }

  if (allComments.length === 0) {
    onLog(`[Warn] 未抓取到任何评论。建议检查 BV 号是否正确或是否被 B 站风控。`);
  } else {
    onLog(`[Complete] 抓取完成，共 ${allComments.length} 条评论`);
  }
  
  return allComments;
}