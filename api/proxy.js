// api/proxy.js
// Runtime: Node.js 18+ (Vercel Edge/Serverless)

export default async function handler(req, res) {
  // 1. Get parameters
  // type: 'view' (video info) or 'reply' (comments)
  // bvid: Bilibili Video ID
  // oid: Object ID (AV ID)
  // next: Page number for comments
  const { type = 'reply', oid, bvid, next = 1 } = req.query;

  // 2. Forge a random buvid3 (Simulate visitor fingerprint to avoid simple anti-scraping)
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });

  // 3. Forge Browser Headers
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
    'Origin': 'https://www.bilibili.com',
    'Cookie': `buvid3=${uuid}infoc;` 
  };

  try {
    let targetUrl = '';

    // === Scenario A: Frontend provides BV ID, we need to find the OID ===
    if (type === 'view') {
      if (!bvid) return res.status(400).json({ error: 'Missing bvid parameter' });
      targetUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    } 
    // === Scenario B: Frontend has OID, we fetch comments ===
    else {
      if (!oid) return res.status(400).json({ error: 'Missing oid parameter' });
      // mode=2 (Time descending) captures newest comments
      // mode=3 (Hot)
      targetUrl = `https://api.bilibili.com/x/v2/reply/main?csrf=PRO&mode=2&next=${next}&oid=${oid}&plat=1&type=1`;
    }

    // 4. Execute Fetch
    const response = await fetch(targetUrl, { headers });
    const data = await response.json();

    // 5. Error Handling
    if (data.code !== 0) {
      return res.status(200).json({ code: data.code, message: data.message || "Bilibili API Error", data: null });
    }

    // 6. Return Data
    res.status(200).json(data);

  } catch (error) {
    res.status(500).json({ error: 'Server Error', details: error.message });
  }
}