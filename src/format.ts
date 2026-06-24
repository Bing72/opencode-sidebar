import type { ClockFormat } from "./types";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatDuration(ms: number): string {
  const safe = ms > 0 ? ms : 0;
  if (safe < MINUTE_MS) return `${(safe / 1000).toFixed(1)}s`;
  if (safe < HOUR_MS) {
    const m = Math.floor(safe / MINUTE_MS);
    const s = Math.floor((safe % MINUTE_MS) / 1000);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(safe / HOUR_MS);
  const m = Math.floor((safe % HOUR_MS) / MINUTE_MS);
  return `${h}h ${m}m`;
}

export function formatLiveDuration(ms: number): string {
  const safe = ms > 0 ? ms : 0;
  if (safe < MINUTE_MS) return "< 1m";
  if (safe < HOUR_MS) return `${Math.floor(safe / MINUTE_MS)}m`;
  const h = Math.floor(safe / HOUR_MS);
  const m = Math.floor((safe % HOUR_MS) / MINUTE_MS);
  return `${h}h ${m}m`;
}

export function formatClock(epochMs: number, mode: ClockFormat): string {
  const d = new Date(epochMs);
  const minutes = pad2(d.getMinutes());
  const seconds = pad2(d.getSeconds());
  const hour24 = d.getHours();
  if (mode === "24h") return `${pad2(hour24)}:${minutes}:${seconds}`;
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${pad2(hour12)}:${minutes}:${seconds} ${period}`;
}

export function rowDurationText(
  e: { readonly running: boolean; readonly durationMs: number | null; readonly clockMs: number },
  liveNow: number,
): string {
  if (!e.running && e.durationMs !== null) return formatLiveDuration(e.durationMs);
  return formatLiveDuration(liveNow - e.clockMs);
}

export function agentModel(runner: string | undefined): string | undefined {
  if (runner === undefined) return undefined;
  const i = runner.lastIndexOf(" · ");
  return i >= 0 ? runner.slice(i + 3) : undefined;
}
