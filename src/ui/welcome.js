import { h, icon } from './dom.js';
import { setName } from './actions.js';

/** İlk ziyarət: yalnız ad soruşulur. */
export function renderWelcome(root, { onDone }) {
  const input = h('input.field', {
    type: 'text',
    id: 'name',
    name: 'name',
    autocomplete: 'given-name',
    maxlength: '40',
    placeholder: 'Məsələn, Aysel',
    required: true,
  });
  const error = h('p.field-error', { role: 'alert' });

  const form = h(
    'form.welcome-form',
    {
      // Brauzerin öz (ingiliscə/rusca) "required" pəncərəsi yox, aşağıdakı azərbaycanca xəta görünsün.
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const name = input.value.trim().replace(/\s+/g, ' ');
        if (!name) {
          error.textContent = 'Sizə necə müraciət edək? Adınızı yazın, kifayətdir.';
          input.focus();
          return;
        }
        setName(name);
        onDone();
      },
    },
    h('label.label', { for: 'name' }, 'Sizə necə müraciət edək?'),
    input,
    error,
    h('button.btn.primary.wide', { type: 'submit' }, 'Başlayaq', icon('arrow', 18)),
  );

  root.replaceChildren(
    h(
      'main.welcome',
      h('div.welcome-orb', { 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
      h(
        'div.welcome-card.enter',
        h('p.eyebrow', 'PsychoAI'),
        h('h1.display', 'Xoş gəlmisiniz.', h('br'), h('em', 'Burada tələsmək yoxdur.')),
        h(
          'p.lead',
          'Bu, sizin sakit guşənizdir. Hazır olanda səsli görüşə başlayır, ürəyinizdən keçənləri danışırsınız — qalanını birlikdə, addım-addım, gündə bir görüşlə qururuq.',
        ),
        form,
        h(
          'div.note',
          icon('leaf', 18),
          h(
            'p',
            'PsychoAI süni intellekt əsaslı dəstəkdir, psixoloqu və ya həkimi əvəz etmir. Təcili vəziyyətdə ',
            h('a', { href: 'tel:112' }, '112'),
            '-yə zəng edin.',
          ),
        ),
        h('p.fineprint', 'Məlumatlarınız yalnız bu cihazda, brauzerinizdə saxlanır.'),
      ),
    ),
  );
  requestAnimationFrame(() => input.focus({ preventScroll: true }));
}
