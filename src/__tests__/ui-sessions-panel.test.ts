import { describe, expect, it } from "vitest";
import type { AgentEntry, Session } from "../types";
import { prepareSessionChildActivityStatuses, sessionChildActivityStatuses } from "../ui-sessions-panel";

function session(id: string, title: string, updated: number, parentID?: string): Session {
  return {
    id,
    slug: id,
    projectID: "project-1",
    directory: "/repo",
    title,
    version: "1.17.9",
    time: { created: updated - 1000, updated },
    ...(parentID === undefined ? {} : { parentID }),
  };
}

function agent(status: AgentEntry["status"], running: boolean): AgentEntry {
  return {
    status,
    glyph: status === "rate-limited" ? "◷" : "●",
    label: "Explore",
    detail: "Inspect status flow",
    clockMs: 10_000,
    durationMs: running ? null : 1000,
    running,
  };
}

describe("sessions panel child activity", () => {
  it("T-USP-01 marks non-current root sessions busy from their running agent rows", () => {
    const rowsBySession = new Map<string, ReadonlyArray<AgentEntry>>([
      ["current", []],
      ["parent", [agent("running", true)]],
      ["child", [agent("running", true)]],
    ]);

    const statuses = sessionChildActivityStatuses(
      [
        session("current", "Current work", 60_000),
        session("parent", "Parent work", 50_000),
        session("child", "Child work", 55_000, "parent"),
      ],
      "current",
      (sessionId: string) => rowsBySession.get(sessionId) ?? [],
    );

    expect(statuses?.get("parent")).toBe("busy");
    expect(statuses?.has("child")).toBe(false);
  });

  it("T-USP-02 promotes rate-limited agent rows to retry before busy", () => {
    const statuses = sessionChildActivityStatuses(
      [session("current", "Current work", 60_000), session("parent", "Parent work", 50_000)],
      "current",
      (sessionId: string) => (sessionId === "parent" ? [agent("running", true), agent("rate-limited", true)] : []),
    );

    expect(statuses?.get("parent")).toBe("retry");
  });

  it("T-USP-03 preloads capped non-current session history before deriving child activity", () => {
    const loaded: string[] = [];
    const statuses = prepareSessionChildActivityStatuses(
      [
        session("current", "Current work", 70_000),
        session("bot-root", "Automated trading data refactor", 60_000),
        session("older-root", "Older work", 50_000),
        session("bot-child", "Subagent work", 65_000, "bot-root"),
      ],
      new Map(),
      {
        currentSessionId: "current",
        now: 80_000,
        maxSessions: 2,
      },
      (sessionId: string) => loaded.push(sessionId),
      (sessionId: string) => (sessionId === "bot-root" ? [agent("running", true)] : []),
    );

    expect(loaded).toEqual(["current", "bot-root"]);
    expect(statuses?.get("bot-root")).toBe("busy");
    expect(statuses?.has("bot-child")).toBe(false);
  });

  it("T-USP-04 passes reload generation only to visible session history loads", () => {
    type EnsureHistoryCall = { readonly sessionId: string; readonly generation: number | undefined };
    const calls: EnsureHistoryCall[] = [];
    const refreshGeneration = 3;
    const options = {
      currentSessionId: "current",
      now: 80_000,
      maxSessions: 2,
      reloadGeneration: refreshGeneration,
    };

    const statuses = prepareSessionChildActivityStatuses(
      [
        session("current", "Current work", 70_000),
        session("root", "Visible root work", 60_000),
        session("older", "Older root work", 50_000),
        session("child", "Child work", 65_000, "root"),
      ],
      new Map(),
      options,
      (sessionId: string, generation?: number) => calls.push({ sessionId, generation }),
      (sessionId: string) => (sessionId === "root" ? [agent("running", true)] : []),
    );

    expect(calls).toEqual([
      { sessionId: "current", generation: refreshGeneration },
      { sessionId: "root", generation: refreshGeneration },
    ]);
    expect(statuses?.get("root")).toBe("busy");
    expect(statuses?.has("child")).toBe(false);
  });
});
