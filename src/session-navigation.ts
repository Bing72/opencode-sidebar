import { buildSessionEntries } from "./sessions";
import type { Session, SessionStatus } from "./types";

export interface SessionSwitchOption {
  readonly title: string;
  readonly value: string;
  readonly description: string;
}

export function buildSessionSwitchOptions(
  sessions: ReadonlyArray<Session>,
  statuses: ReadonlyMap<string, SessionStatus>,
  currentSessionId: string,
  pinnedSessionIds: ReadonlySet<string>,
  now: number,
): SessionSwitchOption[] {
  const sessionById = new Map(sessions.map((session) => [session.id, session] as const));
  return buildSessionEntries(sessions, statuses, {
    currentSessionId,
    now,
    maxSessions: 0,
    pinnedSessionIds,
  }).map((row) => {
    const session = sessionById.get(row.sessionID);
    const rawTitle = session?.title.length ? session.title : "Untitled session";
    return {
      title: `${row.pinned ? "◆ " : ""}${rawTitle}`,
      value: row.sessionID,
      description: `${row.status} · ${session?.directory ?? row.sessionID}`,
    };
  });
}
