import { describe, expect, it } from "vitest";

import {
  createGlobalSessionRefreshClient,
  createSessionRefresher,
  DEFAULT_SESSION_FETCH_LIMIT,
} from "../session-refresh";
import type { Session, SessionStatus } from "../types";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
}

interface GlobalSessionListQuery {
  readonly roots: true;
  readonly limit: number;
}

type StatusUpdate =
  | ReadonlyMap<string, SessionStatus>
  | ((previous: ReadonlyMap<string, SessionStatus>) => ReadonlyMap<string, SessionStatus>);

function session(id: string): Session {
  return {
    id,
    slug: id,
    projectID: "project-1",
    directory: "/repo",
    title: id,
    version: "1.17.9",
    time: { created: 9_000, updated: 10_000 },
  };
}

function applyStatusUpdate(
  previous: ReadonlyMap<string, SessionStatus>,
  update: StatusUpdate,
): ReadonlyMap<string, SessionStatus> {
  return typeof update === "function" ? update(previous) : update;
}

function deferred<T>(): Deferred<T> {
  let resolveValue: ((value: T) => void) | undefined;
  let rejectValue: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolveValue = resolve;
    rejectValue = reject;
  });
  if (resolveValue === undefined || rejectValue === undefined) throw new Error("Deferred was not initialized");
  return { promise, resolve: resolveValue, reject: rejectValue };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("session refresher", () => {
  it("T-REF-01 queues a forced refresh while a request is in flight", async () => {
    const firstList = deferred<ReadonlyArray<Session> | undefined>();
    const firstStatus = deferred<Readonly<Record<string, SessionStatus>> | undefined>();
    const secondList = deferred<ReadonlyArray<Session> | undefined>();
    const secondStatus = deferred<Readonly<Record<string, SessionStatus>> | undefined>();
    const listResponses = [firstList, secondList];
    const statusResponses = [firstStatus, secondStatus];
    const successForces: boolean[] = [];
    let listCalls = 0;

    const refresh = createSessionRefresher(
      {
        list: () => {
          listCalls += 1;
          const response = listResponses.shift();
          if (response === undefined) throw new Error("Unexpected list call");
          return response.promise;
        },
        status: () => {
          const response = statusResponses.shift();
          if (response === undefined) throw new Error("Unexpected status call");
          return response.promise;
        },
      },
      {
        isDisposed: () => false,
        now: () => 10_000,
        onRefreshSuccess: (force) => {
          successForces.push(force);
        },
        setError: () => undefined,
        setSessions: () => undefined,
        setStatuses: () => undefined,
      },
    );

    refresh(true);
    refresh(true);

    expect(listCalls).toBe(1);
    firstList.resolve([]);
    firstStatus.resolve({});
    await flushPromises();

    expect(successForces).toEqual([true]);
    expect(listCalls).toBe(2);
    secondList.resolve([]);
    secondStatus.resolve({});
    await flushPromises();

    expect(successForces).toEqual([true, true]);
  });

  it("T-REF-02 ignores rejected session refreshes after disposal", async () => {
    const list = deferred<ReadonlyArray<Session> | undefined>();
    const status = deferred<Readonly<Record<string, SessionStatus>> | undefined>();
    const errors: string[] = [];
    let disposed = false;
    const refresh = createSessionRefresher(
      {
        list: () => list.promise,
        status: () => status.promise,
      },
      {
        isDisposed: () => disposed,
        now: () => 10_000,
        setError: (message) => {
          if (message !== undefined) errors.push(message);
        },
        setSessions: () => undefined,
        setStatuses: () => undefined,
      },
    );

    refresh(true);
    disposed = true;
    list.reject(new Error("network failed"));
    status.resolve({});
    await flushPromises();

    expect(errors).toEqual([]);
  });

  it("T-REF-03 passes a bounded global roots query to session.list and keeps status paramless", async () => {
    const listQueries: GlobalSessionListQuery[] = [];
    const statusArgCounts: number[] = [];
    const client = createGlobalSessionRefreshClient(
      {
        list: (query: GlobalSessionListQuery) => {
          listQueries.push(query);
          return Promise.resolve({ data: [] });
        },
        status: (...args: readonly unknown[]) => {
          statusArgCounts.push(args.length);
          return Promise.resolve({ data: {} });
        },
      },
      { fetchLimit: 7 },
    );
    const refresh = createSessionRefresher(client, {
      isDisposed: () => false,
      now: () => 10_000,
      setError: () => undefined,
      setSessions: () => undefined,
      setStatuses: () => undefined,
    });

    refresh(true);
    await flushPromises();

    expect(listQueries).toEqual([
      {
        roots: true,
        limit: 7,
      },
    ]);
    expect(statusArgCounts).toEqual([0]);
  });

  it("T-REF-04 uses the default global fetch limit when no limit is provided", async () => {
    const listQueries: GlobalSessionListQuery[] = [];
    const client = createGlobalSessionRefreshClient({
      list: (query: GlobalSessionListQuery) => {
        listQueries.push(query);
        return Promise.resolve({ data: [] });
      },
      status: () => Promise.resolve({ data: {} }),
    });
    const refresh = createSessionRefresher(client, {
      isDisposed: () => false,
      now: () => 10_000,
      setError: () => undefined,
      setSessions: () => undefined,
      setStatuses: () => undefined,
    });

    refresh(true);
    await flushPromises();

    expect(listQueries).toEqual([{ roots: true, limit: DEFAULT_SESSION_FETCH_LIMIT }]);
  });

  it("T-REF-05 preserves omitted active statuses while applying explicit refresh statuses", async () => {
    let currentStatuses: ReadonlyMap<string, SessionStatus> = new Map([
      ["external-busy", { type: "busy" }],
      ["external-retry", { type: "retry", attempt: 1, message: "Rate limited", next: 20_000 }],
      ["explicit-idle", { type: "retry", attempt: 2, message: "Backoff", next: 30_000 }],
      ["stale-idle", { type: "idle" }],
    ]);
    const refresh = createSessionRefresher(
      {
        list: () => Promise.resolve([session("external-busy"), session("external-retry"), session("explicit-idle")]),
        status: () =>
          Promise.resolve({
            "explicit-idle": { type: "idle" },
            "new-busy": { type: "busy" },
          }),
      },
      {
        isDisposed: () => false,
        now: () => 10_000,
        setError: () => undefined,
        setSessions: () => undefined,
        setStatuses: (update: StatusUpdate) => {
          currentStatuses = applyStatusUpdate(currentStatuses, update);
        },
      },
    );

    refresh(true);
    await flushPromises();

    expect(currentStatuses.get("external-busy")).toEqual({ type: "busy" });
    expect(currentStatuses.get("external-retry")).toEqual({
      type: "retry",
      attempt: 1,
      message: "Rate limited",
      next: 20_000,
    });
    expect(currentStatuses.get("explicit-idle")).toEqual({ type: "idle" });
    expect(currentStatuses.get("new-busy")).toEqual({ type: "busy" });
    expect(currentStatuses.has("stale-idle")).toBe(false);
  });

  it("T-REF-06 notifies the optional success hook with the forced refresh flag", async () => {
    const successForces: boolean[] = [];
    const sink = {
      isDisposed: () => false,
      now: () => 10_000,
      onRefreshSuccess: (force: boolean) => {
        successForces.push(force);
      },
      setError: () => undefined,
      setSessions: () => undefined,
      setStatuses: () => undefined,
    };
    const refresh = createSessionRefresher(
      {
        list: () => Promise.resolve([session("success")]),
        status: () => Promise.resolve({}),
      },
      sink,
    );

    refresh(true);
    await flushPromises();

    expect(successForces).toEqual([true]);
  });
});
