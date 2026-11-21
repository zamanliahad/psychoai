import { h } from './dom.js';

const FACES = [
  { max: 2, emoji: '😢', word: 'Çox ağır' },
  { max: 4, emoji: '😟', word: 'Çətin' },
  { max: 6, emoji: '😐', word: 'Elə-belə' },
  { max: 8, emoji: '🙂', word: 'Yaxşı' },
  { max: 10, emoji: '😊', word: 'Çox yaxşı' },
];

export const moodFace = (v) => FACES.find((f) => v <= f.max) ?? FACES[2];

/**
 * Əhval sürgüsü (1–10).
 * moodPicker({ title, hint, value, cta, onSubmit, onBack })
 */
export function moodPicker({ title, hint, value = 5, cta = 'Davam et', onSubmit, onBack, backLabel = 'Geri' }) {
  let current = value;
  const emoji = h('div.mood-emoji', { 'aria-hidden': 'true' }, moodFace(current).emoji);
  const word = h('div.mood-word', moodFace(current).word);
  const num = h('span.mood-num', String(current));

  const input = h('input.mood-range', {
    type: 'range',
    min: '1',
    max: '10',
    step: '1',
    value: String(current),
    'aria-label': title,
    'aria-valuetext': `${current} — ${moodFace(current).word}`,
  });

  const paint = () => {
    const f = moodFace(current);
    if (emoji.textContent !== f.emoji) {
      emoji.textContent = f.emoji;
      emoji.classList.remove('pop');
      void emoji.offsetWidth;
      emoji.classList.add('pop');
    }
    word.textContent = f.word;
    num.textContent = String(current);
    input.style.setProperty('--fill', `${((current - 1) / 9) * 100}%`);
    input.setAttribute('aria-valuetext', `${current} — ${f.word}`);
  };

  input.addEventListener('input', () => {
    current = Number(input.value);
    paint();
  });
  paint();

  return h(
    'section.card.mood-card.enter',
    h('h2.title', title),
    hint && h('p.muted', hint),
    h('div.mood-face', emoji, h('div', word, h('div.mood-scale', num, h('span.muted', ' / 10')))),
    input,
    h('div.mood-ends', h('span', 'Çox ağır'), h('span', 'Çox yaxşı')),
    h(
      'div.actions',
      onBack && h('button.btn.ghost', { type: 'button', onclick: onBack }, backLabel),
      h('button.btn.primary', { type: 'button', onclick: () => onSubmit(current) }, cta),
    ),
  );
}
