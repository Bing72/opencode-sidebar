import { buildAgents, hasUnresolvedNav } from "./agents";
import type { Envelope } from "./history";
import type { AgentEntry, Part, SessionStatus } from "./types";

type ToolPart = Extract<Part, { type: "tool" }>;

const SESSION_STATUS_PRIORITY: Record<SessionStatus["type"], number> = {
  idle: 0,
  busy: 1,
  retry: 2,
};

export interface AgentRowsDeps {
  readonly api: {
    readonly state: {
      readonly session: {
        readonly status: (sessionId: string) => SessionStatus | undefined;
      };
    };
  };
  readonly childrenVersion: () => number;
  readonly ensureChildren: (sessionId: string) => void;
  readonly flattenParts: (merged: ReadonlyArray<Envelope>) => Part[];
  readonly makeResolveChildId: (sessionId: string) => (part: ToolPart) => string | undefined;
  readonly mergedFor: (sessionId: string) => Envelope[];
  readonly sessionStatuses: () => ReadonlyMap<string, SessionStatus>;
}

export function agentRowsForSession(deps: AgentRowsDeps, sessionId: string): AgentEntry[] {
  deps.childrenVersion();
  const rows = buildAgents(deps.flattenParts(deps.mergedFor(sessionId)), {
    statusOf: (id) => strongestSessionStatus(deps.api.state.session.status(id), deps.sessionStatuses().get(id)),
    resolveChildId: deps.makeResolveChildId(sessionId),
  });
  if (hasUnresolvedNav(rows)) deps.ensureChildren(sessionId);
  return rows;
}

function strongestSessionStatus(
  apiStatus: SessionStatus | undefined,
  eventStatus: SessionStatus | undefined,
): SessionStatus | undefined {
  if (apiStatus === undefined) return eventStatus;
  if (eventStatus === undefined) return apiStatus;
  return SESSION_STATUS_PRIORITY[eventStatus.type] > SESSION_STATUS_PRIORITY[apiStatus.type] ? eventStatus : apiStatus;
}
