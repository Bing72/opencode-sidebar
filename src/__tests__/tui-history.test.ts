import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";

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
  readonly fetched?: ReadonlyArray<Envelope>;
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
      return options.reject === undefined ? Promise.resolve(options.fetched ?? []) : Promise.reject(options.reject);
    },
    isDisposed: () => false,
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
  });
});
