import { describe, expect, it } from "vitest";

import { buildSessionEntries, SESSION_GLYPHS, SESSION_TITLE_COLUMNS } from "../sessions";
import { displayWidth } from "../task-metadata";
import type { Session, SessionStatus } from "../types";

interface SessionFixtureOptions {
  readonly directory?: string;
  readonly parentID?: string;
}

function session(id: string, title: string, updated: number, opts?: SessionFixtureOptions): Session {
  return {
    id,
    slug: id,
    projectID: "project-1",
    directory: opts?.directory ?? "/repo",
    title,
    version: "1.17.9",
    time: { created: updated - 1000, updated },
    ...(opts?.parentID === undefined ? {} : { parentID: opts.parentID }),
  };
}

describe("buildSessionEntries", () => {
  it("T-SE-01 maps sessions to clickable rows with running status and current marker", () => {
    const statuses = new Map<string, SessionStatus>([
      ["s1", { type: "idle" }],
      ["s2", { type: "busy" }],
      ["s3", { type: "retry", attempt: 2, message: "Rate limited", next: 12_000 }],
    ]);

    const rows = buildSessionEntries(
      [session("s1", "Current work", 30_000), session("s2", "Build plugin", 40_000), session("s3", "Retrying", 20_000)],
      statuses,
      {
        currentSessionId: "s1",
        now: 50_000,
      },
    );

    expect(rows.map((row) => row.sessionID)).toEqual(["s1", "s2", "s3"]);
    expect(rows.map((row) => row.status)).toEqual(["idle", "busy", "retry"]);
    expect(rows[0]).toMatchObject({ current: true, glyph: SESSION_GLYPHS.current });
    expect(rows[1]).toMatchObject({ running: true, glyph: SESSION_GLYPHS.busy, title: "Build plugin" });
    expect(rows[2]).toMatchObject({ running: true, glyph: SESSION_GLYPHS.retry });
  });

  it("T-SE-02 handles empty sessions and missing statuses as idle rows", () => {
    expect(
      buildSessionEntries([], new Map<string, SessionStatus>(), { currentSessionId: "none", now: 10_000 }),
    ).toEqual([]);

    const [row] = buildSessionEntries([session("s1", "No status", 1_000)], new Map<string, SessionStatus>(), {
      currentSessionId: "other",
      now: 10_000,
    });

    expect(row).toMatchObject({ status: "idle", running: false, glyph: SESSION_GLYPHS.idle });
  });

  it("T-SE-03 truncates CJK session titles by terminal display columns", () => {
    const rows = buildSessionEntries(
      [session("s1", "한글세션제목".repeat(8), 1_000)],
      new Map<string, SessionStatus>(),
      {
        currentSessionId: "s1",
        now: 10_000,
      },
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) throw new Error("Expected one session row");
    expect(displayWidth(row.title)).toBeLessThanOrEqual(SESSION_TITLE_COLUMNS);
  });

  it("T-SE-04 leaves room for the updated-age column in sidebar rows", () => {
    expect(SESSION_TITLE_COLUMNS).toBeLessThanOrEqual(22);

    const rows = buildSessionEntries(
      [session("s1", "Verify original completion", 1_000)],
      new Map<string, SessionStatus>(),
      {
        currentSessionId: "other",
        now: 5_000_000,
      },
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) throw new Error("Expected one session row");
    expect(displayWidth(row.title)).toBeLessThanOrEqual(22);
  });

  it("T-SE-05 hides subagent sessions before applying the visible row limit", () => {
    const rows = buildSessionEntries(
      [
        session("child-1", "Audit code", 50_000, { parentID: "parent-1" }),
        session("parent-1", "Current work", 40_000),
        session("later-1", "Later top-level work", 30_000),
      ],
      new Map<string, SessionStatus>(),
      {
        currentSessionId: "parent-1",
        now: 60_000,
        maxSessions: 2,
      },
    );

    expect(rows.map((row) => row.sessionID)).toEqual(["parent-1", "later-1"]);
  });

  it("T-SE-06 exposes only operation state in the secondary session line", () => {
    const rows = buildSessionEntries(
      [session("s1", "Idle work", 1_000, { directory: "/home/bing72/opencode-plugin" })],
      new Map<string, SessionStatus>(),
      {
        currentSessionId: "other",
        now: 70_000,
      },
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) throw new Error("Expected one session row");
    expect(row.detail).toBe("Idle work\nidle\nUpdated 1m ago");
    expect(row.detail).not.toContain("/home/bing72/opencode-plugin");
  });

  it("T-SE-07 filters hidden sessions before applying the visible row limit", () => {
    const rows = buildSessionEntries(
      [session("hidden-1", "Hidden work", 50_000), session("visible-1", "Visible work", 40_000)],
      new Map<string, SessionStatus>(),
      {
        currentSessionId: "visible-1",
        now: 60_000,
        maxSessions: 1,
        hiddenSessionIds: new Set(["hidden-1"]),
      },
    );

    expect(rows.map((row) => row.sessionID)).toEqual(["visible-1"]);
  });

  it("T-SE-08 keeps the current session visible when hidden ids contain it", () => {
    const rows = buildSessionEntries(
      [session("current", "Current work", 50_000), session("other", "Other work", 40_000)],
      new Map<string, SessionStatus>(),
      {
        currentSessionId: "current",
        now: 60_000,
        hiddenSessionIds: new Set(["current", "other"]),
      },
    );

    expect(rows.map((row) => row.sessionID)).toEqual(["current"]);
  });

  it("T-SE-09 marks only non-current rows as hideable", () => {
    const rows = buildSessionEntries(
      [session("current", "Current work", 50_000), session("other", "Other work", 40_000)],
      new Map<string, SessionStatus>(),
      {
        currentSessionId: "current",
        now: 60_000,
      },
    );

    expect(rows.map((row) => [row.sessionID, row.hideable])).toEqual([
      ["current", false],
      ["other", true],
    ]);
  });

  it("T-SE-10 keeps the current root visible when the visible row cap would otherwise omit it", () => {
    const rows = buildSessionEntries(
      [session("other", "Other work", 50_000), session("current", "Current work", 40_000)],
      new Map<string, SessionStatus>(),
      {
        currentSessionId: "current",
        now: 60_000,
        maxSessions: 1,
      },
    );

    expect(rows.map((row) => row.sessionID)).toEqual(["current"]);
    expect(rows[0]).toMatchObject({ current: true, hideable: false });
  });
});
