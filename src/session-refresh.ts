import { canRefreshSessions, markSessionsRefresh } from "./tui-state";
import type { Session, SessionStatus } from "./types";

export interface SessionRefreshClient {
  readonly list: () => Promise<ReadonlyArray<Session>>;
  readonly status: () => Promise<Readonly<Record<string, SessionStatus>>>;
}

type SessionStatusUpdate =
  | ReadonlyMap<string, SessionStatus>
  | ((previous: ReadonlyMap<string, SessionStatus>) => ReadonlyMap<string, SessionStatus>);

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
  readonly error?: unknown;
}

interface SessionReadOptions {
  readonly throwOnError: true;
}

interface GlobalSessionSource {
  readonly list: (
    query: GlobalSessionListQuery,
    options: SessionReadOptions,
  ) => Promise<SessionResponse<ReadonlyArray<Session>>>;
  readonly status: (
    parameters: undefined,
    options: SessionReadOptions,
  ) => Promise<SessionResponse<Readonly<Record<string, SessionStatus>>>>;
}

export interface SessionRefreshSink {
  readonly excludedSessionIds?: () => ReadonlySet<string>;
  readonly isDisposed: () => boolean;
  readonly now: () => number;
  readonly onRefreshSuccess?: (force: boolean) => void;
  readonly sessionMutationEpoch?: () => number;
  readonly setError: (message: string | undefined) => void;
  readonly setSessions: (sessions: ReadonlyArray<Session>) => void;
  readonly setStatuses: (statuses: SessionStatusUpdate) => void;
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
const EMPTY_SESSION_IDS: ReadonlySet<string> = new Set();
const SESSION_READ_OPTIONS: SessionReadOptions = { throwOnError: true };

export function createGlobalSessionRefreshClient(
  source: GlobalSessionSource,
  options: GlobalSessionRefreshOptions = {},
): SessionRefreshClient {
  const limit = options.fetchLimit ?? DEFAULT_SESSION_FETCH_LIMIT;
  return {
    list: () => source.list({ roots: true, limit }, SESSION_READ_OPTIONS).then(readSessionResponse),
    status: () => source.status(undefined, SESSION_READ_OPTIONS).then(readSessionResponse),
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
    const startedAtMutationEpoch = sink.sessionMutationEpoch?.() ?? 0;

    Promise.all([client.list(), client.status()])
      .then(([sessions, statuses]) => {
        if (sink.isDisposed() || (sink.sessionMutationEpoch?.() ?? 0) !== startedAtMutationEpoch) return;
        const excludedSessionIds = sink.excludedSessionIds?.() ?? EMPTY_SESSION_IDS;
        sink.setSessions(sessions.filter((session) => !excludedSessionIds.has(session.id)));
        const refreshedStatuses = new Map(
          Object.entries(statuses).filter(([sessionId]) => !excludedSessionIds.has(sessionId)),
        );
        sink.setStatuses((previous) => mergeSessionStatuses(previous, refreshedStatuses, excludedSessionIds));
        sink.setError(undefined);
        sink.onRefreshSuccess?.(force);
      })
      .catch((error: unknown) => {
        if (sink.isDisposed() || (sink.sessionMutationEpoch?.() ?? 0) !== startedAtMutationEpoch) return;
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

function mergeSessionStatuses(
  previous: ReadonlyMap<string, SessionStatus>,
  refreshed: ReadonlyMap<string, SessionStatus>,
  excludedSessionIds: ReadonlySet<string>,
): ReadonlyMap<string, SessionStatus> {
  const next = new Map<string, SessionStatus>();
  for (const [id, status] of previous) {
    if (!excludedSessionIds.has(id) && !refreshed.has(id) && status.type !== "idle") next.set(id, status);
  }
  for (const [id, status] of refreshed) next.set(id, status);
  return next;
}

function readSessionResponse<Data>(response: SessionResponse<Data>): Data {
  if (response.data !== undefined) return response.data;
  throw sessionResponseError(response.error);
}

function sessionResponseError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string" && error.length > 0) return new Error(error);
  if (isRecord(error)) {
    const nestedData = error.data;
    if (isRecord(nestedData) && typeof nestedData.message === "string" && nestedData.message.length > 0) {
      return new Error(nestedData.message);
    }
    if (typeof error.message === "string" && error.message.length > 0) return new Error(error.message);
    if (typeof error.name === "string" && error.name.length > 0) return new Error(error.name);
  }
  return new Error("Failed to load sessions");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
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
