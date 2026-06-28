import type { Accessor, Setter } from "solid-js";

import type { Envelope } from "./history";
import {
  deleteSessionById,
  openSessionDeleteConfirmation,
  type SessionDeleteClient,
  type SessionDeleteConfirmationUi,
} from "./session-deletion";
import type { Session, SessionStatus } from "./types";

export interface SessionActionApi {
  readonly ui: SessionDeleteConfirmationUi;
  readonly client: {
    readonly session: SessionDeleteClient;
  };
}

interface SessionActionSignals {
  readonly sessions: Accessor<ReadonlyArray<Session>>;
  readonly setSessions: Setter<ReadonlyArray<Session>>;
  readonly setSessionStatuses: Setter<ReadonlyMap<string, SessionStatus>>;
  readonly setSessionError: Setter<string | undefined>;
  readonly setHistory: Setter<ReadonlyMap<string, ReadonlyArray<Envelope>>>;
  readonly setChildren: Setter<ReadonlyMap<string, ReadonlyArray<Session>>>;
}

interface SessionActionCaches {
  readonly inFlight: Set<string>;
  readonly failed: Set<string>;
  readonly childrenInFlight: Set<string>;
  readonly childrenRetryAt: Map<string, number>;
}

export interface SessionActionControllerArgs {
  readonly api: SessionActionApi;
  readonly signals: SessionActionSignals;
  readonly caches: SessionActionCaches;
  readonly isDisposed: () => boolean;
  readonly refreshSessions: (force?: boolean) => void;
}

export interface SessionActions {
  readonly confirmDeleteSession: (sessionId: string) => void;
}

export function createSessionActions(args: SessionActionControllerArgs): SessionActions {
  const deletingSessionIds = new Set<string>();

  const sessionTitleFor = (sessionId: string): string => {
    const title = args.signals.sessions().find((session) => session.id === sessionId)?.title;
    return title === undefined || title.length === 0 ? "Untitled session" : title;
  };

  const deleteSession = (sessionId: string): void => {
    if (deletingSessionIds.has(sessionId)) return;
    if (!args.signals.sessions().some((session) => session.id === sessionId)) return;
    deletingSessionIds.add(sessionId);
    deleteSessionById(args.api.client.session, sessionId)
      .then(() => {
        if (args.isDisposed()) return;
        args.signals.setSessions((prev) => prev.filter((session) => session.id !== sessionId));
        args.signals.setSessionStatuses((prev) => withoutMapEntry(prev, sessionId));
        args.signals.setHistory((prev) => withoutMapEntry(prev, sessionId));
        args.signals.setChildren((prev) => withoutMapEntry(prev, sessionId));
        args.caches.inFlight.delete(sessionId);
        args.caches.failed.delete(sessionId);
        args.caches.childrenInFlight.delete(sessionId);
        args.caches.childrenRetryAt.delete(sessionId);
        args.signals.setSessionError(undefined);
        args.refreshSessions(true);
      })
      .catch((error: unknown) => {
        if (args.isDisposed()) return;
        const message =
          error instanceof Error ? `Failed to delete session: ${error.message}` : "Failed to delete session";
        args.signals.setSessionError(message);
      })
      .finally(() => {
        deletingSessionIds.delete(sessionId);
      });
  };

  const confirmDeleteSession = (sessionId: string): void => {
    openSessionDeleteConfirmation({
      ui: args.api.ui,
      sessionID: sessionId,
      sessionTitle: sessionTitleFor(sessionId),
      onConfirm: deleteSession,
    });
  };

  return { confirmDeleteSession };
}

function withoutMapEntry<Value>(map: ReadonlyMap<string, Value>, key: string): Map<string, Value> {
  const next = new Map(map);
  next.delete(key);
  return next;
}
