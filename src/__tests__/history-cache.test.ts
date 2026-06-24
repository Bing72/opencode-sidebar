import { describe, expect, it } from "vitest";

import { buildAgents } from "../agents";
import { type Envelope, sanitizeEnvelope } from "../history";
import { buildTimeline } from "../timeline";
import type { Part } from "../types";
import { assistantMsg, partsMap, textPart, toolCompleted, userMsg } from "./factories";

function toolParts(parts: ReadonlyArray<Part>, tool: string): ReadonlyArray<Extract<Part, { type: "tool" }>> {
  return parts.filter((part): part is Extract<Part, { type: "tool" }> => part.type === "tool" && part.tool === tool);
}

function mixedAssistant(): Envelope {
  return {
    info: assistantMsg(2_000, { id: "a1", completed: 9_000 }),
    parts: [
      toolCompleted(
        "a1",
        "task",
        3_000,
        8_000,
        {
          category: "quick",
          description: "find X",
          prompt: "P".repeat(2_000),
          run_in_background: false,
          subagent_type: "explore",
        },
        { agent: "Explore", model: { modelID: "m1" }, sessionId: "child1" },
      ),
      toolCompleted("a1", "todowrite", 3_100, 3_200, {
        ignored: "drop me",
        todos: [{ content: "do the thing", priority: "high", status: "pending" }],
      }),
      toolCompleted("a1", "bash", 3_300, 3_400, { command: "ls", description: "list dir" }),
      textPart("a1", "assistant prose nobody reads", 3_900),
    ],
  };
}

describe("sanitizeEnvelope cache projection", () => {
  it("T-HC-01 prunes task input to rendered fields and empties completed output", () => {
    const sanitized = sanitizeEnvelope(mixedAssistant());
    const task = toolParts(sanitized.parts, "task")[0];
    if (task === undefined || task.state.status !== "completed") throw new Error("expected completed task part");

    expect(task.state.output).toBe("");
    expect(task.state.input.prompt).toBeUndefined();
    expect(task.state.input.description).toBe("find X");
    expect(task.state.input.subagent_type).toBe("explore");
    expect(task.state.input.category).toBe("quick");
    expect(task.state.input.run_in_background).toBe(false);
    expect(task.state.metadata?.sessionId).toBe("child1");
  });

  it("T-HC-02 keeps only todowrite todos and drops non-rendered assistant payloads", () => {
    const sanitized = sanitizeEnvelope(mixedAssistant());
    const todo = toolParts(sanitized.parts, "todowrite")[0];
    if (todo === undefined || todo.state.status !== "completed") throw new Error("expected completed todowrite part");

    expect(todo.state.output).toBe("");
    expect(todo.state.input).toEqual({ todos: [{ content: "do the thing", priority: "high", status: "pending" }] });
    expect(toolParts(sanitized.parts, "bash")).toHaveLength(0);
    expect(sanitized.parts.some((part) => part.type === "text")).toBe(false);
  });

  it("T-HC-03 leaves user text and rendered timeline/agent output unchanged", () => {
    const raw = mixedAssistant();
    const user: Envelope = { info: userMsg(1_000, "u1"), parts: [textPart("u1", "real request", 1_000)] };
    const lean = sanitizeEnvelope(raw);
    const leanUser = sanitizeEnvelope(user);

    expect(leanUser).toEqual(user);
    expect(buildTimeline([leanUser.info, lean.info], partsMap(["u1", leanUser.parts], ["a1", lean.parts]))).toEqual(
      buildTimeline([user.info, raw.info], partsMap(["u1", user.parts], ["a1", raw.parts])),
    );
    expect(buildAgents([...lean.parts], { statusOf: () => undefined })).toEqual(
      buildAgents([...raw.parts], { statusOf: () => undefined }),
    );
  });
});
