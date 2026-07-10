import { describe, expect, it } from "vitest";

import {
  PINNED_SESSION_IDS_KEY,
  parsePinnedSessionIds,
  removePinnedSessionId,
  serializePinnedSessionIds,
  togglePinnedSessionId,
} from "../session-preferences";

describe("session preferences", () => {
  it("T-PREF-00 namespaces persisted pins with the plugin ID", () => {
    expect(PINNED_SESSION_IDS_KEY).toBe("opencode-sidebar:pinned-session-ids");
  });

  it("T-PREF-01 parses only unique non-empty session IDs", () => {
    expect(parsePinnedSessionIds(["s1", "", 2, "s1", "s2"])).toEqual(new Set(["s1", "s2"]));
    expect(parsePinnedSessionIds({ session: "s1" })).toEqual(new Set());
  });

  it("T-PREF-02 toggles pins without mutating the previous set", () => {
    const original = new Set(["s1"]);
    const removed = togglePinnedSessionId(original, "s1");
    const added = togglePinnedSessionId(original, "s2");

    expect(original).toEqual(new Set(["s1"]));
    expect(removed).toEqual(new Set());
    expect(added).toEqual(new Set(["s1", "s2"]));
  });

  it("T-PREF-03 removes deleted pins and serializes the persisted value", () => {
    const original = new Set(["s1", "s2"]);
    const changed = removePinnedSessionId(original, "s1");

    expect(changed).toEqual(new Set(["s2"]));
    expect(serializePinnedSessionIds(changed)).toEqual(["s2"]);
    expect(removePinnedSessionId(original, "missing")).toBe(original);
  });
});
