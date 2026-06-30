import { describe, expect, it } from "vitest";

import {
  createRendererWidthTracker,
  type RendererResizeHandler,
  type RendererWidthSource,
} from "../tui-renderer-width";
import { currentSessionBottomTitle } from "../ui-panels";

class RendererWidthHarness implements RendererWidthSource {
  width: number;
  private handler: RendererResizeHandler | undefined;

  constructor(width: number) {
    this.width = width;
  }

  on(_event: "resize", handler: RendererResizeHandler): void {
    this.handler = handler;
  }

  off(_event: "resize", handler: RendererResizeHandler): void {
    if (this.handler === handler) this.handler = undefined;
  }

  resize(width: number): void {
    this.width = width;
    this.handler?.(width);
  }
}

describe("renderer width tracker", () => {
  it("T-TUI-01 feeds renderer resize width into app_bottom session title visibility", () => {
    const renderer = new RendererWidthHarness(121);
    const tracker = createRendererWidthTracker(renderer);
    const titleArgs = {
      route: { name: "session", params: { sessionID: "s1" } },
      getSession: () => ({ title: "세션 분석" }),
    };

    expect(currentSessionBottomTitle({ ...titleArgs, width: tracker.current() })).toBeUndefined();

    renderer.resize(120);

    expect(currentSessionBottomTitle({ ...titleArgs, width: tracker.current() })).toBe("세션 분석");

    renderer.resize(121);

    expect(currentSessionBottomTitle({ ...titleArgs, width: tracker.current() })).toBeUndefined();
  });

  it("T-TUI-02 stops applying resize updates after disposal", () => {
    const renderer = new RendererWidthHarness(120);
    const tracker = createRendererWidthTracker(renderer);

    tracker.dispose();
    renderer.resize(80);

    expect(tracker.current()).toBe(120);
  });
});
