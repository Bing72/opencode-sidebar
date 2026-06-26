import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIDEBAR_TAB,
  SIDEBAR_CONTENT_ORDER,
  SIDEBAR_TAB_ORDER,
  shouldRefreshSessionsOnTabSelect,
  sidebarTabLabel,
} from "../tabs";

describe("sidebar tabs", () => {
  it("T-TAB-01 labels Timeline and Sessions for mouse-selectable tabs", () => {
    expect(sidebarTabLabel("timeline")).toBe("Timeline");
    expect(sidebarTabLabel("sessions")).toBe("Sessions");
  });

  it("T-TAB-02 keeps the plugin sidebar visible before host sidebar sections", () => {
    expect(SIDEBAR_CONTENT_ORDER).toBeLessThan(100);
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
