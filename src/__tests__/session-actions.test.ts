import type { JSX } from "solid-js";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";

import { createSessionActions, type SessionActionApi } from "../session-actions";
import type { SessionDeleteConfirmProps, SessionDeleteResult } from "../session-deletion";
import type { Session, SessionStatus } from "../types";

interface ActionHarness {
  readonly actions: ReturnType<typeof createSessionActions>;
  readonly renderDialog: () => void;
  readonly prompt: () => SessionDeleteConfirmProps;
  readonly calls: ReadonlyArray<{ readonly sessionID: string }>;
  readonly sessions: () => ReadonlyArray<Session>;
  readonly statuses: () => ReadonlyMap<string, SessionStatus>;
  readonly discardedSessions: ReadonlyArray<string>;
  readonly droppedChildren: ReadonlyArray<string>;
  readonly droppedHistory: ReadonlyArray<string>;
  readonly sessionError: () => string | undefined;
  readonly refreshCalls: ReadonlyArray<boolean | undefined>;
}

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (reason: unknown) => void;
}

function session(id: string, title: string): Session {
  return {
    id,
    slug: id,
    projectID: "project-1",
    directory: "/repo",
    title,
    version: "1.17.9",
    time: { created: 1_000, updated: 2_000 },
  };
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} was not captured`);
  return value;
}

function deferred<Value>(): Deferred<Value> {
  let resolve: ((value: Value) => void) | undefined;
  let reject: ((reason: unknown) => void) | undefined;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve: required(resolve, "deferred resolve"),
    reject: required(reject, "deferred reject"),
  };
}

function actionHarness(deleteImpl: (sessionID: string) => Promise<SessionDeleteResult>): ActionHarness {
  const calls: Array<{ readonly sessionID: string }> = [];
  const prompts: SessionDeleteConfirmProps[] = [];
  let renderDialog: (() => JSX.Element) | undefined;
  const [sessions, setSessions] = createSignal<ReadonlyArray<Session>>([
    session("s1", "Delete me"),
    session("s2", "Keep me"),
  ]);
  const [statuses, setSessionStatuses] = createSignal<ReadonlyMap<string, SessionStatus>>(
    new Map([
      ["s1", { type: "idle" }],
      ["s2", { type: "busy" }],
    ]),
  );
  const [sessionError, setSessionError] = createSignal<string | undefined>("previous error");
  const droppedChildren: string[] = [];
  const droppedHistory: string[] = [];
  const discardedSessions: string[] = [];
  const refreshCalls: Array<boolean | undefined> = [];
  const api: SessionActionApi = {
    ui: {
      DialogConfirm: (props) => {
        prompts.push(props);
        return null;
      },
      dialog: {
        replace: (render) => {
          renderDialog = render;
        },
        clear: () => undefined,
      },
    },
    client: {
      session: {
        delete: async (parameters) => {
          calls.push(parameters);
          return deleteImpl(parameters.sessionID);
        },
      },
    },
  };
  const actions = createSessionActions({
    api,
    signals: { sessions, setSessionError },
    discardSession: (sessionId) => {
      discardedSessions.push(sessionId);
      setSessions((previous) => previous.filter((item) => item.id !== sessionId));
      setSessionStatuses((previous) => {
        const next = new Map(previous);
        next.delete(sessionId);
        return next;
      });
      droppedChildren.push(sessionId);
      droppedHistory.push(sessionId);
    },
    isDisposed: () => false,
    refreshSessions: (force) => refreshCalls.push(force),
  });

  return {
    actions,
    renderDialog: () => {
      required(renderDialog, "dialog renderer")();
    },
    prompt: () => required(prompts.at(-1), "DialogConfirm props"),
    calls,
    sessions,
    statuses,
    discardedSessions,
    droppedChildren,
    droppedHistory,
    sessionError,
    refreshCalls,
  };
}

async function flushAsyncTasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("session action controller", () => {
  it("T-ACT-01 confirms deletion before cleaning session state", async () => {
    const harness = actionHarness(async () => ({ data: true }));

    harness.actions.confirmDeleteSession("s1");

    expect(harness.calls).toEqual([]);
    harness.renderDialog();
    expect(harness.prompt().message).toContain("Delete me");

    harness.prompt().onConfirm();
    await flushAsyncTasks();

    expect(harness.calls).toEqual([{ sessionID: "s1" }]);
    expect(harness.sessions().map((item) => item.id)).toEqual(["s2"]);
    expect(harness.statuses().has("s1")).toBe(false);
    expect(harness.discardedSessions).toEqual(["s1"]);
    expect(harness.droppedChildren).toEqual(["s1"]);
    expect(harness.droppedHistory).toEqual(["s1"]);
    expect(harness.sessionError()).toBeUndefined();
    expect(harness.refreshCalls).toEqual([true]);
  });

  it("T-ACT-02 preserves session state and reports delete failures", async () => {
    const harness = actionHarness(async () => ({ error: new Error("boom") }));

    harness.actions.confirmDeleteSession("s1");
    harness.renderDialog();
    harness.prompt().onConfirm();
    await flushAsyncTasks();

    expect(harness.calls).toEqual([{ sessionID: "s1" }]);
    expect(harness.sessions().map((item) => item.id)).toEqual(["s1", "s2"]);
    expect(harness.statuses().has("s1")).toBe(true);
    expect(harness.discardedSessions).toEqual([]);
    expect(harness.sessionError()).toBe("Failed to delete session: boom");
    expect(harness.refreshCalls).toEqual([]);
  });

  it("T-ACT-03 ignores duplicate delete confirmations while deletion is pending", async () => {
    const pendingDelete = deferred<SessionDeleteResult>();
    const harness = actionHarness(async () => pendingDelete.promise);

    harness.actions.confirmDeleteSession("s1");
    harness.renderDialog();
    const prompt = harness.prompt();

    prompt.onConfirm();
    prompt.onConfirm();
    await flushAsyncTasks();

    expect(harness.calls).toEqual([{ sessionID: "s1" }]);
    expect(harness.sessions().map((item) => item.id)).toEqual(["s1", "s2"]);

    pendingDelete.resolve({ data: true });
    await flushAsyncTasks();
    prompt.onConfirm();
    await flushAsyncTasks();

    expect(harness.calls).toEqual([{ sessionID: "s1" }]);
    expect(harness.sessions().map((item) => item.id)).toEqual(["s2"]);
    expect(harness.sessionError()).toBeUndefined();
  });
});
