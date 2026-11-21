// Görüş otağı: əhval (əvvəl) → canlı görüş → əhval (sonra) → təhlil → nəticə.
import { h, icon, announce } from './dom.js';
import { createOrb } from './orb.js';
import { moodPicker, moodFace } from './mood.js';
import { crisisCard } from './crisis.js';
import { getState, nextLevel, gate, analyze, finishSession, sortedLevels, retryAnalysis } from './actions.js';
import { relativeDay, formatDayLong } from './clock.js';
import { LiveSession, MESSAGES as LIVE_MESSAGES } from '../voice/live.js';
import { buildSystemPrompt } from '../psych/prompts.js';
import { detectCrisis } from '../psych/crisis.js';

const CAPTIONS = {
  connecting: 'Qoşuluram…',
  listening: 'Sizi dinləyirəm',
  you: 'Siz danışırsınız',
  ai: 'Psixoloq danışır',
  muted: 'Mikrofon söndürülüb',
  ended: 'Bağlantı dayandı',
  idle: 'Hazırlaşırıq',
};

const ERRORS = {
  'mic-denied': {
    title: 'Mikrofona icazə verilmədi',
    body: 'Səsli görüş üçün mikrofon lazımdır. Ünvan sətrindəki kilid işarəsinə toxunub mikrofona icazə verin, sonra yenidən cəhd edin.',
  },
  token: {
    title: 'Görüş otağını aça bilmədim',
    body: 'Serverlə əlaqədə kiçik problem yarandı. Bir az sonra yenidən cəhd edin.',
  },
  network: {
    title: 'İnternet bağlantısı kəsildi',
    body: 'Söhbətimiz yerində qalıb. Bağlantı bərpa olunanda yenidən qoşula bilərsiniz.',
  },
  closed: {
    title: 'Bağlantı kəsildi',
    body: 'Narahat olmayın, indiyə qədər danışdıqlarımız saxlanılıb. Yenidən qoşulun və ya görüşü tamamlayın.',
  },
};

/**
 * @param {HTMLElement} root
 * @param {{ setFocusMode:(on:boolean)=>void }} ctx
 * @returns {{ cleanup:()=>void, isLive:()=>boolean }}
 */
