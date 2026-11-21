import { h, icon, announce, prefersReducedMotion } from './dom.js';
import { getState, toggleTask, setTaskNote, sortedLevels } from './actions.js';
import { formatDayLong } from './clock.js';

export function renderTasks(root) {
  const state = getState();
  const tasks = state.tasks || [];
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;

  const head = h(
    'header.page-head',
    h('p.eyebrow', 'Tapşırıqlar'),
    h('h1.display', 'Kiçik addımlar, ', h('em', 'böyük fərq.')),
    h(
      'p.lead',
      total
        ? 'Tapşırığı sınadıqdan sonra işarələyin və bir-iki cümlə yazın: necə keçdi, nə hiss etdiniz? Növbəti görüşdə psixoloq bunu soruşacaq.'
        : 'Hələ tapşırıq yoxdur. İlk görüşdən sonra burada sizə uyğun 2–3 praktiki tapşırıq görünəcək.',
    ),
  );

  if (!total) {
    root.replaceChildren(
      head,
      h(
        'section.card.empty',
        h('div.empty-art', { 'aria-hidden': 'true' }, icon('leaf', 40)),
        h('p', 'Görüşdən sonra qayıdın — tapşırıqlarınız burada sizi gözləyəcək.'),
        h('a.btn.primary', { href: '#/' }, 'Bu günə qayıt'),
      ),
    );
    return;
  }

  const progressBar = h('span.progress-fill', { style: { width: `${(done / total) * 100}%` } });
  const progressText = h('span', `${done} / ${total} tamamlandı`);
  const updateProgress = () => {
    const s = getState();
    const d = s.tasks.filter((t) => t.done).length;
    progressBar.style.width = `${(d / s.tasks.length) * 100}%`;
    progressText.textContent = `${d} / ${s.tasks.length} tamamlandı`;
  };

  const levelTitle = new Map(sortedLevels(state).map((l) => [l.n, l.title]));
  const groups = [...new Set(tasks.map((t) => t.level))].sort((a, b) => b - a);

  root.replaceChildren(
    head,
    h('div.progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) },
      h('span.progress-track', progressBar), progressText),
    h(
      'div.task-groups',
      groups.map((lv) => {
        const list = tasks.filter((t) => t.level === lv);
        return h(
          'section.task-group',
          h(
            'h2.group-title',
            h('span.level-tag', `Level ${lv}`),
            levelTitle.get(lv) || '',
            list[0]?.assignedDayKey && h('span.muted.small', ` · ${formatDayLong(list[0].assignedDayKey)}`),
          ),
          h('ul.task-list', list.map((t) => taskItem(t, updateProgress))),
        );
      }),
    ),
  );
}

function taskItem(t, onChange) {
  const id = `task-${t.id}`;
  const box = h('input.task-check', { type: 'checkbox', id, checked: !!t.done });
  const item = h(`li.task.card${t.done ? '.done' : ''}`);

  let saveTimer = 0;
  const savedHint = h('span.saved', { 'aria-live': 'polite' });
  const note = h('textarea.field.note', {
    rows: '2',
    placeholder: 'Necə keçdi? Nə hiss etdiniz?',
    'aria-label': `"${t.title}" üçün qeyd`,
    maxlength: '600',
    value: t.note || '',
  });
  const save = () => {
    clearTimeout(saveTimer);
    setTaskNote(t.id, note.value.trim());
    savedHint.textContent = 'Yadda saxlanıldı';
    setTimeout(() => (savedHint.textContent = ''), 1800);
  };
  note.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 700);
  });
  note.addEventListener('blur', save);

  box.addEventListener('change', () => {
    toggleTask(t.id, box.checked);
    item.classList.toggle('done', box.checked);
    if (box.checked && !prefersReducedMotion()) {
      item.classList.remove('spring');
      void item.offsetWidth;
      item.classList.add('spring');
    }
    announce(box.checked ? 'Tapşırıq tamamlandı. Əla!' : 'Tapşırıq yenidən açıldı');
    onChange();
  });

  item.append(
    h(
      'div.task-row',
      box,
      h('label.task-label', { for: id }, h('span.checkmark', { 'aria-hidden': 'true' }, icon('check', 16)), h('span.task-title', t.title)),
    ),
    t.instructions && h('p.task-how', t.instructions),
    h('div.note-wrap', note, savedHint),
  );
  return item;
}
