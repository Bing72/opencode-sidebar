import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../types";
import {
  agentStatusColor,
  currentSessionColor,
  handleSessionDeleteMouseUp,
  SESSION_DELETE_ACTION_GLYPH,
  sessionDeleteActionColor,
  sessionGlyphColor,
  sessionGlyphTitleParts,
  sessionRowGlyph,
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

const deletableEntry: SessionEntry = {
  sessionID: "s1",
  title: "Session",
  status: "idle",
  glyph: "○",
  current: false,
  running: false,
  deletable: true,
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

  it("T-ROW-06 uses the host error token for the delete action", () => {
    expect(SESSION_DELETE_ACTION_GLYPH).toBe("×");
    expect(sessionDeleteActionColor(theme)).toBe(theme.error);
  });

  it("T-ROW-07 keeps the project folder as a standalone tab header line", () => {
    expect(tabHeaderProjectParts("~/demo-project")).toEqual({ projectPath: "~/demo-project" });
    expect(tabHeaderProjectParts(undefined)).toBeUndefined();
  });

  it("T-ROW-08 prioritizes current glyph color and otherwise follows status tokens", () => {
    expect(sessionGlyphColor({ ...deletableEntry, status: "busy" }, theme)).toBe(theme.info);
    expect(sessionGlyphColor({ ...deletableEntry, status: "busy", current: true }, theme)).toBe(theme.success);
    expect(sessionGlyphColor({ ...deletableEntry, status: "idle", current: true }, theme)).toBe(theme.success);
    expect(sessionGlyphColor({ ...deletableEntry, status: "retry" }, theme)).toBe(theme.warning);
  });

  it("T-ROW-12 maps agent states to semantic host colors", () => {
    expect(agentStatusColor("running", theme)).toBe(theme.accent);
    expect(agentStatusColor("rate-limited", theme)).toBe(theme.warning);
    expect(agentStatusColor("interrupted", theme)).toBe(theme.textMuted);
    expect(agentStatusColor("error", theme)).toBe(theme.error);
    expect(agentStatusColor("completed", theme)).toBe(theme.success);
  });

  it("T-ROW-11 renders the current busy spinner frame only for non-current busy rows", () => {
    expect(sessionRowGlyph({ ...deletableEntry, status: "busy", glyph: "⣾" }, "⣽")).toBe("⣽");
    expect(sessionRowGlyph({ ...deletableEntry, status: "busy", current: true, glyph: "●" }, "⣽")).toBe("●");
    expect(sessionRowGlyph({ ...deletableEntry, status: "retry", glyph: "◷" }, "⣽")).toBe("◷");
    expect(sessionRowGlyph({ ...deletableEntry, status: "idle", glyph: "○" }, "⣽")).toBe("○");
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
      deletableEntry,
      (sessionID: string) => calls.push(sessionID),
    );

    expect(stopped).toBe(true);
    expect(calls).toEqual(["s1"]);
  });

  it("T-ROW-10 ignores delete callbacks for non-deletable current rows", () => {
    const calls: string[] = [];
    const currentEntry: SessionEntry = { ...deletableEntry, current: true, deletable: false };

    handleSessionDeleteMouseUp({ stopPropagation: () => undefined }, currentEntry, (sessionID: string) =>
      calls.push(sessionID),
    );

    expect(calls).toEqual([]);
  });
});
