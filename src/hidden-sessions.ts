export const HIDDEN_SESSIONS_KEY = "opencode-session-timeline.hiddenSessions";

export interface HiddenSessionsKV {
  readonly get: (key: string, fallback?: unknown) => unknown;
  readonly set: (key: string, value: unknown) => void;
}

export function hiddenSessionIdsFromValue(value: unknown): Set<string> {
  if (!isUnknownArray(value)) return new Set();
  const ids = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) ids.add(item);
  }
  return ids;
}

export function readHiddenSessionIds(kv: Pick<HiddenSessionsKV, "get">): Set<string> {
  return hiddenSessionIdsFromValue(kv.get(HIDDEN_SESSIONS_KEY, []));
}

export function persistHiddenSessionIds(kv: Pick<HiddenSessionsKV, "set">, ids: ReadonlySet<string>): void {
  kv.set(HIDDEN_SESSIONS_KEY, [...ids]);
}

export function addHiddenSessionId(ids: ReadonlySet<string>, sessionId: string): Set<string> {
  return new Set([...ids, sessionId]);
}

export function removeHiddenSessionId(ids: ReadonlySet<string>, sessionId: string): Set<string> {
  const next = new Set(ids);
  next.delete(sessionId);
  return next;
}

export function clearHiddenSessionIds(): Set<string> {
  return new Set();
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
