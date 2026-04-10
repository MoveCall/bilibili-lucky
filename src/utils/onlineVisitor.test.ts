// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { getOrCreateVisitorId } from './onlineVisitor';

describe('getOrCreateVisitorId', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('reuses the same visitor id across page refreshes in one tab', () => {
    const first = getOrCreateVisitorId();
    const second = getOrCreateVisitorId();

    expect(first).toBe(second);
  });
});
