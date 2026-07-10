import type { Message, Part, Session, SessionStatus } from "@opencode-ai/sdk/v2";

export type { Message, Part, Session, SessionStatus };

export type ClockFormat = "24h" | "12h";
export type SidebarTab = "timeline" | "sessions";

export interface PluginOptions {
  readonly clockFormat?: ClockFormat;
  readonly maxRows?: number;
  readonly maxSessions?: number;
  readonly headerColor?: string;
  readonly dimColor?: string;
  readonly turnColor?: string;
  readonly planColor?: string;
  readonly taskColor?: string;
  readonly timerGlyph?: string;
  readonly showIdleDuration?: boolean;
}

export type TimelineKind = "turn" | "tool" | "plan";

export interface TimelineEntry {
  readonly kind: TimelineKind;
  readonly clockMs: number;
  readonly glyph: string;
  readonly label: string;
  readonly detail: string;
  durationMs: number | null;
  readonly running: boolean;
  readonly runner?: string;
}

export type AgentStatus = "running" | "rate-limited" | "interrupted" | "error" | "completed";

export interface AgentEntry {
  readonly status: AgentStatus;
  readonly glyph: string;
  readonly label: string;
  readonly detail: string;
  readonly clockMs: number;
  readonly durationMs: number | null;
  readonly running: boolean;
  readonly childSessionId?: string;
  readonly runner?: string;
}

export interface SessionEntry {
  readonly sessionID: string;
  readonly title: string;
  readonly status: SessionStatus["type"];
  readonly statusReason?: string;
  readonly glyph: string;
  readonly current: boolean;
  readonly running: boolean;
  readonly deletable: boolean;
  readonly updatedMs: number;
  readonly detail: string;
}

export interface ElapsedResult {
  readonly running: boolean;
  readonly ms: number;
  readonly hasData: boolean;
}

export type PartsByMsgId = ReadonlyMap<string, ReadonlyArray<Part>>;
