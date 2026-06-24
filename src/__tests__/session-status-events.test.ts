import { describe, expect, it } from "vitest";

import { type ImmediateSessionEvent, sessionStatusesAfterEvent } from "../session-status-events";
import type { SessionStatus } from "../types";

describe("session status events", () => {
  it("T-SSE-01 applies session.status immediately without mutating previous statuses", () => {
    const previous = new Map<string, SessionStatus>([
      ["s1", { type: "idle" }],
      ["s2", { type: "retry", attempt: 2, message: "Rate limited", next: 12_000 }],
    ]);
    const event: ImmediateSessionEvent = {
      id: "event-1",
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "busy" } },
    };

    const next = sessionStatusesAfterEvent(previous, event);

    expect(next.get("s1")).toEqual({ type: "busy" });
    expect(next.get("s2")).toEqual({ type: "retry", attempt: 2, message: "Rate limited", next: 12_000 });
    expect(previous.get("s1")).toEqual({ type: "idle" });
  });

  it("T-SSE-02 applies session.idle as idle because the SDK event has no status property", () => {
    const previous = new Map<string, SessionStatus>([["s1", { type: "busy" }]]);
    const event: ImmediateSessionEvent = {
      id: "event-2",
      type: "session.idle",
      properties: { sessionID: "s1" },
    };

    const next = sessionStatusesAfterEvent(previous, event);

    expect(next.get("s1")).toEqual({ type: "idle" });
    expect(previous.get("s1")).toEqual({ type: "busy" });
  });
});
