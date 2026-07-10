import { isGenuineRequest } from "./request";
import type { ElapsedResult, Message, Part, PartsByMsgId, SessionStatus } from "./types";

export function computeElapsed(
  messages: ReadonlyArray<Message>,
  partsByMsgId: PartsByMsgId,
  status: SessionStatus | undefined,
  now: number,
): ElapsedResult {
  const request = lastGenuineRequest(messages, partsByMsgId);
  if (request === undefined) return { running: false, ms: 0, hasData: false };
  return { running: status?.type === "busy", ms: Math.max(0, now - request.anchor), hasData: true };
}

export function displayNow(
  status: SessionStatus | undefined,
  messages: ReadonlyArray<Message>,
  partsByMsgId: PartsByMsgId,
  wallNow: number,
  idleObservedAt?: number,
): number {
  if (status?.type === "busy") return wallNow;
  const request = lastGenuineRequest(messages, partsByMsgId);
  return (
    (request === undefined ? undefined : sessionEndTimeFor(messages, request.messageId)) ?? idleObservedAt ?? wallNow
  );
}

export function tickNow(status: SessionStatus | undefined, now: () => number): number {
  return status?.type === "busy" ? now() : Date.now();
}

interface GenuineRequestAnchor {
  readonly messageId: string;
  readonly anchor: number;
}

function lastGenuineRequest(
  messages: ReadonlyArray<Message>,
  partsByMsgId: PartsByMsgId,
): GenuineRequestAnchor | undefined {
  let request: GenuineRequestAnchor | undefined;
  let latestCreated: number | undefined;
  for (const msg of messages) {
    const parts = partsByMsgId.get(msg.id) ?? [];
    if (!isGenuineRequest(msg, parts)) continue;
    if (latestCreated === undefined || msg.time.created > latestCreated) {
      latestCreated = msg.time.created;
      request = { messageId: msg.id, anchor: requestAnchor(msg, parts) };
    }
  }
  return request;
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

function sessionEndTimeFor(messages: ReadonlyArray<Message>, parentId: string): number | undefined {
  let latest: number | undefined;
  for (const msg of messages) {
    if (msg.role !== "assistant" || msg.parentID !== parentId) continue;
    const completed = msg.time.completed;
    if (completed === undefined) continue;
    if (latest === undefined || completed > latest) latest = completed;
  }
  return latest;
}