export function renderRoom(root, ctx) {
  const state = getState();
  const level = nextLevel(state);
  const g = gate(state, level);

  let session = null;
  let orb = null;
  let live = false;
  let timerId = 0;
  let routeAlive = true;
  let pending = null; // görüş bitib, amma hələ yadda saxlanmayıb

  const cleanup = () => {
    routeAlive = false;
    stopLive();
    // İstifadəçi əhval (sonra) addımında çıxsa da, görüş itməsin.
    if (pending) {
      const p = pending;
      pending = null;
      p.analysisPromise.then((analysis) =>
        finishSession({ level: level.n, transcript: p.transcript, analysis, moodBefore: p.moodBefore, moodAfter: null }),
      );
    }
  };

  const stopLive = () => {
    live = false;
    clearInterval(timerId);
    orb?.destroy();
    orb = null;
    try {
      session?.stop();
    } catch {}
    session = null;
    ctx.setFocusMode(false);
  };

  if (!g.ok) {
    root.replaceChildren(closedRoom(state, level, g));
    return { cleanup, isLive: () => false };
  }

  // ---------- 1. Əhval (əvvəl) ----------
  const showMoodBefore = () => {
    root.replaceChildren(
      h(
        'div.narrow',
        h('p.eyebrow', `Level ${level.n} · ${level.title || 'Görüş'}`),
        moodPicker({
          title: 'Bu an özünüzü necə hiss edirsiniz?',
          hint: 'Düzgün və ya yanlış cavab yoxdur. Sadəcə ürəyinizə qulaq asın.',
          cta: 'Görüş otağına keç',
          onBack: () => (location.hash = '#/'),
          onSubmit: (v) => startLive(v),
        }),
      ),
    );
  };

  // ---------- 2. Canlı görüş ----------
  function startLive(moodBefore) {
    const turns = [];
    let liveState = 'connecting';
    let muted = false;
    let lastVoice = 0;
    let shownMode = '';
    let startedAt = Date.now();
    let crisisShown = false;
    let userEnded = false;

    live = true;
    ctx.setFocusMode(true);

    const canvas = h('canvas.orb-canvas', { 'aria-hidden': 'true' });
    const caption = h('p.orb-caption', { 'aria-live': 'polite' }, CAPTIONS.connecting);
    const timer = h('span.timer', '00:00');
    const statusDot = h('span.status-dot');
    const banner = h('div.banner-slot');
    const crisisSlot = h('div.crisis-slot');
    const log = h('div.transcript', { role: 'log', 'aria-label': 'Söhbətin yazısı', tabindex: '0' });
    const emptyLog = h('p.transcript-empty', 'Danışmağa başlayanda sözləriniz burada görünəcək.');
    log.append(emptyLog);

    const muteBtn = h(
      'button.ctrl',
      { type: 'button', 'aria-pressed': 'false', onclick: () => toggleMute() },
      icon('mic', 22),
      h('span', 'Səssiz'),
    );
    const typeBtn = h(
      'button.ctrl',
      { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'type-form', onclick: () => toggleType() },
      icon('keyboard', 22),
      h('span', 'Yaz'),
    );
    const endBtn = h('button.btn.clay.end-btn', { type: 'button', onclick: () => askEnd() }, 'Görüşü tamamla');
    const endConfirm = h('div.end-confirm', { hidden: true });

    const textarea = h('textarea.field.type-input', {
      rows: '1',
      placeholder: 'Fikrinizi yazın…',
      'aria-label': 'Psixoloqa yazılı mesaj',
      maxlength: '1000',
    });
    const typeForm = h(
      'form.type-form',
      { id: 'type-form', hidden: true, onsubmit: (e) => { e.preventDefault(); sendTyped(); } },
      textarea,
      h('button.btn.primary.icon-btn', { type: 'submit', 'aria-label': 'Göndər' }, icon('send', 20)),
    );
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTyped();
      }
    });
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    });

    root.replaceChildren(
      h(
        'section.room',
        h(
          'header.room-head',
          h('div', h('p.eyebrow', `Level ${level.n}`), h('h1.room-title', level.title || 'Görüş')),
          h('div.room-meta', statusDot, timer),
        ),
        h(
          'div.room-body',
          h('div.orb-wrap', canvas, caption),
          h('div.room-side', banner, crisisSlot, log, typeForm),
        ),
        h('footer.room-controls', muteBtn, typeBtn, h('div.end-wrap', endBtn, endConfirm)),
      ),
    );

    orb = createOrb(canvas, { getLevel: () => (session ? session.level : 0), getMode });

    timerId = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      timer.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);

    function getMode() {
      let mode;
      if (liveState === 'connecting') mode = 'connecting';
      else if (liveState === 'ended') mode = 'ended';
      else if (liveState === 'speaking') mode = 'ai';
      else {
        const now = performance.now();
        if (!muted && session && session.level > 0.09) lastVoice = now;
        mode = now - lastVoice < 380 ? 'you' : 'listening';
      }
      const cap = muted && (mode === 'listening' || mode === 'you') ? 'muted' : mode;
      if (cap !== shownMode) {
        shownMode = cap;
        caption.textContent = CAPTIONS[cap];
        statusDot.dataset.mode = mode;
        root.querySelector('.room')?.setAttribute('data-mode', mode);
      }
      return mode;
    }

    // --- transkript ---
    function addText(who, text, final) {
      if (!text && !final) return;
      let cur = turns[turns.length - 1];
      if (cur && cur.who !== who && !cur.final) finalizeTurn(cur);
      if (!cur || cur.who !== who || cur.final) {
        if (!text) return;
        cur = { who, text: '', final: false, el: null };
        turns.push(cur);
      }
      if (text) cur.text = text; // həmişə növbənin tam mətni (detail.full)
      paintTurn(cur);
      if (final) finalizeTurn(cur);
    }

    function finalizeTurn(turn) {
      if (turn.final) return;
      turn.final = true;
      turn.el?.classList.remove('partial');
      if (turn.who === 'you') checkCrisis(turn.text);
    }

    function paintTurn(turn) {
      emptyLog.remove();
      const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
      if (!turn.el) {
        turn.el = h(
          `div.turn.${turn.who}.partial`,
          h('span.who', turn.who === 'you' ? 'Siz' : 'Psixoloq'),
          h('p.say'),
        );
        log.append(turn.el);
      }
      turn.el.querySelector('.say').textContent = turn.text.trim();
      if (turn.final) turn.el.classList.remove('partial');
      if (nearBottom) log.scrollTop = log.scrollHeight;
    }

    function checkCrisis(text) {
      let hit = false;
      try {
        hit = detectCrisis(text);
      } catch (err) {
        console.warn('[ui] detectCrisis xətası', err);
      }
      if (hit && !crisisSlot.firstChild) {
        crisisShown = true;
        crisisSlot.append(crisisCard());
        announce('Dəstək məlumatı göstərildi. Təcili vəziyyətdə 112-yə zəng edin.');
      }
    }

    // [{who,text,final}] — LiveSession.transcript ilə eyni forma, amma "Yenidən qoşul"-dan sonra da bütöv qalır.
    const transcriptList = () =>
      turns.filter((t) => t.text.trim()).map((t) => ({ who: t.who, text: t.text.trim(), final: true }));
    const transcriptText = () =>
      transcriptList()
        .map((t) => `${t.who === 'you' ? 'İstifadəçi' : 'Psixoloq'}: ${t.text}`)
        .join('\n');

    // --- idarəetmə ---
    function toggleMute() {
      muted = !muted;
      try {
        session?.mute(muted);
      } catch {}
      muteBtn.setAttribute('aria-pressed', String(muted));
      muteBtn.replaceChildren(icon(muted ? 'micOff' : 'mic', 22), h('span', muted ? 'Səsi aç' : 'Səssiz'));
      announce(muted ? 'Mikrofon söndürüldü' : 'Mikrofon açıldı');
    }

    function toggleType() {
      const open = typeForm.hidden;
      typeForm.hidden = !open;
      typeBtn.setAttribute('aria-expanded', String(open));
      typeBtn.classList.toggle('on', open);
      if (open) textarea.focus();
    }

    function sendTyped() {
      const t = textarea.value.trim();
      if (!t) return;
      if (!session || liveState === 'ended' || liveState === 'connecting') {
        flash('Bağlantı hazır olanda mesajınızı göndərə bilərsiniz.');
        return;
      }
      // sendText özü "you" transkript hadisəsi göndərir — burada ayrıca əlavə etmirik.
      let sent = false;
      try {
        sent = session.sendText(t) !== false;
      } catch {}
      if (!sent) {
        flash('Mesaj göndərilmədi. Bir də cəhd edin.');
        return;
      }
      textarea.value = '';
      textarea.style.height = 'auto';
    }

    function flash(text) {
      const el = h('p.flash', text);
      banner.replaceChildren(el);
      setTimeout(() => el.isConnected && el.remove(), 3500);
    }

    function showError(code, message) {
      let e = ERRORS[code] || { title: 'Nəsə alınmadı', body: message || 'Bir az sonra yenidən cəhd edin.' };
      // LiveSession eyni kodla daha dəqiq səbəb göndərə bilər (mikrofon tapılmadı / məşğuldur, brauzer dəstəkləmir).
      if (code === 'mic-denied' && message && message !== LIVE_MESSAGES['mic-denied']) e = { title: 'Mikrofonla problem var', body: message };
      else if (code === 'network' && message && message !== LIVE_MESSAGES.network) e = { title: 'Səsli görüş açılmadı', body: message };
      liveState = 'ended';
      const canRetry = true;
      banner.replaceChildren(
        h(
          'div.banner.enter',
          { role: 'alert' },
          h('strong', e.title),
          h('p', e.body),
          h(
            'div.actions',
            canRetry &&
              h('button.btn.primary.small', { type: 'button', onclick: () => connect(true) }, icon('refresh', 16),
                code === 'closed' || code === 'network' ? 'Yenidən qoşul' : 'Yenidən cəhd et'),
            !turns.length &&
              h('button.btn.ghost.small', { type: 'button', onclick: () => { stopLive(); location.hash = '#/'; } }, 'Geri qayıt'),
          ),
        ),
      );
    }

    function askEnd() {
      const said = turns.some((t) => t.text.trim());
      endBtn.hidden = true;
      endConfirm.hidden = false;
      endConfirm.replaceChildren(
        h('span', said ? 'Görüşü tamamlayaq?' : 'Hələ danışmadıq. Yenə də tamamlayaq?'),
        h('button.btn.ghost.small', { type: 'button', onclick: () => { endConfirm.hidden = true; endBtn.hidden = false; endBtn.focus(); } }, 'Davam et'),
        h('button.btn.clay.small', { type: 'button', onclick: () => endSession() }, 'Bəli, tamamla'),
      );
      endConfirm.querySelector('.clay').focus();
    }

    function endSession() {
      userEnded = true;
      const last = turns[turns.length - 1];
      if (last && !last.final) finalizeTurn(last);
      const transcript = transcriptList();
      stopLive();
      // Təhlili dərhal başladırıq — istifadəçi əhvalını qeyd edərkən hazırlansın.
      const analysisPromise = transcript.length ? analyze(level.n, transcript) : Promise.resolve(null);
      pending = { moodBefore, transcript, analysisPromise };
      showMoodAfter(pending);
    }

    // --- bağlantı ---
    async function connect(isRetry) {
      try {
        session?.stop();
      } catch {}
      banner.replaceChildren();
      liveState = 'connecting';
      if (!isRetry) startedAt = Date.now();

      let systemPrompt;
      try {
        systemPrompt = buildSystemPrompt(getState(), level.n);
      } catch (err) {
        console.warn('[ui] buildSystemPrompt xətası', err);
        systemPrompt = '';
      }
      const soFar = transcriptText();
      if (isRetry && soFar) {
        systemPrompt += `\n\nBağlantı qısa müddətə kəsildi və görüş davam edir. Salamlaşmanı təkrarlama, söhbətə qaldığı yerdən davam et. İndiyə qədərki söhbət:\n${soFar}`;
      }

      const s = new LiveSession({ systemPrompt });
      session = s;
      s.addEventListener('state', (e) => {
        if (session !== s) return;
        const st = e.detail?.state ?? e.detail;
        if (st === 'ended' && !userEnded && liveState !== 'ended') liveState = 'ended';
        else liveState = st;
      });
      s.addEventListener('transcript', (e) => {
        if (session !== s) return;
        // final:false olanda `text` deltadır — tam mətn `full`-dadır.
        const { who, text = '', full, final = false } = e.detail || {};
        addText(who === 'ai' ? 'ai' : 'you', full ?? text, final);
      });
      s.addEventListener('error', (e) => {
        if (session !== s || userEnded) return;
        const { code, message } = e.detail || {};
        showError(code, message);
      });
      try {
        if (muted) s.mute(true);
        await s.start();
      } catch (err) {
        if (session === s && !userEnded && !banner.querySelector('.banner')) {
          showError(err?.code || (err?.name === 'NotAllowedError' ? 'mic-denied' : 'token'), err?.message);
        }
      }
    }

    connect(false);
  }

  // ---------- 3. Əhval (sonra) ----------
  function showMoodAfter({ moodBefore, transcript, analysisPromise }) {
    root.replaceChildren(
      h(
        'div.narrow',
        h('p.eyebrow', 'Görüş bitdi'),
        moodPicker({
          title: 'İndi özünüzü necə hiss edirsiniz?',
          hint: 'Görüşdən əvvəl ' + moodBefore + ' qeyd etmişdiniz. Fərq olmasa da, bu da normaldır.',
          value: moodBefore,
          cta: 'Yadda saxla',
          onSubmit: (moodAfter) => showAnalysing({ moodBefore, moodAfter, transcript, analysisPromise }),
        }),
      ),
    );
  }

  // ---------- 4. Təhlil ----------
  async function showAnalysing({ moodBefore, moodAfter, transcript, analysisPromise }) {
    const hints = [
      'Söhbətimizi diqqətlə nəzərdən keçirirəm…',
      'Sizin üçün kiçik tapşırıqlar seçirəm…',
      level.n === 1 ? 'Fərdi proqramınızı qururam…' : 'Növbəti addımı hazırlayıram…',
    ];
    const hintEl = h('p.lead', hints[0]);
    root.replaceChildren(
      h(
        'div.narrow.analysing',
        { 'aria-busy': 'true' },
        h('div.breath-loader', { 'aria-hidden': 'true' }, h('span'), h('span'), h('span')),
        h('h2.title', 'Bir az gözləyin'),
        hintEl,
        h('p.muted.small', 'Bu müddətdə bir dəfə dərindən nəfəs alın.'),
      ),
    );
    let i = 0;
    const startedWait = Date.now();
    const rot = setInterval(() => {
      i = (i + 1) % hints.length;
      // Təhlil ~55 saniyəyə qədər çəkə bilər — uzananda sakitləşdirici mətn göstəririk.
      hintEl.textContent =
        Date.now() - startedWait > 15000 && i === 0
          ? 'Bu dəfə bir az uzun çəkir. Narahat olmayın, görüşünüz artıq qorunur.'
          : hints[i];
    }, 3200);

    const minWait = new Promise((r) => setTimeout(r, 1400));
    pending = null; // bundan sonra yadda saxlamanı bu funksiya edir
    const [analysis] = await Promise.all([analysisPromise, minWait]);
    clearInterval(rot);

    let after;
    try {
      after = finishSession({ level: level.n, transcript, analysis, moodBefore, moodAfter });
    } catch (err) {
      console.error('[ui] görüş yadda saxlanmadı', err);
      after = getState();
    }
    if (!routeAlive) return;
    showResult({ analysis, moodBefore, moodAfter, stateAfter: after });
  }

  // ---------- 5. Nəticə ----------
  function showResult({ analysis, moodBefore, moodAfter, stateAfter }) {
    const newTasks = (stateAfter.tasks || []).filter((t) => t.level === level.n);
    const tasks = newTasks.length ? newTasks : analysis?.tasks || [];
    const upcoming = sortedLevels(stateAfter).filter((l) => l.status !== 'COMPLETED');
    const showProgram = level.n === 1 && upcoming.length > 0 && !!analysis?.program?.length;

    // Analiz alınmadısa: görüş artıq tamamlanıb, xülasəni yenidən istəmək olar (store.applyAnalysis).
    function retryBlock() {
      const msg = h(
        'p.muted',
        'Xülasəni bu dəfə hazırlaya bilmədim — narahat olmayın, görüşünüz yadda saxlanıldı.',
      );
      const btn = h(
        'button.btn.ghost.small',
        {
          type: 'button',
          onclick: async () => {
            btn.disabled = true;
            btn.replaceChildren(icon('refresh', 16), 'Hazırlanır… (bir dəqiqəyə qədər çəkə bilər)');
            const again = await retryAnalysis(level.n);
            if (!routeAlive) return;
            if (again) {
              showResult({ analysis: again, moodBefore, moodAfter, stateAfter: getState() });
            } else {
              btn.disabled = false;
              btn.replaceChildren(icon('refresh', 16), 'Yenidən cəhd et');
              msg.textContent = 'Hələ alınmadı. Bir az sonra yenidən cəhd edin — görüşünüz yerindədir.';
            }
          },
        },
        icon('refresh', 16),
        'Xülasəni yenidən hazırla',
      );
      return h('div.retry', msg, h('div.actions', btn));
    }

    root.replaceChildren(
      h(
        'div.result',
        h(
          'header.page-head.enter',
          h('p.eyebrow', `Level ${level.n} tamamlandı`),
          h('h1.display', 'Bu gün özünüzə ', h('em', 'vaxt ayırdınız.')),
          h(
            'div.mood-pair',
            chip('Əvvəl', moodBefore),
            h('span.mood-arrow', { 'aria-hidden': 'true' }, '→'),
            chip('Sonra', moodAfter),
          ),
        ),
        h(
          'div.grid-2',
          h(
            'div.stack',
            h(
              'section.card.enter',
              h('h2.subtitle', icon('leaf', 20), 'Görüşün xülasəsi'),
              analysis?.summary ? h('p.prose', analysis.summary) : retryBlock(),
              analysis?.mood?.note && h('p.ai-note', icon('sparkle', 18), analysis.mood.note),
            ),
            showProgram && programCard(upcoming, stateAfter.profile?.programSummary),
          ),
          h(
            'div.stack',
            h(
              'section.card.soft.enter',
              h('h2.subtitle', icon('check', 20), 'Yeni tapşırıqlar'),
              tasks.length
                ? h('ol.task-preview', tasks.map((t) => h('li', h('strong', t.title), t.instructions && h('p.muted.small', t.instructions))))
                : h('p.muted', 'Bu dəfə tapşırıq yoxdur. Sadəcə dincəlin.'),
              h('a.btn.ghost.small', { href: '#/tapsiriqlar' }, 'Tapşırıqlara keç', icon('arrow', 16)),
            ),
            h('a.btn.primary.wide', { href: '#/' }, 'Bu günə qayıt'),
          ),
        ),
      ),
    );
    announce(`Level ${level.n} tamamlandı.`);
  }

  showMoodBefore();
  // "Məşğul": canlı görüş və ya bitmiş, amma hələ əhvalı qeyd olunmamış görüş.
  return { cleanup, isLive: () => live || !!pending };
}

