import { describe, expect, it } from "vitest";

import { buildSessionEntries, SESSION_GLYPHS, SESSION_TITLE_COLUMNS } from "../sessions";
import { displayWidth } from "../task-metadata";
import type { Session, SessionStatus } from "../types";

function session(id: string, title: string, updated: number, directory = "/repo"): Session {
  return {
    id,
    slug: id,
    projectID: "project-1",
    directory,
    title,
    version: "1.17.9",
    time: { created: updated - 1000, updated },
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
});
