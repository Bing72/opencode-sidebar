import { describe, expect, it } from "vitest";
import type { Envelope } from "../history";
import type { Part, SessionStatus } from "../types";
import { type AgentRowsDeps, agentRowsForSession } from "../ui-agent-rows";
import { toolCompleted } from "./factories";

function completedTask(childSessionId: string): Part {
  return toolCompleted(
    "a1",
    "task",
    1_000,
    2_000,
    {
      description: "Explore status flow",
      run_in_background: true,
      subagent_type: "explore",
    },
    { sessionId: childSessionId },
  );
}

function depsFor(parts: ReadonlyArray<Part>, childStatus: SessionStatus, apiStatus?: SessionStatus): AgentRowsDeps {
  return {
    api: {
      state: {
        session: {
          status: () => apiStatus,
        },
      },
    },
    childrenVersion: () => 0,
    ensureChildren: () => undefined,
    flattenParts: (_merged: ReadonlyArray<Envelope>) => [...parts],
    makeResolveChildId: () => () => undefined,
    mergedFor: () => [],
    sessionStatuses: () => new Map([["child-1", childStatus]]),
  };
}

describe("agentRowsForSession", () => {
  it("T-AGR-01 keeps a completed child task running from immediate session status", () => {
    const rows = agentRowsForSession(
      depsFor([completedTask("child-1")], { type: "busy" }, { type: "idle" }),
      "parent-1",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ childSessionId: "child-1", running: true, status: "running" });
  });

  it("T-AGR-02 keeps a completed child task rate-limited from immediate session status", () => {
    const rows = agentRowsForSession(
      depsFor([completedTask("child-1")], { type: "retry", attempt: 2, message: "Rate limited", next: 12_000 }),
      "parent-1",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ childSessionId: "child-1", running: true, status: "rate-limited" });
  });
});
