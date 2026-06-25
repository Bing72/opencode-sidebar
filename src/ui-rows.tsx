/** @jsxImportSource @opentui/solid */

import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import type { JSX } from "solid-js";

import { agentModel, formatLiveDuration, rowDurationText } from "./format";
import { SIDEBAR_TAB_ORDER, sidebarTabLabel } from "./tabs";
import type { AgentEntry, SessionEntry, SessionStatus, SidebarTab } from "./types";

export interface PaletteOptions {
  readonly headerColor?: string;
  readonly dimColor?: string;
}

interface SessionColorTheme<Color> {
  readonly accent?: Color;
  readonly primary: Color;
  readonly warning: Color;
  readonly success?: Color;
  readonly textMuted: Color;
}

interface HideMouseEvent {
  readonly stopPropagation: () => void;
}

export interface SessionGlyphTitleParts {
  readonly glyph: string;
  readonly separator: string;
  readonly title: string;
}

const SESSION_GLYPH_TITLE_SEPARATOR = " ";

export function sessionGlyphTitleParts(entry: Pick<SessionEntry, "glyph" | "title">): SessionGlyphTitleParts {
  return {
    glyph: entry.glyph,
    separator: SESSION_GLYPH_TITLE_SEPARATOR,
    title: entry.title,
  };
}

export function sessionStatusColor<Color>(status: SessionStatus["type"], theme: SessionColorTheme<Color>): Color {
  switch (status) {
    case "busy":
      return theme.accent ?? theme.primary;
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

export function sessionHideActionColor<Color>(theme: { readonly error: Color }): Color {
  return theme.error;
}

export function handleSessionHideMouseUp(
  event: HideMouseEvent,
  entry: Pick<SessionEntry, "sessionID" | "hideable">,
  hideSession: (sessionId: string) => void,
): void {
  event.stopPropagation();
  if (entry.hideable) hideSession(entry.sessionID);
}

export function renderTabs(
  active: SidebarTab,
  options: PaletteOptions,
  theme: TuiThemeCurrent,
  select: (tab: SidebarTab) => void,
): JSX.Element {
  const tab = (value: SidebarTab) => (
    <text
      fg={
        active === value
          ? (options.headerColor ?? theme.accent ?? theme.primary)
          : (options.dimColor ?? theme.textMuted)
      }
      onMouseUp={() => select(value)}
    >
      {active === value ? `[${sidebarTabLabel(value)}]` : ` ${sidebarTabLabel(value)} `}
    </text>
  );
  return (
    <box height={1} flexDirection="row">
      {tab(SIDEBAR_TAB_ORDER[0])}
      <text fg={theme.textMuted}>{" | "}</text>
      {tab(SIDEBAR_TAB_ORDER[1])}
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
  openSession: (sessionId: string) => void,
  hideSession?: (sessionId: string) => void,
): JSX.Element[] {
  return rows.map((entry) => {
    const titleParts = sessionGlyphTitleParts(entry);
    return (
      <box
        flexDirection="column"
        onMouseUp={(event) => {
          event.stopPropagation();
          openSession(entry.sessionID);
        }}
      >
        <box height={1} flexDirection="row" justifyContent="space-between">
          <box flexDirection="row" flexShrink={1} overflow="hidden" minWidth={0}>
            <text
              fg={entry.current ? currentSessionColor(theme) : sessionStatusColor(entry.status, theme)}
              wrapMode="none"
              flexShrink={0}
            >
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
            <text fg={theme.textMuted}>{` ${formatLiveDuration(entry.updatedMs)} ago`}</text>
            {entry.hideable && hideSession !== undefined ? (
              <text
                fg={sessionHideActionColor(theme)}
                onMouseUp={(event) => handleSessionHideMouseUp(event, entry, hideSession)}
              >
                {" ×"}
              </text>
            ) : null}
          </box>
        </box>
        <box height={1}>
          <text fg={sessionStatusColor(entry.status, theme)} wrapMode="none">{`  ${entry.status}`}</text>
        </box>
      </box>
    );
  }) as unknown as JSX.Element[];
}

function assertNever(value: never): never {
  throw new Error(`Unhandled session status: ${value}`);
}
