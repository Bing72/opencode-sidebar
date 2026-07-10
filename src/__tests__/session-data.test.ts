import { describe, expect, it } from "vitest";

import { loadSessionChildren, loadSessionHistory } from "../session-data";
import type { Message, Part, Session } from "../types";
import { textPart, userMsg } from "./factories";

interface RequestOptions {
  readonly throwOnError: true;
}

function session(id: string): Session {
  return {
    id,
    slug: id,
    projectID: "project-1",
    directory: "/repo",
    title: id,
    version: "1.17.18",
    time: { created: 1_000, updated: 2_000 },
  };
}

describe("session data client", () => {
  it("T-DATA-01 loads messages through the SDK throw-on-error path", async () => {
    const message = userMsg(1_000, "u1");
    const parts = [textPart("u1", "hello", 1_000)];
    const calls: Array<{
      readonly parameters: { readonly sessionID: string; readonly limit: number };
      readonly options: RequestOptions;
    }> = [];

    const history = await loadSessionHistory(
      {
        messages: (parameters, options) => {
          calls.push({ parameters, options });
          return Promise.resolve({ data: [{ info: message, parts }] });
        },
      },
      "s1",
      150,
    );

    expect(calls).toEqual([
      {
        parameters: { sessionID: "s1", limit: 150 },
        options: { throwOnError: true },
      },
    ]);
    expect(history).toEqual([{ info: message, parts }]);
  });

  it("T-DATA-02 propagates message errors instead of returning an empty history", async () => {
    await expect(
      loadSessionHistory(
        {
          messages: (_parameters, options) =>
            options.throwOnError
              ? Promise.reject(new Error("messages unavailable"))
              : Promise.resolve({ data: [] as Array<{ readonly info: Message; readonly parts: Part[] }> }),
        },
        "s1",
        150,
      ),
    ).rejects.toThrow("messages unavailable");
  });

  it("T-DATA-03 loads child sessions through the SDK throw-on-error path", async () => {
    const child = session("child-1");
    const calls: Array<{
      readonly parameters: { readonly sessionID: string };
      readonly options: RequestOptions;
    }> = [];

    const children = await loadSessionChildren(
      {
        children: (parameters, options) => {
          calls.push({ parameters, options });
          return Promise.resolve({ data: [child] });
        },
      },
      "parent-1",
    );

    expect(calls).toEqual([
      {
        parameters: { sessionID: "parent-1" },
        options: { throwOnError: true },
      },
    ]);
    expect(children).toEqual([child]);
  });
});
