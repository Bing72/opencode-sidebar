/** @jsxImportSource @opentui/solid */

import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import type { JSX } from "solid-js";

import { computeElapsed, displayNow, tickNow } from "./elapsed";
import { formatClock, formatLiveDuration, rowDurationText } from "./format";
import type { Envelope } from "./history";
import { displayWidth } from "./task-metadata";
import { buildTimeline, GLYPHS } from "./timeline";
import type { Part, PluginOptions, Session, SessionStatus, TimelineEntry, TimelineKind } from "./types";
import { agentRowsForSession } from "./ui-agent-rows";
import { renderAgentRow } from "./ui-rows";

export {
  createAppBottomSessionTitleEntry,
  currentSessionBottomTitle,
  renderAppBottomSessionTitle,
  sessionTitleColor,
} from "./ui-bottom-title";
export { renderSessionsPanel } from "./ui-sessions-panel";

export interface PanelDeps {
  readonly api: TuiPluginApi;
  readonly options: PluginOptions;
  readonly now: () => number;
  readonly width: () => number;
  readonly mergedFor: (sessionId: string) => Envelope[];
  readonly partsByMsg: (merged: ReadonlyArray<Envelope>) => Map<string, ReadonlyArray<Part>>;
  readonly flattenParts: (merged: ReadonlyArray<Envelope>) => Part[];
  readonly ensureHistory: (sessionId: string, visibleRefreshGeneration?: number) => void;
  readonly ensureChildren: (sessionId: string) => void;
  readonly makeResolveChildId: (sessionId: string) => (part: Extract<Part, { type: "tool" }>) => string | undefined;
  readonly childrenVersion: () => number;
  readonly sessionBusySpinnerFrameIndex: () => number;
  readonly visibleHistoryRefreshGeneration: () => number | undefined;
  readonly refreshSessions: () => void;
  readonly sessions: () => ReadonlyArray<Session>;
  readonly sessionStatuses: () => ReadonlyMap<string, SessionStatus>;
  readonly idleObservedAt: (sessionId: string) => number | undefined;
  readonly sessionError: () => string | undefined;
  readonly confirmDeleteSession: (sessionId: string) => void;
  readonly sessionControls: SessionPanelControls;
}

export interface SessionPanelControls {
  readonly filterQuery: () => string;
  readonly pinnedSessionIds: () => ReadonlySet<string>;
  readonly clearFilter: () => void;
  readonly openFilter: () => void;
  readonly openSwitcher: () => void;
  readonly togglePinnedSession: (sessionId: string) => void;
}

const DEFAULT_MAX_ROWS = 50;
const TIMER_FULL_COLUMNS = 20;
const TIMER_COMPACT_COLUMNS = 12;
const TIMER_TINY_COLUMNS = 7;
const TIMER_MINIMAL_COLUMNS = 6;

interface PromptTimerTextArgs {
  readonly glyph: string;
  readonly wallMs: number;
  readonly workMs?: number;
  readonly availableColumns: number;
}

export function promptTimerText(args: PromptTimerTextArgs): string {
  const wallDuration = formatLiveDuration(args.wallMs);
  const minimal = `${args.glyph}${wallDuration}`;
  if (args.workMs === undefined) {
    const variants = [`${args.glyph} 경과 ${wallDuration}`, `${args.glyph} ${wallDuration}`, minimal];
    return variants.find((variant) => displayWidth(variant) <= args.availableColumns) ?? minimal;
  }
  const workDuration = formatLiveDuration(args.workMs);
  const variants = [
    `${args.glyph} 경과 ${wallDuration}·작업 ${workDuration}`,
    `${args.glyph} ${wallDuration}·${workDuration}`,
    `${args.glyph}${wallDuration}/${workDuration}`,
    minimal,
  ];
  return variants.find((variant) => displayWidth(variant) <= args.availableColumns) ?? minimal;
}

export function promptTimerColumns(viewColumns: number): number {
  if (viewColumns >= 72) return TIMER_FULL_COLUMNS;
  if (viewColumns >= 56) return TIMER_COMPACT_COLUMNS;
  if (viewColumns >= 40) return TIMER_TINY_COLUMNS;
  return TIMER_MINIMAL_COLUMNS;
}

export function renderAgentsPanel(deps: PanelDeps, sessionId: string): JSX.Element {
  const rows = agentRowsForSession(deps, sessionId);
  const merged = deps.mergedFor(sessionId);
  const infos = merged.map((entry) => entry.info);
  const partsByMsg = deps.partsByMsg(merged);
  const status = deps.api.state.session.status(sessionId);
  const theme = deps.api.theme.current;
  const liveNow = displayNow(status, infos, partsByMsg, tickNow(status, deps.now));
  return (
    <box flexDirection="column">
      <box height={1}>
        <text fg={deps.options.headerColor ?? theme.accent ?? theme.primary}>
          <b>{"Agents"}</b>
        </text>
      </box>
      {rows.length === 0 ? (
        <box height={1}>
          <text fg={deps.options.dimColor ?? theme.textMuted}>{"No subagents"}</text>
        </box>
      ) : (
        rows.map((entry) =>
          renderAgentRow(entry, liveNow, theme, (id) => deps.api.route.navigate("session", { sessionID: id })),
        )
      )}
    </box>
  ) as unknown as JSX.Element;
}

