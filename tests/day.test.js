import { describe, it, expect } from "vitest";
import { dayKey, addDays, canStartLevel } from "../src/lib/day.js";

const state = (over = {}) => ({
  profile: { name: "", currentLevel: 2, lastCompletedDayKey: null, programSummary: null, ...over.profile },
  levels: over.levels || [
    { n: 1, title: "Tanışlıq", status: "COMPLETED", scheduledDayKey: null, completedDayKey: "2026-11-19" },
    { n: 2, title: "B", status: "AVAILABLE", scheduledDayKey: null, completedDayKey: null },
    { n: 3, title: "C", status: "LOCKED", scheduledDayKey: null, completedDayKey: null },
  ],
  tasks: [], moods: [], sessions: [],
});

describe("dayKey", () => {
  it("uses Asia/Baku (UTC+4): 21:30 UTC is already next day in Baku", () => {
    expect(dayKey(new Date("2026-11-20T21:30:00Z"))).toBe("2026-11-21");
    expect(dayKey(new Date("2026-11-20T19:59:00Z"))).toBe("2026-11-20");
  });
  it("respects tz argument", () => {
    expect(dayKey(new Date("2026-11-20T21:30:00Z"), "UTC")).toBe("2026-11-20");
  });
  it("addDays crosses month/year", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("canStartLevel", () => {
  it("allows an available level on a new day", () => {
    expect(canStartLevel(state({ profile: { lastCompletedDayKey: "2026-11-19" } }), 2, "2026-11-20")).toEqual({ ok: true });
  });
  it("second level on the same server day -> done-today with opensOn tomorrow", () => {
    const r = canStartLevel(state({ profile: { lastCompletedDayKey: "2026-11-20" } }), 2, "2026-11-20");
    expect(r).toEqual({ ok: false, reason: "done-today", opensOn: "2026-11-21" });
  });
  it("scheduled for tomorrow -> not-yet with opensOn", () => {
    const s = state();
    s.levels[1].scheduledDayKey = "2026-11-21";
    expect(canStartLevel(s, 2, "2026-11-20")).toEqual({ ok: false, reason: "not-yet", opensOn: "2026-11-21" });
  });
  it("locked / completed / missing levels -> locked", () => {
    expect(canStartLevel(state(), 3, "2026-11-20").reason).toBe("locked");
    expect(canStartLevel(state(), 1, "2026-11-20").reason).toBe("locked");
    expect(canStartLevel(state(), 9, "2026-11-20").reason).toBe("locked");
  });
  it("accepts a level object", () => {
    expect(canStartLevel(state(), { n: 2 }, "2026-11-20").ok).toBe(true);
  });
  it("relies on the server todayKey, not the device clock", () => {
    // device clock may say anything; only todayKey matters
    expect(canStartLevel(state({ profile: { lastCompletedDayKey: "2026-11-20" } }), 2, "2026-11-21").ok).toBe(true);
  });
});
