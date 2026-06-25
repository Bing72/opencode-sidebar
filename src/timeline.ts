import { firstLine, isGenuineRequest, requestText } from "./request";
import { GLYPHS, truncate } from "./task-metadata";
import type { Message, PartsByMsgId, TimelineEntry } from "./types";

export { GLYPHS };

const LABEL_MAX = 40;

export function buildTimeline(
  messages: ReadonlyArray<Message>,
  partsByMsgId: PartsByMsgId,
  opts?: { readonly maxRows?: number },
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const msg of messages) {
    const parts = partsByMsgId.get(msg.id) ?? [];
    if (!isGenuineRequest(msg, parts)) continue;
    const text = requestText(parts);
    if (text === null) continue;
    entries.push(turnEntry(msg, text));
  }
  return fillGaps(capKeepingTurns(stableSortByClock(entries), opts?.maxRows));
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

function capKeepingTurns(sorted: TimelineEntry[], maxRows: number | undefined): TimelineEntry[] {
  if (maxRows === undefined || maxRows <= 0 || sorted.length <= maxRows) return sorted;
  const tail = sorted.slice(sorted.length - maxRows);
  const firstTurn = sorted.find((entry) => entry.kind === "turn");
  if (firstTurn === undefined || tail.includes(firstTurn)) return tail;
  const recent = sorted.slice(sorted.length - (maxRows - 1));
  const keep = new Set<TimelineEntry>([firstTurn, ...recent]);
  return sorted.filter((entry) => keep.has(entry));
}

function turnEntry(msg: Message, text: string): TimelineEntry {
  return {
    kind: "turn",
    clockMs: msg.time.created,
    glyph: GLYPHS.turn,
    label: requestLabel(text),
    detail: text,
    durationMs: null,
    running: false,
  };
}

function requestLabel(text: string): string {
  if (text.trimStart().startsWith("<ultrawork-mode>")) return "ultrawork mode";
  return truncate(firstLine(text), LABEL_MAX);
}
