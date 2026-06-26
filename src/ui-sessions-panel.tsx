/** @jsxImportSource @opentui/solid */

import type { JSX } from "solid-js";

import { buildSessionEntries } from "./sessions";
import type { AgentEntry, SessionStatus } from "./types";
import { agentRowsForSession } from "./ui-agent-rows";
import type { PanelDeps } from "./ui-panels";
import { renderSessionRows } from "./ui-rows";
import { renderHiddenSessionsFooter } from "./ui-session-footer";

const DEFAULT_MAX_SESSIONS = 20;

export function renderSessionsPanel(deps: PanelDeps, sessionId: string): JSX.Element {
  deps.refreshSessions();
  const theme = deps.api.theme.current;
  const hiddenIds = deps.hiddenSessionIds();
  const childActivityStatuses = childActivityStatusesForCurrentSession(deps, sessionId);
  const rows = buildSessionEntries(deps.sessions(), deps.sessionStatuses(), {
    currentSessionId: sessionId,
    now: deps.now(),
    maxSessions: deps.options.maxSessions ?? DEFAULT_MAX_SESSIONS,
    hiddenSessionIds: hiddenIds,
    childActivityStatuses,
  });
  const error = deps.sessionError();
  return (
    <box flexDirection="column">
      {error === undefined ? null : (
        <box height={1}>
          <text fg={theme.warning}>{error}</text>
        </box>
      )}
      {rows.length === 0 ? (
        <box height={1}>
          <text fg={theme.textMuted}>{"No sessions"}</text>
        </box>
      ) : (
        renderSessionRows(rows, theme, {
          openSession: (id) => deps.api.route.navigate("session", { sessionID: id }),
          hideSession: deps.hideSession,
          confirmDeleteSession: deps.confirmDeleteSession,
        })
      )}
      {renderHiddenSessionsFooter(hiddenIds.size, theme, deps.showHiddenSessions)}
    </box>
  ) as unknown as JSX.Element;
}

function childActivityStatusesForCurrentSession(
  deps: PanelDeps,
  sessionId: string,
): ReadonlyMap<string, SessionStatus["type"]> | undefined {
  const status = childActivityStatus(agentRowsForSession(deps, sessionId));
  if (status === undefined) return undefined;
  return new Map([[sessionId, status]]);
}

function childActivityStatus(rows: ReadonlyArray<AgentEntry>): SessionStatus["type"] | undefined {
  if (rows.some((entry) => entry.status === "rate-limited")) return "retry";
  if (rows.some((entry) => entry.running)) return "busy";
  return undefined;
}
