import './styles/main.css';
import { h, icon } from './ui/dom.js';
import { getState, subscribe, gate } from './ui/actions.js';
import { syncToday } from './ui/clock.js';
import { renderWelcome } from './ui/welcome.js';
import { renderToday } from './ui/today.js';
import { renderRoom } from './ui/room.js';
import { renderRoadmap } from './ui/roadmap.js';
import { renderTasks } from './ui/tasks.js';
import { renderStatus } from './ui/status.js';

const ROUTES = {
  '/': { label: 'Bu gün', short: 'Bu gün', icon: 'sun', render: renderToday },
  '/gorus': { label: 'Görüş otağı', short: 'Görüş', icon: 'orb', render: renderRoom },
  '/xerite': { label: 'Yol Xəritəsi', short: 'Xəritə', icon: 'map', render: renderRoadmap },
  '/tapsiriqlar': { label: 'Tapşırıqlar', short: 'Tapşırıq', icon: 'check', render: renderTasks },
  '/veziyyet': { label: 'Vəziyyətim', short: 'Vəziyyət', icon: 'chart', render: renderStatus },
};

const app = document.getElementById('app');
let view = null; // { cleanup, isLive }
let currentPath = null;
let shell = null;

const pathFromHash = () => {
  const p = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  return ROUTES[p] ? p : '/';
};

function buildShell() {
  const navItems = Object.entries(ROUTES).map(([path, r]) =>
    h(
      'a.nav-item',
      { href: `#${path}`, dataset: { path } },
      icon(r.icon, 22),
      h('span.nav-label', h('span.long', r.label), h('span.short', r.short)),
      h('span.nav-badge', { hidden: true }),
    ),
  );
  const nav = h('nav.nav', { 'aria-label': 'Əsas menyu' }, h('a.brand', { href: '#/' }, h('span.brand-mark', { 'aria-hidden': 'true' }), 'PsychoAI'), h('div.nav-items', navItems),
    h('p.nav-note', 'Süni intellekt dəstəyidir, psixoloqu əvəz etmir. Təcili hal: ', h('a', { href: 'tel:112' }, '112')));
  const main = h('main.page', { id: 'main', tabindex: '-1' });
  const skip = h('a.skip', { href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Əsas məzmuna keç');
  const root = h('div.shell', skip, nav, main);
  app.replaceChildren(root);
  return { root, nav, main, navItems };
}

function setFocusMode(on) {
  document.body.classList.toggle('focus-mode', on);
}

function updateNav(path) {
  if (!shell) return;
  const state = getState();
  const open = (state.tasks || []).filter((t) => !t.done).length;
  let ready = false;
  try {
    ready = gate(state).ok;
  } catch {}
  for (const a of shell.navItems) {
    const p = a.dataset.path;
    if (p === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    const badge = a.querySelector('.nav-badge');
    if (p === '/tapsiriqlar') {
      badge.hidden = open === 0;
      badge.textContent = String(open);
      badge.setAttribute('aria-label', `${open} açıq tapşırıq`);
    } else if (p === '/gorus') {
      badge.hidden = !ready;
      badge.textContent = '';
      badge.classList.add('dot');
      badge.setAttribute('aria-label', 'Görüş hazırdır');
    }
  }
}

function render() {
  const path = pathFromHash();

  if (!getState().profile?.name) {
    view?.cleanup?.();
    view = null;
    shell = null;
    currentPath = null;
    setFocusMode(false);
    document.title = 'PsychoAI — Xoş gəlmisiniz';
    renderWelcome(app, { onDone: () => { location.hash = '#/'; render(); } });
    return;
  }

  if (!shell) shell = buildShell();
  view?.cleanup?.();
  view = null;
  currentPath = path;

  const route = ROUTES[path];
  document.title = `${route.label} — PsychoAI`;
  const container = h('div.view.enter');
  shell.main.replaceChildren(container);
  const result = route.render(container, { setFocusMode });
  if (result && typeof result === 'object') view = result;
  updateNav(path);
  window.scrollTo({ top: 0 });
}

// Canlı görüş zamanı təsadüfən başqa səhifəyə keçməyin qarşısını al.
let reverting = false;
window.addEventListener('hashchange', (e) => {
  if (reverting) {
    reverting = false;
    return;
  }
  if (view?.isLive?.() && pathFromHash() !== currentPath) {
    const ok = window.confirm('Görüş hələ yekunlaşmayıb. Bu səhifədən çıxmaq istəyirsiniz?');
    if (!ok) {
      reverting = true;
      location.hash = new URL(e.oldURL).hash || '#/';
      return;
    }
  }
  render();
});

window.addEventListener('beforeunload', (e) => {
  if (view?.isLive?.()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Gün dəyişərsə (məs. gecə yarısından sonra tab yenidən açılanda) server gününü yenilə.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || view?.isLive?.()) return;
  const before = document.body.dataset.today;
  const today = await syncToday();
  document.body.dataset.today = today;
  if (before && before !== today) render();
});

subscribe(() => updateNav(currentPath));

(async function boot() {
  app.replaceChildren(h('div.boot', { 'aria-busy': 'true' }, h('div.breath-loader', h('span'), h('span'), h('span'))));
  document.body.dataset.today = await syncToday();
  render();
})();
