import { isCancelledError, strField, taskRunner, taskWhoDesc } from "./task-metadata";
import type { AgentEntry, AgentStatus, Part, SessionStatus } from "./types";

type ToolPart = Extract<Part, { type: "tool" }>;
type ToolState = ToolPart["state"];
type TimedTask =
  | {
      readonly part: ToolPart;
      readonly status: "running";
      readonly state: Extract<ToolState, { status: "running" }>;
      readonly start: number;
      readonly index: number;
    }
  | {
      readonly part: ToolPart;
      readonly status: "completed";
      readonly state: Extract<ToolState, { status: "completed" }>;
      readonly start: number;
      readonly end: number;
      readonly index: number;
    }
  | {
      readonly part: ToolPart;
      readonly status: "error";
      readonly state: Extract<ToolState, { status: "error" }>;
      readonly start: number;
      readonly end: number;
      readonly index: number;
    };

export const AGENT_GLYPHS: Record<AgentStatus, string> = {
  running: "●",
  "rate-limited": "◷",
  interrupted: "⊘",
  error: "✕",
  completed: "✓",
};
export const MAX_AGENT_ROWS = 20;
export const BURST_GAP_MS = 120_000;

export interface AgentDeps {
  readonly statusOf: (sessionId: string) => SessionStatus | undefined;
  readonly resolveChildId?: (part: ToolPart) => string | undefined;
}

export function taskChildId(metadata: { readonly [key: string]: unknown } | undefined): string | undefined {
  if (metadata === undefined) return undefined;
  return strField(metadata.sessionId) ?? strField(metadata.sessionID);
}

export function hasUnresolvedNav(rows: ReadonlyArray<AgentEntry>): boolean {
  return rows.some((row) => row.childSessionId === undefined);
}

export function buildAgents(parts: ReadonlyArray<Part>, deps: AgentDeps): AgentEntry[] {
  const items = timedTasks(parts)
    .sort((a, b) => a.start - b.start || a.index - b.index)
    .map((task) => ({ task, entry: agentEntry(task, deps) }));
  let batch: typeof items = [];
  for (const item of items)
    batch = batch.some((member) => bridges(member, item.task.start)) ? [...batch, item] : [item];
  const entries = capAgents(batch.map((item) => item.entry));
  if (entries.length === 0 || entries.every((entry) => entry.status === "completed")) return [];
  return entries;
}

export function resolveChildIdFrom(
  children: ReadonlyArray<{ readonly id: string; readonly title: string; readonly time: { readonly created: number } }>,
  description: string,
  start: number,
): string | undefined {
  if (description.length === 0) return undefined;
  const prefix = `${description} `;
  const matches = children.filter(
    (child) =>
      (child.title === description || child.title.startsWith(prefix)) && Math.abs(child.time.created - start) < 600_000,
  );
  if (matches.length <= 1) return matches[0]?.id;
  const sorted = [...matches].sort((a, b) => Math.abs(a.time.created - start) - Math.abs(b.time.created - start));
  const first = sorted[0];
  const second = sorted[1];
  if (first === undefined || second === undefined) return first?.id;
  return Math.abs(first.time.created - start) < Math.abs(second.time.created - start) ? first.id : undefined;
}

function timedTasks(parts: ReadonlyArray<Part>): TimedTask[] {
  const out: TimedTask[] = [];
  let index = 0;
  for (const part of parts) {
    const task = timedTask(part, index);
    if (task !== null) out.push(task);
    index++;
  }
  return out;
}

function timedTask(part: Part, index: number): TimedTask | null {
  if (part.type !== "tool" || part.tool !== "task") return null;
  const state = part.state;
  switch (state.status) {
    case "pending":
      return null;
    case "running":
      return { part, status: "running", state, start: state.time.start, index };
    case "completed":
      return { part, status: "completed", state, start: state.time.start, end: state.time.end, index };
    case "error":
      return { part, status: "error", state, start: state.time.start, end: state.time.end, index };
    default:
      return assertNever(state);
  }
}

function bridges(member: { readonly task: TimedTask; readonly entry: AgentEntry }, start: number): boolean {
  if (member.entry.running) return true;
  if (member.task.start === start) return true;
  if (member.task.state.input.run_in_background === true) return start - member.task.start < BURST_GAP_MS;
  return "end" in member.task && member.task.end > start;
}

function capAgents(entries: AgentEntry[]): AgentEntry[] {
  if (entries.length <= MAX_AGENT_ROWS) return entries;
  const keep = new Set<AgentEntry>(entries.filter((entry) => entry.running));
  addNewest(entries, keep, (entry) => !entry.running && entry.status !== "completed");
  addNewest(entries, keep, () => true);
  return entries.filter((entry) => keep.has(entry));
}

function addNewest(entries: AgentEntry[], keep: Set<AgentEntry>, pick: (entry: AgentEntry) => boolean): void {
  for (let i = entries.length - 1; i >= 0 && keep.size < MAX_AGENT_ROWS; i--) {
    const entry = entries[i];
    if (entry !== undefined && pick(entry)) keep.add(entry);
  }
}

function agentEntry(task: TimedTask, deps: AgentDeps): AgentEntry {
  const id = taskChildId(task.state.metadata) ?? deps.resolveChildId?.(task.part);
  const childStatus = id === undefined ? undefined : deps.statusOf(id);
  const { label, detail } = taskWhoDesc(task.state.input);
  const runner = taskRunner(task.state.metadata);
  switch (task.status) {
    case "running":
      return withOptional(
        {
          status: childStatus?.type === "retry" ? "rate-limited" : "running",
          label,
          detail,
          clockMs: task.start,
          durationMs: null,
          running: true,
        },
        id,
        runner,
      );
    case "completed": {
      const status =
        childStatus?.type === "retry" ? "rate-limited" : childStatus?.type === "busy" ? "running" : "completed";
      return withOptional(
        {
          status,
          label,
          detail,
          clockMs: task.start,
          durationMs: status === "completed" ? task.end - task.start : null,
          running: status !== "completed",
        },
        id,
        runner,
      );
    }
    case "error":
      return withOptional(
        {
          status: isCancelledError(task.state) ? "interrupted" : "error",
          label,
          detail,
          clockMs: task.start,
          durationMs: task.end - task.start,
          running: false,
        },
        id,
        runner,
      );
    default:
      return assertNever(task);
  }
}

function withOptional(
  entry: Omit<AgentEntry, "glyph" | "childSessionId" | "runner">,
  childSessionId: string | undefined,
  runner: string | undefined,
): AgentEntry {
  const base: AgentEntry = { ...entry, glyph: AGENT_GLYPHS[entry.status] };
  return {
    ...base,
    ...(childSessionId === undefined ? {} : { childSessionId }),
    ...(runner === undefined ? {} : { runner }),
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled task state: ${JSON.stringify(value)}`);
}
