import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import type { Envelope } from "../history";
import { createHistoryLoader, type HistoryLoader } from "../tui-history";
import { textPart, userMsg } from "./factories";

interface FetchCall {
  readonly sessionId: string;
  readonly limit: number;
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
  readonly live?: ReadonlyArray<Envelope>;
  readonly reject?: Error;
}

function envelope(id: string, created: number, text: string): Envelope {
  return { info: userMsg(created, id), parts: [textPart(id, text, created)] };
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
});
