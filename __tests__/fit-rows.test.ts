import { describe, expect, it } from "vitest";
import { fitRoom, fitRoomSentence } from "@/lib/fit-rows";

describe("fitRoom", () => {
  it("is null when the engine did not report the count or the cap (nothing is claimed)", () => {
    expect(fitRoom(165, undefined)).toBeNull();
    expect(fitRoom(undefined, 2000)).toBeNull();
    expect(fitRoom(165, 0)).toBeNull();
    expect(fitRoom(-1, 2000)).toBeNull();
    expect(fitRoom(Number.NaN, 2000)).toBeNull();
  });

  it("has room well below 80% of the cap", () => {
    expect(fitRoom(165, 2000)).toEqual({ used: 165, limit: 2000, left: 1835, state: "room" });
    expect(fitRoom(1599, 2000)?.state).toBe("room");
  });

  it("is near from 80% of the cap, and full at the cap", () => {
    expect(fitRoom(1600, 2000)).toEqual({ used: 1600, limit: 2000, left: 400, state: "near" });
    expect(fitRoom(1999, 2000)).toMatchObject({ left: 1, state: "near" });
    expect(fitRoom(2000, 2000)).toMatchObject({ left: 0, state: "full" });
  });

  it("never reports negative room", () => {
    expect(fitRoom(2100, 2000)).toMatchObject({ left: 0, state: "full" });
  });
});

describe("fitRoomSentence", () => {
  it("says nothing while there is plenty of room", () => {
    expect(fitRoomSentence(fitRoom(165, 2000))).toBeNull();
    expect(fitRoomSentence(null)).toBeNull();
  });

  it("names the used count, the cap and how many more results fit, in plain words", () => {
    const s = fitRoomSentence(fitRoom(1700, 2000))!;
    expect(s).toBe("This fit uses 1,700 of the 2,000 complete rows the model can take. Each measured result adds a row, so after about 300 more the model stops fitting.");
    expect(s).not.toMatch(/surrogate|N<=|engine/);
  });

  it("says the cap is reached when there is no room left", () => {
    expect(fitRoomSentence(fitRoom(2000, 2000))).toMatch(/already uses all 2,000 complete rows/);
  });
});
