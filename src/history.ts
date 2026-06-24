import type { Message, Part } from "./types";

export type Envelope = { readonly info: Message; readonly parts: ReadonlyArray<Part> };

type ToolPart = Extract<Part, { type: "tool" }>;
type ToolState = ToolPart["state"];

const TIMELINE_TOOLS: ReadonlySet<string> = new Set(["task", "todowrite"]);
const TASK_INPUT_KEYS = ["subagent_type", "category", "description", "run_in_background"] as const;
const TODOWRITE_INPUT_KEYS = ["todos"] as const;

export function mergeEnvelopes(cached: ReadonlyArray<Envelope>, live: ReadonlyArray<Envelope>): Envelope[] {
  const order = new Map<string, number>();
  const byId = new Map<string, Envelope>();
  let index = 0;
  for (const envelope of [...cached, ...live]) {
    const id = envelope.info.id;
    if (!order.has(id)) order.set(id, index++);
    byId.set(id, envelope);
  }
  return [...byId.values()].sort(
    (a, b) => a.info.time.created - b.info.time.created || (order.get(a.info.id) ?? 0) - (order.get(b.info.id) ?? 0),
  );
}

export function capSessions<Value>(map: Map<string, Value>, limit: number): Map<string, Value> {
  while (map.size > limit) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  return map;
}

export function capEnvelopes(list: Envelope[], limit: number): Envelope[] {
  if (list.length <= limit) return list;
  const first = list[0];
  const tail = list.slice(list.length - (limit - 1));
  if (first === undefined || tail.includes(first)) return tail;
  return [first, ...tail];
}

export function sanitizeEnvelope(env: Envelope): Envelope {
  if (env.info.role === "user") return { info: env.info, parts: env.parts.filter((part) => part.type === "text") };
  const parts: Part[] = [];
  for (const part of env.parts) {
    if (part.type === "tool" && TIMELINE_TOOLS.has(part.tool))
      parts.push({ ...part, state: leanState(part.tool, part.state) });
  }
  return { info: env.info, parts };
}

function leanInput(tool: string, input: { readonly [key: string]: unknown }): { readonly [key: string]: unknown } {
  const keys = tool === "task" ? TASK_INPUT_KEYS : TODOWRITE_INPUT_KEYS;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in input) out[key] = input[key];
  }
  return out;
}

function leanState(tool: string, state: ToolState): ToolState {
  const input = leanInput(tool, state.input);
  switch (state.status) {
    case "completed":
      return { ...state, input, output: "" };
    case "pending":
    case "running":
    case "error":
      return { ...state, input };
    default:
      return assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled tool state: ${JSON.stringify(value)}`);
}
