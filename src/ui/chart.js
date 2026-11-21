import { h, svg } from './dom.js';
import { formatDay } from './clock.js';

const SERIES = [
  { key: 'before', label: 'Görüşdən əvvəl', cls: 's-before' },
  { key: 'after', label: 'Görüşdən sonra', cls: 's-after' },
  { key: 'aiScore', label: 'Psixoloqun qiyməti', cls: 's-ai' },
];

/** Əhval qrafiki (SVG). moods: [{dayKey, level, before, after, aiScore}] */
export function moodChart(moods) {
  const W = 640;
  const H = 260;
  const pad = { l: 34, r: 18, t: 16, b: 38 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = moods.length;
  const x = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => pad.t + ih - ((v - 1) / 9) * ih;

  const grid = [1, 4, 7, 10].map((v) =>
    svg(
      'g',
      { class: 'grid' },
      svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }),
      svg('text', { x: pad.l - 10, y: y(v) + 4, 'text-anchor': 'end' }, String(v)),
    ),
  );

  const xLabels = moods.map((m, i) =>
    svg(
      'g',
      { class: 'xlabel' },
      svg('text', { x: x(i), y: H - pad.b + 18, 'text-anchor': 'middle' }, `L${m.level}`),
      n <= 8 && svg('text', { x: x(i), y: H - pad.b + 32, 'text-anchor': 'middle', class: 'xdate' }, formatDay(m.dayKey)),
    ),
  );

  const lines = SERIES.map((s) => {
    const pts = moods.map((m, i) => (m[s.key] == null ? null : [x(i), y(m[s.key]), m, i])).filter(Boolean);
    if (!pts.length) return null;
    const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
    return svg(
      'g',
      { class: `series ${s.cls}` },
      pts.length > 1 && svg('path', { d, fill: 'none' }),
      pts.map(([px, py, m]) =>
        svg('circle', { cx: px, cy: py, r: 4.5 }, svg('title', {}, `Level ${m.level} · ${formatDay(m.dayKey)} — ${s.label.toLowerCase()}: ${m[s.key]}`)),
      ),
    );
  });

  const desc = moods
    .map((m) => `Level ${m.level}: əvvəl ${m.before ?? '—'}, sonra ${m.after ?? '—'}, psixoloqun qiyməti ${m.aiScore ?? '—'}`)
    .join('; ');

  return h(
    'figure.chart',
    h(
      'div.legend',
      SERIES.map((s) => h(`span.legend-item.${s.cls}`, h('span.swatch', { 'aria-hidden': 'true' }), s.label)),
    ),
    svg(
      'svg',
      { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Əhval qrafiki. ${desc}`, preserveAspectRatio: 'xMidYMid meet' },
      grid,
      xLabels,
      lines,
    ),
    h('figcaption.muted.small', '1 — çox ağır, 10 — çox yaxşı'),
  );
}
