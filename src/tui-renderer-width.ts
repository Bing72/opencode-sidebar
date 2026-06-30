import { createSignal } from "solid-js";

export type RendererResizeHandler = (width: number) => void;

export interface RendererWidthSource {
  readonly width: number;
  readonly on: (event: "resize", handler: RendererResizeHandler) => void;
  readonly off: (event: "resize", handler: RendererResizeHandler) => void;
}

export interface RendererWidthTracker {
  readonly current: () => number;
  readonly dispose: () => void;
}

export function createRendererWidthTracker(renderer: RendererWidthSource): RendererWidthTracker {
  const [current, setCurrent] = createSignal(renderer.width);
  const onResize = (width: number): void => {
    setCurrent(width);
  };
  renderer.on("resize", onResize);
  return {
    current,
    dispose: () => renderer.off("resize", onResize),
  };
}
