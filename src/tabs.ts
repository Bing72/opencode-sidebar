import type { SidebarTab } from "./types";

export const SIDEBAR_CONTENT_ORDER = 50;
export const SIDEBAR_TAB_ORDER = ["sessions", "timeline"] as const satisfies ReadonlyArray<SidebarTab>;
export const DEFAULT_SIDEBAR_TAB: SidebarTab = "sessions";

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

export function shouldRefreshSessionsOnTabSelect(tab: SidebarTab): boolean {
  return tab === "sessions";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled sidebar tab: ${value}`);
}