function chip(label, v) {
  return h('div.mood-chip', h('span.muted', label), h('strong', v == null ? '—' : `${moodFace(v).emoji} ${v}`));
}

function programCard(upcoming, summary) {
  return h(
    'section.card.program.enter',
    h('h2.subtitle', icon('map', 20), 'Sizin fərdi proqramınız'),
    summary && h('p.prose', summary),
    h(
      'ol.program-list',
      upcoming.map((l) =>
        h(
          'li',
          h('span.level-num', String(l.n)),
          h('div', h('strong', l.title), h('span.muted.small', l.scheduledDayKey ? formatDayLong(l.scheduledDayKey) : l.focus || '')),
        ),
      ),
    ),
    h('a.btn.ghost.small', { href: '#/xerite' }, 'Günləri seç', icon('calendar', 16)),
  );
}

function closedRoom(state, level, g) {
  const opens = g.opensOn || sortedLevels(state).find((l) => l.status !== 'COMPLETED' && l.scheduledDayKey)?.scheduledDayKey;
  if (g.reason === 'offline') {
    return h(
      'div.narrow.closed-room',
      h('div.sleep-orb', { 'aria-hidden': 'true' }),
      h('h1.title', 'Serverlə əlaqə yoxdur'),
      h('p.lead', 'Gündəlik kilid serverin vaxtına əsaslanır. İnternet bağlantınızı yoxlayın və "Bu gün" səhifəsindən yenidən cəhd edin.'),
      h('div.actions', h('a.btn.primary', { href: '#/' }, 'Bu günə qayıt')),
    );
  }
  const title =
    g.reason === 'finished'
      ? 'Proqramınızı tamamladınız'
      : g.reason === 'done-today'
        ? 'Bu günkü görüşümüz bitdi'
        : 'Görüş otağı hələ bağlıdır';
  const body =
    g.reason === 'finished'
      ? 'Bütün levelləri keçdiniz. Qeydləriniz və qrafikiniz "Vəziyyətim" bölməsindədir.'
      : g.reason === 'done-today'
        ? 'Hər gün bir görüş kifayətdir: eşitdiklərinizin yerinə oturmasına vaxt verək. Bu arada tapşırıqlarınızı sınayın.'
        : 'Növbəti level seçdiyiniz gündə açılacaq.';
  return h(
    'div.narrow.closed-room',
    h('div.sleep-orb', { 'aria-hidden': 'true' }),
    h('h1.title', title),
    h('p.lead', body),
    opens && g.reason !== 'finished' &&
      h('div.opens', icon('calendar', 20), h('div', h('span.muted', `Level ${level?.n ?? ''} açılır`), h('strong', cap(relativeDay(opens))))),
    h(
      'div.actions',
      h('a.btn.ghost', { href: '#/tapsiriqlar' }, 'Tapşırıqlar'),
      h('a.btn.primary', { href: '#/xerite' }, 'Yol Xəritəsi'),
    ),
  );
}

const cap = (s) => (s ? s[0].toLocaleUpperCase('az') + s.slice(1) : s);
