import { formatLiveDuration } from "./format";
import { truncateDisplay } from "./task-metadata";
import type { Session, SessionEntry, SessionStatus } from "./types";

export const SESSION_TITLE_COLUMNS = 22;

export const SESSION_GLYPHS: Record<SessionStatus["type"] | "current", string> = {
  current: "›",
  idle: "○",
  busy: "●",
  retry: "◷",
};

export interface BuildSessionOptions {
  readonly currentSessionId: string;
  readonly now: number;
  readonly maxSessions?: number;
}

export function buildSessionEntries(
  sessions: ReadonlyArray<Session>,
  statuses: ReadonlyMap<string, SessionStatus>,
  options: BuildSessionOptions,
): SessionEntry[] {
  const limit = options.maxSessions === undefined || options.maxSessions <= 0 ? sessions.length : options.maxSessions;
  const rows: SessionEntry[] = [];
  for (const session of sessions.slice(0, limit)) {
    const status = statuses.get(session.id)?.type ?? "idle";
    const current = session.id === options.currentSessionId;
    const running = status === "busy" || status === "retry";
    const updatedMs = Math.max(0, options.now - session.time.updated);
    rows.push({
      sessionID: session.id,
      title: truncateDisplay(session.title.length > 0 ? session.title : "Untitled session", SESSION_TITLE_COLUMNS),
      directory: session.path ?? session.directory,
      status,
      glyph: current ? SESSION_GLYPHS.current : SESSION_GLYPHS[status],
      current,
      running,
      updatedMs,
      detail: `${session.title}\n${session.path ?? session.directory}\nUpdated ${formatLiveDuration(updatedMs)} ago`,
    });
  }
  return rows;
}
