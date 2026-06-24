import { describe, expect, it } from "vitest";

import {
  nextSidebarTab,
  SIDEBAR_CONTENT_ORDER,
  SIDEBAR_TOGGLE_BINDING,
  SIDEBAR_TOGGLE_COMMAND,
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
  });
});
