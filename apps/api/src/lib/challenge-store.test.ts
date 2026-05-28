import { afterEach, describe, expect, it } from "vitest";
import { _resetChallengeStoreForTests, consume, put } from "./challenge-store";

describe("challenge-store (in-memory mock)", () => {
  afterEach(() => _resetChallengeStoreForTests());

  it("put then consume → true", async () => {
    await put("c1", 60);
    expect(await consume("c1")).toBe(true);
  });

  it("consume twice → second is false (single-use)", async () => {
    await put("c2", 60);
    expect(await consume("c2")).toBe(true);
    expect(await consume("c2")).toBe(false);
  });

  it("consume unknown → false", async () => {
    expect(await consume("never")).toBe(false);
  });
});
