import type { Message, Part } from "./types";

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
    if (firstLine(part.text).length > 0) return part.text;
  }
  return null;
}

export function isBackgroundCompletion(text: string): boolean {
  return text.trimStart().startsWith("<system-reminder>") && text.includes("[BACKGROUND TASK COMPLETED]");
}

export function isGenuineRequest(message: Message, parts: ReadonlyArray<Part>): boolean {
  if (message.role !== "user") return false;
  const text = requestText(parts);
  return text !== null && !isBackgroundCompletion(text);
}
