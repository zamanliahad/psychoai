// Day logic. The daily lock is based on the SERVER day (Asia/Baku), passed in as todayKey.

/** @returns {string} "YYYY-MM-DD" of `date` in time zone `tz`. */
export function dayKey(date, tz = "Asia/Baku") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Adds whole days to a "YYYY-MM-DD" key (calendar arithmetic, no time zone involved). */
export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/**
 * @param state  store State
 * @param level  level number (n) or a level object with .n
 * @param todayKey server day key ("YYYY-MM-DD")
 * @returns {{ok: boolean, reason?: "done-today"|"not-yet"|"locked", opensOn?: string}}
 */
export function canStartLevel(state, level, todayKey) {
  const n = typeof level === "object" && level ? level.n : level;
  const lvl = state?.levels?.find((l) => l.n === n);
  if (!lvl || lvl.status === "LOCKED" || lvl.status === "COMPLETED") return { ok: false, reason: "locked" };
  if (state.profile?.lastCompletedDayKey === todayKey) {
    const tomorrow = addDays(todayKey, 1);
    const opensOn = lvl.scheduledDayKey && lvl.scheduledDayKey > tomorrow ? lvl.scheduledDayKey : tomorrow;
    return { ok: false, reason: "done-today", opensOn };
  }
  if (lvl.scheduledDayKey && lvl.scheduledDayKey > todayKey) return { ok: false, reason: "not-yet", opensOn: lvl.scheduledDayKey };
  return { ok: true };
}
