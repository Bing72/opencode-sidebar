import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import type { Envelope } from "../history";
import { createHistoryLoader, type HistoryLoader } from "../tui-history";
import { textPart, userMsg } from "./factories";

interface FetchCall {
  readonly sessionId: string;
  readonly limit: number;
}

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (reason: unknown) => void;
}

interface HistoryHarness {
  readonly calls: readonly FetchCall[];
  readonly errors: () => string | undefined;
  readonly loader: HistoryLoader;
  readonly rev: () => number;
}

interface HistoryHarnessOptions {
  readonly fetchHistory?: (sessionId: string, limit: number) => Promise<ReadonlyArray<Envelope>>;
  readonly fetched?: ReadonlyArray<Envelope>;
  readonly isDisposed?: () => boolean;
  readonly isSessionExcluded?: (sessionId: string) => boolean;
  readonly live?: ReadonlyArray<Envelope>;
  readonly reject?: Error;
}

function envelope(id: string, created: number, text: string): Envelope {
  return { info: userMsg(created, id), parts: [textPart(id, text, created)] };
}

function deferred<Value>(): Deferred<Value> {
  let resolveValue: ((value: Value) => void) | undefined;
  let rejectValue: ((reason: unknown) => void) | undefined;
  const promise = new Promise<Value>((resolve, reject) => {
    resolveValue = resolve;
    rejectValue = reject;
  });
  if (resolveValue === undefined || rejectValue === undefined) throw new Error("Deferred was not initialized");
  return { promise, resolve: resolveValue, reject: rejectValue };
}

