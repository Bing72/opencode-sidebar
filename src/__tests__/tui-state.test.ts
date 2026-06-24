import { describe, expect, it } from "vitest";

import {
  CHILDREN_RETRY_MS,
  canFetchChildren,
  canRefreshSessions,
  markChildrenFetch,
  markSessionsRefresh,
  SESSION_REFRESH_EVENTS,
  SESSION_REFRESH_MS,
  sessionIdsForLiveTail,
} from "../tui-state";

describe("tui state helpers", () => {
  it("T-TUI-01 expands missing session IDs to every cached history", () => {
    expect(sessionIdsForLiveTail([undefined], ["s1", "s2"])).toEqual(["s1", "s2"]);
    expect(sessionIdsForLiveTail(["s3", undefined], ["s1", "s2"])).toEqual(["s1", "s2"]);
  });

  it("T-TUI-02 keeps explicit session IDs scoped and deduplicated", () => {
    expect(sessionIdsForLiveTail(["s2", "s1", "s2"], ["s1", "s2", "s3"])).toEqual(["s2", "s1"]);
  });

  it("T-TUI-03 throttles child-session retries per session", () => {
    const now = 10_000;
    const retryAt = markChildrenFetch(new Map(), "s1", now);

    expect(retryAt.get("s1")).toBe(now + CHILDREN_RETRY_MS);
    expect(canFetchChildren("s1", retryAt, now + CHILDREN_RETRY_MS - 1)).toBe(false);
    expect(canFetchChildren("s1", retryAt, now + CHILDREN_RETRY_MS)).toBe(true);
    expect(canFetchChildren("s2", retryAt, now + 1)).toBe(true);
  });

  it("T-TUI-04 throttles automatic session-list refreshes", () => {
    const now = 10_000;
    const nextRefresh = markSessionsRefresh(now);

    expect(nextRefresh).toBe(now + SESSION_REFRESH_MS);
    expect(canRefreshSessions(nextRefresh, now + SESSION_REFRESH_MS - 1)).toBe(false);
    expect(canRefreshSessions(nextRefresh, now + SESSION_REFRESH_MS)).toBe(true);
    expect(canRefreshSessions(0, now)).toBe(true);
  });

  it("T-TUI-05 subscribes to session list mutation events", () => {
    expect(SESSION_REFRESH_EVENTS).toEqual(["session.created", "session.updated", "session.deleted"]);
  });
});
