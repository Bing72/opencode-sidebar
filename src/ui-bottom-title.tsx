/** @jsxImportSource @opentui/solid */

import type { TuiRouteCurrent } from "@opencode-ai/plugin/tui";
import type { ColorInput } from "@opentui/core";
import type { JSX } from "solid-js";

const HOST_WIDE_BREAKPOINT = 120;

interface SessionTitleSource {
  readonly title: string;
}

type SessionTitleLookup = (sessionId: string) => SessionTitleSource | undefined;

interface CurrentSessionBottomTitleArgs {
  readonly route: TuiRouteCurrent;
  readonly getSession: SessionTitleLookup;
  readonly width: number;
}

interface CurrentSessionBottomTitle {
  readonly sessionId: string;
  readonly title: string;
}

interface SessionTitleTheme {
  readonly accent: ColorInput;
  readonly primary: ColorInput;
  readonly success: ColorInput;
  readonly info: ColorInput;
  readonly warning: ColorInput;
  readonly secondary: ColorInput;
}

interface RenderAppBottomSessionTitleArgs extends CurrentSessionBottomTitleArgs {
  readonly theme: SessionTitleTheme;
}

type SessionTitlePaletteIndex = 0 | 1 | 2 | 3 | 4 | 5;

export function currentSessionBottomTitle(args: CurrentSessionBottomTitleArgs): string | undefined {
  return currentSessionBottomTitleEntry(args)?.title;
}

export function renderAppBottomSessionTitle(args: RenderAppBottomSessionTitleArgs): JSX.Element | null {
  const entry = currentSessionBottomTitleEntry(args);
  if (entry === undefined) return null;
  return (
    <box height={1} flexDirection="row" justifyContent="center" overflow="hidden" minWidth={0}>
      <text fg={sessionTitleColor(entry.sessionId, args.theme)} wrapMode="none">
        {entry.title}
      </text>
    </box>
  );
}

export function sessionTitleColor(sessionId: string, theme: SessionTitleTheme): ColorInput {
  switch (sessionTitlePaletteIndex(sessionId)) {
    case 0:
      return theme.accent;
    case 1:
      return theme.primary;
    case 2:
      return theme.success;
    case 3:
      return theme.info;
    case 4:
      return theme.warning;
    case 5:
      return theme.secondary;
  }
}

function currentSessionBottomTitleEntry(args: CurrentSessionBottomTitleArgs): CurrentSessionBottomTitle | undefined {
  const { route, getSession, width } = args;
  if (width > HOST_WIDE_BREAKPOINT) return undefined;
  if (route.name !== "session") return undefined;
  const sessionId = route.params?.sessionID;
  if (typeof sessionId !== "string") return undefined;
  const title = getSession(sessionId)?.title;
  return title === undefined || title.length === 0 ? undefined : { sessionId, title };
}

function sessionTitlePaletteIndex(sessionId: string): SessionTitlePaletteIndex {
  switch (stableSessionTitleHash(sessionId) % 6) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
      return 3;
    case 4:
      return 4;
    default:
      return 5;
  }
}

function stableSessionTitleHash(sessionId: string): number {
  let hash = 0;
  for (const char of sessionId) hash += char.charCodeAt(0);
  return hash;
}