export function renderTimelinePanel(deps: PanelDeps, sessionId: string): JSX.Element | null {
  deps.ensureHistory(sessionId);
  const merged = deps.mergedFor(sessionId);
  const infos = merged.map((entry) => entry.info);
  const partsByMsg = deps.partsByMsg(merged);
  const entries = buildTimeline(infos, partsByMsg, { maxRows: deps.options.maxRows ?? DEFAULT_MAX_ROWS });
  if (entries.length === 0) return null;
  const theme = deps.api.theme.current;
  const status = deps.api.state.session.status(sessionId);
  const liveNow = displayNow(status, infos, partsByMsg, tickNow(status, deps.now));
  return (
    <box flexDirection="column">
      {entries.map((entry) => renderTimelineRow(deps, entry, sessionId, theme, liveNow))}
    </box>
  ) as unknown as JSX.Element;
}

export function renderPromptTimer(deps: PanelDeps, sessionId: string): JSX.Element | null {
  deps.ensureHistory(sessionId);
  const merged = deps.mergedFor(sessionId);
  const status = deps.api.state.session.status(sessionId);
  const infos = merged.map((entry) => entry.info);
  const partsByMsg = deps.partsByMsg(merged);
  const wallNow = deps.now();
  const idleObservedAt = status?.type === "idle" ? deps.idleObservedAt(sessionId) : undefined;
  const wallElapsed = computeElapsed(infos, partsByMsg, status, wallNow);
  if (!wallElapsed.hasData) return null;
  const workNow = displayNow(status, infos, partsByMsg, wallNow, idleObservedAt);
  const workElapsed = computeElapsed(infos, partsByMsg, status, workNow);
  const glyph = deps.options.timerGlyph ?? GLYPHS.timer;
  const availableColumns = promptTimerColumns(deps.width());
  if (wallElapsed.running) {
    return (
      <text fg={deps.options.headerColor ?? deps.api.theme.current.accent} wrapMode="none" flexShrink={0}>
        {promptTimerText({ glyph, wallMs: wallElapsed.ms, workMs: workElapsed.ms, availableColumns })}
      </text>
    );
  }
  const textArgs =
    deps.options.showIdleDuration === false
      ? { glyph, wallMs: wallElapsed.ms, availableColumns }
      : { glyph, wallMs: wallElapsed.ms, workMs: workElapsed.ms, availableColumns };
  return (
    <text fg={deps.options.dimColor ?? deps.api.theme.current.textMuted} wrapMode="none" flexShrink={0}>
      {promptTimerText(textArgs)}
    </text>
  );
}

function renderTimelineRow(
  deps: PanelDeps,
  entry: TimelineEntry,
  sessionId: string,
  theme: TuiThemeCurrent,
  liveNow: number,
): JSX.Element {
  return (
    <box
      height={1}
      flexDirection="row"
      justifyContent="space-between"
      onMouseUp={(event) => {
        event.stopPropagation();
        openDetail(deps, entry, sessionId);
      }}
    >
      <box flexDirection="row" flexShrink={1} overflow="hidden" minWidth={0}>
        <text fg={theme.textMuted}>{`${formatClock(entry.clockMs, deps.options.clockFormat ?? "24h")} `}</text>
        <text fg={timelineEntryColor(entry.kind, deps.options, theme)}>{`${entry.glyph} `}</text>
        <text fg={theme.text} wrapMode="none">
          {entry.label}
        </text>
      </box>
      <text fg={theme.textMuted}>{` ${rowDurationText(entry, liveNow)}`}</text>
    </box>
  ) as unknown as JSX.Element;
}

interface TimelineColorTheme<Color> {
  readonly accent: Color;
  readonly primary: Color;
  readonly warning: Color;
  readonly secondary: Color;
  readonly success: Color;
}

export function timelineEntryColor<Color>(
  kind: TimelineKind,
  options: PluginOptions,
  theme: TimelineColorTheme<Color>,
): string | Color {
  switch (kind) {
    case "turn":
      return options.turnColor ?? theme.accent ?? theme.primary;
    case "plan":
      return options.planColor ?? theme.warning ?? theme.secondary;
    case "tool":
      return options.taskColor ?? theme.success ?? theme.primary;
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled timeline kind: ${value}`);
}

function openDetail(deps: PanelDeps, entry: TimelineEntry, sessionId: string): void {
  deps.api.ui.dialog.replace(() => {
    const theme = deps.api.theme.current;
    const merged = deps.mergedFor(sessionId);
    const status = deps.api.state.session.status(sessionId);
    const infos = merged.map((item) => item.info);
    const detailNow = displayNow(status, infos, deps.partsByMsg(merged), tickNow(status, deps.now));
    return (
      <box flexDirection="column" paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2}>
        <box height={1}>
          <text fg={theme.accent}>
            <b>{`${entry.glyph} ${entry.kind}`}</b>
          </text>
        </box>
        <box height={1}>
          <text
            fg={theme.textMuted}
          >{`${formatClock(entry.clockMs, deps.options.clockFormat ?? "24h")} · ${rowDurationText(entry, detailNow)}`}</text>
        </box>
        <box paddingTop={1}>
          <text fg={theme.text} wrapMode="word">
            {entry.detail}
          </text>
        </box>
      </box>
    ) as unknown as JSX.Element;
  });
}
