import type { JSX } from "solid-js";
import { describe, expect, it } from "vitest";

import {
  deleteSessionById,
  openSessionDeleteConfirmation,
  type SessionDeleteClient,
  type SessionDeleteConfirmProps,
  SessionDeleteUnexpectedResultError,
  sessionDeletionCopy,
} from "../session-deletion";

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} was not captured`);
  return value;
}

function dialogHarness(): {
  readonly ui: {
    readonly DialogConfirm: (props: SessionDeleteConfirmProps) => JSX.Element;
    readonly dialog: {
      readonly replace: (render: () => JSX.Element) => void;
      readonly clear: () => void;
    };
  };
  readonly render: () => void;
  readonly props: () => SessionDeleteConfirmProps;
  readonly clearCount: () => number;
} {
  const prompts: SessionDeleteConfirmProps[] = [];
  let clearCount = 0;
  let renderDialog: (() => JSX.Element) | undefined;

  return {
    ui: {
      DialogConfirm: (props) => {
        prompts.push(props);
        return null;
      },
      dialog: {
        replace: (render) => {
          renderDialog = render;
        },
        clear: () => {
          clearCount += 1;
        },
      },
    },
    render: () => {
      required(renderDialog, "dialog renderer")();
    },
    props: () => required(prompts.at(-1), "DialogConfirm props"),
    clearCount: () => clearCount,
  };
}

describe("session deletion confirmation", () => {
  it("T-DEL-01 opens confirmation copy without deleting immediately", () => {
    const confirmed: string[] = [];
    const harness = dialogHarness();

    openSessionDeleteConfirmation({
      ui: harness.ui,
      sessionID: "s1",
      sessionTitle: "Build fix",
      onConfirm: (sessionID) => confirmed.push(sessionID),
    });

    expect(confirmed).toEqual([]);
    harness.render();
    const copy = sessionDeletionCopy("Build fix");
    expect(harness.props().title).toBe(copy.title);
    expect(harness.props().message).toContain("Build fix");
    expect(confirmed).toEqual([]);
  });

  it("T-DEL-02 clears the dialog without deleting when cancelled", () => {
    const confirmed: string[] = [];
    const harness = dialogHarness();

    openSessionDeleteConfirmation({
      ui: harness.ui,
      sessionID: "s1",
      sessionTitle: "Build fix",
      onConfirm: (sessionID) => confirmed.push(sessionID),
    });
    harness.render();

    harness.props().onCancel();

    expect(harness.clearCount()).toBe(1);
    expect(confirmed).toEqual([]);
  });

  it("T-DEL-03 clears the dialog and calls delete only after confirmation", () => {
    const confirmed: string[] = [];
    const harness = dialogHarness();

    openSessionDeleteConfirmation({
      ui: harness.ui,
      sessionID: "s1",
      sessionTitle: "Build fix",
      onConfirm: (sessionID) => confirmed.push(sessionID),
    });
    harness.render();

    harness.props().onConfirm();

    expect(harness.clearCount()).toBe(1);
    expect(confirmed).toEqual(["s1"]);
  });
});

describe("deleteSessionById", () => {
  it("T-DEL-04 calls the session delete API with the sessionID", async () => {
    const calls: Array<{ readonly sessionID: string }> = [];
    const client: SessionDeleteClient = {
      delete: async (parameters) => {
        calls.push(parameters);
        return { data: true };
      },
    };

    await deleteSessionById(client, "s-delete");

    expect(calls).toEqual([{ sessionID: "s-delete" }]);
  });

  it("T-DEL-05 rejects SDK error responses", async () => {
    const error = new Error("missing session");
    const client: SessionDeleteClient = {
      delete: async () => ({ error }),
    };

    await expect(deleteSessionById(client, "s-delete")).rejects.toBe(error);
  });

  it("T-DEL-06 rejects non-true delete responses", async () => {
    const falseClient: SessionDeleteClient = {
      delete: async () => ({ data: false }),
    };
    const emptyClient: SessionDeleteClient = {
      delete: async () => ({}),
    };

    await expect(deleteSessionById(falseClient, "s-delete")).rejects.toBeInstanceOf(SessionDeleteUnexpectedResultError);
    await expect(deleteSessionById(emptyClient, "s-delete")).rejects.toBeInstanceOf(SessionDeleteUnexpectedResultError);
  });
});
