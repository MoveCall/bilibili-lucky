const STORAGE_KEY = 'bilibili-lucky:visitor-id';

function createVisitorId() {
  return `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateVisitorId() {
  try {
    if (typeof sessionStorage === 'undefined') {
      return createVisitorId();
    }

    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const next = createVisitorId();
    sessionStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return createVisitorId();
  }
}
