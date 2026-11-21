import { h, icon } from './dom.js';
import { CRISIS_MESSAGE } from '../psych/crisis.js';

const FALLBACK = {
  title: 'Siz tək deyilsiniz',
  body: 'Dediklərinizi eşitdim və bu, çox ağır hiss ola bilər. Əgər özünüzə zərər vermək fikri yaranırsa, xahiş edirəm, indi 112-yə zəng edin və ya yanınızdakı etibar etdiyiniz birinə xəbər verin.',
  phone: '112',
};

/** Sakit dəstək kartı. Görüşü dayandırmır. */
export function crisisCard({ onClose } = {}) {
  const msg = { ...FALLBACK, ...(CRISIS_MESSAGE || {}) };
  const card = h(
    'aside.crisis.enter',
    { role: 'alertdialog', 'aria-labelledby': 'crisis-title', 'aria-describedby': 'crisis-body' },
    h('div.crisis-icon', icon('heart', 26)),
    h('div.crisis-text', h('h3', { id: 'crisis-title' }, msg.title), h('p', { id: 'crisis-body' }, msg.body)),
    h(
      'div.crisis-actions',
      h('a.btn.clay', { href: `tel:${msg.phone}` }, icon('phone', 18), `${msg.phone}-yə zəng et`),
      h(
        'button.btn.ghost',
        { type: 'button', onclick: () => { card.remove(); onClose?.(); } },
        'Söhbətə davam et',
      ),
    ),
  );
  return card;
}
