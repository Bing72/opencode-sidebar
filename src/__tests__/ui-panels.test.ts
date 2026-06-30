import type { TuiRouteCurrent } from "@opencode-ai/plugin/tui";
import { describe, expect, it } from "vitest";

import {
  currentSessionBottomTitle,
  promptTimerText,
  renderAppBottomSessionTitle,
  sessionTitleColor,
  timelineEntryColor,
} from "../ui-panels";

const theme = {
  accent: "theme-accent",
  primary: "theme-primary",
  warning: "theme-warning",
  secondary: "theme-secondary",
  success: "theme-success",
};

const bottomTitleTheme = {
  accent: "title-accent",
  primary: "title-primary",
  success: "title-success",
  info: "title-info",
  warning: "title-warning",
  secondary: "title-secondary",
};

function titleLookup(
  titles: ReadonlyMap<string, string>,
): (sessionId: string) => { readonly title: string } | undefined {
  return (sessionId) => {
    const title = titles.get(sessionId);
    return title === undefined ? undefined : { title };
  };
}

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

  it("T-UI-03 returns the raw Korean session title on narrow session routes", () => {
    const route: TuiRouteCurrent = { name: "session", params: { sessionID: "s1" } };

    const title = currentSessionBottomTitle({
      route,
      getSession: titleLookup(new Map([["s1", "세션 분석"]])),
      width: 120,
    });

    expect(title).toBe("세션 분석");
  });

  it("T-UI-04 returns no title when the session route is wider than the host breakpoint", () => {
    const route: TuiRouteCurrent = { name: "session", params: { sessionID: "s1" } };

    const title = currentSessionBottomTitle({
      route,
      getSession: titleLookup(new Map([["s1", "세션 분석"]])),
      width: 121,
    });

    expect(title).toBeUndefined();
  });

  it("T-UI-05 returns no title for the home route", () => {
    const route: TuiRouteCurrent = { name: "home" };

    const title = currentSessionBottomTitle({
      route,
      getSession: titleLookup(new Map([["s1", "Hidden title"]])),
      width: 80,
    });

    expect(title).toBeUndefined();
  });

  it("T-UI-06 returns no title for an empty current session title", () => {
    const route: TuiRouteCurrent = { name: "session", params: { sessionID: "s1" } };

    const title = currentSessionBottomTitle({
      route,
      getSession: titleLookup(new Map([["s1", ""]])),
      width: 80,
    });

    expect(title).toBeUndefined();
  });

  it("T-UI-07 renders no app_bottom title when the terminal is wide", () => {
    const route: TuiRouteCurrent = { name: "session", params: { sessionID: "s1" } };

    const element = renderAppBottomSessionTitle({
      route,
      getSession: titleLookup(new Map([["s1", "세션 분석"]])),
      theme: bottomTitleTheme,
      width: 121,
    });

    expect(element).toBeNull();
  });

  it("T-UI-08 keeps the same app_bottom title color for the same session", () => {
    const firstColor = sessionTitleColor("s1", bottomTitleTheme);
    const secondColor = sessionTitleColor("s1", bottomTitleTheme);

    expect(secondColor).toBe(firstColor);
  });

  it("T-UI-09 rotates app_bottom title colors through a fixed theme palette", () => {
    expect(sessionTitleColor("s1", bottomTitleTheme)).toBe(bottomTitleTheme.success);
    expect(sessionTitleColor("s2", bottomTitleTheme)).toBe(bottomTitleTheme.info);
    expect(sessionTitleColor("s3", bottomTitleTheme)).toBe(bottomTitleTheme.warning);
    expect(sessionTitleColor("s4", bottomTitleTheme)).toBe(bottomTitleTheme.secondary);
    expect(sessionTitleColor("s5", bottomTitleTheme)).toBe(bottomTitleTheme.accent);
    expect(sessionTitleColor("s6", bottomTitleTheme)).toBe(bottomTitleTheme.primary);
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
