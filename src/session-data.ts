import type { Envelope } from "./history";
import type { Message, Part, Session } from "./types";

interface ThrowOnErrorOptions {
  readonly throwOnError: true;
}

interface DataResponse<Data> {
  readonly data: Data;
}

interface SessionMessageSource {
  readonly messages: (
    parameters: { readonly sessionID: string; readonly limit: number },
    options: ThrowOnErrorOptions,
  ) => Promise<DataResponse<ReadonlyArray<{ readonly info: Message; readonly parts: ReadonlyArray<Part> }>>>;
}

interface SessionChildrenSource {
  readonly children: (
    parameters: { readonly sessionID: string },
    options: ThrowOnErrorOptions,
  ) => Promise<DataResponse<ReadonlyArray<Session>>>;
}

const THROW_ON_ERROR = { throwOnError: true } as const;

export function loadSessionHistory(
  source: SessionMessageSource,
  sessionId: string,
  limit: number,
): Promise<ReadonlyArray<Envelope>> {
  return source.messages({ sessionID: sessionId, limit }, THROW_ON_ERROR).then((response) => response.data);
}

export function loadSessionChildren(source: SessionChildrenSource, sessionId: string): Promise<ReadonlyArray<Session>> {
  return source.children({ sessionID: sessionId }, THROW_ON_ERROR).then((response) => response.data);
}
