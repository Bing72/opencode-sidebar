import { isGenuineRequest } from "./request";
import type { ElapsedResult, Message, Part, PartsByMsgId, SessionStatus } from "./types";

export function computeElapsed(
  messages: ReadonlyArray<Message>,
  partsByMsgId: PartsByMsgId,
  status: SessionStatus | undefined,
  now: number,
): ElapsedResult {
  const anchor = lastGenuineRequest(messages, partsByMsgId);
  if (anchor === undefined) return { running: false, ms: 0, hasData: false };
  return { running: status?.type === "busy", ms: Math.max(0, now - anchor), hasData: true };
}

export function displayNow(
  status: SessionStatus | undefined,
  messages: ReadonlyArray<Message>,
  wallNow: number,
  idleObservedAt?: number,
): number {
  if (status?.type === "busy") return wallNow;
  return sessionEndTime(messages) ?? idleObservedAt ?? wallNow;
}

export function tickNow(status: SessionStatus | undefined, now: () => number): number {
  return status?.type === "busy" ? now() : Date.now();
}

function lastGenuineRequest(messages: ReadonlyArray<Message>, partsByMsgId: PartsByMsgId): number | undefined {
  let anchor: number | undefined;
  let latestCreated: number | undefined;
  for (const msg of messages) {
    const parts = partsByMsgId.get(msg.id) ?? [];
    if (!isGenuineRequest(msg, parts)) continue;
    if (latestCreated === undefined || msg.time.created > latestCreated) {
      latestCreated = msg.time.created;
      anchor = requestAnchor(msg, parts);
    }
  }
  return anchor;
}

function requestAnchor(message: Message, parts: ReadonlyArray<Part>): number {
  return firstTextPartStart(parts) ?? message.time.created;
}

function firstTextPartStart(parts: ReadonlyArray<Part>): number | undefined {
  for (const part of parts) {
    if (part.type !== "text") continue;
    if (part.synthetic === true) continue;
    if (part.ignored === true) continue;
    const start = part.time?.start;
    if (start !== undefined) return start;
  }
  return undefined;
}

function sessionEndTime(messages: ReadonlyArray<Message>): number | undefined {
  let latest: number | undefined;
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const completed = msg.time.completed;
    if (completed === undefined) continue;
    if (latest === undefined || completed > latest) latest = completed;
  }
  return latest;
}
