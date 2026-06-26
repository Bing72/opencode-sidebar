import type { JSX } from "solid-js";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";

import { HIDDEN_SESSIONS_KEY } from "../hidden-sessions";
import type { Envelope } from "../history";
import { createSessionActions, type SessionActionApi } from "../session-actions";
import type { SessionDeleteConfirmProps, SessionDeleteResult } from "../session-deletion";
import type { Session, SessionStatus } from "../types";

interface KvHarness {
  readonly values: Map<string, unknown>;
  readonly get: (key: string, fallback?: unknown) => unknown;
  readonly set: (key: string, value: unknown) => void;
}

interface ActionHarness {
  readonly actions: ReturnType<typeof createSessionActions>;
  readonly renderDialog: () => void;
  readonly prompt: () => SessionDeleteConfirmProps;
  readonly calls: ReadonlyArray<{ readonly sessionID: string }>;
  readonly sessions: () => ReadonlyArray<Session>;
  readonly statuses: () => ReadonlyMap<string, SessionStatus>;
  readonly history: () => ReadonlyMap<string, ReadonlyArray<Envelope>>;
  readonly children: () => ReadonlyMap<string, ReadonlyArray<Session>>;
  readonly sessionError: () => string | undefined;
  readonly refreshCalls: ReadonlyArray<boolean | undefined>;
  readonly caches: {
    readonly inFlight: Set<string>;
    readonly failed: Set<string>;
    readonly childrenInFlight: Set<string>;
    readonly childrenRetryAt: Map<string, number>;
  };
  readonly kv: KvHarness;
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

function kvStore(initial: unknown): KvHarness {
  const values = new Map<string, unknown>([[HIDDEN_SESSIONS_KEY, initial]]);
  return {
    values,
    get: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
    set: (key, value) => {
      values.set(key, value);
    },
  };
}

function actionHarness(deleteImpl: (sessionID: string) => Promise<SessionDeleteResult>): ActionHarness {
  const calls: Array<{ readonly sessionID: string }> = [];
  const prompts: SessionDeleteConfirmProps[] = [];
  let renderDialog: (() => JSX.Element) | undefined;
  const kv = kvStore(["s1", "s2"]);
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
  const [history, setHistory] = createSignal<ReadonlyMap<string, ReadonlyArray<Envelope>>>(
    new Map([
      ["s1", []],
      ["s2", []],
    ]),
  );
  const [children, setChildren] = createSignal<ReadonlyMap<string, ReadonlyArray<Session>>>(
    new Map([
      ["s1", []],
      ["s2", []],
    ]),
  );
  const refreshCalls: Array<boolean | undefined> = [];
  const caches = {
    inFlight: new Set(["s1"]),
    failed: new Set(["s1"]),
    childrenInFlight: new Set(["s1"]),
    childrenRetryAt: new Map([["s1", 123]]),
  };
  const api: SessionActionApi = {
    kv,
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
    signals: { sessions, setSessions, setSessionStatuses, setSessionError, setHistory, setChildren },
    caches,
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
    history,
    children,
    sessionError,
    refreshCalls,
    caches,
    kv,
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
    expect(harness.history().has("s1")).toBe(false);
    expect(harness.children().has("s1")).toBe(false);
    expect(harness.caches.inFlight.has("s1")).toBe(false);
    expect(harness.caches.failed.has("s1")).toBe(false);
    expect(harness.caches.childrenInFlight.has("s1")).toBe(false);
    expect(harness.caches.childrenRetryAt.has("s1")).toBe(false);
    expect([...harness.actions.hiddenSessionIds()]).toEqual(["s2"]);
    expect(harness.kv.values.get(HIDDEN_SESSIONS_KEY)).toEqual(["s2"]);
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
    expect([...harness.actions.hiddenSessionIds()]).toEqual(["s1", "s2"]);
    expect(harness.kv.values.get(HIDDEN_SESSIONS_KEY)).toEqual(["s1", "s2"]);
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
