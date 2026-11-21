import { h, icon } from './dom.js';
import { getState, nextLevel, gate, sortedLevels } from './actions.js';
import { getToday, formatDayLong, relativeDay, greeting, syncToday } from './clock.js';
import { moodFace } from './mood.js';

export function renderToday(root) {
  const state = getState();
  const today = getToday();
  const name = state.profile?.name || '';
  const level = nextLevel(state);
  const g = gate(state, level);

  root.replaceChildren(
    h(
      'header.page-head',
      h('p.eyebrow', formatDayLong(today)),
      h('h1.display', `${greeting()}, `, h('em', name), '.'),
      h('p.lead', headline(g, level)),
    ),
    h('div.grid-2', h('div.stack', levelCard(state, level, g)), h('div.stack', tasksPreview(state), moodPreview(state))),
  );
}

function headline(g, level) {
  if (g.ok && level?.n === 1) return 'İlk görüşünüz sizi gözləyir. Rahat bir yer tapın, tələsməyin.';
  if (g.ok) return 'Bu günkü görüş hazırdır. Özünüzü hazır hiss edəndə başlayın.';
  if (g.reason === 'done-today') return 'Bu günkü görüş tamamlandı. Dincəlin və tapşırıqlarınızı sınayın.';
  if (g.reason === 'offline') return 'Serverlə əlaqə qura bilmədim. İnternet bağlantınızı yoxlayıb yenidən cəhd edin.';
  if (g.reason === 'finished') return 'Proqramı tamamladınız. Bu yolu keçdiyiniz üçün özünüzə təşəkkür edin.';
  return 'Növbəti görüşünüz yaxındadır. Bu arada tapşırıqlarınıza baxa bilərsiniz.';
}

function levelCard(state, level, g) {
  if (!level) {
    return h(
      'section.card.hero.enter',
      h('div.badge.sage', icon('sparkle', 16), 'Proqram tamamlandı'),
      h('h2.title', 'Siz bütün levelləri keçdiniz'),
      h('p', 'Qeydləriniz və əhval qrafikiniz "Vəziyyətim" bölməsində qalır. İstədiyiniz vaxt geri dönüb baxa bilərsiniz.'),
      h('a.btn.ghost', { href: '#/veziyyet' }, 'Vəziyyətimə bax', icon('arrow', 18)),
    );
  }

  const head = [
    h('div.level-tag', `Level ${level.n}`),
    h('h2.title', level.title || 'Görüş'),
    level.focus && h('p.muted', level.focus),
  ];

  if (g.ok) {
    return h(
      'section.card.hero.ready.enter',
      h('div.hero-orb', { 'aria-hidden': 'true' }, h('span'), h('span')),
      ...head,
      h(
        'ul.hero-points',
        h('li', icon('mic', 18), 'Səsli söhbət, istəsəniz yazaraq da'),
        h('li', icon('heart', 18), 'Əvvəl və sonra əhvalınızı qeyd edirik'),
      ),
      h('a.btn.primary.wide', { href: '#/gorus' }, level.n === 1 ? 'İlk görüşə başla' : 'Görüşə başla', icon('arrow', 18)),
    );
  }

  if (g.reason === 'offline') {
    return h(
      'section.card.hero.locked.enter',
      h('div.badge', icon('refresh', 16), 'Bağlantı yoxdur'),
      ...head,
      h('p', 'Gündəlik kilid serverin vaxtına əsaslanır. Bağlantı bərpa olunanda görüşə başlaya biləcəksiniz.'),
      h(
        'button.btn.primary',
        {
          type: 'button',
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            await syncToday();
            renderToday(e.target.closest('.view') || document.querySelector('.view'));
          },
        },
        icon('refresh', 18),
        'Yenidən yoxla',
      ),
    );
  }

  const opens = g.opensOn || nextScheduled(state);
  const lockText =
    g.reason === 'done-today'
      ? 'Bu gün artıq bir görüş keçirdiniz. Hər gün yalnız bir level açılır ki, eşitdiklərinizi həzm etməyə vaxtınız olsun.'
      : g.reason === 'not-yet'
        ? 'Bu level seçdiyiniz gündə açılacaq. Günü Yol Xəritəsində dəyişə bilərsiniz.'
        : 'Bu level hələ bağlıdır. Əvvəlki addımlar tamamlandıqca açılacaq.';

  return h(
    'section.card.hero.locked.enter',
    h('div.badge', icon('lock', 16), g.reason === 'done-today' ? 'Bu günkü görüş tamamlandı' : 'Hələ bağlıdır'),
    ...head,
    h('p', lockText),
    opens &&
      h(
        'div.opens',
        icon('calendar', 20),
        h('div', h('span.muted', 'Növbəti görüş açılır'), h('strong', capital(relativeDay(opens)))),
      ),
    h('a.btn.ghost', { href: '#/xerite' }, 'Yol Xəritəsinə bax', icon('arrow', 18)),
  );
}

function nextScheduled(state) {
  return sortedLevels(state).find((l) => l.status !== 'COMPLETED' && l.scheduledDayKey)?.scheduledDayKey;
}

function tasksPreview(state) {
  const open = (state.tasks || []).filter((t) => !t.done);
  const done = (state.tasks || []).length - open.length;
  if (!(state.tasks || []).length) {
    return h(
      'section.card.soft',
      h('h3.subtitle', icon('check', 20), 'Tapşırıqlar'),
      h('p.muted', 'Hər görüşdən sonra burada 2–3 kiçik, praktiki tapşırıq görünəcək.'),
    );
  }
  return h(
    'section.card.soft',
    h('h3.subtitle', icon('check', 20), 'Tapşırıqlar', h('span.count', `${done}/${state.tasks.length}`)),
    open.length
      ? h('ul.mini-list', open.slice(0, 3).map((t) => h('li', h('span.dot'), t.title)))
      : h('p.muted', 'Hamısı tamamlanıb. Əla iş!'),
    h('a.link', { href: '#/tapsiriqlar' }, 'Hamısına bax', icon('arrow', 16)),
  );
}

function moodPreview(state) {
  const moods = (state.moods || []).filter((m) => m.before != null || m.after != null);
  const last = moods[moods.length - 1];
  if (!last) {
    return h(
      'section.card.soft',
      h('h3.subtitle', icon('chart', 20), 'Əhvalınız'),
      h('p.muted', 'Hər görüşdən əvvəl və sonra əhvalınızı qeyd edəcəyik. Zamanla dəyişikliyi qrafikdə görəcəksiniz.'),
    );
  }
  return h(
    'section.card.soft',
    h('h3.subtitle', icon('chart', 20), 'Son görüşdən sonra'),
    h(
      'div.mood-pair',
      moodChip('Əvvəl', last.before),
      h('span.mood-arrow', { 'aria-hidden': 'true' }, '→'),
      moodChip('Sonra', last.after),
    ),
    last.aiNote && h('p.muted.small', last.aiNote),
    h('a.link', { href: '#/veziyyet' }, 'Vəziyyətim', icon('arrow', 16)),
  );
}

function moodChip(label, v) {
  if (v == null) return h('div.mood-chip', h('span.muted', label), h('strong', '—'));
  return h('div.mood-chip', h('span.muted', label), h('strong', `${moodFace(v).emoji} ${v}`));
}

const capital = (s) => (s ? s[0].toLocaleUpperCase('az') + s.slice(1) : s);
