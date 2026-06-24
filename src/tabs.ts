import type { SidebarTab } from "./types";

export const SIDEBAR_CONTENT_ORDER = 50;
export const SIDEBAR_TOGGLE_COMMAND = "opencode-session-timeline.toggle-sidebar-tab";
export const SIDEBAR_TOGGLE_BINDING = "ctrl+tab";

export function nextSidebarTab(tab: SidebarTab): SidebarTab {
  switch (tab) {
    case "timeline":
      return "sessions";
    case "sessions":
      return "timeline";
    default:
      return assertNever(tab);
  }
}

export function sidebarTabLabel(tab: SidebarTab): string {
  switch (tab) {
    case "timeline":
      return "Timeline";
    case "sessions":
      return "Sessions";
    default:
      return assertNever(tab);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled sidebar tab: ${value}`);
}
