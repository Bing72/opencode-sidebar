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

  it("T-TL-02 hides granular tools while keeping todowrite and task rows", () => {
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

    expect(rows.map((entry) => entry.glyph)).toEqual([GLYPHS.subagent]);
    expect(rows[0]?.label).toBe("explore: List files");
  });
});
