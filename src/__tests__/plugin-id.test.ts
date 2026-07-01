import { describe, expect, it } from "vitest";

import plugin from "../tui";

describe("plugin identity", () => {
  it("T-PLUGIN-01 uses opencode-sidebar as the canonical plugin id", () => {
    expect(plugin.id).toBe("opencode-sidebar");
  });
});
