/** @jsxImportSource @opentui/solid */

import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import type { JSX } from "solid-js";

import { agentModel, formatSessionAge, rowDurationText } from "./format";
import { SIDEBAR_TAB_ORDER, sidebarTabLabel } from "./tabs";
import type { AgentEntry, SessionEntry, SessionStatus, SidebarTab } from "./types";

export interface PaletteOptions {
  readonly headerColor?: string;
  readonly dimColor?: string;
}

interface SessionColorTheme<Color> {
  readonly accent?: Color;
  readonly info?: Color;
  readonly primary: Color;
  readonly warning: Color;
  readonly success?: Color;
  readonly textMuted: Color;
}

interface SessionActionMouseEvent {
  readonly stopPropagation: () => void;
}

export interface SessionRowActions {
  readonly openSession: (sessionId: string) => void;
  readonly confirmDeleteSession?: (sessionId: string) => void;
}

export interface SessionGlyphTitleParts {
  readonly glyph: string;
  readonly separator: string;
  readonly title: string;
}

export type SessionStatusReasonParts =
  | { readonly status: SessionStatus["type"] }
  | {
      readonly status: SessionStatus["type"];
      readonly separator: typeof SESSION_STATUS_REASON_SEPARATOR;
      readonly reason: string;
    };

export interface TabHeaderProjectParts {
  readonly projectPath: string;
}

export interface RenderTabsArgs {
  readonly active: SidebarTab;
  readonly options: PaletteOptions;
  readonly theme: TuiThemeCurrent;
  readonly select: (tab: SidebarTab) => void;
  readonly projectPath?: string;
}

const SESSION_GLYPH_TITLE_SEPARATOR = " ";
const SESSION_STATUS_REASON_SEPARATOR = " · ";
export const SESSION_BUSY_GLYPH_COLOR = "white";
export const SESSION_DELETE_ACTION_GLYPH = "×";
export const SESSION_DELETE_ACTION_COLOR = "#EF4444";

export function sessionGlyphTitleParts(entry: Pick<SessionEntry, "glyph" | "title">): SessionGlyphTitleParts {
  return {
    glyph: entry.glyph,
    separator: SESSION_GLYPH_TITLE_SEPARATOR,
    title: entry.title,
  };
}

export function sessionStatusReasonParts(
  entry: Pick<SessionEntry, "status" | "statusReason">,
): SessionStatusReasonParts {
  if (entry.statusReason === undefined) return { status: entry.status };
  return {
    status: entry.status,
    separator: SESSION_STATUS_REASON_SEPARATOR,
    reason: entry.statusReason,
  };
}

export function tabHeaderProjectParts(projectPath: string | undefined): TabHeaderProjectParts | undefined {
  if (projectPath === undefined) return undefined;
  return { projectPath };
}

export function sessionStatusColor<Color>(status: SessionStatus["type"], theme: SessionColorTheme<Color>): Color {
  switch (status) {
    case "busy":
      return theme.info ?? theme.accent ?? theme.primary;
    case "retry":
      return theme.warning;
    case "idle":
      return theme.textMuted;
    default:
      return assertNever(status);
  }
}

export function currentSessionColor<Color>(theme: SessionColorTheme<Color>): Color {
  return theme.success ?? theme.primary;
}

export function sessionGlyphColor<Color>(
  entry: Pick<SessionEntry, "current" | "status">,
  theme: SessionColorTheme<Color>,
): Color | typeof SESSION_BUSY_GLYPH_COLOR {
  if (entry.current) return currentSessionColor(theme);
  switch (entry.status) {
    case "busy":
      return SESSION_BUSY_GLYPH_COLOR;
    case "retry":
    case "idle":
      return sessionStatusColor(entry.status, theme);
    default:
      return assertNever(entry.status);
  }
}

export function sessionRowGlyph(
  entry: Pick<SessionEntry, "current" | "glyph" | "status">,
  busySpinnerFrame: string,
): string {
  if (entry.current) return entry.glyph;
  return entry.status === "busy" ? busySpinnerFrame : entry.glyph;
}

export function sessionDeleteActionColor(): typeof SESSION_DELETE_ACTION_COLOR {
  return SESSION_DELETE_ACTION_COLOR;
}

export function handleSessionDeleteMouseUp(
  event: SessionActionMouseEvent,
  entry: Pick<SessionEntry, "sessionID" | "deletable">,
  confirmDeleteSession: (sessionId: string) => void,
): void {
  event.stopPropagation();
  if (entry.deletable) confirmDeleteSession(entry.sessionID);
}

