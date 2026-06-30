import type { EventSessionIdle, EventSessionStatus } from "@opencode-ai/sdk/v2";

import type { SessionStatus } from "./types";

export type ImmediateSessionEvent = EventSessionStatus | EventSessionIdle;

export function sessionStatusesAfterEvent(
  statuses: ReadonlyMap<string, SessionStatus>,
  event: ImmediateSessionEvent,
): ReadonlyMap<string, SessionStatus> {
  switch (event.type) {
    case "session.status":
      return new Map(statuses).set(event.properties.sessionID, event.properties.status);
    case "session.idle":
      return new Map(statuses).set(event.properties.sessionID, { type: "idle" });
    default:
      return assertNever(event);
  }
}

export function idleObservedTimesAfterEvent(
  observed: ReadonlyMap<string, number>,
  event: ImmediateSessionEvent,
  now: number,
): ReadonlyMap<string, number> {
  switch (event.type) {
    case "session.status":
      return idleObservedTimesAfterStatus(observed, event.properties.sessionID, event.properties.status, now);
    case "session.idle":
      return new Map(observed).set(event.properties.sessionID, now);
    default:
      return assertNever(event);
  }
}

function idleObservedTimesAfterStatus(
  observed: ReadonlyMap<string, number>,
  sessionId: string,
  status: SessionStatus,
  now: number,
): ReadonlyMap<string, number> {
  switch (status.type) {
    case "idle":
      return new Map(observed).set(sessionId, now);
    case "busy":
    case "retry": {
      const next = new Map(observed);
      next.delete(sessionId);
      return next;
    }
    default:
      return assertNever(status);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled session status event: ${value}`);
}
