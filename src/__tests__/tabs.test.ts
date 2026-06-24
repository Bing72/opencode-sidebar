import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIDEBAR_TAB,
  nextSidebarTab,
  SIDEBAR_CONTENT_ORDER,
  SIDEBAR_TAB_ORDER,
  SIDEBAR_TOGGLE_BINDING,
  SIDEBAR_TOGGLE_COMMAND,
  SIDEBAR_TOGGLE_DESCRIPTION,
  SIDEBAR_TOGGLE_TITLE,
  shouldRefreshSessionsOnTabSelect,
  sidebarTabLabel,
} from "../tabs";

describe("sidebar tabs", () => {
  it("T-TAB-01 toggles Timeline and Sessions without changing tab labels", () => {
    expect(nextSidebarTab("timeline")).toBe("sessions");
    expect(nextSidebarTab("sessions")).toBe("timeline");
    expect(sidebarTabLabel("timeline")).toBe("Timeline");
    expect(sidebarTabLabel("sessions")).toBe("Sessions");
  });

  it("T-TAB-02 keeps the plugin sidebar visible before host sidebar sections", () => {
    expect(SIDEBAR_CONTENT_ORDER).toBeLessThan(100);
  });

  it("T-TAB-03 exposes a keyboard binding for switching Timeline and Sessions", () => {
    expect(SIDEBAR_TOGGLE_COMMAND).toBe("opencode-session-timeline.toggle-sidebar-tab");
    expect(SIDEBAR_TOGGLE_BINDING).toBe("ctrl+tab");
    expect(SIDEBAR_TOGGLE_TITLE).toBe("Toggle Sessions/Timeline");
    expect(SIDEBAR_TOGGLE_DESCRIPTION).toBe("Switch Sessions/Timeline");
  });

  it("T-TAB-05 renders Sessions before Timeline and starts on Sessions", () => {
    expect(SIDEBAR_TAB_ORDER).toEqual(["sessions", "timeline"]);
    expect(DEFAULT_SIDEBAR_TAB).toBe("sessions");
  });

  it("T-TAB-04 refreshes session data whenever Sessions is selected", () => {
    expect(shouldRefreshSessionsOnTabSelect("sessions")).toBe(true);
    expect(shouldRefreshSessionsOnTabSelect("timeline")).toBe(false);
  });
});
