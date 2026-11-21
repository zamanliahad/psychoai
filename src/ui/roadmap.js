import { h, icon, toast } from './dom.js';
import { getState, sortedLevels, gate, nextLevel, minDayFor, scheduleLevel } from './actions.js';
import { getToday, addDays, formatDayLong, relativeDay, weekdayShort, dayNumber, formatDay } from './clock.js';

const PICKER_DAYS = 21;

export function renderRoadmap(root) {
  let openPicker = null; // level n

  const paint = () => {
    const state = getState();
    const levels = sortedLevels(state);
    const current = nextLevel(state);
    const g = gate(state, current);
    const hasProgram = levels.length > 1;

    root.replaceChildren(
      h(
        'header.page-head',
        h('p.eyebrow', 'Yol Xəritəsi'),
        h('h1.display', 'Addım-addım, ', h('em', 'öz tempinizdə.')),
        h(
          'p.lead',
          hasProgram
            ? 'Hər gün yalnız bir level açılır. Sizə uyğun günləri özünüz seçə bilərsiniz — tətbiq heç vaxt zəng etmir, sadəcə həmin gün görüşü hazır saxlayır.'
            : 'İlk görüşdən sonra sizin üçün 5–7 günlük fərdi proqram qurulacaq və burada görünəcək.',
        ),
      ),
      h(
        'div.grid-2',
        h(
          'div.stack',
          state.profile?.programSummary &&
            h('section.card.soft', h('h2.subtitle', icon('sparkle', 20), 'Proqramın məqsədi'), h('p.prose', state.profile.programSummary)),
          h(
            'ol.timeline',
            levels.map((l) => levelNode(state, l, current, g)),
            !hasProgram && placeholderNodes(),
          ),
        ),
        h('div.stack', legend()),
      ),
    );
  };

  function levelNode(state, l, current, g) {
    const done = l.status === 'COMPLETED';
    const isCurrent = current && l.n === current.n;
    const today = getToday();

    let statusText;
    let cls = 'future';
    if (done) {
      statusText = `Tamamlandı · ${formatDay(l.completedDayKey)}`;
      cls = 'done';
    } else if (isCurrent && g.ok) {
      statusText = 'Bu gün hazırdır';
      cls = 'now';
    } else if (isCurrent && g.opensOn) {
      statusText = `Açılır: ${relativeDay(g.opensOn)}`;
      cls = 'next';
    } else if (l.scheduledDayKey) {
      statusText = cap(relativeDay(l.scheduledDayKey));
    } else {
      statusText = 'Gün seçilməyib';
    }

    const canPick = !done;
    const node = h(
      `li.tl-item.${cls}`,
      h('span.tl-dot', { 'aria-hidden': 'true' }, done ? icon('check', 16) : String(l.n)),
      h(
        'div.tl-card',
        h('div.tl-top', h('span.level-tag', `Level ${l.n}`), h('span.tl-status', statusText)),
        h('h3.tl-title', l.title || 'Görüş'),
        l.focus && h('p.muted.small', l.focus),
        done && l.summary && h('p.small.tl-summary', l.summary),
        isCurrent && g.ok && h('a.btn.primary.small', { href: '#/gorus' }, 'Görüşə başla', icon('arrow', 16)),
        canPick &&
          l.n !== 1 &&
          h(
            'button.btn.ghost.small',
            {
              type: 'button',
              'aria-expanded': String(openPicker === l.n),
              onclick: () => {
                openPicker = openPicker === l.n ? null : l.n;
                paint();
              },
            },
            icon('calendar', 16),
            l.scheduledDayKey ? 'Günü dəyiş' : 'Gün seç',
          ),
        openPicker === l.n && dayPicker(state, l, today),
      ),
    );
    return node;
  }

  function dayPicker(state, l) {
    const min = minDayFor(l.n, state);
    const occupied = new Map(
      sortedLevels(state)
        .filter((x) => x.status !== 'COMPLETED' && x.n !== l.n && x.scheduledDayKey)
        .map((x) => [x.scheduledDayKey, x.n]),
    );
    const days = Array.from({ length: PICKER_DAYS }, (_, i) => addDays(min, i));

    return h(
      'div.picker.enter',
      h('p.small.muted', `Ən tez: ${formatDayLong(min)}. Eyni günə iki level düşmür — lazım olsa, sonrakı levellər bir gün irəli sürüşəcək.`),
      h(
        'div.day-grid',
        { role: 'listbox', 'aria-label': `Level ${l.n} üçün gün seçin` },
        days.map((d) => {
          const taken = occupied.get(d);
          const selected = d === l.scheduledDayKey;
          return h(
            'button.day',
            {
              type: 'button',
              role: 'option',
              'aria-selected': String(selected),
              class: [selected && 'selected', taken && 'taken'].filter(Boolean).join(' '),
              title: taken ? `Level ${taken} bu gündədir` : formatDayLong(d),
              onclick: () => {
                if (scheduleLevel(l.n, d)) {
                  openPicker = null;
                  paint();
                  toast(`Level ${l.n}: ${formatDayLong(d)}`);
                }
              },
            },
            h('span.dw', weekdayShort(d)),
            h('span.dn', String(dayNumber(d))),
            taken && h('span.dt', `L${taken}`),
          );
        }),
      ),
    );
  }

  paint();
}

function placeholderNodes() {
  return [2, 3, 4].map((n) =>
    h(
      'li.tl-item.ghost',
      { 'aria-hidden': 'true' },
      h('span.tl-dot', String(n)),
      h('div.tl-card', h('div.skeleton.w60'), h('div.skeleton.w40')),
    ),
  );
}

function legend() {
  return h(
    'section.card.soft',
    h('h2.subtitle', icon('leaf', 20), 'Necə işləyir?'),
    h(
      'ul.rules',
      h('li', h('strong', 'Gündə bir level. '), 'Eşitdiklərinizin həzm olunmasına və tapşırıqları sınamağa vaxt qalsın deyə.'),
      h('li', h('strong', 'Günü siz seçirsiniz. '), 'Günaşırı və ya həftəsonu — sizə necə rahatdırsa.'),
      h('li', h('strong', 'Zəng və bildiriş yoxdur. '), 'Görüşü yalnız siz, hazır olanda başladırsınız.'),
    ),
  );
}

const cap = (s) => (s ? s[0].toLocaleUpperCase('az') + s.slice(1) : s);
