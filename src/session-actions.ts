import type { Accessor, Setter } from "solid-js";

import {
  deleteSessionById,
  openSessionDeleteConfirmation,
  type SessionDeleteClient,
  type SessionDeleteConfirmationUi,
} from "./session-deletion";
import type { Session } from "./types";

export interface SessionActionApi {
  readonly ui: SessionDeleteConfirmationUi;
  readonly client: {
    readonly session: SessionDeleteClient;
  };
}

interface SessionActionSignals {
  readonly sessions: Accessor<ReadonlyArray<Session>>;
  readonly setSessionError: Setter<string | undefined>;
}

export interface SessionActionControllerArgs {
  readonly api: SessionActionApi;
  readonly signals: SessionActionSignals;
  readonly discardSession: (sessionId: string) => void;
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
        args.discardSession(sessionId);
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
