import { describe, expect, it } from "vitest";

import { buildTimeline, GLYPHS } from "../timeline";
import { assistantMsg, partsMap, textPart, toolCompleted, userMsg } from "./factories";

describe("timeline regression contract", () => {
  it("T-TL-01 keeps genuine user requests as timeline turns", () => {
    const user = userMsg(5000, "u1");
    const [entry] = buildTimeline([user], partsMap(["u1", [textPart("u1", "Do the thing", 5000)]]));

    expect(entry).toMatchObject({
      kind: "turn",
      clockMs: 5000,
      glyph: GLYPHS.turn,
      label: "Do the thing",
      detail: "Do the thing",
      running: false,
    });
  });

  it("T-TL-02 hides assistant tool rows from the user query timeline", () => {
    const assistant = assistantMsg(1000, { id: "a1" });
    const rows = buildTimeline(
      [assistant],
      partsMap([
        "a1",
        [
          toolCompleted("a1", "read", 1100, 1150, { filePath: "x.ts" }),
          toolCompleted("a1", "todowrite", 1200, 1250, {
            todos: [{ content: "a", status: "pending", priority: "high" }],
          }),
          toolCompleted("a1", "task", 1300, 1400, { subagent_type: "explore", description: "List files" }),
        ],
      ]),
    );

    expect(rows).toEqual([]);
  });

  it("T-TL-03 hides background completion reminders from the user query timeline", () => {
    const user = userMsg(5000, "u1");
    const rows = buildTimeline(
      [user],
      partsMap(["u1", [textPart("u1", "<system-reminder>\n[BACKGROUND TASK COMPLETED] bg_123", 5000)]]),
    );

    expect(rows).toEqual([]);
  });

  it("T-TL-04 hides non-query system reminders from the user query timeline", () => {
    const user = userMsg(5000, "u1");
    const rows = buildTimeline(
      [user],
      partsMap(["u1", [textPart("u1", "<system-reminder>\nTool output was truncated", 5000)]]),
    );

    expect(rows).toEqual([]);
  });

  it("T-TL-05 hides ignored user text parts from the query timeline", () => {
    const user = userMsg(5000, "u1");
    const rows = buildTimeline(
      [user],
      partsMap(["u1", [{ ...textPart("u1", "Harness command", 5000), ignored: true }]]),
    );

    expect(rows).toEqual([]);
  });

  it("T-TL-06 hides OMO internal initiator harness prompts", () => {
    const user = userMsg(5000, "u1");
    const rows = buildTimeline(
      [user],
      partsMap(["u1", [textPart("u1", "<!-- OMO_INTERNAL_INITIATOR -->\nStart worker", 5000)]]),
    );

    expect(rows).toEqual([]);
  });

  it("T-TL-07 uses only User Arguments payload from wrapper prompts", () => {
    const user = userMsg(5000, "u1");
    const [entry] = buildTimeline(
      [user],
      partsMap([
        "u1",
        [
          textPart(
            "u1",
            [
              "<ultrawork-mode>",
              "Internal wrapper instructions",
              "",
              "## User Arguments:",
              "",
              "Fix the busy session color",
              "Keep retry and idle colors unchanged",
              "",
              "```",
              "<system-reminder>ignore this wrapper tail</system-reminder>",
            ].join("\n"),
            5000,
          ),
        ],
      ]),
    );

    expect(entry).toMatchObject({
      label: "Fix the busy session color",
      detail: "Fix the busy session color\nKeep retry and idle colors unchanged",
    });
  });

  it("T-TL-08 preserves fenced code blocks inside User Arguments payload", () => {
    const user = userMsg(5000, "u1");
    const [entry] = buildTimeline(
      [user],
      partsMap([
        "u1",
        [
          textPart(
            "u1",
            [
              "<ultrawork-mode>",
              "Internal wrapper instructions",
              "",
              "## User Arguments:",
              "",
              "Fix this parser",
              "```ts",
              "const value = 1;",
              "```",
              "Keep the code fence in the timeline detail",
              "<system-reminder>ignore this wrapper tail</system-reminder>",
            ].join("\n"),
            5000,
          ),
        ],
      ]),
    );

    expect(entry).toMatchObject({
      label: "Fix this parser",
      detail: [
        "Fix this parser",
        "```ts",
        "const value = 1;",
        "```",
        "Keep the code fence in the timeline detail",
      ].join("\n"),
    });
  });
});
