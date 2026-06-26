import { describe, expect, it } from "vitest";

import {
  addHiddenSessionId,
  clearHiddenSessionIds,
  HIDDEN_SESSIONS_KEY,
  hiddenSessionIdsFromValue,
  persistHiddenSessionIds,
  readHiddenSessionIds,
  removeHiddenSessionId,
} from "../hidden-sessions";

function kvStore(initial?: unknown): {
  readonly get: (key: string, fallback?: unknown) => unknown;
  readonly set: (key: string, value: unknown) => void;
  readonly values: Map<string, unknown>;
} {
  const values = new Map<string, unknown>();
  if (initial !== undefined) values.set(HIDDEN_SESSIONS_KEY, initial);
  return {
    values,
    get: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
    set: (key, value) => values.set(key, value),
  };
}

describe("hidden session persistence", () => {
  it("T-HIDE-01 reads only non-empty session ids from plugin-local storage", () => {
    const ids = readHiddenSessionIds(kvStore(["s1", "", 123, "s2", "s1"]));

    expect([...ids]).toEqual(["s1", "s2"]);
    expect([...hiddenSessionIdsFromValue("bad-storage")]).toEqual([]);
  });

  it("T-HIDE-02 writes hidden ids without destructive session operations", () => {
    const kv = kvStore();
    const ids = addHiddenSessionId(new Set(["s1"]), "s2");

    persistHiddenSessionIds(kv, ids);

    expect(kv.values.get(HIDDEN_SESSIONS_KEY)).toEqual(["s1", "s2"]);
  });

  it("T-HIDE-03 clears hidden ids for the footer recovery action", () => {
    expect([...clearHiddenSessionIds()]).toEqual([]);
  });

  it("T-HIDE-04 removes a deleted session from persisted hidden ids", () => {
    const ids = removeHiddenSessionId(new Set(["s1", "s2"]), "s1");

    expect([...ids]).toEqual(["s2"]);
  });
});
