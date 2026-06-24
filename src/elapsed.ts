import { isGenuineRequest } from "./request";
import type { ElapsedResult, Message, PartsByMsgId, SessionStatus } from "./types";

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
): number {
  if (status?.type === "busy") return wallNow;
  return sessionEndTime(messages) ?? wallNow;
}

export function tickNow(status: SessionStatus | undefined, now: () => number): number {
  return status?.type === "busy" ? now() : Date.now();
}

function lastGenuineRequest(messages: ReadonlyArray<Message>, partsByMsgId: PartsByMsgId): number | undefined {
  let anchor: number | undefined;
  for (const msg of messages) {
    if (!isGenuineRequest(msg, partsByMsgId.get(msg.id) ?? [])) continue;
    if (anchor === undefined || msg.time.created > anchor) anchor = msg.time.created;
  }
  return anchor;
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
