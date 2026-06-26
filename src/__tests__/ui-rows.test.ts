import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../types";
import {
  currentSessionColor,
  handleSessionDeleteMouseUp,
  handleSessionHideMouseUp,
  sessionDeleteActionColor,
  sessionGlyphColor,
  sessionGlyphTitleParts,
  sessionHideActionColor,
  sessionStatusColor,
  sessionStatusReasonParts,
  tabHeaderProjectParts,
} from "../ui-rows";

const theme = {
  accent: "theme-accent",
  info: "theme-info",
  primary: "theme-primary",
  warning: "theme-warning",
  success: "theme-success",
  textMuted: "theme-muted",
  error: "theme-error",
};

const hideableEntry: SessionEntry = {
  sessionID: "s1",
  title: "Session",
  status: "idle",
  glyph: "○",
  current: false,
  running: false,
  hideable: true,
  updatedMs: 1000,
  detail: "Session\nidle\nUpdated 1s ago",
};

describe("session row helpers", () => {
  it("T-ROW-01 maps session status colors to calm theme tokens", () => {
    expect(sessionStatusColor("busy", theme)).toBe(theme.info);
    expect(sessionStatusColor("retry", theme)).toBe(theme.warning);
    expect(sessionStatusColor("idle", theme)).toBe(theme.textMuted);
    expect(currentSessionColor(theme)).toBe(theme.success);
    expect(
      sessionStatusColor("busy", {
        accent: "fallback-accent",
        primary: "fallback-primary",
        warning: "fallback-warning",
        textMuted: "fallback-muted",
      }),
    ).toBe("fallback-accent");
    expect(
      currentSessionColor({
        primary: "fallback-primary",
        warning: "fallback-warning",
        textMuted: "fallback-muted",
      }),
    ).toBe("fallback-primary");
  });

  it("T-ROW-02 stops navigation propagation before hiding a session", () => {
    const calls: string[] = [];
    let stopped = false;

    handleSessionHideMouseUp(
      {
        stopPropagation: () => {
          stopped = true;
        },
      },
      hideableEntry,
      (sessionID: string) => calls.push(sessionID),
    );

    expect(stopped).toBe(true);
    expect(calls).toEqual(["s1"]);
  });

  it("T-ROW-03 ignores hide callbacks for non-hideable rows", () => {
    const calls: string[] = [];

    handleSessionHideMouseUp(
      { stopPropagation: () => undefined },
      { ...hideableEntry, hideable: false },
      (sessionID: string) => calls.push(sessionID),
    );

    expect(calls).toEqual([]);
  });

  it("T-ROW-04 keeps the glyph/title separator outside the shrinkable title", () => {
    const parts = sessionGlyphTitleParts({ glyph: "○", title: "hold.py" });

    expect(parts.glyph).toBe("○");
    expect(parts.separator).toBe(" ");
    expect(parts.title).toBe("hold.py");
  });

  it("T-ROW-05 keeps retry reasons beside the session status", () => {
    const retryParts = sessionStatusReasonParts({ status: "retry", statusReason: "rate limited" });

    expect(retryParts).toEqual({ status: "retry", separator: " · ", reason: "rate limited" });
    expect(sessionStatusReasonParts({ status: "idle" })).toEqual({ status: "idle" });
  });

  it("T-ROW-06 keeps hide visually muted and delete visually destructive", () => {
    expect(sessionHideActionColor(theme)).toBe(theme.textMuted);
    expect(sessionDeleteActionColor(theme)).toBe(theme.error);
  });

  it("T-ROW-07 keeps the project folder as a standalone tab header line", () => {
    expect(tabHeaderProjectParts("~/opencode-plugin")).toEqual({ projectPath: "~/opencode-plugin" });
    expect(tabHeaderProjectParts(undefined)).toBeUndefined();
  });

  it("T-ROW-08 maps busy session glyphs to info while preserving current idle and retry colors", () => {
    expect(sessionGlyphColor({ ...hideableEntry, status: "busy" }, theme)).toBe(theme.info);
    expect(sessionGlyphColor({ ...hideableEntry, status: "busy", current: true }, theme)).toBe(theme.info);
    expect(sessionGlyphColor({ ...hideableEntry, status: "idle", current: true }, theme)).toBe(theme.success);
    expect(sessionGlyphColor({ ...hideableEntry, status: "retry" }, theme)).toBe(theme.warning);
  });

  it("T-ROW-09 stops navigation propagation before requesting delete confirmation", () => {
    const calls: string[] = [];
    let stopped = false;

    handleSessionDeleteMouseUp(
      {
        stopPropagation: () => {
          stopped = true;
        },
      },
      hideableEntry,
      (sessionID: string) => calls.push(sessionID),
    );

    expect(stopped).toBe(true);
    expect(calls).toEqual(["s1"]);
  });

  it("T-ROW-10 ignores delete callbacks for non-hideable current rows", () => {
    const calls: string[] = [];
    const currentEntry: SessionEntry = { ...hideableEntry, current: true, hideable: false };

    handleSessionDeleteMouseUp({ stopPropagation: () => undefined }, currentEntry, (sessionID: string) =>
      calls.push(sessionID),
    );

    expect(calls).toEqual([]);
  });
});
