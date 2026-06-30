import { describe, expect, it } from "vitest";

import { formatDuration, formatLiveDuration, formatSessionAge } from "../format";

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

describe("duration formatting", () => {
  it("T-FMT-02 omits spaces between duration units", () => {
    expect(formatDuration(10 * 60_000 + 3_000)).toBe("10m3s");
    expect(formatDuration(3_600_000 + 2 * 60_000)).toBe("1h2m");
    expect(formatLiveDuration(3_600_000 + 2 * 60_000)).toBe("1h2m");
  });
});
