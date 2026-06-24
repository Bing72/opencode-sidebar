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
  readonly hiddenSessionIds?: ReadonlySet<string>;
}

export function buildSessionEntries(
  sessions: ReadonlyArray<Session>,
  statuses: ReadonlyMap<string, SessionStatus>,
  options: BuildSessionOptions,
): SessionEntry[] {
  const limit = options.maxSessions === undefined || options.maxSessions <= 0 ? sessions.length : options.maxSessions;
  const rows: SessionEntry[] = [];
  for (const session of sessions) {
    if (session.parentID !== undefined) continue;
    const status = statuses.get(session.id)?.type ?? "idle";
    const current = session.id === options.currentSessionId;
    if (!current && options.hiddenSessionIds?.has(session.id)) continue;
    if (rows.length >= limit) {
      if (!current) continue;
      rows.pop();
    }
    const running = status === "busy" || status === "retry";
    const updatedMs = Math.max(0, options.now - session.time.updated);
    rows.push({
      sessionID: session.id,
      title: truncateDisplay(session.title.length > 0 ? session.title : "Untitled session", SESSION_TITLE_COLUMNS),
      status,
      glyph: current ? SESSION_GLYPHS.current : SESSION_GLYPHS[status],
      current,
      running,
      hideable: !current,
      updatedMs,
      detail: `${session.title}\n${status}\nUpdated ${formatLiveDuration(updatedMs)} ago`,
    });
  }
  return rows;
}
