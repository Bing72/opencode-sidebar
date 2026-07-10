import { describe, expect, it } from "vitest";

import { computeElapsed, displayNow } from "../elapsed";
import { assistantMsg, partsMap, textPart, userMsg } from "./factories";

describe("elapsed timer", () => {
  it("T-EL-01 anchors busy elapsed to the genuine user text part start", () => {
    // Given
    const user = userMsg(15_000, "u1");
    const partsByMsgId = partsMap(["u1", [textPart("u1", "Run the task", 1_000)]]);

    // When
    const elapsed = computeElapsed([user], partsByMsgId, { type: "busy" }, 16_000);

    // Then
    expect(elapsed).toEqual({ running: true, ms: 15_000, hasData: true });
  });

  it("T-EL-02 falls back to the user message created time when the text part has no start time", () => {
    // Given
    const user = userMsg(15_000, "u1");
    const partsByMsgId = partsMap(["u1", [textPart("u1", "Run the task", undefined)]]);

    // When
    const elapsed = computeElapsed([user], partsByMsgId, { type: "busy" }, 18_000);

    // Then
    expect(elapsed).toEqual({ running: true, ms: 3_000, hasData: true });
  });

  it("T-EL-03 caps idle elapsed at the assistant completion time", () => {
    // Given
    const user = userMsg(1_000, "u1");
    const assistant = assistantMsg(2_000, { completed: 6_000, id: "a1" });
    const partsByMsgId = partsMap(["u1", [textPart("u1", "Run the task", 1_000)]]);

    // When
    const now = displayNow({ type: "idle" }, [user, assistant], partsByMsgId, 30_000, 10_000);
    const elapsed = computeElapsed([user, assistant], partsByMsgId, { type: "idle" }, now);

    // Then
    expect(now).toBe(6_000);
    expect(elapsed).toEqual({ running: false, ms: 5_000, hasData: true });
  });

  it("T-EL-04 uses the observed idle time when no assistant completion is loaded", () => {
    // Given
    const user = userMsg(1_000, "u1");
    const partsByMsgId = partsMap(["u1", [textPart("u1", "Run the task", 1_000)]]);

    // When
    const now = displayNow({ type: "idle" }, [user], partsByMsgId, 30_000, 6_000);
    const elapsed = computeElapsed([user], partsByMsgId, { type: "idle" }, now);

    // Then
    expect(now).toBe(6_000);
    expect(elapsed).toEqual({ running: false, ms: 5_000, hasData: true });
  });

  it("T-EL-05 keeps wall elapsed live while agent work duration stays capped after idle", () => {
    // Given
    const user = userMsg(1_000, "u1");
    const partsByMsgId = partsMap(["u1", [textPart("u1", "Run the task", 1_000)]]);

    // When
    const wallElapsed = computeElapsed([user], partsByMsgId, { type: "idle" }, 30_000);
    const workNow = displayNow({ type: "idle" }, [user], partsByMsgId, 30_000, 6_000);
    const workElapsed = computeElapsed([user], partsByMsgId, { type: "idle" }, workNow);

    // Then
    expect(wallElapsed).toEqual({ running: false, ms: 29_000, hasData: true });
    expect(workElapsed).toEqual({ running: false, ms: 5_000, hasData: true });
  });

  it("T-EL-06 ignores an earlier turn completion when the latest genuine request has not completed", () => {
    const firstUser = userMsg(1_000, "u1");
    const firstAssistant = assistantMsg(2_000, { completed: 6_000, id: "a1" });
    const latestUser = userMsg(10_000, "u2");
    const partsByMsgId = partsMap(
      ["u1", [textPart("u1", "First request", 1_000)]],
      ["u2", [textPart("u2", "Latest request", 10_000)]],
    );

    const now = displayNow({ type: "idle" }, [firstUser, firstAssistant, latestUser], partsByMsgId, 30_000, 15_000);
    const elapsed = computeElapsed([firstUser, firstAssistant, latestUser], partsByMsgId, { type: "idle" }, now);

    expect(now).toBe(15_000);
    expect(elapsed).toEqual({ running: false, ms: 5_000, hasData: true });
  });

  it("T-EL-07 matches completion by parent message even when text timing overlaps the previous turn", () => {
    const firstUser = userMsg(1_000, "u1");
    const firstAssistant = assistantMsg(2_000, { completed: 6_000, id: "a1", parentID: "u1" });
    const latestUser = userMsg(10_000, "u2");
    const latestAssistant = assistantMsg(11_000, { completed: 18_000, id: "a2", parentID: "u2" });
    const partsByMsgId = partsMap(
      ["u1", [textPart("u1", "First request", 1_000)]],
      ["u2", [textPart("u2", "Latest request", 5_000)]],
    );

    const now = displayNow(
      { type: "idle" },
      [firstUser, firstAssistant, latestUser, latestAssistant],
      partsByMsgId,
      30_000,
      20_000,
    );
    const elapsed = computeElapsed(
      [firstUser, firstAssistant, latestUser, latestAssistant],
      partsByMsgId,
      { type: "idle" },
      now,
    );

    expect(now).toBe(18_000);
    expect(elapsed).toEqual({ running: false, ms: 13_000, hasData: true });
  });
});
