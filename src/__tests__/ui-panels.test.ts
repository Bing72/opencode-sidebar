import type { TuiRouteCurrent } from "@opencode-ai/plugin/tui";
import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";

import {
  createAppBottomSessionTitleEntry,
  currentSessionBottomTitle,
  promptTimerColumns,
  promptTimerText,
  renderAppBottomSessionTitle,
  sessionTitleColor,
  timelineEntryColor,
} from "../ui-panels";

const testJsxFactory = {
  createElement(type: string, props: Record<string, unknown> | null, ...children: unknown[]): unknown {
    return { type, props, children };
  },
};

Object.defineProperty(globalThis, "React", { configurable: true, value: testJsxFactory });

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

function withSolidRoot<T>(run: () => T): T {
  return createRoot((dispose) => {
    try {
      return run();
    } finally {
      dispose();
    }
  });
}

interface TestJsxElement {
  readonly type: unknown;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly unknown[];
}

function testJsxElement(value: unknown): TestJsxElement {
  return value as TestJsxElement;
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

  it("T-UI-07 hides app_bottom without occupying a row when the terminal starts wide", () => {
    const route: TuiRouteCurrent = { name: "session", params: { sessionID: "s1" } };

    const element = withSolidRoot(() =>
      renderAppBottomSessionTitle({
        route: () => route,
        getSession: titleLookup(new Map([["s1", "세션 분석"]])),
        theme: () => bottomTitleTheme,
        width: () => 121,
      }),
    );

    expect(testJsxElement(element)).toMatchObject({
      type: "box",
      props: { width: "100%", height: 1, visible: false },
    });
  });

  it("T-UI-13 updates the mounted app_bottom title when the terminal shrinks", () => {
    const route: TuiRouteCurrent = { name: "session", params: { sessionID: "s1" } };

    withSolidRoot(() => {
      const [width, setWidth] = createSignal(121);
      const entry = createAppBottomSessionTitleEntry({
        route: () => route,
        getSession: titleLookup(new Map([["s1", "세션 분석"]])),
        width,
      });

      expect(entry()).toBeUndefined();
      setWidth(80);
      expect(entry()).toEqual({ sessionId: "s1", title: "세션 분석" });
    });
  });

  it("T-UI-14 keeps the mounted app_bottom title reactive to data refreshes", () => {
    const route: TuiRouteCurrent = { name: "session", params: { sessionID: "s1" } };
    const titles = new Map([["s1", "초기 제목"]]);

    withSolidRoot(() => {
      const [revision, setRevision] = createSignal(0);
      const entry = createAppBottomSessionTitleEntry({
        route: () => route,
        getSession: titleLookup(titles),
        width: () => 80,
        revision,
      });

      expect(entry()).toEqual({ sessionId: "s1", title: "초기 제목" });
      titles.set("s1", "변경된 제목");
      setRevision((value) => value + 1);
      expect(entry()).toEqual({ sessionId: "s1", title: "변경된 제목" });
    });
  });

  it("T-UI-15 keeps the mounted app_bottom title hidden on wide refreshes", () => {
    const route: TuiRouteCurrent = { name: "session", params: { sessionID: "s1" } };

    withSolidRoot(() => {
      const [revision, setRevision] = createSignal(0);
      const entry = createAppBottomSessionTitleEntry({
        route: () => route,
        getSession: titleLookup(new Map([["s1", "세션 분석"]])),
        width: () => 121,
        revision,
      });

      expect(entry()).toBeUndefined();
      setRevision((value) => value + 1);
      expect(entry()).toBeUndefined();
    });
  });

  it("T-UI-17 mounts a one-row app_bottom title while narrow", () => {
    const route: TuiRouteCurrent = { name: "session", params: { sessionID: "s1" } };

    const element = withSolidRoot(() =>
      renderAppBottomSessionTitle({
        route: () => route,
        getSession: titleLookup(new Map([["s1", "세션 분석"]])),
        theme: () => bottomTitleTheme,
        width: () => 80,
      }),
    );

    expect(testJsxElement(element)).toMatchObject({
      type: "box",
      props: {
        width: "100%",
        height: 1,
        visible: true,
        flexDirection: "row",
        justifyContent: "center",
        overflow: "hidden",
        minWidth: 0,
      },
      children: [{ type: "text", props: { content: "세션 분석", fg: bottomTitleTheme.success, wrapMode: "none" } }],
    });
  });

  it("T-UI-18 preserves raw title lookup behavior for wide values", () => {
    const route: TuiRouteCurrent = { name: "session", params: { sessionID: "s1" } };

    const title = currentSessionBottomTitle({
      route,
      getSession: titleLookup(new Map([["s1", "세션 분석"]])),
      width: 121,
    });

    expect(title).toBeUndefined();
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

  it("T-UI-10 selects prompt timer text variants by available columns", () => {
    const args = { glyph: "⏱", wallMs: 600_000, workMs: 180_000 };

    expect(promptTimerText({ ...args, availableColumns: 18 })).toBe("⏱ 경과 10m·작업 3m");
    expect(promptTimerText({ ...args, availableColumns: 17 })).toBe("⏱ 10m·3m");
    expect(promptTimerText({ ...args, availableColumns: 7 })).toBe("⏱10m/3m");
    expect(promptTimerText({ ...args, availableColumns: 6 })).toBe("⏱10m");
  });

  it("T-UI-11 keeps wall elapsed visible when work duration is hidden", () => {
    const args = { glyph: "⏱", wallMs: 600_000 };

    expect(promptTimerText({ ...args, availableColumns: 12 })).toBe("⏱ 경과 10m");
    expect(promptTimerText({ ...args, availableColumns: 7 })).toBe("⏱ 10m");
    expect(promptTimerText({ ...args, availableColumns: 3 })).toBe("⏱10m");
  });

  it("T-UI-12 reserves prompt input room when choosing prompt timer columns", () => {
    const args = { glyph: "⏱", wallMs: 600_000, workMs: 180_000 };

    expect(promptTimerText({ ...args, availableColumns: promptTimerColumns(80) })).toBe("⏱ 경과 10m·작업 3m");
    expect(promptTimerText({ ...args, availableColumns: promptTimerColumns(60) })).toBe("⏱ 10m·3m");
    expect(promptTimerText({ ...args, availableColumns: promptTimerColumns(48) })).toBe("⏱10m/3m");
    expect(promptTimerText({ ...args, availableColumns: promptTimerColumns(36) })).toBe("⏱10m");
  });
});
