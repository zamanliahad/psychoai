// Single data layer. Browser: localStorage. Tests / no localStorage: in-memory (or an injected storage).
import { addDays } from "./day.js";

export const STORAGE_KEY = "psychoai:v1";

export function defaultState() {
  return {
    profile: { name: "", currentLevel: 1, lastCompletedDayKey: null, programSummary: null },
    levels: [
      { n: 1, title: "Tanışlıq", focus: "Tanış olmaq, narahatlıqları anlamaq", brief: "", status: "AVAILABLE", scheduledDayKey: null, completedDayKey: null, summary: null },
    ],
    tasks: [],
    moods: [],
    sessions: [],
  };
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function browserStorage() {
  try {
    if (typeof window === "undefined") return null; // Node/tests: avoid Node's experimental localStorage
    const ls = window.localStorage;
    if (!ls) return null;
    const probe = "__psychoai_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

function load(storage, key) {
  const base = defaultState();
  try {
    const raw = storage.getItem(key);
    if (!raw) return base;
    const s = JSON.parse(raw);
    return {
      profile: { ...base.profile, ...(s.profile || {}) },
      levels: Array.isArray(s.levels) && s.levels.length ? s.levels : base.levels,
      tasks: Array.isArray(s.tasks) ? s.tasks : [],
      moods: Array.isArray(s.moods) ? s.moods : [],
      sessions: Array.isArray(s.sessions) ? s.sessions : [],
    };
  } catch {
    return base;
  }
}

let idSeq = 0;
const newId = () => `t${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---- pure mutators (operate on a draft state) ----

/** Writes analysis results for an already-completed level (also used to retry analysis later). */
function applyAnalysisTo(s, level, analysis, dayKey) {
  if (!analysis) return;
  const lvl = s.levels.find((l) => l.n === level);
  if (lvl) lvl.summary = analysis.summary ?? null;
  for (const t of analysis.tasks || []) {
    s.tasks.push({ id: newId(), level, title: t.title, instructions: t.instructions || "", done: false, note: "", assignedDayKey: dayKey });
  }
  const mood = s.moods.find((m) => m.level === level && m.dayKey === dayKey) || s.moods.find((m) => m.level === level);
  if (mood && analysis.mood) {
    mood.aiScore = analysis.mood.score ?? null;
    mood.aiNote = analysis.mood.note ?? null;
  }
  if (Array.isArray(analysis.program) && analysis.program.length) applyProgramTo(s, analysis.program);
}

function applyProgramTo(s, program) {
  const completed = s.levels.filter((l) => l.status === "COMPLETED");
  const doneNs = new Set(completed.map((l) => l.n));
  const old = new Map(s.levels.map((l) => [l.n, l]));
  const lastDone = completed.reduce((a, l) => Math.max(a, l.n), 0);
  const base = s.profile.lastCompletedDayKey;
  const fresh = program
    .filter((p) => !doneNs.has(p.n))
    .map((p) => {
      const prev = old.get(p.n);
      return {
        n: p.n,
        title: p.title,
        focus: p.focus || "",
        brief: p.brief || "",
        status: p.n === s.profile.currentLevel ? "AVAILABLE" : "LOCKED",
        scheduledDayKey: prev?.scheduledDayKey ?? (base ? addDays(base, p.n - lastDone) : null),
        completedDayKey: null,
        summary: null,
      };
    });
  s.levels = [...completed, ...fresh].sort((a, b) => a.n - b.n);
}

function completeSessionOn(s, level, { transcript, analysis = null, moodBefore = null, moodAfter = null } = {}, todayKey) {
  let lvl = s.levels.find((l) => l.n === level);
  if (!lvl) {
    lvl = { n: level, title: `Level ${level}`, focus: "", brief: "", status: "AVAILABLE", scheduledDayKey: null, completedDayKey: null, summary: null };
    s.levels.push(lvl);
  }
  lvl.status = "COMPLETED";
  lvl.completedDayKey = todayKey;
  lvl.summary = null;
  s.profile.lastCompletedDayKey = todayKey;
  s.profile.currentLevel = Math.max(s.profile.currentLevel || 1, level + 1);
  s.sessions.push({ level, dayKey: todayKey, transcript: transcript ?? [] });
  s.moods.push({ dayKey: todayKey, level, before: moodBefore, after: moodAfter, aiScore: null, aiNote: null });
  applyAnalysisTo(s, level, analysis, todayKey);
  const next = s.levels.find((l) => l.n === level + 1);
  if (next && next.status === "LOCKED") next.status = "AVAILABLE";
  if (next && (!next.scheduledDayKey || next.scheduledDayKey <= todayKey)) next.scheduledDayKey = addDays(todayKey, 1);
  s.levels.sort((a, b) => a.n - b.n);
}

/**
 * @param {{storage?: {getItem,setItem}, key?: string}} [opts]
 */
export function createStore({ storage, key = STORAGE_KEY } = {}) {
  const st = storage || browserStorage() || memoryStorage();
  let state = load(st, key);
  const subs = new Set();

  const save = () => {
    try {
      st.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn("store: save failed", e);
    }
  };

  const api = {
    /** @returns State (treat as read-only; change it via update). */
    get: () => state,
    /** fn mutates a draft copy; result is saved and subscribers are notified. @returns State */
    update(fn) {
      const draft = structuredClone(state);
      fn(draft);
      state = draft;
      save();
      for (const f of subs) {
        try {
          f(state);
        } catch (e) {
          console.error(e);
        }
      }
      return state;
    },
    /** @returns unsubscribe() */
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    /** Marks the level COMPLETED even when analysis is null (summary stays null). @returns State */
    completeSession: (level, data, todayKey) => api.update((s) => completeSessionOn(s, level, data, todayKey)),
    /** Adds analysis to an already completed level later (retry after failure). @returns State */
    applyAnalysis: (level, analysis, dayKey) =>
      api.update((s) => applyAnalysisTo(s, level, analysis, dayKey ?? s.levels.find((l) => l.n === level)?.completedDayKey ?? null)),
    /** Replaces the not-yet-completed levels with program [{n,title,focus,brief}]. @returns State */
    applyProgram: (program) => api.update((s) => applyProgramTo(s, program)),
    /** Clears everything back to the default state. @returns State */
    reset: () => api.update((s) => Object.assign(s, defaultState())),
  };
  return api;
}

export const store = createStore();
export default store;

export const completeSession = (level, data, todayKey) => store.completeSession(level, data, todayKey);
export const applyAnalysis = (level, analysis, dayKey) => store.applyAnalysis(level, analysis, dayKey);
export const applyProgram = (program) => store.applyProgram(program);
