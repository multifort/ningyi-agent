/**
 * Tests for the dependency-free cron parser.
 */
import { describe, it, expect } from "vitest";
import { parseCron, isValidCron, nextRun } from "../src/cron.js";

describe("isValidCron", () => {
  it("accepts standard expressions", () => {
    expect(isValidCron("* * * * *")).toBe(true);
    expect(isValidCron("0 9 * * *")).toBe(true);
    expect(isValidCron("*/15 * * * *")).toBe(true);
    expect(isValidCron("0 9 * * 1-5")).toBe(true);
    expect(isValidCron("0,30 8-18 * * *")).toBe(true);
  });

  it("rejects malformed expressions", () => {
    expect(isValidCron("bad")).toBe(false);
    expect(isValidCron("* * * *")).toBe(false); // 4 fields
    expect(isValidCron("* * * * * *")).toBe(false); // 6 fields
    expect(isValidCron("60 * * * *")).toBe(false); // minute out of range
    expect(isValidCron("* 24 * * *")).toBe(false); // hour out of range
    expect(isValidCron("* * 0 * *")).toBe(false); // dom min is 1
  });
});

describe("parseCron", () => {
  it("expands ranges and steps", () => {
    const f = parseCron("0 9-11 * * *");
    expect([...f.hour].sort((a, b) => a - b)).toEqual([9, 10, 11]);
    expect([...f.minute]).toEqual([0]);
  });

  it("expands step values", () => {
    const f = parseCron("*/20 * * * *");
    expect([...f.minute].sort((a, b) => a - b)).toEqual([0, 20, 40]);
  });
});

describe("nextRun", () => {
  const base = new Date("2026-06-03T09:17:30"); // a Wednesday

  it("finds the next minute boundary", () => {
    const next = nextRun("* * * * *", base)!;
    expect(next.getMinutes()).toBe(18);
    expect(next.getSeconds()).toBe(0);
  });

  it("finds next daily 9am (tomorrow, since 9:17 passed)", () => {
    const next = nextRun("0 9 * * *", base)!;
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(4); // next day
  });

  it("respects step minutes", () => {
    const next = nextRun("*/15 * * * *", base)!;
    expect(next.getMinutes()).toBe(30);
  });

  it("finds next weekday for Mon-Fri schedule from a Friday evening", () => {
    const friEvening = new Date("2026-06-05T20:00:00"); // Friday
    const next = nextRun("0 9 * * 1-5", friEvening)!;
    expect(next.getDay()).toBe(1); // Monday
    expect(next.getHours()).toBe(9);
  });
});
