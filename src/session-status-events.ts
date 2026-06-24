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

function assertNever(value: never): never {
  throw new Error(`Unhandled session status event: ${value}`);
}
