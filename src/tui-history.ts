import { type Accessor, createSignal, type Setter } from "solid-js";

import { capEnvelopes, capSessions, type Envelope, mergeEnvelopes, sanitizeEnvelope } from "./history";
import { shouldLoadHistory } from "./tui-state";
import type { Part } from "./types";

const HISTORY_FETCH_LIMIT = 150;
const HISTORY_RETRY_COOLDOWN_MS = 3_000;
const HISTORY_RETRY_MAX_MS = 60_000;
const MAX_HISTORY_MESSAGES = 600;
const MAX_HISTORY_SESSIONS = 32;

export interface HistoryLoaderArgs {
  readonly dataRev: Accessor<number>;
  readonly fetchHistory: (sessionId: string, limit: number) => Promise<ReadonlyArray<Envelope>>;
  readonly isDisposed: () => boolean;
  readonly liveEnvelopes: (sessionId: string) => Envelope[];
  readonly setDataRev: Setter<number>;
  readonly setSessionError: Setter<string | undefined>;
}

export interface HistoryLoader {
  readonly absorbLiveTail: (sessionId: string) => void;
  readonly dispose: () => void;
  readonly dropHistory: (sessionId: string) => void;
  readonly ensureHistory: (sessionId: string, visibleRefreshGeneration?: number) => void;
  readonly failed: Set<string>;
  readonly flattenParts: (merged: ReadonlyArray<Envelope>) => Part[];
  readonly history: Accessor<ReadonlyMap<string, ReadonlyArray<Envelope>>>;
  readonly inFlight: Set<string>;
  readonly invalidateHistory: (sessionId: string) => void;
  readonly mergedFor: (sessionId: string) => Envelope[];
  readonly onRefreshSuccess: (force: boolean) => void;
  readonly partsByMsg: (merged: ReadonlyArray<Envelope>) => Map<string, ReadonlyArray<Part>>;
  readonly requestVisibleHistoryRefresh: () => void;
  readonly setHistory: Setter<ReadonlyMap<string, ReadonlyArray<Envelope>>>;
  readonly visibleHistoryRefreshGeneration: Accessor<number | undefined>;
}

