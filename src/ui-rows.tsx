/** @jsxImportSource @opentui/solid */

import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import type { JSX } from "solid-js";

import { agentModel, formatLiveDuration, rowDurationText } from "./format";
import { sidebarTabLabel } from "./tabs";
import type { AgentEntry, SessionEntry, SidebarTab } from "./types";

export interface PaletteOptions {
  readonly headerColor?: string;
  readonly dimColor?: string;
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
      {tab("timeline")}
      <text fg={theme.textMuted}>{" | "}</text>
      {tab("sessions")}
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
): JSX.Element[] {
  return rows.map((entry) => (
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
            fg={
              entry.running
                ? (theme.accent ?? theme.primary)
                : entry.current
                  ? (theme.success ?? theme.primary)
                  : theme.text
            }
            wrapMode="none"
          >{`${entry.glyph} ${entry.title}`}</text>
        </box>
        <box flexDirection="row" flexShrink={0}>
          <text fg={theme.textMuted}>{` ${formatLiveDuration(entry.updatedMs)} ago`}</text>
        </box>
      </box>
      <box height={1}>
        <text fg={theme.textMuted} wrapMode="none">{`  ${entry.status} · ${entry.directory}`}</text>
      </box>
    </box>
  )) as unknown as JSX.Element[];
}
