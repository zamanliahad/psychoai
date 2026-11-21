// Qartal QA: headless end-to-end flow with mocked /api/analyze, /api/token and a fake Gemini Live WebSocket.
// Usage: npx vite --port 5175 --strictPort   (in another terminal)
//        node tests/e2e/qa-flow.mjs [--quick]
// Spends no Gemini quota. Screenshots -> docs/qa/screens/. Results -> stdout (JSON lines).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.QA_BASE || 'http://localhost:5175/';
const OUT = path.resolve('docs/qa/screens');
const FIXTURE = JSON.parse(fs.readFileSync(path.resolve('tests/e2e/analyze-fixture.json'), 'utf8').replace(/^﻿/, ''));
const QUICK = process.argv.includes('--quick');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok: !!ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
};

// ---- fake Live WebSocket + mic stub, injected before any page script ----
const INIT = () => {
  const RealWS = window.WebSocket;
  const ctl = (window.__live = { fail: false, sockets: [], setups: [], texts: [], current: null, micDenied: false });
  // 0.1 s 440 Hz tone, 24 kHz PCM16, base64
  const n = 2400;
  const u8 = new Uint8Array(n * 2);
  const dv = new DataView(u8.buffer);
  for (let i = 0; i < n; i++) dv.setInt16(i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / 24000) * 6000), true);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  const TONE = btoa(s);

  class FakeWS {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.bufferedAmount = 0;
      this.binaryType = 'blob';
      ctl.sockets.push(this);
      ctl.current = this;
      setTimeout(() => {
        if (ctl.fail) {
          this.readyState = 3;
          this.onclose?.({ code: 1006, reason: '' });
          return;
        }
        this.readyState = 1;
        this.onopen?.({});
      }, 40);
    }
    send(d) {
      const m = JSON.parse(d);
      if (m.setup) {
        ctl.setups.push(m.setup);
        setTimeout(() => this._msg({ setupComplete: {} }), 30);
        return;
      }
      if (m.realtimeInput?.text) {
        ctl.texts.push(m.realtimeInput.text);
        this.aiSay('Salam! Mən sizi dinləyirəm. Bu gün özünüzü necə hiss edirsiniz?');
      }
    }
    _msg(o) {
      if (this.readyState !== 1 || !this.onmessage) return;
      this.onmessage({ data: JSON.stringify(o) });
    }
    aiSay(text) {
      const words = text.split(' ');
      let i = 0;
      const tick = () => {
        if (this.readyState !== 1) return;
        if (i < words.length) {
          this._msg({
            serverContent: {
              outputTranscription: { text: (i ? ' ' : '') + words[i] },
              modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: TONE } }] },
            },
          });
          i++;
          setTimeout(tick, 30);
        } else this._msg({ serverContent: { turnComplete: true } });
      };
      tick();
    }
    userSay(text) {
      this._msg({ serverContent: { inputTranscription: { text } } });
      setTimeout(() => this._msg({ serverContent: { turnComplete: true } }), 60);
    }
    drop() {
      this.readyState = 3;
      this.onclose?.({ code: 1006, reason: 'qa drop' });
    }
    close() {
      this.readyState = 3;
    }
  }
  window.WebSocket = function (url, p) {
    if (String(url).includes('generativelanguage')) return new FakeWS(url);
    return new RealWS(url, p);
  };
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket.prototype = RealWS.prototype;

  const realGUM = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = (c) =>
      ctl.micDenied
        ? Promise.reject(new DOMException('mic', typeof ctl.micDenied === 'string' ? ctl.micDenied : 'NotAllowedError'))
        : realGUM(c);
  }
};

async function newPage(browser, { w, h, scheme }, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, locale: 'az-AZ', permissions: ['microphone'] });
  await ctx.addInitScript(INIT);
  if (opts.micDenied) await ctx.addInitScript((v) => (window.__live.micDenied = v), opts.micDenied);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const calls = { token: 0, analyze: 0 };
  page.__calls = calls;
  page.__analyze = opts.analyze || 'ok';
  page.__time = opts.time || null; // null -> real /api/time
  await page.route('**/api/token', (r) => {
    calls.token++;
    if (opts.token === 'fail') return r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"token-failed"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'auth_tokens/qa-fake', model: 'gemini-3.8-live' }) });
  });
  await page.route('**/api/analyze', async (r) => {
    calls.analyze++;
    await new Promise((res) => setTimeout(res, 2500));
    if (page.__analyze === 'fail') return r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"analyze-failed"}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) });
  });
  await page.route('**/api/time', (r) => {
    if (page.__time === 'fail') return r.abort();
    if (page.__time) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ now: new Date().toISOString(), dayKey: page.__time }) });
    return r.continue();
  });
  page.__errors = errors;
  return { ctx, page };
}

