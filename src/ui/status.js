import { h, icon } from './dom.js';
import { getState, sortedLevels } from './actions.js';
import { moodChart } from './chart.js';
import { moodFace } from './mood.js';
import { formatDayLong } from './clock.js';

export function renderStatus(root) {
  const state = getState();
  const moods = [...(state.moods || [])]
    .filter((m) => m.before != null || m.after != null || m.aiScore != null)
    .sort((a, b) => (a.dayKey === b.dayKey ? a.level - b.level : a.dayKey < b.dayKey ? -1 : 1));
  const completed = sortedLevels(state).filter((l) => l.status === 'COMPLETED').reverse();

  const head = h(
    'header.page-head',
    h('p.eyebrow', 'Vəziyyətim'),
    h('h1.display', 'Sizin yolunuz, ', h('em', 'sizin tempiniz.')),
    h('p.lead', 'Hər görüşdən əvvəl və sonra qeyd etdiyiniz əhval, psixoloqun qısa qiymətləndirməsi və görüşlərin xülasəsi.'),
  );

  if (!moods.length && !completed.length) {
    root.replaceChildren(
      head,
      h(
        'section.card.empty',
        h('div.empty-art', { 'aria-hidden': 'true' }, icon('chart', 40)),
        h('p', 'Hələ qeyd yoxdur. İlk görüşdən sonra əhvalınızın dəyişməsini burada görəcəksiniz.'),
        h('a.btn.primary', { href: '#/' }, 'Bu günə qayıt'),
      ),
    );
    return;
  }

  root.replaceChildren(
    head,
    h(
      'div.grid-2.wide-first',
      h('div.stack', h('section.card', h('h2.subtitle', icon('chart', 20), 'Əhval qrafiki'), moodChart(moods)), stats(moods)),
      h(
        'div.stack',
        h('h2.subtitle.section-title', icon('leaf', 20), 'Görüşlərin xülasəsi'),
        completed.length
          ? completed.map((l) => sessionCard(l, moods.find((m) => m.level === l.n)))
          : h('p.muted', 'Xülasələr görüşlərdən sonra burada görünəcək.'),
      ),
    ),
  );
}

function stats(moods) {
  const pairs = moods.filter((m) => m.before != null && m.after != null);
  const avgDelta = pairs.length ? pairs.reduce((s, m) => s + (m.after - m.before), 0) / pairs.length : null;
  const ai = moods.filter((m) => m.aiScore != null);
  const lastAi = ai[ai.length - 1];
  const fmt = (v) => (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',');

  return h(
    'div.stat-row',
    h('div.stat.card.soft', h('span.muted.small', 'Görüşlər'), h('strong', String(moods.length))),
    h(
      'div.stat.card.soft',
      h('span.muted.small', 'Orta dəyişiklik'),
      h('strong', avgDelta == null ? '—' : fmt(avgDelta)),
    ),
    h('div.stat.card.soft', h('span.muted.small', 'Son qiymət'), h('strong', lastAi ? `${lastAi.aiScore}/10` : '—')),
  );
}

function sessionCard(l, mood) {
  return h(
    'article.card.session',
    h(
      'div.tl-top',
      h('span.level-tag', `Level ${l.n}`),
      h('span.muted.small', formatDayLong(l.completedDayKey)),
    ),
    h('h3.tl-title', l.title || 'Görüş'),
    mood &&
      h(
        'div.mood-pair.small',
        h('span', 'Əvvəl ', h('strong', mood.before == null ? '—' : `${moodFace(mood.before).emoji} ${mood.before}`)),
        h('span.mood-arrow', { 'aria-hidden': 'true' }, '→'),
        h('span', 'Sonra ', h('strong', mood.after == null ? '—' : `${moodFace(mood.after).emoji} ${mood.after}`)),
      ),
    l.summary ? h('p.prose', l.summary) : h('p.muted.small', 'Bu görüşün xülasəsi hazırlanmayıb.'),
    mood?.aiNote && h('p.ai-note', icon('sparkle', 18), mood.aiNote),
  );
}
