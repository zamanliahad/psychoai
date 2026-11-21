// Arayüzün məlumat qatı ilə bütün əlaqəsi buradan keçir (Usta-nın store.js interfeysi).
// İnterfeys dəyişsə, yalnız bu faylı düzəltmək kifayətdir.
import { store, completeSession, applyAnalysis } from '../lib/store.js';
import { canStartLevel, addDays } from '../lib/day.js';
import { LEVEL1 } from '../psych/level1.js';
import { getToday, isServerTime, syncToday } from './clock.js';

export const getState = () => store.get();
export const update = (fn) => store.update(fn);
export const subscribe = (fn) => store.subscribe(fn);

export const LEVEL1_FALLBACK = {
  ...LEVEL1,
  status: 'AVAILABLE',
  scheduledDayKey: null,
  completedDayKey: null,
  summary: null,
};

/** Levellər n-ə görə; Level 1-in mətni Dərya-nın LEVEL1-indən (yalnız göstərmək üçün). */
export function sortedLevels(state = getState()) {
  const levels = [...(state.levels || [])]
    .sort((a, b) => a.n - b.n)
    .map((l) => (l.n === 1 ? { ...l, title: LEVEL1.title, focus: LEVEL1.focus } : l));
  return levels.length ? levels : [LEVEL1_FALLBACK];
}

/** Növbəti (tamamlanmamış) level, yoxdursa null. */
export function nextLevel(state = getState()) {
  return sortedLevels(state).find((l) => l.status !== 'COMPLETED') ?? null;
}

/** canStartLevel-in arayüz üçün bükülməsi. */
export function gate(state = getState(), level = nextLevel(state)) {
  if (!level) return { ok: false, reason: 'finished' };
  // Kilid yalnız server gününə əsaslanır; /api/time əlçatan deyilsə görüş açılmır.
  if (!isServerTime()) return { ok: false, reason: 'offline' };
  try {
    return canStartLevel(state, level.n, getToday());
  } catch (err) {
    console.warn('[ui] canStartLevel xətası', err);
    return { ok: false, reason: 'locked' };
  }
}

export function setName(name) {
  update((s) => {
    s.profile = s.profile || {};
    s.profile.name = name;
    if (!s.profile.currentLevel) s.profile.currentLevel = 1;
    if (!s.levels || s.levels.length === 0) s.levels = [{ ...LEVEL1_FALLBACK }];
  });
}

/**
 * Görüş bitdikdən sonra: level COMPLETED, tapşırıqlar, əhval, (Level 1-dən sonra) proqram.
 * analysis null ola bilər (şəbəkə və ya JSON xətası) — görüş yenə də tamamlandı sayılır.
 */
export function finishSession({ level, transcript, analysis, moodBefore, moodAfter }) {
  const dayKey = getToday();
  // Usta: level COMPLETED (analiz null olsa da), seans, əhval, tapşırıqlar və Level 1-dən sonra proqram.
  completeSession(level, { transcript, analysis, moodBefore, moodAfter }, dayKey);
  return getState();
}

/** Analiz alınmayanda "Yenidən cəhd et": transkripti yenidən göndər və nəticəni level-ə yaz. */
export async function retryAnalysis(level) {
  const session = [...(getState().sessions || [])].reverse().find((s) => s.level === level);
  if (!session?.transcript?.length) return null;
  const analysis = await analyze(level, session.transcript);
  if (analysis) applyAnalysis(level, analysis, session.dayKey);
  return analysis;
}

export { syncToday };

/**
 * Level üçün gün seç. Qaydalar: bu gündən və son tamamlanmış gündən sonra, əvvəlki leveldən sonra.
 * Sonrakı levellər eyni günə və ya daha əvvələ düşərsə, bir-bir irəli sürüşdürülür (eyni gündə 2 level olmur).
 */
export function scheduleLevel(n, chosenKey) {
  const min = minDayFor(n);
  if (chosenKey < min) return false;
  update((s) => {
    const levels = [...s.levels].sort((a, b) => a.n - b.n);
    let prev = null;
    for (const l of levels) {
      if (l.status === 'COMPLETED') {
        prev = l.completedDayKey ?? prev;
        continue;
      }
      if (l.n === n) l.scheduledDayKey = chosenKey;
      else if (l.n > n && prev && (!l.scheduledDayKey || l.scheduledDayKey <= prev)) l.scheduledDayKey = addDays(prev, 1);
      prev = l.scheduledDayKey ?? prev;
    }
  });
  return true;
}

/** Level n üçün seçilə bilən ən erkən gün. */
export function minDayFor(n, state = getState()) {
  const today = getToday();
  const last = state.profile?.lastCompletedDayKey;
  let min = today;
  if (last && last >= min) min = addDays(last, 1);
  const prev = sortedLevels(state)
    .filter((l) => l.n < n)
    .map((l) => (l.status === 'COMPLETED' ? l.completedDayKey : l.scheduledDayKey))
    .filter(Boolean)
    .sort()
    .pop();
  if (prev && prev >= min) min = addDays(prev, 1);
  return min;
}

export function toggleTask(id, done) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (t) t.done = done;
  });
}

export function setTaskNote(id, note) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (t) t.note = note;
  });
}

/** Seans transkriptini analiz üçün göndər. Xəta olarsa null qaytarır. */
export async function analyze(level, transcript) {
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, transcript, state: getState() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== 'object') throw new Error('boş cavab');
    return data;
  } catch (err) {
    console.warn('[ui] analiz alınmadı', err);
    return null;
  }
}