export function renderTabs(args: RenderTabsArgs): JSX.Element {
  const { active, options, theme, select } = args;
  const projectParts = tabHeaderProjectParts(args.projectPath);
  const tab = (value: SidebarTab) => (
    <text
      fg={
        active === value
          ? (options.headerColor ?? theme.accent ?? theme.primary)
          : (options.dimColor ?? theme.textMuted)
      }
      onMouseUp={() => select(value)}
      wrapMode="none"
    >
      {active === value ? `[${sidebarTabLabel(value)}]` : ` ${sidebarTabLabel(value)} `}
    </text>
  );
  return (
    <box flexDirection="column">
      {projectParts === undefined ? null : (
        <box height={1} overflow="hidden" minWidth={0}>
          <text fg={theme.textMuted} wrapMode="none">
            {projectParts.projectPath}
          </text>
        </box>
      )}
      <box height={1} flexDirection="row" overflow="hidden" minWidth={0}>
        {tab(SIDEBAR_TAB_ORDER[0])}
        <text fg={theme.textMuted} wrapMode="none">
          {" | "}
        </text>
        {tab(SIDEBAR_TAB_ORDER[1])}
      </box>
    </box>
  ) as unknown as JSX.Element;
}

export function renderAgentRow(
  entry: AgentEntry,
  liveNow: number,
  theme: TuiThemeCurrent,
  openSession: (sessionId: string) => void,
): JSX.Element {
  const model = agentModel(entry.runner);
  return (
    <box
      flexDirection="column"
      onMouseUp={(event) => {
        event.stopPropagation();
        if (entry.childSessionId !== undefined) openSession(entry.childSessionId);
      }}
    >
      <box height={1} flexDirection="row" justifyContent="space-between">
        <text fg={entry.running ? (theme.accent ?? theme.primary) : theme.text}>{`${entry.glyph} ${entry.label}`}</text>
        <text fg={theme.textMuted}>{` ${rowDurationText(entry, liveNow)}`}</text>
      </box>
      {model === undefined ? null : (
        <box height={1}>
          <text fg={theme.textMuted}>{`  ${model}`}</text>
        </box>
      )}
    </box>
  ) as unknown as JSX.Element;
}

export function renderSessionRows(
  rows: ReadonlyArray<SessionEntry>,
  theme: TuiThemeCurrent,
  actions: SessionRowActions,
): JSX.Element[] {
  return rows.map((entry) => {
    const confirmDeleteSession = actions.confirmDeleteSession;
    const titleParts = sessionGlyphTitleParts(entry);
    const statusParts = sessionStatusReasonParts(entry);
    return (
      <box
        flexDirection="column"
        onMouseUp={(event) => {
          event.stopPropagation();
          actions.openSession(entry.sessionID);
        }}
      >
        <box height={1} flexDirection="row" justifyContent="space-between">
          <box flexDirection="row" flexShrink={1} overflow="hidden" minWidth={0}>
            <text fg={sessionGlyphColor(entry, theme)} wrapMode="none" flexShrink={0}>
              {titleParts.glyph}
            </text>
            <text fg={theme.text} wrapMode="none" flexShrink={0}>
              {titleParts.separator}
            </text>
            <text fg={theme.text} wrapMode="none">
              {titleParts.title}
            </text>
          </box>
          <box flexDirection="row" flexShrink={0}>
            <text fg={theme.textMuted}>{` ${formatSessionAge(entry.updatedMs)} ago`}</text>
            {entry.deletable && confirmDeleteSession !== undefined ? (
              <text
                fg={sessionDeleteActionColor()}
                onMouseUp={(event) => handleSessionDeleteMouseUp(event, entry, confirmDeleteSession)}
              >
                {` ${SESSION_DELETE_ACTION_GLYPH}`}
              </text>
            ) : null}
          </box>
        </box>
        <box height={1} flexDirection="row" overflow="hidden" minWidth={0}>
          <text fg={sessionStatusColor(statusParts.status, theme)} wrapMode="none" flexShrink={0}>
            {`  ${statusParts.status}`}
          </text>
          {"reason" in statusParts ? (
            <text fg={theme.textMuted} wrapMode="none">{`${statusParts.separator}${statusParts.reason}`}</text>
          ) : null}
        </box>
      </box>
    );
  }) as unknown as JSX.Element[];
}

function assertNever(value: never): never {
  throw new Error(`Unhandled session status: ${value}`);
}
