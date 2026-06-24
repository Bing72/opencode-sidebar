/** @jsxImportSource @opentui/solid */

import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import type { JSX } from "solid-js";

interface HiddenFooterMouseEvent {
  readonly stopPropagation: () => void;
}

export function hiddenSessionsFooterLabel(count: number): string | undefined {
  return count > 0 ? `${count} hidden · show` : undefined;
}

export function handleHiddenSessionsFooterMouseUp(event: HiddenFooterMouseEvent, showHiddenSessions: () => void): void {
  event.stopPropagation();
  showHiddenSessions();
}

export function renderHiddenSessionsFooter(
  count: number,
  theme: TuiThemeCurrent,
  showHiddenSessions: () => void,
): JSX.Element | null {
  const label = hiddenSessionsFooterLabel(count);
  if (label === undefined) return null;
  return (
    <box height={1}>
      <text fg={theme.textMuted} onMouseUp={(event) => handleHiddenSessionsFooterMouseUp(event, showHiddenSessions)}>
        {label}
      </text>
    </box>
  ) as unknown as JSX.Element;
}
