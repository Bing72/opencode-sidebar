export const PINNED_SESSION_IDS_KEY = "opencode-sidebar:pinned-session-ids";

export function parsePinnedSessionIds(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0));
}

export function togglePinnedSessionId(ids: ReadonlySet<string>, sessionId: string): ReadonlySet<string> {
  const next = new Set(ids);
  if (next.has(sessionId)) next.delete(sessionId);
  else next.add(sessionId);
  return next;
}

export function removePinnedSessionId(ids: ReadonlySet<string>, sessionId: string): ReadonlySet<string> {
  if (!ids.has(sessionId)) return ids;
  const next = new Set(ids);
  next.delete(sessionId);
  return next;
}

export function serializePinnedSessionIds(ids: ReadonlySet<string>): string[] {
  return [...ids];
}
