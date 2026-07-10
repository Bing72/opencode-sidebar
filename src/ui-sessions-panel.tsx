/** @jsxImportSource @opentui/solid */

import type { JSX } from "solid-js";

import { type BuildSessionOptions, buildSessionEntries, sessionBusySpinnerFrame } from "./sessions";
import type { AgentEntry, Session, SessionStatus } from "./types";
import { agentRowsForSession } from "./ui-agent-rows";
import type { PanelDeps } from "./ui-panels";
import { renderSessionRows } from "./ui-rows";

const DEFAULT_MAX_SESSIONS = 20;

export function renderSessionsPanel(deps: PanelDeps, sessionId: string): JSX.Element {
  deps.refreshSessions();
  const theme = deps.api.theme.current;
  const sessions = deps.sessions();
  const sessionStatuses = deps.sessionStatuses();
  const filterQuery = deps.sessionControls.filterQuery();
  const pinnedSessionIds = deps.sessionControls.pinnedSessionIds();
  const reloadGeneration = deps.visibleHistoryRefreshGeneration();
  const busySpinnerFrame = () => sessionBusySpinnerFrame(deps.sessionBusySpinnerFrameIndex());
  const sessionOptions = {
    currentSessionId: sessionId,
    now: deps.now(),
    maxSessions: deps.options.maxSessions ?? DEFAULT_MAX_SESSIONS,
    filterQuery,
    pinnedSessionIds,
  };
  const childActivityStatuses = prepareSessionChildActivityStatuses(
    sessions,
    sessionStatuses,
    {
      ...sessionOptions,
      ...(reloadGeneration === undefined ? {} : { reloadGeneration }),
    },
    deps.ensureHistory,
    (id) => agentRowsForSession(deps, id),
  );
  const rows = buildSessionEntries(sessions, sessionStatuses, {
    ...sessionOptions,
    childActivityStatuses,
  });
  const error = deps.sessionError();
  return (
    <box flexDirection="column">
      <box height={1} flexDirection="row" overflow="hidden" minWidth={0}>
        <text fg={theme.accent ?? theme.primary} onMouseUp={deps.sessionControls.openSwitcher} wrapMode="none">
          {"Switch"}
        </text>
        <text fg={theme.textMuted} wrapMode="none">
          {" | "}
        </text>
        <text
          fg={filterQuery.length === 0 ? theme.textMuted : theme.warning}
          onMouseUp={deps.sessionControls.openFilter}
          wrapMode="none"
        >
          {filterQuery.length === 0 ? "Filter" : "[Filter]"}
        </text>
        {filterQuery.length === 0 ? null : (
          <text fg={theme.textMuted} onMouseUp={deps.sessionControls.clearFilter} wrapMode="none">
            {" · Clear"}
          </text>
        )}
      </box>
      {filterQuery.length === 0 ? null : (
        <box height={1} overflow="hidden" minWidth={0}>
          <text fg={theme.textMuted} wrapMode="none">{`Filter: ${filterQuery}`}</text>
        </box>
      )}
      {error === undefined ? null : (
        <box height={1}>
          <text fg={theme.warning}>{error}</text>
        </box>
      )}
      {rows.length === 0 ? (
        <box height={1}>
          <text fg={theme.textMuted}>{filterQuery.length === 0 ? "No sessions" : "No matching sessions"}</text>
        </box>
      ) : (
        renderSessionRows({
          rows,
          theme,
          busySpinnerFrame,
          actions: {
            openSession: (id) => deps.api.route.navigate("session", { sessionID: id }),
            confirmDeleteSession: deps.confirmDeleteSession,
            togglePinnedSession: deps.sessionControls.togglePinnedSession,
          },
        })
      )}
    </box>
  ) as unknown as JSX.Element;
}

type SessionActivityOptions = Omit<BuildSessionOptions, "childActivityStatuses">;

type EnsureHistory = (sessionId: string, visibleRefreshGeneration?: number) => void;

type SessionActivityOptionsWithRefresh = SessionActivityOptions & {
  readonly reloadGeneration?: number;
};

export function prepareSessionChildActivityStatuses(
  sessions: ReadonlyArray<Session>,
  statuses: ReadonlyMap<string, SessionStatus>,
  options: SessionActivityOptionsWithRefresh,
  ensureHistory: EnsureHistory,
  rowsForSession: (sessionId: string) => ReadonlyArray<AgentEntry>,
): ReadonlyMap<string, SessionStatus["type"]> | undefined {
  const targetIds = sessionActivityTargetIds(sessions, statuses, options);
  for (const id of targetIds) ensureHistory(id, options.reloadGeneration);
  return sessionChildActivityStatuses(
    sessions.filter((session) => targetIds.has(session.id)),
    options.currentSessionId,
    rowsForSession,
  );
}

export function sessionChildActivityStatuses(
  sessions: ReadonlyArray<Session>,
  currentSessionId: string,
  rowsForSession: (sessionId: string) => ReadonlyArray<AgentEntry>,
): ReadonlyMap<string, SessionStatus["type"]> | undefined {
  const statuses = new Map<string, SessionStatus["type"]>();
  for (const session of sessions) {
    if (session.parentID !== undefined && session.id !== currentSessionId) continue;
    const status = childActivityStatus(rowsForSession(session.id));
    if (status !== undefined) statuses.set(session.id, status);
  }
  return statuses.size === 0 ? undefined : statuses;
}

function sessionActivityTargetIds(
  sessions: ReadonlyArray<Session>,
  statuses: ReadonlyMap<string, SessionStatus>,
  options: SessionActivityOptions,
): ReadonlySet<string> {
  return new Set(buildSessionEntries(sessions, statuses, options).map((row) => row.sessionID));
}

function childActivityStatus(rows: ReadonlyArray<AgentEntry>): SessionStatus["type"] | undefined {
  if (rows.some((entry) => entry.status === "rate-limited")) return "retry";
  if (rows.some((entry) => entry.running)) return "busy";
  return undefined;
}