function historyHarness(options: HistoryHarnessOptions = {}): HistoryHarness {
  const [rev, setRev] = createSignal(0);
  const [error, setError] = createSignal<string | undefined>();
  const calls: FetchCall[] = [];
  const loader = createHistoryLoader({
    dataRev: rev,
    fetchHistory: (sessionId, limit) => {
      calls.push({ sessionId, limit });
      if (options.fetchHistory !== undefined) return options.fetchHistory(sessionId, limit);
      return options.reject === undefined ? Promise.resolve(options.fetched ?? []) : Promise.reject(options.reject);
    },
    isDisposed: options.isDisposed ?? (() => false),
    ...(options.isSessionExcluded === undefined ? {} : { isSessionExcluded: options.isSessionExcluded }),
    liveEnvelopes: () => [...(options.live ?? [])],
    setDataRev: setRev,
    setSessionError: setError,
  });
  return { calls, errors: error, loader, rev };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("tui history loader", () => {
  it("T-HIST-01 loads missing history with live envelopes and records the fetch limit", async () => {
    const harness = historyHarness({
      fetched: [envelope("u1", 1_000, "cached")],
      live: [envelope("u2", 2_000, "live")],
    });

    harness.loader.ensureHistory("s1");
    await flushPromises();

    expect(harness.calls).toEqual([{ sessionId: "s1", limit: 150 }]);
    expect(
      harness.loader
        .history()
        .get("s1")
        ?.map((item) => item.info.id),
    ).toEqual(["u1", "u2"]);
    expect(harness.loader.inFlight.has("s1")).toBe(false);
    expect(harness.rev()).toBe(1);
  });

  it("T-HIST-02 reloads cached history once per visible refresh generation", async () => {
    const harness = historyHarness({ fetched: [envelope("u2", 2_000, "reload")] });
    harness.loader.setHistory(new Map([["s1", [envelope("u1", 1_000, "cached")]]]));

    harness.loader.ensureHistory("s1");
    expect(harness.calls).toEqual([]);

    harness.loader.requestVisibleHistoryRefresh();
    harness.loader.onRefreshSuccess(true);
    harness.loader.ensureHistory("s1", harness.loader.visibleHistoryRefreshGeneration());
    await flushPromises();
    expect(harness.calls).toEqual([{ sessionId: "s1", limit: 150 }]);

    harness.loader.ensureHistory("s1", harness.loader.visibleHistoryRefreshGeneration());
    expect(harness.calls).toHaveLength(1);

    harness.loader.requestVisibleHistoryRefresh();
    harness.loader.onRefreshSuccess(true);
    harness.loader.ensureHistory("s1", harness.loader.visibleHistoryRefreshGeneration());
    await flushPromises();
    expect(harness.calls).toHaveLength(2);
  });

  it("T-HIST-03 advances visible generation only after a pending forced refresh succeeds", () => {
    const harness = historyHarness();

    harness.loader.onRefreshSuccess(true);
    expect(harness.loader.visibleHistoryRefreshGeneration()).toBeUndefined();

    harness.loader.requestVisibleHistoryRefresh();
    harness.loader.onRefreshSuccess(false);
    expect(harness.loader.visibleHistoryRefreshGeneration()).toBeUndefined();

    harness.loader.onRefreshSuccess(true);
    expect(harness.loader.visibleHistoryRefreshGeneration()).toBe(1);
    expect(harness.rev()).toBe(1);
  });

  it("T-HIST-04 advances once for each queued visible forced refresh success", () => {
    const harness = historyHarness();

    harness.loader.requestVisibleHistoryRefresh();
    harness.loader.requestVisibleHistoryRefresh();
    harness.loader.onRefreshSuccess(true);
    expect(harness.loader.visibleHistoryRefreshGeneration()).toBe(1);
    harness.loader.onRefreshSuccess(true);

    expect(harness.loader.visibleHistoryRefreshGeneration()).toBe(2);
    expect(harness.rev()).toBe(2);
  });

  it("T-HIST-05 marks failed history loads and reports the error", async () => {
    const harness = historyHarness({ reject: new Error("boom") });

    harness.loader.ensureHistory("s1");
    await flushPromises();

    expect(harness.loader.failed.has("s1")).toBe(true);
    expect(harness.errors()).toBe("boom");
    expect(harness.loader.inFlight.has("s1")).toBe(false);
    harness.loader.dispose();
  });

  it("T-HIST-06 schedules one retry after a three-second cooldown without request bursts", async () => {
    let attempt = 0;
    vi.useFakeTimers();
    const harness = historyHarness({
      fetchHistory: () => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error("temporary history failure"))
          : Promise.resolve([envelope("u1", 1_000, "recovered")]);
      },
    });

    try {
      harness.loader.setHistory(new Map([["s1", [envelope("cached", 500, "cached")]]]));
      harness.loader.requestVisibleHistoryRefresh();
      harness.loader.onRefreshSuccess(true);
      const generation = harness.loader.visibleHistoryRefreshGeneration();

      harness.loader.ensureHistory("s1", generation);
      await flushPromises();

      expect(harness.loader.failed.has("s1")).toBe(true);
      expect(harness.errors()).toBe("temporary history failure");

      harness.loader.ensureHistory("s1", generation);
      harness.loader.ensureHistory("s1", generation);
      await vi.advanceTimersByTimeAsync(2_999);
      expect(harness.calls).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(harness.calls).toHaveLength(2);

      await flushPromises();

      expect(harness.loader.failed.has("s1")).toBe(false);
      expect(harness.loader.inFlight.has("s1")).toBe(false);
      expect(
        harness.loader
          .history()
          .get("s1")
          ?.map((item) => item.info.id),
      ).toEqual(["u1"]);
    } finally {
      harness.loader.dispose();
      vi.useRealTimers();
    }
  });

  it("T-HIST-07 invalidates cached history and replaces it with a fresh server snapshot", async () => {
    const harness = historyHarness({ fetched: [envelope("fresh", 2_000, "fresh")] });
    harness.loader.setHistory(new Map([["s1", [envelope("removed", 1_000, "stale")]]]));
    expect(harness.loader.mergedFor("s1").map((item) => item.info.id)).toEqual(["removed"]);

    harness.loader.invalidateHistory("s1");
    expect(harness.loader.history().has("s1")).toBe(false);
    expect(harness.loader.mergedFor("s1")).toEqual([]);
    expect(harness.calls).toEqual([{ sessionId: "s1", limit: 150 }]);

    await flushPromises();

    expect(
      harness.loader
        .history()
        .get("s1")
        ?.map((item) => item.info.id),
    ).toEqual(["fresh"]);
  });

  it("T-HIST-08 discards an in-flight stale response and reloads once after invalidation", async () => {
    let resolveStale: ((value: ReadonlyArray<Envelope>) => void) | undefined;
    const harness = historyHarness({
      fetchHistory: () => {
        if (resolveStale === undefined) {
          return new Promise((resolve) => {
            resolveStale = resolve;
          });
        }
        return Promise.resolve([envelope("fresh", 2_000, "fresh")]);
      },
    });

    harness.loader.ensureHistory("s1");
    harness.loader.invalidateHistory("s1");
    harness.loader.invalidateHistory("s1");
    resolveStale?.([envelope("removed", 1_000, "stale")]);
    await flushPromises();
    await flushPromises();

    expect(harness.calls).toHaveLength(2);
    expect(
      harness.loader
        .history()
        .get("s1")
        ?.map((item) => item.info.id),
    ).toEqual(["fresh"]);
  });

  it("T-HIST-09 clears a live-only merged view without fetching an uncached session", () => {
    const live = [envelope("removed", 1_000, "stale")];
    const harness = historyHarness({ live });

    expect(harness.loader.mergedFor("s1").map((item) => item.info.id)).toEqual(["removed"]);
    live.length = 0;

    harness.loader.invalidateHistory("s1");
    expect(harness.loader.mergedFor("s1")).toEqual([]);
    expect(harness.calls).toEqual([]);
    expect(harness.rev()).toBe(1);
  });

  it("T-HIST-10 drops a deleted session without reviving it from an in-flight response", async () => {
    let resolveFetch: ((value: ReadonlyArray<Envelope>) => void) | undefined;
    const harness = historyHarness({
      fetchHistory: () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    });

    harness.loader.ensureHistory("s1");
    harness.loader.dropHistory("s1");
    resolveFetch?.([envelope("deleted", 1_000, "stale")]);
    await flushPromises();

    expect(harness.calls).toHaveLength(1);
    expect(harness.loader.inFlight.has("s1")).toBe(false);
    expect(harness.loader.history().has("s1")).toBe(false);
  });

  it("T-HIST-11 cancels scheduled retries on disposal", async () => {
    vi.useFakeTimers();
    const harness = historyHarness({ reject: new Error("offline") });

    try {
      harness.loader.ensureHistory("s1");
      await flushPromises();
      harness.loader.dispose();

      await vi.advanceTimersByTimeAsync(3_000);

      expect(harness.calls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T-HIST-12 ignores an in-flight rejection after disposal", async () => {
    let disposed = false;
    let rejectFetch: ((reason: unknown) => void) | undefined;
    const harness = historyHarness({
      fetchHistory: () =>
        new Promise((_resolve, reject) => {
          rejectFetch = reject;
        }),
      isDisposed: () => disposed,
    });

    harness.loader.ensureHistory("s1");
    disposed = true;
    harness.loader.dispose();
    rejectFetch?.(new Error("late failure"));
    await flushPromises();

    expect(harness.loader.failed.has("s1")).toBe(false);
    expect(harness.loader.inFlight.has("s1")).toBe(false);
    expect(harness.errors()).toBeUndefined();
  });

  it("T-HIST-13 backs off persistent failures instead of retrying every three seconds", async () => {
    vi.useFakeTimers();
    const harness = historyHarness({ reject: new Error("still offline") });

    try {
      harness.loader.ensureHistory("s1");
      await flushPromises();

      await vi.advanceTimersByTimeAsync(3_000);
      expect(harness.calls).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(5_999);
      expect(harness.calls).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(harness.calls).toHaveLength(3);

      await vi.advanceTimersByTimeAsync(11_999);
      expect(harness.calls).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(harness.calls).toHaveLength(4);
    } finally {
      harness.loader.dispose();
      vi.useRealTimers();
    }
  });

  it("T-HIST-14 limits history loading to four concurrent requests and drains queued demand", async () => {
    const pending = new Map<string, Deferred<ReadonlyArray<Envelope>>>();
    let active = 0;
    let maximumActive = 0;
    const harness = historyHarness({
      fetchHistory: (sessionId) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const request = deferred<ReadonlyArray<Envelope>>();
        pending.set(sessionId, request);
        return request.promise.finally(() => {
          active -= 1;
        });
      },
    });

    for (const sessionId of ["s1", "s2", "s3", "s4", "s5", "s6"]) harness.loader.ensureHistory(sessionId);

    expect(harness.calls.map((call) => call.sessionId)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(maximumActive).toBe(4);

    pending.get("s1")?.resolve([]);
    await flushPromises();
    await flushPromises();
    expect(harness.calls.map((call) => call.sessionId)).toEqual(["s1", "s2", "s3", "s4", "s5"]);

    pending.get("s2")?.resolve([]);
    await flushPromises();
    await flushPromises();
    expect(harness.calls.map((call) => call.sessionId)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
    expect(maximumActive).toBe(4);

    for (const sessionId of ["s3", "s4", "s5", "s6"]) pending.get(sessionId)?.resolve([]);
    await flushPromises();
    await flushPromises();
    expect(harness.loader.inFlight.size).toBe(0);
  });

  it("T-HIST-15 coalesces a newer visible generation while the same session is in flight", async () => {
    const first = deferred<ReadonlyArray<Envelope>>();
    let calls = 0;
    const harness = historyHarness({
      fetchHistory: () => {
        calls += 1;
        return calls === 1 ? first.promise : Promise.resolve([envelope("fresh", 2_000, "fresh")]);
      },
    });
    harness.loader.setHistory(new Map([["s1", [envelope("cached", 1_000, "cached")]]]));

    harness.loader.ensureHistory("s1", 1);
    harness.loader.ensureHistory("s1", 2);
    harness.loader.ensureHistory("s1", 2);
    first.resolve([envelope("older", 1_500, "older")]);
    await flushPromises();
    await flushPromises();

    expect(harness.calls).toHaveLength(2);
    expect(
      harness.loader
        .history()
        .get("s1")
        ?.map((item) => item.info.id),
    ).toEqual(["fresh"]);
  });

  it("T-HIST-16 removes a queued deleted session before it can start", async () => {
    const pending: Deferred<ReadonlyArray<Envelope>>[] = [];
    const harness = historyHarness({
      fetchHistory: () => {
        const request = deferred<ReadonlyArray<Envelope>>();
        pending.push(request);
        return request.promise;
      },
    });

    for (const sessionId of ["s1", "s2", "s3", "s4", "deleted"]) harness.loader.ensureHistory(sessionId);
    harness.loader.dropHistory("deleted");
    for (const request of pending) request.resolve([]);
    await flushPromises();

    expect(harness.calls.map((call) => call.sessionId)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(harness.loader.history().has("deleted")).toBe(false);
  });

  it("T-HIST-17 clears queued history demand on disposal", async () => {
    const pending: Deferred<ReadonlyArray<Envelope>>[] = [];
    const harness = historyHarness({
      fetchHistory: () => {
        const request = deferred<ReadonlyArray<Envelope>>();
        pending.push(request);
        return request.promise;
      },
    });

    for (const sessionId of ["s1", "s2", "s3", "s4", "queued"]) harness.loader.ensureHistory(sessionId);
    harness.loader.dispose();
    for (const request of pending) request.resolve([]);
    await flushPromises();

    expect(harness.calls.map((call) => call.sessionId)).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("T-HIST-18 blocks late invalidation and render demand for a deleted session", async () => {
    const excluded = new Set<string>();
    const first = deferred<ReadonlyArray<Envelope>>();
    const harness = historyHarness({
      fetchHistory: () => first.promise,
      isSessionExcluded: (sessionId) => excluded.has(sessionId),
    });

    harness.loader.ensureHistory("deleted");
    excluded.add("deleted");
    harness.loader.dropHistory("deleted");
    harness.loader.invalidateHistory("deleted");
    harness.loader.ensureHistory("deleted");
    first.resolve([envelope("stale", 1_000, "stale")]);
    await flushPromises();
    await flushPromises();

    expect(harness.calls).toHaveLength(1);
    expect(harness.loader.history().has("deleted")).toBe(false);
    expect(harness.loader.failed.has("deleted")).toBe(false);
  });

  it("T-HIST-19 reloads generation-less demand after the same session ID is recreated", async () => {
    const excluded = new Set<string>();
    const first = deferred<ReadonlyArray<Envelope>>();
    let calls = 0;
    const harness = historyHarness({
      fetchHistory: () => {
        calls += 1;
        return calls === 1 ? first.promise : Promise.resolve([envelope("fresh", 2_000, "fresh")]);
      },
      isSessionExcluded: (sessionId) => excluded.has(sessionId),
    });

    harness.loader.ensureHistory("same-id");
    excluded.add("same-id");
    harness.loader.dropHistory("same-id");
    excluded.delete("same-id");
    harness.loader.ensureHistory("same-id");
    first.resolve([envelope("old", 1_000, "old")]);
    await flushPromises();
    await flushPromises();

    expect(harness.calls).toHaveLength(2);
    expect(
      harness.loader
        .history()
        .get("same-id")
        ?.map((item) => item.info.id),
    ).toEqual(["fresh"]);
  });

  it("T-HIST-20 preserves exponential backoff when invalidation arrives during failure cooldown", async () => {
    vi.useFakeTimers();
    const harness = historyHarness({ reject: new Error("offline") });
    harness.loader.setHistory(new Map([["s1", [envelope("cached", 500, "cached")]]]));

    try {
      harness.loader.ensureHistory("s1", 1);
      await flushPromises();
      harness.loader.invalidateHistory("s1");

      await vi.advanceTimersByTimeAsync(2_999);
      expect(harness.calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(harness.calls).toHaveLength(2);

      await flushPromises();
      harness.loader.invalidateHistory("s1");
      await vi.advanceTimersByTimeAsync(5_999);
      expect(harness.calls).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(harness.calls).toHaveLength(3);
    } finally {
      harness.loader.dispose();
      vi.useRealTimers();
    }
  });

  it("T-HIST-21 releases a failed request slot to the next queued session", async () => {
    vi.useFakeTimers();
    const pending = new Map<string, Deferred<ReadonlyArray<Envelope>>>();
    const harness = historyHarness({
      fetchHistory: (sessionId) => {
        const request = deferred<ReadonlyArray<Envelope>>();
        pending.set(sessionId, request);
        return request.promise;
      },
    });

    try {
      for (const sessionId of ["s1", "s2", "s3", "s4", "s5"]) harness.loader.ensureHistory(sessionId);
      pending.get("s1")?.reject(new Error("failed"));
      await flushPromises();
      await flushPromises();

      expect(harness.calls.map((call) => call.sessionId)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    } finally {
      harness.loader.dispose();
      for (const request of pending.values()) request.resolve([]);
      vi.useRealTimers();
    }
  });

  it("T-HIST-22 preserves the newest pending generation across in-flight invalidation", async () => {
    const first = deferred<ReadonlyArray<Envelope>>();
    let calls = 0;
    const harness = historyHarness({
      fetchHistory: () => {
        calls += 1;
        return calls === 1 ? first.promise : Promise.resolve([envelope("fresh", 2_000, "fresh")]);
      },
    });
    harness.loader.setHistory(new Map([["s1", [envelope("cached", 500, "cached")]]]));

    harness.loader.ensureHistory("s1", 1);
    harness.loader.ensureHistory("s1", 2);
    harness.loader.invalidateHistory("s1");
    first.resolve([envelope("stale", 1_000, "stale")]);
    await flushPromises();
    await flushPromises();

    harness.loader.ensureHistory("s1", 2);

    expect(harness.calls).toHaveLength(2);
    expect(
      harness.loader
        .history()
        .get("s1")
        ?.map((item) => item.info.id),
    ).toEqual(["fresh"]);
  });
});
