export const CHILDREN_RETRY_MS = 3_000;
export const SESSION_REFRESH_THROTTLE_MS = 3_000;
export const SESSION_REFRESH_EVENTS = ["session.created", "session.updated", "session.deleted"] as const;

export interface LiveTailUpdate {
  readonly sessionID: string | undefined;
  readonly refreshSessions: boolean;
}

export interface LiveTailFlushPlan {
  readonly sessionIds: readonly string[];
  readonly refreshSessions: boolean;
}

export function sessionIdsForLiveTail(
  eventSessionIds: ReadonlyArray<string | undefined>,
  cachedSessionIds: Iterable<string>,
): string[] {
  const cached = [...cachedSessionIds];
  if (eventSessionIds.some((sid) => sid === undefined)) return cached;
  const scoped: string[] = [];
  for (const sid of eventSessionIds) {
    if (sid !== undefined && !scoped.includes(sid)) scoped.push(sid);
  }
  return scoped;
}

export function liveTailFlushPlan(
  updates: ReadonlyArray<LiveTailUpdate>,
  cachedSessionIds: Iterable<string>,
): LiveTailFlushPlan {
  return {
    sessionIds: sessionIdsForLiveTail(
      updates.map((update) => update.sessionID),
      cachedSessionIds,
    ),
    refreshSessions: updates.some((update) => update.refreshSessions),
  };
}

export function canFetchChildren(sessionId: string, retryAt: ReadonlyMap<string, number>, now: number): boolean {
  return (retryAt.get(sessionId) ?? 0) <= now;
}

export function markChildrenFetch(retryAt: Map<string, number>, sessionId: string, now: number): Map<string, number> {
  retryAt.set(sessionId, now + CHILDREN_RETRY_MS);
  return retryAt;
}

export function canRefreshSessions(nextRefreshAt: number, now: number): boolean {
  return nextRefreshAt <= now;
}

export function markSessionsRefresh(now: number): number {
  return now + SESSION_REFRESH_THROTTLE_MS;
}
