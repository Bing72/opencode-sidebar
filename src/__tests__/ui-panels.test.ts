import { describe, expect, it } from "vitest";

import { promptTimerText, timelineEntryColor } from "../ui-panels";

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

  it("T-UI-10 labels prompt wall elapsed and agent work duration separately", () => {
    const text = promptTimerText({ glyph: "T", wallMs: 600_000, workMs: 180_000 });

    expect(text).toBe("T 경과 10m · 작업 3m");
  });

  it("T-UI-11 can show prompt wall elapsed without idle work duration", () => {
    const text = promptTimerText({ glyph: "T", wallMs: 600_000 });

    expect(text).toBe("T 경과 10m");
  });
});
