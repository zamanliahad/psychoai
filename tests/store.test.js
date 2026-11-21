import { describe, it, expect, vi } from "vitest";
import { createStore, defaultState, STORAGE_KEY } from "../src/lib/store.js";
import { canStartLevel } from "../src/lib/day.js";

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

const analysis = {
  summary: "Tanışlıq seansı keçdi.",
  tasks: [{ title: "Nəfəs məşqi", instructions: "Gündə 2 dəfə 4-7-8." }, { title: "Gündəlik", instructions: "3 cümlə yaz." }],
  mood: { score: 6, note: "Bir az narahat." },
  program: [
    { n: 2, title: "Narahatlıq", focus: "f2", brief: "b2" },
    { n: 3, title: "Yuxu", focus: "f3", brief: "b3" },
  ],
};

describe("store basics", () => {
  it("starts with default state and Level 1 AVAILABLE", () => {
    const s = createStore({ storage: mem() }).get();
    expect(s.profile.currentLevel).toBe(1);
    expect(s.levels[0]).toMatchObject({ n: 1, status: "AVAILABLE" });
  });
  it("works without any storage (in-memory fallback)", () => {
    const st = createStore();
    st.update((s) => (s.profile.name = "Ahad"));
    expect(st.get().profile.name).toBe("Ahad");
  });
  it("update persists, subscribe notifies, unsubscribe stops", () => {
    const storage = mem();
    const st = createStore({ storage });
    const fn = vi.fn();
    const off = st.subscribe(fn);
    st.update((s) => (s.profile.name = "Leyla"));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).profile.name).toBe("Leyla");
    expect(createStore({ storage }).get().profile.name).toBe("Leyla");
    off();
    st.update((s) => (s.profile.name = "X"));
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("survives corrupt saved data", () => {
    const storage = mem();
    storage.setItem(STORAGE_KEY, "{not json");
    expect(createStore({ storage }).get()).toEqual(defaultState());
  });
});

describe("completeSession", () => {
  it("with analysis: completes, adds tasks, mood, program; next level opens tomorrow", () => {
    const st = createStore({ storage: mem() });
    const s = st.completeSession(1, { transcript: [{ who: "you", text: "salam" }], analysis, moodBefore: 4, moodAfter: 6 }, "2026-11-20");
    expect(s.levels[0]).toMatchObject({ n: 1, status: "COMPLETED", completedDayKey: "2026-11-20", summary: analysis.summary });
    expect(s.profile).toMatchObject({ currentLevel: 2, lastCompletedDayKey: "2026-11-20" });
    expect(s.tasks).toHaveLength(2);
    expect(s.tasks[0]).toMatchObject({ level: 1, done: false, note: "", assignedDayKey: "2026-11-20" });
    expect(s.tasks[0].id).not.toBe(s.tasks[1].id);
    expect(s.moods[0]).toEqual({ dayKey: "2026-11-20", level: 1, before: 4, after: 6, aiScore: 6, aiNote: "Bir az narahat." });
    expect(s.sessions[0]).toMatchObject({ level: 1, dayKey: "2026-11-20" });
    expect(s.levels.map((l) => [l.n, l.status, l.scheduledDayKey])).toEqual([
      [1, "COMPLETED", null],
      [2, "AVAILABLE", "2026-11-21"],
      [3, "LOCKED", "2026-11-22"],
    ]);
    expect(canStartLevel(s, 2, "2026-11-20").reason).toBe("done-today");
    expect(canStartLevel(s, 2, "2026-11-21").ok).toBe(true);
  });

  it("analysis failure (null) still marks the level COMPLETED with summary=null", () => {
    const st = createStore({ storage: mem() });
    const s = st.completeSession(1, { transcript: [{ who: "you", text: "salam" }], analysis: null, moodBefore: 5, moodAfter: 7 }, "2026-11-20");
    expect(s.levels[0]).toMatchObject({ status: "COMPLETED", summary: null });
    expect(s.profile.lastCompletedDayKey).toBe("2026-11-20");
    expect(s.sessions).toHaveLength(1);
    expect(s.moods[0]).toMatchObject({ before: 5, after: 7, aiScore: null });
    expect(s.tasks).toHaveLength(0);
  });

  it("analysis can be retried later and the program regenerated", () => {
    const st = createStore({ storage: mem() });
    st.completeSession(1, { transcript: [], analysis: null, moodBefore: 5, moodAfter: 7 }, "2026-11-20");
    const s = st.applyAnalysis(1, analysis);
    expect(s.levels[0].summary).toBe(analysis.summary);
    expect(s.moods[0].aiScore).toBe(6);
    expect(s.levels.find((l) => l.n === 2)).toMatchObject({ status: "AVAILABLE", scheduledDayKey: "2026-11-21" });
  });
});

describe("applyProgram", () => {
  it("keeps completed levels, keeps a chosen schedule, replaces the rest", () => {
    const st = createStore({ storage: mem() });
    st.completeSession(1, { transcript: [], analysis, moodBefore: 4, moodAfter: 6 }, "2026-11-20");
    st.update((s) => (s.levels.find((l) => l.n === 3).scheduledDayKey = "2026-11-25"));
    const s = st.applyProgram([
      { n: 1, title: "ignored", focus: "", brief: "" },
      { n: 2, title: "Yeni 2", focus: "", brief: "" },
      { n: 3, title: "Yeni 3", focus: "", brief: "" },
      { n: 4, title: "Yeni 4", focus: "", brief: "" },
    ]);
    expect(s.levels.map((l) => [l.n, l.title, l.status, l.scheduledDayKey])).toEqual([
      [1, "Tanışlıq", "COMPLETED", null],
      [2, "Yeni 2", "AVAILABLE", "2026-11-21"],
      [3, "Yeni 3", "LOCKED", "2026-11-25"],
      [4, "Yeni 4", "LOCKED", "2026-11-23"],
    ]);
  });
});
