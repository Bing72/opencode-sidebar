import { firstLine, isBackgroundCompletion, requestText } from "./request";
import { GLYPHS, isCancelledError, isRecord, taskRunner, taskWhoDesc, truncate } from "./task-metadata";
import type { Message, Part, PartsByMsgId, TimelineEntry } from "./types";

export { GLYPHS };

type UserMessage = Extract<Message, { role: "user" }>;
type ToolPart = Extract<Part, { type: "tool" }>;

const LABEL_MAX = 40;
const TASK_DESC_MAX = 34;

export function buildTimeline(
  messages: ReadonlyArray<Message>,
  partsByMsgId: PartsByMsgId,
  opts?: { readonly maxRows?: number },
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      entries.push(...userEntries(msg, partsByMsgId.get(msg.id) ?? []));
      continue;
    }
    for (const part of partsByMsgId.get(msg.id) ?? []) {
      const entry = partEntry(part);
      if (entry !== null) entries.push(entry);
    }
  }
  return dropZeroGapRows(fillGaps(capKeepingTurns(dedupePlans(stableSortByClock(entries)), opts?.maxRows)));
}

function dropZeroGapRows(rows: TimelineEntry[]): TimelineEntry[] {
  return rows.filter((row) => row.kind === "turn" || row.durationMs !== 0 || row.glyph !== GLYPHS.done);
}

function fillGaps(rows: TimelineEntry[]): TimelineEntry[] {
  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i];
    const next = rows[i + 1];
    if (row !== undefined && next !== undefined && row.durationMs === null && !row.running)
      row.durationMs = next.clockMs - row.clockMs;
  }
  return rows;
}

function stableSortByClock(entries: ReadonlyArray<TimelineEntry>): TimelineEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.clockMs - b.entry.clockMs || a.index - b.index)
    .map((item) => item.entry);
}

function dedupePlans(sorted: ReadonlyArray<TimelineEntry>): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  let seenTurn = false;
  let planSinceTurn = false;
  for (const entry of sorted) {
    if (entry.kind === "turn") {
      seenTurn = true;
      planSinceTurn = false;
      out.push(entry);
    } else if (entry.kind === "plan") {
      if (seenTurn && !planSinceTurn) {
        out.push(entry);
        planSinceTurn = true;
      }
    } else {
      out.push(entry);
    }
  }
  return out;
}

function capKeepingTurns(sorted: TimelineEntry[], maxRows: number | undefined): TimelineEntry[] {
  if (maxRows === undefined || maxRows <= 0 || sorted.length <= maxRows) return sorted;
  const tail = sorted.slice(sorted.length - maxRows);
  const firstTurn = sorted.find((entry) => entry.kind === "turn");
  if (firstTurn === undefined || tail.includes(firstTurn)) return tail;
  const recent = sorted.slice(sorted.length - (maxRows - 1));
  const keep = new Set<TimelineEntry>([firstTurn, ...recent]);
  return sorted.filter((entry) => keep.has(entry));
}

function userEntries(msg: UserMessage, parts: ReadonlyArray<Part>): TimelineEntry[] {
  const text = requestText(parts);
  if (text === null) return [];
  if (isBackgroundCompletion(text)) return completionEntries(text, msg.time.created);
  return [
    {
      kind: "turn",
      clockMs: msg.time.created,
      glyph: GLYPHS.turn,
      label: requestLabel(text),
      detail: text,
      durationMs: null,
      running: false,
    },
  ];
}

function completionEntries(text: string, clockMs: number): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const match of text.matchAll(/^[-*]\s+`bg_\w+`:\s*(.+?)\s*$/gm)) {
    const desc = match[1];
    if (desc !== undefined) out.push(doneEntry(clockMs, desc));
  }
  if (out.length === 0) out.push(doneEntry(clockMs, "background task"));
  return out;
}

function doneEntry(clockMs: number, desc: string): TimelineEntry {
  return {
    kind: "tool",
    clockMs,
    glyph: GLYPHS.done,
    label: `${truncate(desc, TASK_DESC_MAX)} 완료`,
    detail: `${desc} 완료`,
    durationMs: null,
    running: false,
  };
}

function requestLabel(text: string): string {
  if (text.trimStart().startsWith("<ultrawork-mode>")) return "ultrawork mode";
  return truncate(firstLine(text), LABEL_MAX);
}

function partEntry(part: Part): TimelineEntry | null {
  if (part.type !== "tool") return null;
  if (part.tool === "task") return taskEntry(part);
  if (part.tool === "todowrite") return planEntry(part);
  return null;
}

function taskEntry(part: ToolPart): TimelineEntry | null {
  const state = part.state;
  const { label, detail } = taskWhoDesc(state.input);
  switch (state.status) {
    case "pending":
      return null;
    case "running": {
      const runner = taskRunner(state.metadata);
      return withRunner(
        {
          kind: "tool",
          clockMs: state.time.start,
          glyph: GLYPHS.subagent,
          label,
          detail,
          durationMs: null,
          running: true,
        },
        runner,
      );
    }
    case "completed": {
      const runner = taskRunner(state.metadata);
      return withRunner(
        {
          kind: "tool",
          clockMs: state.time.start,
          glyph: GLYPHS.subagent,
          label,
          detail,
          durationMs: subagentDurationMs(state.input, state.time.start, state.time.end),
          running: false,
        },
        runner,
      );
    }
    case "error": {
      const runner = taskRunner(state.metadata);
      return withRunner(
        {
          kind: "tool",
          clockMs: state.time.start,
          glyph: isCancelledError(state) ? GLYPHS.cancelled : GLYPHS.subagent,
          label,
          detail,
          durationMs: state.time.end - state.time.start,
          running: false,
        },
        runner,
      );
    }
    default:
      return assertNever(state);
  }
}

function withRunner(entry: TimelineEntry, runner: string | undefined): TimelineEntry {
  if (runner === undefined) return entry;
  return { ...entry, runner };
}

function planEntry(part: ToolPart): TimelineEntry | null {
  const state = part.state;
  if (state.status === "pending") return null;
  const todos = state.input.todos;
  const count = Array.isArray(todos) ? todos.length : 0;
  const label = count > 0 ? `Todos (${count})` : "Todos";
  const contents = todoContents(todos);
  return {
    kind: "plan",
    clockMs: state.time.start,
    glyph: GLYPHS.plan,
    label,
    detail: contents.length > 0 ? `${label}:\n${contents.map((content) => `• ${content}`).join("\n")}` : label,
    durationMs: null,
    running: false,
  };
}

function subagentDurationMs(input: { readonly [key: string]: unknown }, start: number, end: number): number | null {
  if (input.run_in_background === true) return null;
  return end - start;
}

function todoContents(todos: unknown): string[] {
  if (!Array.isArray(todos)) return [];
  const out: string[] = [];
  for (const todo of todos) {
    if (!isRecord(todo)) continue;
    const content = todo.content;
    if (typeof content === "string" && content.length > 0) out.push(content);
  }
  return out;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled tool state: ${JSON.stringify(value)}`);
}
