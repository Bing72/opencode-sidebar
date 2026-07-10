import { describe, expect, it } from "vitest";

import { buildSessionSwitchOptions } from "../session-navigation";
import type { Session, SessionStatus } from "../types";

function session(id: string, title: string, directory: string, parentID?: string): Session {
  return {
    id,
    slug: id,
    projectID: "project-1",
    directory,
    title,
    version: "1.17.18",
    time: { created: 1_000, updated: 2_000 },
    ...(parentID === undefined ? {} : { parentID }),
  };
}

describe("session switch options", () => {
  it("T-NAV-01 puts the current and pinned roots first while hiding unrelated child sessions", () => {
    const options = buildSessionSwitchOptions(
      [
        session("recent", "Recent", "/repo/recent"),
        session("pinned", "Pinned", "/repo/pinned"),
        session("current", "Current", "/repo/current"),
        session("child", "Child", "/repo/child", "recent"),
      ],
      new Map<string, SessionStatus>([["pinned", { type: "busy" }]]),
      "current",
      new Set(["pinned"]),
      3_000,
    );

    expect(options).toEqual([
      { title: "Current", value: "current", description: "idle · /repo/current" },
      { title: "◆ Pinned", value: "pinned", description: "busy · /repo/pinned" },
      { title: "Recent", value: "recent", description: "idle · /repo/recent" },
    ]);
  });

  it("T-NAV-02 keeps a currently viewed child available for quick switching", () => {
    const options = buildSessionSwitchOptions(
      [session("parent", "Parent", "/repo"), session("child", "", "/repo", "parent")],
      new Map(),
      "child",
      new Set(),
      3_000,
    );

    expect(options.map((option) => [option.value, option.title])).toEqual([
      ["child", "Untitled session"],
      ["parent", "Parent"],
    ]);
  });
});