const tag = (v) => `${v.w}-${v.scheme}`;
async function shot(page, v, name, full = true) {
  await page.waitForTimeout(450); // .enter animasiyaları
  await page.screenshot({ path: path.join(OUT, `${name}-${tag(v)}.png`), fullPage: full });
  const sw = await page.evaluate(() => [document.scrollingElement.scrollWidth, document.scrollingElement.clientWidth]);
  if (sw[0] > sw[1]) check(`no horizontal scroll: ${name} @${tag(v)}`, false, `scrollWidth ${sw[0]} > ${sw[1]}`);
  else if (v.w === 360) results.push({ name: `hscroll ${name} @${tag(v)}`, ok: true });
}

async function setRange(page, value) {
  await page.$eval('input.mood-range', (el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

const readState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('psychoai:v1') || 'null'));
const live = (page, fn, arg) => page.evaluate(fn, arg);

async function mainFlow(browser, v, assertAll) {
  const { ctx, page } = await newPage(browser, v);
  const A = (name, ok, info) => assertAll && check(name, ok, info);
  await page.goto(BASE);
  await page.waitForSelector('.welcome');
  await shot(page, v, '01-welcome');
  // empty name -> error message
  await page.click('.welcome-form button[type=submit]');
  A('welcome: empty name shows error', (await page.textContent('.field-error')).length > 5);
  await page.fill('#name', 'Aysel');
  await page.click('.welcome-form button[type=submit]');
  await page.waitForSelector('.card.hero.ready');
  await shot(page, v, '02-today-ready');
  A('today: ready card + greeting has name', (await page.textContent('h1.display')).includes('Aysel'));

  await page.click('a.btn.primary.wide[href="#/gorus"]');
  await page.waitForSelector('input.mood-range');
  await setRange(page, 3);
  await shot(page, v, '03-mood-before');
  await page.click('.mood-card .btn.primary');

  // room
  await page.waitForSelector('.turn.ai', { timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('.turn.ai:not(.partial)'));
  A('room: AI greeting transcript appears', (await page.textContent('.turn.ai .say')).includes('dinləyirəm'));
  A('room: system prompt sent in setup', await live(page, () => !!window.__live.setups[0]?.systemInstruction?.parts?.[0]?.text?.length));
  await live(page, () => window.__live.current.userSay('İşdə çox gərginəm, gecələr yata bilmirəm.'));
  await page.waitForFunction(() => document.querySelectorAll('.turn.you').length >= 1);
  // typed message
  await page.click('button.ctrl[aria-controls="type-form"]');
  await page.fill('textarea.type-input', 'Bunu yazaraq da deyim.');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.turn.you').length >= 2);
  A('room: typed message sent to Live', await live(page, () => window.__live.texts.includes('Bunu yazaraq da deyim.')));
  // mute
  await page.click('button.ctrl[aria-pressed]');
  A('room: mute toggles', (await page.getAttribute('button.ctrl[aria-pressed]', 'aria-pressed')) === 'true');
  await page.click('button.ctrl[aria-pressed]');
  await page.waitForTimeout(400);
  await shot(page, v, '04-room', false);

  // crisis
  await live(page, () => window.__live.current.userSay('Bəzən yaşamaq istəmirəm.'));
  await page.waitForSelector('.crisis', { timeout: 3000 }).catch(() => null);
  A('crisis: support card shown on crisis phrase', await page.$('.crisis'));
  A('crisis: card has tel:112', await page.$('.crisis a[href="tel:112"]'));
  await page.waitForTimeout(500);
  const noOverlap = await page.evaluate(() => {
    const s = document.querySelector('.crisis-slot').getBoundingClientRect();
    const f = document.querySelector('.room-controls').getBoundingClientRect();
    return s.bottom <= f.top + 1;
  });
  check(`crisis: card does not cover room controls @${tag(v)}`, noOverlap);
  await shot(page, v, '05-room-crisis', false);
  await page.click('.crisis .btn.ghost').catch(() => {});

  // connection drop -> transcript kept, reconnect possible
  const turnsBefore = await page.$$eval('.turn', (els) => els.length);
  await live(page, () => {
    window.__live.fail = true;
    window.__live.current.drop();
  });
  await page.waitForSelector('.banner[role=alert]', { timeout: 9000 }).catch(() => null);
  const bannerText = (await page.textContent('.banner[role=alert]').catch(() => '')) || '';
  A('drop: "Bağlantı kəsildi" banner', bannerText.includes('Bağlantı kəsildi'), bannerText.slice(0, 60));
  A('drop: transcript kept', (await page.$$eval('.turn', (els) => els.length)) === turnsBefore);
  A('drop: "Görüşü tamamla" still available', await page.isVisible('.end-btn'));
  await shot(page, v, '06-room-dropped', false);
  await live(page, () => (window.__live.fail = false));
  const setupsBefore = await live(page, () => window.__live.setups.length);
  await page.click('.banner .btn.primary');
  await page.waitForFunction((n) => window.__live.setups.length > n, setupsBefore, { timeout: 6000 }).catch(() => null);
  await page.waitForTimeout(600);
  const resumePrompt = await live(page, () => window.__live.setups.at(-1)?.systemInstruction?.parts?.[0]?.text || '');
  A('reconnect: new setup carries earlier conversation', resumePrompt.includes('gərginəm'));
  A('reconnect: banner cleared and transcript still there', !(await page.$('.banner[role=alert]')) && (await page.$$eval('.turn', (e) => e.length)) >= turnsBefore);

  // end
  await page.click('.end-btn');
  await shot(page, v, '07-room-end-confirm', false);
  await page.click('.end-confirm .btn.clay');
  await page.waitForSelector('input.mood-range');
  await setRange(page, 7);
  await shot(page, v, '08-mood-after');
  await page.click('.mood-card .btn.primary');
  await page.waitForSelector('.analysing');
  await shot(page, v, '09-analysing', false);
  await page.waitForSelector('.result', { timeout: 10000 });
  await shot(page, v, '10-result');
  A('result: summary shown', (await page.textContent('.result .prose')).length > 40);
  A('result: tasks listed', (await page.$$('.task-preview li')).length === FIXTURE.tasks.length);
  A('result: program card listed', (await page.$$('.program-list li')).length === FIXTURE.program.length);
  const st = await readState(page);
  A('store: level 1 COMPLETED, moods before/after saved', st.levels.find((l) => l.n === 1).status === 'COMPLETED' && st.moods[0].before === 3 && st.moods[0].after === 7);
  A('store: session transcript saved', st.sessions[0]?.transcript?.length >= 3);

  // daily lock
  await page.goto(BASE + '#/');
  await page.waitForSelector('.card.hero');
  A('lock: Bu gün shows done-today', (await page.textContent('.card.hero')).includes('Bu günkü görüş tamamlandı'));
  await shot(page, v, '11-today-locked');
  await page.goto(BASE + '#/gorus');
  await page.waitForSelector('.closed-room');
  A('lock: Görüş otağı closed (no mood picker)', !(await page.$('input.mood-range')));
  await shot(page, v, '12-room-closed');

  // roadmap
  await page.goto(BASE + '#/xerite');
  await page.waitForSelector('.timeline');
  await shot(page, v, '13-roadmap');
  const pickBtn = page.locator('.tl-item').nth(1).locator('button.btn.ghost');
  await pickBtn.click();
  await page.waitForSelector('.picker');
  await shot(page, v, '14-roadmap-picker');
  if (assertAll) {
    // put L3 on L4's day -> L4 must move; then move L2 past L3 -> L3+ shift
    let s = await readState(page);
    const l4day = s.levels.find((l) => l.n === 4)?.scheduledDayKey;
    await pickBtn.click(); // close
    await page.locator('.tl-item').nth(2).locator('button.btn.ghost').click();
    if (l4day) {
      const btn = page.locator(`.picker .day[title*="Level 4"]`).first();
      if (await btn.count()) await btn.click();
      else await page.locator('.picker .day').nth(2).click();
    }
    s = await readState(page);
    let days = s.levels.filter((l) => l.status !== 'COMPLETED').map((l) => l.scheduledDayKey);
    A('roadmap: no two levels on the same day (after picking a taken day)', new Set(days).size === days.length, days.join(','));
    await page.locator('.tl-item').nth(1).locator('button.btn.ghost').click();
    await page.locator('.picker .day').nth(10).click();
    s = await readState(page);
    const sorted = s.levels.filter((l) => l.status !== 'COMPLETED').sort((a, b) => a.n - b.n).map((l) => l.scheduledDayKey);
    days = sorted;
    A('roadmap: order kept and unique after moving L2 later', new Set(days).size === days.length && days.every((d, i) => !i || d > days[i - 1]), days.join(','));
    const today = await page.evaluate(() => document.body.dataset.today);
    A('roadmap: nothing scheduled on today (already done)', days.every((d) => d > today));
  }

  // tasks
  await page.goto(BASE + '#/tapsiriqlar');
  await page.waitForSelector('.task');
  await page.click('.task:first-child .task-label');
  await page.fill('.task:first-child textarea.note', 'Dünən axşam etdim, rahatladım.');
  await page.click('h1.display');
  await page.waitForTimeout(300);
  await shot(page, v, '15-tasks');
  await page.reload();
  await page.waitForSelector('.task');
  A('tasks: check persists after reload', await page.isChecked('.task:first-child input.task-check'));
  A('tasks: note persists after reload', (await page.inputValue('.task:first-child textarea.note')) === 'Dünən axşam etdim, rahatladım.');

  // status
  await page.goto(BASE + '#/veziyyet');
  await page.waitForSelector('.page-head');
  A('status: chart SVG renders', await page.$('.card svg'));
  await shot(page, v, '16-status');

  A('mocks: no real token/analyze calls escaped (token mocked, analyze 1x)', page.__calls.analyze === 1, JSON.stringify(page.__calls));
  check(`console errors @${tag(v)}`, page.__errors.length === 0, page.__errors.slice(0, 5).join(' | '));
  await ctx.close();
}

async function micDenied(browser, v, assertAll) {
  const { ctx, page } = await newPage(browser, v, { micDenied: true });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('psychoai:v1', JSON.stringify({ profile: { name: 'Aysel', currentLevel: 1 } })));
  await page.goto(BASE + '#/gorus'); await page.reload();
  await page.waitForSelector('input.mood-range');
  await page.click('.mood-card .btn.primary');
  await page.waitForSelector('.banner[role=alert]', { timeout: 6000 }).catch(() => null);
  const t = (await page.textContent('.banner').catch(() => '')) || '';
  if (assertAll) {
    check('mic denied: clear Azerbaijani explanation', t.includes('Mikrofona icazə verilmədi'), t.slice(0, 80));
    check('mic denied: page not broken (retry + back buttons)', (await page.$$('.banner button')).length === 2);
    check('mic denied: no token fetched', page.__calls.token === 0);
  }
  await shot(page, v, '17-mic-denied', false);
  if (assertAll) check(`console errors (mic denied) @${tag(v)}`, page.__errors.length === 0, page.__errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function micMissing(browser, v) {
  const { ctx, page } = await newPage(browser, v, { micDenied: 'NotFoundError' });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('psychoai:v1', JSON.stringify({ profile: { name: 'Aysel', currentLevel: 1 } })));
  await page.goto(BASE + '#/gorus'); await page.reload();
  await page.waitForSelector('input.mood-range');
  await page.click('.mood-card .btn.primary');
  await page.waitForSelector('.banner[role=alert]', { timeout: 6000 }).catch(() => null);
  const t = (await page.textContent('.banner').catch(() => '')) || '';
  check('mic missing: says microphone not found (not "denied")', t.includes('Mikrofon tapılmadı'), t.slice(0, 80));
  await ctx.close();
}

async function tokenFail(browser, v) {
  const { ctx, page } = await newPage(browser, v, { token: 'fail' });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('psychoai:v1', JSON.stringify({ profile: { name: 'Aysel', currentLevel: 1 } })));
  await page.goto(BASE + '#/gorus'); await page.reload();
  await page.waitForSelector('input.mood-range');
  await page.click('.mood-card .btn.primary');
  await page.waitForSelector('.banner[role=alert]', { timeout: 6000 }).catch(() => null);
  const t = (await page.textContent('.banner').catch(() => '')) || '';
  check('token fail: friendly banner', t.includes('Görüş otağını aça bilmədim'), t.slice(0, 60));
  await ctx.close();
}

async function analyzeFail(browser, v, assertAll) {
  const { ctx, page } = await newPage(browser, v, { analyze: 'fail' });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('psychoai:v1', JSON.stringify({ profile: { name: 'Aysel', currentLevel: 1 } })));
  await page.goto(BASE + '#/gorus'); await page.reload();
  await page.waitForSelector('input.mood-range');
  await page.click('.mood-card .btn.primary');
  await page.waitForSelector('.turn.ai', { timeout: 8000 });
  await live(page, () => window.__live.current.userSay('Salam, bir az narahatam.'));
  await page.waitForSelector('.turn.you');
  await page.click('.end-btn');
  await page.click('.end-confirm .btn.clay');
  await page.waitForSelector('input.mood-range');
  await page.click('.mood-card .btn.primary');
  await page.waitForSelector('.result', { timeout: 10000 });
  await shot(page, v, '18-result-analyze-failed');
  if (assertAll) {
    const st = await readState(page);
    const l1 = st.levels.find((l) => l.n === 1);
    check('analyze fail: session still COMPLETED, summary null', l1.status === 'COMPLETED' && l1.summary == null);
    check('analyze fail: retry button shown', await page.$('.retry button'));
    page.__analyze = 'ok';
    await page.click('.retry button');
    await page.waitForFunction(() => !document.querySelector('.retry') && document.querySelector('.result .prose'), null, { timeout: 8000 }).catch(() => null);
    const st2 = await readState(page);
    check('analyze retry: summary + tasks + program applied later', !!st2.levels.find((l) => l.n === 1).summary && st2.tasks.length === FIXTURE.tasks.length && st2.levels.length === 1 + FIXTURE.program.length);
    await page.goto(BASE + '#/');
    await page.waitForSelector('.card.hero');
    check('analyze fail: daily lock still applies', (await page.textContent('.card.hero')).includes('Bu günkü görüş tamamlandı'));
    check(`console errors (analyze fail, mocked 502 ignored) @${tag(v)}`, page.__errors.filter((e) => !e.includes('502')).length === 0, page.__errors.slice(0, 3).join(' | '));
  }
  await ctx.close();
}

