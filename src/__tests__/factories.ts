import type { Message, Part } from "../types";

export function userMsg(created: number, id = `u-${created}`): Message {
  return {
    id,
    sessionID: "s1",
    role: "user",
    time: { created },
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude" },
  };
}

export function assistantMsg(created: number, opts?: { readonly completed?: number; readonly id?: string }): Message {
  const completed = opts?.completed;
  return {
    id: opts?.id ?? `a-${created}`,
    sessionID: "s1",
    role: "assistant",
    time: completed === undefined ? { created } : { created, completed },
    parentID: "u1",
    modelID: "claude",
    providerID: "anthropic",
    mode: "build",
    agent: "build",
    path: { cwd: "/", root: "/" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  };
}

export function textPart(messageID: string, text: string, start: number | undefined): Part {
  const base = {
    id: `text-${messageID}-${start ?? "na"}`,
    sessionID: "s1",
    messageID,
    type: "text" as const,
    text,
    synthetic: false,
    ignored: false,
  };
  if (start === undefined) return base;
  return { ...base, time: { start } };
}

function toolPart(
  messageID: string,
  tool: string,
  callIdHint: string,
): Pick<Extract<Part, { type: "tool" }>, "id" | "sessionID" | "messageID" | "type" | "callID" | "tool"> {
  return {
    id: `tool-${messageID}-${callIdHint}`,
    sessionID: "s1",
    messageID,
    type: "tool",
    callID: `c-${callIdHint}`,
    tool,
  };
}

export function toolCompleted(
  messageID: string,
  tool: string,
  start: number,
  end: number,
  input: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {},
): Part {
  return {
    ...toolPart(messageID, tool, String(start)),
    state: { status: "completed", input, output: "ok", title: "done", metadata, time: { start, end } },
  };
}

export function partsMap(...groups: ReadonlyArray<readonly [string, ReadonlyArray<Part>]>): Map<string, Part[]> {
  const map = new Map<string, Part[]>();
  for (const [id, parts] of groups) map.set(id, [...parts]);
  return map;
}
