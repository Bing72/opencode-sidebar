import type { JSX } from "solid-js";

export interface SessionDeletionCopy {
  readonly title: string;
  readonly message: string;
}

export interface SessionDeleteConfirmProps {
  readonly title: string;
  readonly message: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export interface SessionDeleteConfirmationUi {
  readonly DialogConfirm: (props: SessionDeleteConfirmProps) => JSX.Element;
  readonly dialog: {
    readonly replace: (render: () => JSX.Element) => void;
    readonly clear: () => void;
  };
}

export interface OpenSessionDeleteConfirmationArgs {
  readonly ui: SessionDeleteConfirmationUi;
  readonly sessionID: string;
  readonly sessionTitle: string;
  readonly onConfirm: (sessionID: string) => void;
}

export interface SessionDeleteParameters {
  readonly sessionID: string;
}

export interface SessionDeleteResult {
  readonly data?: boolean | undefined;
  readonly error?: unknown | undefined;
}

export interface SessionDeleteClient {
  readonly delete: (parameters: SessionDeleteParameters) => Promise<SessionDeleteResult>;
}

export class SessionDeleteUnexpectedResultError extends Error {
  readonly name = "SessionDeleteUnexpectedResultError";

  constructor(
    readonly sessionID: string,
    readonly data: boolean | undefined,
  ) {
    super(`Session ${sessionID} delete did not return true`);
  }
}

export class SessionDeleteSdkError extends Error {
  readonly name = "SessionDeleteSdkError";

  constructor(
    readonly sessionID: string,
    cause: unknown,
  ) {
    super(`Failed to delete session ${sessionID}`, { cause });
  }
}

export function sessionDeletionCopy(sessionTitle: string): SessionDeletionCopy {
  return {
    title: "Delete session?",
    message: `Delete "${sessionTitle}" permanently? This cannot be undone.`,
  };
}

export function openSessionDeleteConfirmation(args: OpenSessionDeleteConfirmationArgs): void {
  const copy = sessionDeletionCopy(args.sessionTitle);
  args.ui.dialog.replace(() =>
    args.ui.DialogConfirm({
      title: copy.title,
      message: copy.message,
      onCancel: () => args.ui.dialog.clear(),
      onConfirm: () => {
        args.ui.dialog.clear();
        args.onConfirm(args.sessionID);
      },
    }),
  );
}

export async function deleteSessionById(client: SessionDeleteClient, sessionID: string): Promise<void> {
  const result = await client.delete({ sessionID });
  if (result.error !== undefined) {
    if (result.error instanceof Error) throw result.error;
    throw new SessionDeleteSdkError(sessionID, result.error);
  }
  if (result.data !== true) throw new SessionDeleteUnexpectedResultError(sessionID, result.data);
}
