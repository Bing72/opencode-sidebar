import { buildAgents, hasUnresolvedNav } from "./agents";
import type { AgentEntry } from "./types";
import type { PanelDeps } from "./ui-panels";

export function agentRowsForSession(deps: PanelDeps, sessionId: string): AgentEntry[] {
  deps.childrenVersion();
  const rows = buildAgents(deps.flattenParts(deps.mergedFor(sessionId)), {
    statusOf: (id) => deps.api.state.session.status(id),
    resolveChildId: deps.makeResolveChildId(sessionId),
  });
  if (hasUnresolvedNav(rows)) deps.ensureChildren(sessionId);
  return rows;
}
