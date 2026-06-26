import type { Message, Part } from "./types";

const USER_ARGUMENTS_MARKER = /^(?:#{1,6}\s+)?User Arguments:\s*$/i;

export function firstLine(s: string): string {
  for (const line of s.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "";
}

export function requestText(parts: ReadonlyArray<Part>): string | null {
  for (const part of parts) {
    if (part.type !== "text") continue;
    if (part.synthetic === true) continue;
    if (part.ignored === true) continue;
    const text = userArgumentsPayload(part.text) ?? part.text;
    if (firstLine(text).length > 0) return text;
  }
  return null;
}

function userArgumentsPayload(text: string): string | undefined {
  const lines = text.split("\n");
  const markerIndex = lines.findIndex(isUserArgumentsMarker);
  if (markerIndex === -1) return undefined;
  const payloadStart = markerIndex + 1;
  const payloadEnd = firstWrapperSentinelIndex(lines, payloadStart);
  return trimWrapperFence(trimBlankEdges(lines.slice(payloadStart, payloadEnd))).join("\n");
}

function isUserArgumentsMarker(line: string): boolean {
  return USER_ARGUMENTS_MARKER.test(line.trim());
}

function firstWrapperSentinelIndex(lines: ReadonlyArray<string>, start: number): number {
  let inFence = false;
  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined) continue;
    const trimmed = line.trimStart();
    if (!inFence && isWrapperFenceSentinel(lines, index, trimmed)) return index;
    if (isFenceLine(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && isWrapperSentinel(trimmed)) return index;
  }
  return lines.length;
}

function isWrapperSentinel(trimmed: string): boolean {
  return trimmed.startsWith("<system-reminder>") || isInternalInitiator(trimmed);
}

function isFenceLine(trimmed: string): boolean {
  return trimmed.startsWith("```");
}

function isBareFenceLine(trimmed: string): boolean {
  return trimmed === "```";
}

function isWrapperFenceSentinel(lines: ReadonlyArray<string>, index: number, trimmed: string): boolean {
  if (!isBareFenceLine(trimmed)) return false;
  const next = nextNonBlankLine(lines, index + 1);
  return next !== undefined && isWrapperSentinel(next.trimStart());
}

function nextNonBlankLine(lines: ReadonlyArray<string>, start: number): string | undefined {
  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    if (!isBlankLine(line)) return line;
  }
  return undefined;
}

function trimWrapperFence(lines: ReadonlyArray<string>): ReadonlyArray<string> {
  const last = lines.at(-1);
  if (last === undefined || !isBareFenceLine(last.trim())) return lines;
  return isInsideFenceBefore(lines, lines.length - 1) ? lines : lines.slice(0, -1);
}

function isInsideFenceBefore(lines: ReadonlyArray<string>, end: number): boolean {
  let inFence = false;
  for (let index = 0; index < end; index++) {
    const line = lines[index];
    if (line !== undefined && isFenceLine(line.trimStart())) inFence = !inFence;
  }
  return inFence;
}

function trimBlankEdges(lines: ReadonlyArray<string>): ReadonlyArray<string> {
  let start = 0;
  let end = lines.length;
  while (start < end && isBlankLine(lines[start])) start++;
  while (end > start && isBlankLine(lines[end - 1])) end--;
  return lines.slice(start, end);
}

function isBlankLine(line: string | undefined): boolean {
  return line === undefined || line.trim().length === 0;
}

function isSystemReminder(text: string): boolean {
  return text.trimStart().startsWith("<system-reminder>");
}

function isInternalInitiator(text: string): boolean {
  return text.trimStart().startsWith("<!-- OMO_INTERNAL_INITIATOR -->");
}

export function isGenuineRequest(message: Message, parts: ReadonlyArray<Part>): boolean {
  if (message.role !== "user") return false;
  const text = requestText(parts);
  return text !== null && !isSystemReminder(text) && !isInternalInitiator(text);
}
