import { describe, expect, it } from "vitest";

import { handleHiddenSessionsFooterMouseUp, hiddenSessionsFooterLabel, timelineEntryColor } from "../ui-panels";

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

  it("T-UI-03 formats hidden session footer copy only when recovery is available", () => {
    expect(hiddenSessionsFooterLabel(0)).toBeUndefined();
    expect(hiddenSessionsFooterLabel(2)).toBe("2 hidden · show");
  });

  it("T-UI-04 stops propagation before showing hidden sessions", () => {
    let stopped = false;
    let recovered = false;

    handleHiddenSessionsFooterMouseUp(
      {
        stopPropagation: () => {
          stopped = true;
        },
      },
      () => {
        recovered = true;
      },
    );

    expect(stopped).toBe(true);
    expect(recovered).toBe(true);
  });
});
