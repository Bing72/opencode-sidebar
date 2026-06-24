import { describe, expect, it } from "vitest";

import { timelineEntryColor } from "../ui-panels";

const theme = {
  accent: "theme-accent",
  primary: "theme-primary",
  warning: "theme-warning",
  secondary: "theme-secondary",
  success: "theme-success",
};

describe("timeline panel rendering helpers", () => {
  it("T-UI-01 applies timeline kind color options before theme fallbacks", () => {
    expect(timelineEntryColor("turn", { turnColor: "custom-turn" }, theme)).toBe("custom-turn");
    expect(timelineEntryColor("plan", { planColor: "custom-plan" }, theme)).toBe("custom-plan");
    expect(timelineEntryColor("tool", { taskColor: "custom-task" }, theme)).toBe("custom-task");
  });

  it("T-UI-02 preserves original theme fallback colors when options are absent", () => {
    expect(timelineEntryColor("turn", {}, theme)).toBe(theme.accent);
    expect(timelineEntryColor("plan", {}, theme)).toBe(theme.warning);
    expect(timelineEntryColor("tool", {}, theme)).toBe(theme.success);
  });
});
