import { describe, expect, it } from "vitest";

import { formatSessionAge } from "../format";

describe("session age formatting", () => {
  it("T-FMT-01 omits lower units once session age reaches hours or days", () => {
    expect(formatSessionAge(-1)).toBe("< 1m");
    expect(formatSessionAge(0)).toBe("< 1m");
    expect(formatSessionAge(59 * 60_000)).toBe("59m");
    expect(formatSessionAge(61 * 60_000)).toBe("1h");
    expect(formatSessionAge(23 * 3_600_000 + 59 * 60_000)).toBe("23h");
    expect(formatSessionAge(25 * 3_600_000)).toBe("1d");
  });
});
