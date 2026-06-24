export const GLYPHS = {
  turn: "◆",
  plan: "☰",
  subagent: "⚙",
  done: "✓",
  cancelled: "⊘",
  timer: "⏱",
} as const;

const TASK_DESC_MAX = 34;

export function isCancelledError(state: {
  readonly error: string;
  readonly metadata?: { readonly [key: string]: unknown };
}): boolean {
  return (
    state.metadata?.interrupted === true || state.error === "Cancelled" || state.error === "Tool execution aborted"
  );
}

export function taskRunner(metadata: { readonly [key: string]: unknown } | undefined): string | undefined {
  if (metadata === undefined) return undefined;
  const agent = strField(metadata.agent);
  const rawModel = metadata.model;
  const model = isRecord(rawModel) ? (strField(rawModel.modelID) ?? strField(rawModel.id)) : undefined;
  const parts = [agent, model].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function taskWhoDesc(input: { readonly [key: string]: unknown }): {
  readonly label: string;
  readonly detail: string;
} {
  const who = strField(input.subagent_type) ?? strField(input.category) ?? "task";
  const desc = strField(input.description);
  if (desc === undefined) return { label: who, detail: who };
  return { label: `${who}: ${truncate(desc, TASK_DESC_MAX)}`, detail: `${who}: ${desc}` };
}

export function strField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

export function displayWidth(s: string): number {
  let width = 0;
  for (const char of s) width += charDisplayWidth(char);
  return width;
}

export function truncateDisplay(s: string, columns: number): string {
  let width = 0;
  let result = "";
  for (const char of s) {
    const nextWidth = charDisplayWidth(char);
    if (width + nextWidth > columns) return result.trimEnd();
    result += char;
    width += nextWidth;
  }
  return result.trimEnd();
}

function charDisplayWidth(char: string): number {
  const point = char.codePointAt(0);
  if (point === undefined || isCombiningMark(point)) return 0;
  return isWideCodePoint(point) ? 2 : 1;
}

function isCombiningMark(point: number): boolean {
  return (
    (point >= 0x0300 && point <= 0x036f) ||
    (point >= 0x1ab0 && point <= 0x1aff) ||
    (point >= 0x1dc0 && point <= 0x1dff) ||
    (point >= 0x20d0 && point <= 0x20ff) ||
    (point >= 0xfe20 && point <= 0xfe2f)
  );
}

function isWideCodePoint(point: number): boolean {
  return (
    (point >= 0x1100 && point <= 0x115f) ||
    point === 0x2329 ||
    point === 0x232a ||
    (point >= 0x2e80 && point <= 0xa4cf && point !== 0x303f) ||
    (point >= 0xac00 && point <= 0xd7a3) ||
    (point >= 0xf900 && point <= 0xfaff) ||
    (point >= 0xfe10 && point <= 0xfe19) ||
    (point >= 0xfe30 && point <= 0xfe6f) ||
    (point >= 0xff00 && point <= 0xff60) ||
    (point >= 0xffe0 && point <= 0xffe6) ||
    (point >= 0x1f300 && point <= 0x1faff)
  );
}