export function createHistoryLoader(args: HistoryLoaderArgs): HistoryLoader {
  const [history, setHistory] = createSignal<ReadonlyMap<string, ReadonlyArray<Envelope>>>(new Map());
  const [visibleHistoryRefreshGeneration, setVisibleHistoryRefreshGeneration] = createSignal<number | undefined>();
  const inFlight = new Set<string>();
  const failed = new Set<string>();
  const invalidationVersions = new Map<string, number>();
  const reloadAfterFlight = new Set<string>();
  const requestedReloadGenerations = new Map<string, number>();
  const retryAttempts = new Map<string, number>();
  const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let pendingVisibleHistoryRefreshRequests = 0;
  let mergedKey = "";
  let mergedCache: Envelope[] = [];

  const boundedHistory = (merged: Envelope[]): Envelope[] =>
    capEnvelopes(merged.map(sanitizeEnvelope), MAX_HISTORY_MESSAGES);

  const absorbLiveTail = (sessionId: string): void => {
    setHistory((previous) => {
      const cached = previous.get(sessionId);
      if (cached === undefined) return previous;
      return new Map(previous).set(sessionId, boundedHistory(mergeEnvelopes(cached, args.liveEnvelopes(sessionId))));
    });
  };

  const clearRetryTimer = (sessionId: string): void => {
    const timer = retryTimers.get(sessionId);
    if (timer !== undefined) clearTimeout(timer);
    retryTimers.delete(sessionId);
  };

  const clearFailure = (sessionId: string): void => {
    failed.delete(sessionId);
    retryAttempts.delete(sessionId);
    clearRetryTimer(sessionId);
  };

  const markFailure = (sessionId: string, generation: number | undefined): void => {
    const attempt = (retryAttempts.get(sessionId) ?? 0) + 1;
    const retryDelay = Math.min(HISTORY_RETRY_COOLDOWN_MS * 2 ** (attempt - 1), HISTORY_RETRY_MAX_MS);
    failed.add(sessionId);
    retryAttempts.set(sessionId, attempt);
    requestedReloadGenerations.delete(sessionId);
    clearRetryTimer(sessionId);
    retryTimers.set(
      sessionId,
      setTimeout(() => {
        retryTimers.delete(sessionId);
        failed.delete(sessionId);
        if (!args.isDisposed()) ensureHistory(sessionId, generation);
      }, retryDelay),
    );
  };

  const ensureHistory = (sessionId: string, generation?: number): void => {
    if (
      !shouldLoadHistory({
        sessionId,
        history: history(),
        inFlight,
        failed,
        disposed: args.isDisposed(),
        requestedReloadGenerations,
        ...(generation === undefined ? {} : { visibleRefreshGeneration: generation }),
      })
    ) {
      return;
    }
    if (generation !== undefined) requestedReloadGenerations.set(sessionId, generation);
    const invalidationVersion = invalidationVersions.get(sessionId) ?? 0;
    inFlight.add(sessionId);
    args
      .fetchHistory(sessionId, HISTORY_FETCH_LIMIT)
      .then((full) => {
        if (args.isDisposed()) return;
        if ((invalidationVersions.get(sessionId) ?? 0) !== invalidationVersion) return;
        clearFailure(sessionId);
        setHistory((previous) =>
          capSessions(
            new Map(previous).set(sessionId, boundedHistory(mergeEnvelopes(full, args.liveEnvelopes(sessionId)))),
            MAX_HISTORY_SESSIONS,
          ),
        );
        args.setDataRev((value) => value + 1);
      })
      .catch((error: unknown) => {
        if (args.isDisposed() || (invalidationVersions.get(sessionId) ?? 0) !== invalidationVersion) return;
        markFailure(sessionId, generation);
        args.setSessionError(error instanceof Error ? error.message : "Failed to load session history");
      })
      .finally(() => {
        inFlight.delete(sessionId);
        if (!reloadAfterFlight.delete(sessionId)) return;
        ensureHistory(sessionId);
      });
  };

  const dropHistory = (sessionId: string): void => {
    invalidationVersions.set(sessionId, (invalidationVersions.get(sessionId) ?? 0) + 1);
    clearFailure(sessionId);
    requestedReloadGenerations.delete(sessionId);
    reloadAfterFlight.delete(sessionId);
    setHistory((previous) => {
      if (!previous.has(sessionId)) return previous;
      const next = new Map(previous);
      next.delete(sessionId);
      return next;
    });
    mergedKey = "";
    mergedCache = [];
    args.setDataRev((value) => value + 1);
  };

  const invalidateHistory = (sessionId: string): void => {
    const requestInFlight = inFlight.has(sessionId);
    const shouldReload = history().has(sessionId) || requestInFlight;
    dropHistory(sessionId);
    if (!shouldReload) return;
    if (requestInFlight) reloadAfterFlight.add(sessionId);
    else ensureHistory(sessionId);
  };

  const mergedFor = (sessionId: string): Envelope[] => {
    const key = `${sessionId}:${args.dataRev()}:${history().has(sessionId) ? "h" : "l"}`;
    if (key === mergedKey) return mergedCache;
    mergedCache = mergeEnvelopes(history().get(sessionId) ?? [], args.liveEnvelopes(sessionId));
    mergedKey = key;
    return mergedCache;
  };

  return {
    absorbLiveTail,
    dispose: () => {
      for (const timer of retryTimers.values()) clearTimeout(timer);
      retryAttempts.clear();
      retryTimers.clear();
      reloadAfterFlight.clear();
    },
    dropHistory,
    ensureHistory,
    failed,
    flattenParts: (merged) => merged.flatMap((entry) => [...entry.parts]),
    history,
    inFlight,
    invalidateHistory,
    mergedFor,
    onRefreshSuccess: (force) => {
      if (!force || pendingVisibleHistoryRefreshRequests === 0) return;
      pendingVisibleHistoryRefreshRequests -= 1;
      setVisibleHistoryRefreshGeneration((value) => (value ?? 0) + 1);
      args.setDataRev((value) => value + 1);
    },
    partsByMsg: (merged) => new Map(merged.map((entry) => [entry.info.id, entry.parts] as const)),
    requestVisibleHistoryRefresh: () => {
      pendingVisibleHistoryRefreshRequests += 1;
    },
    setHistory,
    visibleHistoryRefreshGeneration,
  };
}
