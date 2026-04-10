import { createHash } from 'node:crypto';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com/',
  'Origin': 'https://www.bilibili.com',
  'Accept': 'application/json, text/plain, */*'
};

const WBI_MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32,
  15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19,
  29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63,
  57, 62, 11, 36, 20, 34, 44, 52
];

let cachedWbiKeys = {
  imgKey: '',
  subKey: '',
  expiresAt: 0
};

function getConfiguredCookie() {
  const cookie = process.env.BILIBILI_COOKIE?.trim() ?? '';
  return cookie;
}

function buildBuvid3() {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0;
    return (char === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
  });

  return `${uuid}infoc`;
}

function buildHeaders() {
  const configuredCookie = getConfiguredCookie();
  const cookieParts = [`buvid3=${buildBuvid3()};`];

  if (configuredCookie) {
    cookieParts.unshift(configuredCookie.replace(/;\s*$/, ''));
  }

  return {
    ...DEFAULT_HEADERS,
    Cookie: cookieParts.join('; ')
  };
}

function getMixinKey(origin) {
  return WBI_MIXIN_KEY_ENC_TAB.map((index) => origin[index]).join('').slice(0, 32);
}

function sanitizeWbiValue(value) {
  return String(value).replace(/[!'()*]/g, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, init, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, init);

    if (response.ok || response.status !== 412 || attempt === retries) {
      return response;
    }

    await sleep(1500 + attempt * 1500 + Math.floor(Math.random() * 500));
  }
}

function normalizeDynamicItem(item) {
  return {
    id: item?.id_str ?? '',
    type: item?.type ?? '',
    text: item?.modules?.module_dynamic?.desc?.text ?? '',
    createdAt: item?.modules?.module_author?.pub_ts ?? 0
  };
}

async function getWbiKeys() {
  if (cachedWbiKeys.imgKey && cachedWbiKeys.subKey && Date.now() < cachedWbiKeys.expiresAt) {
    return cachedWbiKeys;
  }

  const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    headers: buildHeaders()
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch WBI keys: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  const imgUrl = json?.data?.wbi_img?.img_url ?? '';
  const subUrl = json?.data?.wbi_img?.sub_url ?? '';
  const imgKey = imgUrl.split('/').pop()?.split('.')[0] ?? '';
  const subKey = subUrl.split('/').pop()?.split('.')[0] ?? '';

  if (!imgKey || !subKey) {
    throw new Error('Failed to resolve WBI keys from nav response');
  }

  cachedWbiKeys = {
    imgKey,
    subKey,
    expiresAt: Date.now() + 10 * 60 * 1000
  };

  return cachedWbiKeys;
}

async function signWbiParams(params) {
  const { imgKey, subKey } = await getWbiKeys();
  const mixinKey = getMixinKey(imgKey + subKey);
  const wts = Math.floor(Date.now() / 1000);

  const searchParams = new URLSearchParams();
  const normalizedEntries = Object.entries({
    ...params,
    wts
  }).sort(([a], [b]) => a.localeCompare(b));

  for (const [key, value] of normalizedEntries) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    searchParams.set(key, sanitizeWbiValue(value));
  }

  const query = searchParams.toString();
  const wRid = createHash('md5').update(query + mixinKey).digest('hex');
  searchParams.set('w_rid', wRid);
  return searchParams;
}

function buildTargetUrl(params) {
  const { type = 'reply', oid, bvid, root, pn = 1, ps = 20, host_mid } = params;

  if (type === 'status') {
    return '';
  }

  if (type === 'view') {
    if (!bvid) {
      throw new Error('Missing bvid parameter');
    }
    return `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
  }

  if (type === 'spaceDynamic') {
    if (!host_mid) {
      throw new Error('Missing host_mid parameter');
    }

    return 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space';
  }

  if (!oid) {
    throw new Error('Missing oid parameter');
  }

  if (type === 'subReply') {
    if (!root) {
      throw new Error('Missing root parameter');
    }
    const query = new URLSearchParams({
      oid: String(oid),
      pn: String(pn),
      ps: String(ps),
      root: String(root),
      type: '1'
    });
    return `https://api.bilibili.com/x/v2/reply/reply?${query.toString()}`;
  }

  return 'https://api.bilibili.com/x/v2/reply/wbi/main';
}

export async function fetchBiliApi(params) {
  const {
    type = 'reply',
    oid,
    next,
    pagination_str,
    seek_rpid,
    mode = '2',
    plat = '1',
    web_location = '1315875',
    host_mid,
    offset,
    sampleSize = '20'
  } = params;

  if (type === 'status') {
    return {
      code: 0,
      message: 'OK',
      data: {
        hasConfiguredCookie: Boolean(getConfiguredCookie())
      }
    };
  }

  const targetUrl = buildTargetUrl(params);
  let requestUrl = targetUrl;

  if (type === 'reply') {
    const signedParams = await signWbiParams({
      mode: String(mode),
      next: next ?? '0',
      oid: String(oid),
      pagination_str,
      plat: String(plat),
      seek_rpid,
      type: '1',
      web_location: String(web_location)
    });
    requestUrl = `${targetUrl}?${signedParams.toString()}`;
  } else if (type === 'spaceDynamic') {
    const signedParams = await signWbiParams({
      host_mid: String(host_mid),
      offset: offset ?? ''
    });
    requestUrl = `${targetUrl}?${signedParams.toString()}`;

    // Slow down repeated profile checks a bit to reduce burstiness.
    await sleep(500 + Math.floor(Math.random() * 500));
  }

  const requestInit = { headers: buildHeaders() };
  const response = type === 'spaceDynamic'
    ? await fetchWithRetry(requestUrl, requestInit)
    : await fetch(requestUrl, requestInit);

  if (!response.ok) {
    throw new Error(`Bilibili upstream error: ${response.status} ${response.statusText}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Bilibili upstream returned invalid JSON');
  }

  if (type === 'spaceDynamic') {
    const limit = Number(sampleSize);
    const normalizedItems = (data?.data?.items ?? []).map(normalizeDynamicItem);

    return {
      ...data,
      data: {
        items: Number.isFinite(limit) && limit > 0 ? normalizedItems.slice(0, limit) : normalizedItems,
        hasMore: Boolean(data?.data?.has_more),
        offset: data?.data?.offset ?? ''
      }
    };
  }

  return data;
}

export async function createProxyPayload(params) {
  try {
    const data = await fetchBiliApi(params);
    return {
      status: 200,
      body: data
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server Error';
    const status = message.startsWith('Missing ') ? 400 : 502;

    return {
      status,
      body: {
        code: -1,
        message,
        data: null
      }
    };
  }
}
