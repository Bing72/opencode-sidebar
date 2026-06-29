import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, sep } from "node:path";

import { formatSessionAge } from "./format";
import { truncateDisplay } from "./task-metadata";
import type { Session, SessionEntry, SessionStatus } from "./types";

export const SESSION_TITLE_COLUMNS = 22;
export const SESSION_BUSY_SPINNER_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"] as const;
export const SESSION_BUSY_SPINNER_TICK_MS = 100;

type SessionStatusType = SessionStatus["type"];
type ActiveSessionStatus = Exclude<SessionStatusType, "idle">;

const ACTIVE_STATUS_PRIORITY: Record<ActiveSessionStatus, number> = {
  busy: 1,
  retry: 2,
};

export const SESSION_GLYPHS: Record<SessionStatus["type"] | "current", string> = {
  current: "●",
  idle: "○",
  busy: SESSION_BUSY_SPINNER_FRAMES[0],
  retry: "◷",
};

export function sessionBusySpinnerFrame(frameIndex: number): string {
  const frameCount = SESSION_BUSY_SPINNER_FRAMES.length;
  const normalizedFrameIndex = ((frameIndex % frameCount) + frameCount) % frameCount;
  return SESSION_BUSY_SPINNER_FRAMES[normalizedFrameIndex] ?? SESSION_BUSY_SPINNER_FRAMES[0];
}

export function nextSessionBusySpinnerFrameIndex(frameIndex: number): number {
  return sessionBusySpinnerFrameIndex(frameIndex + 1);
}

function sessionBusySpinnerFrameIndex(frameIndex: number): number {
  const frameCount = SESSION_BUSY_SPINNER_FRAMES.length;
  return ((frameIndex % frameCount) + frameCount) % frameCount;
}

export interface BuildSessionOptions {
  readonly currentSessionId: string;
  readonly now: number;
  readonly maxSessions?: number;
  readonly childActivityStatuses?: ReadonlyMap<string, SessionStatusType> | undefined;
}

export function buildSessionEntries(
  sessions: ReadonlyArray<Session>,
  statuses: ReadonlyMap<string, SessionStatus>,
  options: BuildSessionOptions,
): SessionEntry[] {
  const limit = options.maxSessions === undefined || options.maxSessions <= 0 ? sessions.length : options.maxSessions;
  const childStatuses = activeChildStatusByParent(sessions, statuses);
  const rows: SessionEntry[] = [];
  for (const session of sessions) {
    const current = session.id === options.currentSessionId;
    if (session.parentID !== undefined && !current) continue;
    const status = effectiveSessionStatus(session.id, statuses, childStatuses, options.childActivityStatuses);
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
      ...statusReasonEntry(session.id, statuses, status),
      glyph: current ? SESSION_GLYPHS.current : SESSION_GLYPHS[status],
      current,
      running,
      deletable: !current,
      updatedMs,
      detail: `${session.title}\n${status}\nUpdated ${formatSessionAge(updatedMs)} ago`,
    });
  }
  const currentIndex = rows.findIndex((row) => row.current);
  if (currentIndex > 0) {
    const current = rows[currentIndex];
    if (current !== undefined) {
      rows.splice(currentIndex, 1);
      rows.unshift(current);
    }
  }
  return rows;
}

export function currentSessionProjectPath(
  sessions: ReadonlyArray<Session>,
  currentSessionId: string,
): string | undefined {
  const current = sessions.find((session) => session.id === currentSessionId);
  if (current === undefined) return undefined;
  return projectPathLabel(current.directory);
}

function projectPathLabel(directory: string): string {
  const homeRelative = relative(homedir(), directory);
  if (homeRelative === "") return "~";
  if (!isPathOutsideHome(homeRelative)) return `~/${homeRelative.split(sep).join("/")}`;
  return compactOutsideHomePath(directory);
}

function isPathOutsideHome(homeRelative: string): boolean {
  return homeRelative === ".." || homeRelative.startsWith(`..${sep}`) || isAbsolute(homeRelative);
}

function compactOutsideHomePath(directory: string): string {
  const project = basename(directory) || directory;
  const parent = basename(dirname(directory));
  if (parent.length === 0 || parent === project) return project;
  return `…/${parent}/${project}`;
}

function statusReasonEntry(
  sessionId: string,
  statuses: ReadonlyMap<string, SessionStatus>,
  status: SessionStatusType,
): Pick<SessionEntry, "statusReason"> | Record<string, never> {
  if (status !== "retry") return {};
  const retry = statuses.get(sessionId);
  if (retry?.type !== "retry") return {};
  return { statusReason: retry.message.toLowerCase() };
}

function activeChildStatusByParent(
  sessions: ReadonlyArray<Session>,
  statuses: ReadonlyMap<string, SessionStatus>,
): ReadonlyMap<string, ActiveSessionStatus> {
  const out = new Map<string, ActiveSessionStatus>();
  for (const session of sessions) {
    const parentId = session.parentID;
    if (parentId === undefined) continue;
    const activeStatus = activeSessionStatus(statuses.get(session.id)?.type);
    if (activeStatus === undefined) continue;
    out.set(parentId, strongerActiveStatus(out.get(parentId), activeStatus));
  }
  return out;
}

function effectiveSessionStatus(
  sessionId: string,
  statuses: ReadonlyMap<string, SessionStatus>,
  childStatuses: ReadonlyMap<string, ActiveSessionStatus>,
  childActivityStatuses: ReadonlyMap<string, SessionStatusType> | undefined,
): SessionStatusType {
  const ownStatus = statuses.get(sessionId)?.type ?? "idle";
  if (ownStatus !== "idle") return ownStatus;
  const explicitChildStatus = activeSessionStatus(childActivityStatuses?.get(sessionId));
  if (explicitChildStatus === undefined) return childStatuses.get(sessionId) ?? ownStatus;
  return strongerActiveStatus(childStatuses.get(sessionId), explicitChildStatus);
}

function activeSessionStatus(status: SessionStatusType | undefined): ActiveSessionStatus | undefined {
  if (status === "busy" || status === "retry") return status;
  return undefined;
}

function strongerActiveStatus(
  current: ActiveSessionStatus | undefined,
  next: ActiveSessionStatus,
): ActiveSessionStatus {
  if (current === undefined) return next;
  return ACTIVE_STATUS_PRIORITY[next] > ACTIVE_STATUS_PRIORITY[current] ? next : current;
}
