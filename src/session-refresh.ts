import { canRefreshSessions, markSessionsRefresh } from "./tui-state";
import type { Session, SessionStatus } from "./types";

export interface SessionRefreshClient {
  readonly list: () => Promise<ReadonlyArray<Session> | undefined>;
  readonly status: () => Promise<Readonly<Record<string, SessionStatus>> | undefined>;
}

export const DEFAULT_SESSION_FETCH_LIMIT = 100;

export interface GlobalSessionListQuery {
  readonly roots: true;
  readonly limit: number;
}

export interface GlobalSessionRefreshOptions {
  readonly fetchLimit?: number;
}

interface SessionResponse<Data> {
  readonly data: Data | undefined;
}

interface GlobalSessionSource {
  readonly list: (query: GlobalSessionListQuery) => Promise<SessionResponse<ReadonlyArray<Session>>>;
  readonly status: () => Promise<SessionResponse<Readonly<Record<string, SessionStatus>>>>;
}

export interface SessionRefreshSink {
  readonly isDisposed: () => boolean;
  readonly now: () => number;
  readonly setError: (message: string | undefined) => void;
  readonly setSessions: (sessions: ReadonlyArray<Session>) => void;
  readonly setStatuses: (statuses: ReadonlyMap<string, SessionStatus>) => void;
}

interface RefreshState {
  readonly inFlight: boolean;
  readonly pendingForce: boolean;
  readonly nextRefreshAt: number;
}

type RefreshDecision =
  | { readonly kind: "start"; readonly state: RefreshState }
  | { readonly kind: "skip"; readonly state: RefreshState };

interface RefreshCompletion {
  readonly state: RefreshState;
  readonly drainForce: boolean;
}

const INITIAL_REFRESH_STATE: RefreshState = {
  inFlight: false,
  pendingForce: false,
  nextRefreshAt: 0,
};

export function createGlobalSessionRefreshClient(
  source: GlobalSessionSource,
  options: GlobalSessionRefreshOptions = {},
): SessionRefreshClient {
  const limit = options.fetchLimit ?? DEFAULT_SESSION_FETCH_LIMIT;
  return {
    list: () => source.list({ roots: true, limit }).then((res) => res.data),
    status: () => source.status().then((res) => res.data),
  };
}

export function createSessionRefresher(
  client: SessionRefreshClient,
  sink: SessionRefreshSink,
): (force?: boolean) => void {
  let refreshState = INITIAL_REFRESH_STATE;

  const refresh = (force = false): void => {
    if (sink.isDisposed()) return;
    const decision = requestRefresh(refreshState, sink.now(), force);
    refreshState = decision.state;
    if (decision.kind === "skip") return;

    Promise.all([client.list(), client.status()])
      .then(([sessions, statuses]) => {
        if (sink.isDisposed()) return;
        sink.setSessions(sessions ?? []);
        sink.setStatuses(new Map(Object.entries(statuses ?? {})));
        sink.setError(undefined);
      })
      .catch((error: unknown) => {
        if (sink.isDisposed()) return;
        sink.setError(error instanceof Error ? error.message : "Failed to load sessions");
      })
      .finally(() => {
        const completion = finishRefresh(refreshState);
        refreshState = completion.state;
        if (!sink.isDisposed() && completion.drainForce) refresh(true);
      });
  };

  return refresh;
}

function requestRefresh(state: RefreshState, now: number, force: boolean): RefreshDecision {
  if (state.inFlight) {
    return force ? { kind: "skip", state: { ...state, pendingForce: true } } : { kind: "skip", state };
  }
  if (!force && !canRefreshSessions(state.nextRefreshAt, now)) return { kind: "skip", state };
  return {
    kind: "start",
    state: { inFlight: true, pendingForce: false, nextRefreshAt: markSessionsRefresh(now) },
  };
}

function finishRefresh(state: RefreshState): RefreshCompletion {
  return {
    state: { ...state, inFlight: false, pendingForce: false },
    drainForce: state.pendingForce,
  };
}