async function serverDay(browser, v) {
  const { ctx, page } = await newPage(browser, v, { time: '2026-11-20' });
  // device clock says 3 days later, server says today -> still locked
  await page.clock.setFixedTime(new Date('2026-11-23T10:00:00+04:00'));
  await page.goto(BASE);
  const seeded = {
    profile: { name: 'Aysel', currentLevel: 2, lastCompletedDayKey: '2026-11-20', programSummary: 'Test' },
    levels: [
      { n: 1, title: 'Tanışlıq', focus: '', brief: '', status: 'COMPLETED', scheduledDayKey: null, completedDayKey: '2026-11-20', summary: 'x' },
      { n: 2, title: 'İkinci', focus: '', brief: '', status: 'AVAILABLE', scheduledDayKey: '2026-11-21', completedDayKey: null, summary: null },
    ],
    tasks: [], moods: [], sessions: [],
  };
  await page.evaluate((s) => localStorage.setItem('psychoai:v1', JSON.stringify(s)), seeded);
  await page.goto(BASE + '#/gorus'); await page.reload();
  await page.waitForSelector('.view');
  check('server day: device clock +3 days, server same day -> still locked', !!(await page.$('.closed-room')));
  page.__time = '2026-11-21';
  await page.reload();
  await page.waitForSelector('.view');
  check('server day: server says next day -> level 2 opens', !!(await page.$('input.mood-range')));
  page.__time = 'fail';
  await page.reload();
  await page.waitForSelector('.view');
  check('server day: /api/time unreachable -> room stays closed (offline)', !!(await page.$('.closed-room')));
  await shot(page, v, '19-offline', false);
  await page.goto(BASE + '#/');
  await page.waitForSelector('.card.hero');
  await shot(page, v, '20-today-offline', false);
  await ctx.close();
}

