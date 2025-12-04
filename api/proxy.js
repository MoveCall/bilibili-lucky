// api/proxy.js
// 运行在 Vercel 边缘网络的 Serverless Function
// 负责转发 B 站 API 请求，解决 CORS 和 UA 风控问题

export default async function handler(req, res) {
  const { type, oid, bvid, pn = 1 } = req.query;

  // 1. 伪造浏览器请求头
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
    'Origin': 'https://www.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  };

  let targetUrl = '';

  // 2. 根据请求类型构建 B 站 API URL
  if (type === 'view') {
    // 获取视频详情 (用于 BV -> OID)
    if (!bvid) return res.status(400).json({ code: -1, message: 'Missing bvid' });
    targetUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  } else if (type === 'reply') {
    // 获取评论列表
    // sort=0: 按时间排序
    // nohot=1: 不显示热评 (防止重复)
    // ps=20: 每页数量
    if (!oid) return res.status(400).json({ code: -1, message: 'Missing oid' });
    targetUrl = `https://api.bilibili.com/x/v2/reply?type=1&oid=${oid}&sort=0&nohot=1&ps=20&pn=${pn}`;
  } else {
    return res.status(400).json({ code: -1, message: 'Invalid type parameter' });
  }

  try {
    // 3. 发起请求
    const response = await fetch(targetUrl, { headers });
    
    if (!response.ok) {
      return res.status(response.status).json({ code: -1, message: `Bilibili API Error: ${response.status}` });
    }

    const data = await response.json();

    // 4. 返回数据给前端
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ code: -1, message: 'Internal Server Error', error: error.message });
  }
}