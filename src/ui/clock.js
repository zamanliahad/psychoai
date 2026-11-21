// Server günü (Asia/Baku). Kilid telefonun saatına yox, /api/time-a əsaslanır.
import { dayKey } from '../lib/day.js';

let today = null; // "YYYY-MM-DD"
let fromServer = false;

export async function syncToday() {
  try {
    const res = await fetch('/api/time', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (typeof data?.dayKey === 'string') {
      today = data.dayKey;
      fromServer = true;
      return today;
    }
    throw new Error('dayKey yoxdur');
  } catch {
    // Server əlçatan deyilsə, müvəqqəti olaraq cihazın vaxtı (Bakı saat qurşağı).
    today = dayKey(new Date());
    fromServer = false;
    return today;
  }
}

export function getToday() {
  return today ?? dayKey(new Date());
}

export function isServerTime() {
  return fromServer;
}

// ---- Gün açarları üzərində sadə hesab (UTC-də, saat qurşağından asılı deyil) ----

function parse(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(key, n) {
  const d = parse(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
const WEEKDAYS = ['bazar', 'bazar ertəsi', 'çərşənbə axşamı', 'çərşənbə', 'cümə axşamı', 'cümə', 'şənbə'];
const WEEKDAYS_SHORT = ['B', 'B.e', 'Ç.a', 'Ç', 'C.a', 'C', 'Ş'];

/** "21 noyabr" */
export function formatDay(key) {
  if (!key) return '';
  const d = parse(key);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "21 noyabr, cümə" */
export function formatDayLong(key) {
  if (!key) return '';
  return `${formatDay(key)}, ${WEEKDAYS[parse(key).getUTCDay()]}`;
}

export function weekdayShort(key) {
  return WEEKDAYS_SHORT[parse(key).getUTCDay()];
}

export function dayNumber(key) {
  return parse(key).getUTCDate();
}

/** "bu gün" / "sabah" / "21 noyabr, cümə" */
export function relativeDay(key) {
  if (!key) return '';
  const diff = diffDays(getToday(), key);
  if (diff === 0) return 'bu gün';
  if (diff === 1) return 'sabah';
  if (diff === -1) return 'dünən';
  return formatDayLong(key);
}

export function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Baku' }).format(new Date()),
  );
  if (hour < 5) return 'Salam';
  if (hour < 12) return 'Sabahınız xeyir';
  if (hour < 18) return 'Günortanız xeyir';
  return 'Axşamınız xeyir';
}
