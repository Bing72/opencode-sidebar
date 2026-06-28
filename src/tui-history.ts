import { type Accessor, createSignal, type Setter } from "solid-js";

import { capEnvelopes, capSessions, type Envelope, mergeEnvelopes, sanitizeEnvelope } from "./history";
import { shouldLoadHistory } from "./tui-state";
import type { Part } from "./types";

const HISTORY_FETCH_LIMIT = 150;
const MAX_HISTORY_MESSAGES = 600;
const MAX_HISTORY_SESSIONS = 32;

export interface HistoryLoaderArgs {
  readonly dataRev: Accessor<number>;
  readonly fetchHistory: (sessionId: string, limit: number) => Promise<ReadonlyArray<Envelope> | undefined>;
  readonly isDisposed: () => boolean;
  readonly liveEnvelopes: (sessionId: string) => Envelope[];
  readonly setDataRev: Setter<number>;
  readonly setSessionError: Setter<string | undefined>;
}

export interface HistoryLoader {
  readonly absorbLiveTail: (sessionId: string) => void;
  readonly ensureHistory: (sessionId: string, visibleRefreshGeneration?: number) => void;
  readonly failed: Set<string>;
  readonly flattenParts: (merged: ReadonlyArray<Envelope>) => Part[];
  readonly history: Accessor<ReadonlyMap<string, ReadonlyArray<Envelope>>>;
  readonly inFlight: Set<string>;
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
  const requestedReloadGenerations = new Map<string, number>();
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
    inFlight.add(sessionId);
    args
      .fetchHistory(sessionId, HISTORY_FETCH_LIMIT)
      .then((full) => {
        if (args.isDisposed()) return;
        if (full === undefined) {
          failed.add(sessionId);
          return;
        }
        setHistory((previous) =>
          capSessions(
            new Map(previous).set(sessionId, boundedHistory(mergeEnvelopes(full, args.liveEnvelopes(sessionId)))),
            MAX_HISTORY_SESSIONS,
          ),
        );
        args.setDataRev((value) => value + 1);
      })
      .catch((error: unknown) => {
        failed.add(sessionId);
        args.setSessionError(error instanceof Error ? error.message : "Failed to load session history");
      })
      .finally(() => inFlight.delete(sessionId));
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
    ensureHistory,
    failed,
    flattenParts: (merged) => merged.flatMap((entry) => [...entry.parts]),
    history,
    inFlight,
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
