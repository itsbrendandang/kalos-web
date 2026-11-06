import { describe, expect, it } from "vitest";
import { dataNumber, linear, niceTicks } from "@/components/campaign/data/svg";

describe("linear", () => {
  it("maps the domain onto the range, endpoints included", () => {
    const f = linear([0, 10], [0, 320]);
    expect(f(0)).toBe(0);
    expect(f(5)).toBe(160);
    expect(f(10)).toBe(320);
  });
  it("maps a zero-width domain to the middle of the range", () => {
    expect(linear([3, 3], [0, 100])(3)).toBe(50);
  });
});

describe("niceTicks", () => {
  it("returns round ticks that cover the domain", () => {
    expect(niceTicks(0, 10, 4)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceTicks(0.1, 0.9, 4)).toEqual([0.2, 0.4, 0.6, 0.8]);
  });
  it("returns the single value for a zero-width domain and nothing for non-finite input", () => {
    expect(niceTicks(4, 4)).toEqual([4]);
    expect(niceTicks(NaN, 3)).toEqual([]);
  });
  it("keeps every tick inside the domain", () => {
    const t = niceTicks(23.7, 63.3, 3);
    expect(t.every((v) => v >= 23.7 && v <= 63.3 + 1e-9)).toBe(true);
  });
});

describe("dataNumber", () => {
  it("shows up to four significant digits and n/a for missing values", () => {
    expect(dataNumber(0.00123456)).toBe("0.001235");
    expect(dataNumber(63.29512)).toBe("63.3");
    expect(dataNumber(null)).toBe("n/a");
    expect(dataNumber(Number.NaN)).toBe("n/a");
  });
});
