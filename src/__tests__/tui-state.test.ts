import { describe, expect, it } from "vitest";

import {
  CHILDREN_RETRY_MS,
  canFetchChildren,
  canRefreshSessions,
  HISTORY_INVALIDATION_EVENTS,
  liveTailFlushPlan,
  markChildrenFetch,
  markSessionsRefresh,
  SESSION_REFRESH_EVENTS,
  SESSION_REFRESH_THROTTLE_MS,
  sessionIdFromEvent,
  sessionIdsForLiveTail,
  shouldLoadHistory,
  withoutMapEntry,
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

  it("T-TUI-04 throttles non-forced session-list refreshes", () => {
    const now = 10_000;
    const nextRefresh = markSessionsRefresh(now);

    expect(nextRefresh).toBe(now + SESSION_REFRESH_THROTTLE_MS);
    expect(canRefreshSessions(nextRefresh, now + SESSION_REFRESH_THROTTLE_MS - 1)).toBe(false);
    expect(canRefreshSessions(nextRefresh, now + SESSION_REFRESH_THROTTLE_MS)).toBe(true);
    expect(canRefreshSessions(0, now)).toBe(true);
  });

  it("T-TUI-05 subscribes to session list mutation events", () => {
    expect(SESSION_REFRESH_EVENTS).toEqual(["session.created", "session.updated", "session.deleted"]);
  });

  it("T-TUI-06 invalidates cached history when messages disappear or a session is compacted", () => {
    expect(HISTORY_INVALIDATION_EVENTS).toEqual(["message.removed", "message.part.removed", "session.compacted"]);
  });

  it("T-TUI-07 reads session IDs from both current and legacy mutation events", () => {
    expect(sessionIdFromEvent({ properties: { sessionID: "current", info: { id: "legacy" } } })).toBe("current");
    expect(sessionIdFromEvent({ properties: { info: { id: "legacy" } } })).toBe("legacy");
    expect(sessionIdFromEvent(undefined)).toBeUndefined();
  });

  it("T-TUI-08 removes a map entry without mutating the input", () => {
    const original = new Map([
      ["s1", 1],
      ["s2", 2],
    ]);

    const changed = withoutMapEntry(original, "s1");

    expect(changed).toEqual(new Map([["s2", 2]]));
    expect(original).toEqual(
      new Map([
        ["s1", 1],
        ["s2", 2],
      ]),
    );
    expect(withoutMapEntry(original, "missing")).toBe(original);
  });

  it("T-TUI-09 keeps part-only live-tail batches from refreshing sessions", () => {
    expect(liveTailFlushPlan([{ sessionID: "s1", refreshSessions: false }], ["s1", "s2"])).toEqual({
      sessionIds: ["s1"],
      refreshSessions: false,
    });
  });

  it("T-TUI-10 refreshes sessions when any coalesced live-tail update requires it", () => {
    expect(
      liveTailFlushPlan(
        [
          { sessionID: "s1", refreshSessions: false },
          { sessionID: undefined, refreshSessions: true },
        ],
        ["s1", "s2"],
      ),
    ).toEqual({
      sessionIds: ["s1", "s2"],
      refreshSessions: true,
    });
  });

  it("T-TUI-11 loads missing cached history", () => {
    expect(
      shouldLoadHistory({
        sessionId: "s1",
        history: new Map<string, readonly []>(),
        inFlight: new Set<string>(),
        failed: new Set<string>(),
        disposed: false,
        requestedReloadGenerations: new Map<string, number>(),
      }),
    ).toBe(true);
  });

  it("T-TUI-12 keeps cached history idle without a reload generation", () => {
    const history: ReadonlyMap<string, readonly []> = new Map([["s1", []]]);

    expect(
      shouldLoadHistory({
        sessionId: "s1",
        history,
        inFlight: new Set<string>(),
        failed: new Set<string>(),
        disposed: false,
        requestedReloadGenerations: new Map<string, number>(),
      }),
    ).toBe(false);
  });

  it("T-TUI-13 reloads cached history for a new visible generation", () => {
    const history: ReadonlyMap<string, readonly []> = new Map([["s1", []]]);
    const requestedReloadGenerations = new Map([["s1", 1]]);

    expect(
      shouldLoadHistory({
        sessionId: "s1",
        history,
        inFlight: new Set<string>(),
        failed: new Set<string>(),
        disposed: false,
        visibleRefreshGeneration: 2,
        requestedReloadGenerations,
      }),
    ).toBe(true);
  });

  it("T-TUI-14 skips cached history already requested for the visible generation", () => {
    const history: ReadonlyMap<string, readonly []> = new Map([["s1", []]]);
    const requestedReloadGenerations = new Map([["s1", 2]]);

    expect(
      shouldLoadHistory({
        sessionId: "s1",
        history,
        inFlight: new Set<string>(),
        failed: new Set<string>(),
        disposed: false,
        visibleRefreshGeneration: 2,
        requestedReloadGenerations,
      }),
    ).toBe(false);
  });

  it("T-TUI-15 blocks history loads while guarded", () => {
    const history = new Map<string, readonly []>();

    expect(
      shouldLoadHistory({
        sessionId: "s1",
        history,
        inFlight: new Set(["s1"]),
        failed: new Set<string>(),
        disposed: false,
        requestedReloadGenerations: new Map<string, number>(),
      }),
    ).toBe(false);
    expect(
      shouldLoadHistory({
        sessionId: "s1",
        history,
        inFlight: new Set<string>(),
        failed: new Set(["s1"]),
        disposed: false,
        requestedReloadGenerations: new Map<string, number>(),
      }),
    ).toBe(false);
    expect(
      shouldLoadHistory({
        sessionId: "s1",
        history,
        inFlight: new Set<string>(),
        failed: new Set<string>(),
        disposed: true,
        requestedReloadGenerations: new Map<string, number>(),
      }),
    ).toBe(false);
  });
});
