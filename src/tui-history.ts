import { type Accessor, createSignal, type Setter } from "solid-js";

import { capEnvelopes, capSessions, type Envelope, mergeEnvelopes, sanitizeEnvelope } from "./history";
import { shouldLoadHistory } from "./tui-state";
import type { Part } from "./types";

const HISTORY_FETCH_LIMIT = 150;
const HISTORY_RETRY_COOLDOWN_MS = 3_000;
const HISTORY_RETRY_MAX_MS = 60_000;
const MAX_HISTORY_MESSAGES = 600;
const MAX_HISTORY_SESSIONS = 32;
export const MAX_CONCURRENT_HISTORY_FETCHES = 4;

export interface HistoryLoaderArgs {
  readonly dataRev: Accessor<number>;
  readonly fetchHistory: (sessionId: string, limit: number) => Promise<ReadonlyArray<Envelope>>;
  readonly isDisposed: () => boolean;
  readonly isSessionExcluded?: (sessionId: string) => boolean;
  readonly liveEnvelopes: (sessionId: string) => Envelope[];
  readonly maxConcurrentFetches?: number;
  readonly setDataRev: Setter<number>;
  readonly setSessionError: Setter<string | undefined>;
}

interface PendingHistoryRequest {
  readonly sessionId: string;
  readonly generation: number | undefined;
}

function newestGeneration(first: number | undefined, second: number | undefined): number | undefined {
  if (first === undefined) return second;
  if (second === undefined) return first;
  return Math.max(first, second);
}

function rememberPendingRequest(
  requests: Map<string, PendingHistoryRequest>,
  sessionId: string,
  generation: number | undefined,
): void {
  requests.set(sessionId, {
    sessionId,
    generation: newestGeneration(requests.get(sessionId)?.generation, generation),
  });
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
  const inFlightVersions = new Map<string, number>();
  const reloadAfterFlight = new Map<string, PendingHistoryRequest>();
  const queuedRequests = new Map<string, PendingHistoryRequest>();
  const requestQueue: string[] = [];
  const requestedReloadGenerations = new Map<string, number>();
  const retryAttempts = new Map<string, number>();
  const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const maxConcurrentFetches = Math.max(1, Math.floor(args.maxConcurrentFetches ?? MAX_CONCURRENT_HISTORY_FETCHES));
  let activeFetches = 0;
  let loaderDisposed = false;
  let pendingVisibleHistoryRefreshRequests = 0;
  let mergedKey = "";
  let mergedCache: Envelope[] = [];

  const boundedHistory = (merged: Envelope[]): Envelope[] =>
    capEnvelopes(merged.map(sanitizeEnvelope), MAX_HISTORY_MESSAGES);

  const isDisposed = (): boolean => loaderDisposed || args.isDisposed();
  const isSessionExcluded = (sessionId: string): boolean => args.isSessionExcluded?.(sessionId) ?? false;

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
        if (!isDisposed()) ensureHistory(sessionId, generation);
      }, retryDelay),
    );
  };

  const ensureHistory = (sessionId: string, generation?: number): void => {
    if (isDisposed() || isSessionExcluded(sessionId) || failed.has(sessionId)) return;
    if (inFlight.has(sessionId)) {
      const currentVersion = invalidationVersions.get(sessionId) ?? 0;
      const requestIsStale = inFlightVersions.get(sessionId) !== currentVersion;
      if (requestIsStale || (generation !== undefined && requestedReloadGenerations.get(sessionId) !== generation)) {
        rememberPendingRequest(reloadAfterFlight, sessionId, generation);
      }
      return;
    }
    if (queuedRequests.has(sessionId)) {
      rememberPendingRequest(queuedRequests, sessionId, generation);
      return;
    }
    if (
      !shouldLoadHistory({
        sessionId,
        history: history(),
        inFlight,
        failed,
        disposed: isDisposed(),
        requestedReloadGenerations,
        ...(generation === undefined ? {} : { visibleRefreshGeneration: generation }),
      })
    ) {
      return;
    }
    queuedRequests.set(sessionId, { sessionId, generation });
    requestQueue.push(sessionId);
    drainHistoryQueue();
  };

  const startHistoryFetch = (request: PendingHistoryRequest): void => {
    const { sessionId, generation } = request;
    if (generation !== undefined) requestedReloadGenerations.set(sessionId, generation);
    const invalidationVersion = invalidationVersions.get(sessionId) ?? 0;
    inFlight.add(sessionId);
    inFlightVersions.set(sessionId, invalidationVersion);
    activeFetches += 1;
    let fetch: Promise<ReadonlyArray<Envelope>>;
    try {
      fetch = args.fetchHistory(sessionId, HISTORY_FETCH_LIMIT);
    } catch (error) {
      fetch = Promise.reject(error);
    }
    fetch
      .then((full) => {
        if (isDisposed()) return;
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
        if (isDisposed() || (invalidationVersions.get(sessionId) ?? 0) !== invalidationVersion) return;
        const pendingGeneration = reloadAfterFlight.get(sessionId)?.generation;
        reloadAfterFlight.delete(sessionId);
        markFailure(sessionId, newestGeneration(generation, pendingGeneration));
        args.setSessionError(error instanceof Error ? error.message : "Failed to load session history");
      })
      .finally(() => {
        inFlight.delete(sessionId);
        inFlightVersions.delete(sessionId);
        activeFetches -= 1;
        const pending = reloadAfterFlight.get(sessionId);
        reloadAfterFlight.delete(sessionId);
        if (pending !== undefined) ensureHistory(sessionId, pending.generation);
        drainHistoryQueue();
      });
  };

  const drainHistoryQueue = (): void => {
    while (!isDisposed() && activeFetches < maxConcurrentFetches) {
      const sessionId = requestQueue.shift();
      if (sessionId === undefined) return;
      const request = queuedRequests.get(sessionId);
      if (request === undefined) continue;
      queuedRequests.delete(sessionId);
      if (isSessionExcluded(sessionId)) continue;
      if (
        !shouldLoadHistory({
          sessionId,
          history: history(),
          inFlight,
          failed,
          disposed: isDisposed(),
          requestedReloadGenerations,
          ...(request.generation === undefined ? {} : { visibleRefreshGeneration: request.generation }),
        })
      ) {
        continue;
      }
      startHistoryFetch(request);
    }
  };

  const resetHistory = (sessionId: string, clearFailureState: boolean): void => {
    invalidationVersions.set(sessionId, (invalidationVersions.get(sessionId) ?? 0) + 1);
    if (clearFailureState) clearFailure(sessionId);
    queuedRequests.delete(sessionId);
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

  const dropHistory = (sessionId: string): void => resetHistory(sessionId, true);

  const invalidateHistory = (sessionId: string): void => {
    if (isSessionExcluded(sessionId)) return;
    const requestInFlight = inFlight.has(sessionId);
    const queued = queuedRequests.get(sessionId);
    const generation = newestGeneration(
      queued?.generation,
      newestGeneration(requestedReloadGenerations.get(sessionId), reloadAfterFlight.get(sessionId)?.generation),
    );
    const shouldReload = history().has(sessionId) || requestInFlight || queued !== undefined;
    resetHistory(sessionId, false);
    if (!shouldReload || failed.has(sessionId)) return;
    if (requestInFlight) rememberPendingRequest(reloadAfterFlight, sessionId, generation);
    else ensureHistory(sessionId, generation);
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
      loaderDisposed = true;
      for (const timer of retryTimers.values()) clearTimeout(timer);
      queuedRequests.clear();
      requestQueue.length = 0;
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