// QA_CHANNEL=msedge uses the system Edge (still headless, no window) when Playwright's Chromium can't be downloaded.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_CHANNEL ? { channel: process.env.QA_CHANNEL } : {}),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const VIEWS = [
  { w: 360, h: 780, scheme: 'light' },
  { w: 360, h: 780, scheme: 'dark' },
  { w: 1280, h: 800, scheme: 'light' },
  { w: 1280, h: 800, scheme: 'dark' },
];
try {
  for (const [i, v] of VIEWS.entries()) {
    if (QUICK && i) break;
    const first = i === 0;
    try { await mainFlow(browser, v, first); } catch (e) { check(`main flow @${tag(v)}`, false, e.message.split('\n')[0]); }
    try { await micDenied(browser, v, first); } catch (e) { check(`mic denied @${tag(v)}`, false, e.message.split('\n')[0]); }
    try { await analyzeFail(browser, v, first); } catch (e) { check(`analyze fail @${tag(v)}`, false, e.message.split('\n')[0]); }
    if (first) {
      try { await tokenFail(browser, v); } catch (e) { check('token fail', false, e.message.split('\n')[0]); }
      try { await micMissing(browser, v); } catch (e) { check('mic missing', false, e.message.split('\n')[0]); }
    }
    try { await serverDay(browser, v); } catch (e) { check(`server day @${tag(v)}`, false, e.message.split('\n')[0]); }
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nTOTAL ${results.length}  FAILED ${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
