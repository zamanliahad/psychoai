// LiveSession — Gemini Live ilə real vaxtda səsli söhbət.
// İnterfeys (plan, Task 5):
//   new LiveSession({ systemPrompt, voice = "Kore" })
//   start(): Promise<void>  stop()  mute(on)  sendText(t)  get level(): 0..1
//   events: state {state}, transcript {who, text, final}, error {code, message}
import { Mic, Player, b64ToInt16, int16ToB64, IN_RATE } from './audio.js';

export const DEFAULT_MODEL = 'gemini-3.8-live';
const SETUP_TIMEOUT_MS = 15000;
const MAX_BUFFERED = 1 << 20; // şəbəkə ilişəndə yaddaş böyüməsin

/** Ephemeral token ilə WebSocket ünvanı. Dəyişmək lazım olsa — yalnız burada. */
export function buildLiveUrl(token) {
  return 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained'
    + '?access_token=' + encodeURIComponent(token);
}

export function buildSetup({ model = DEFAULT_MODEL, voice = 'Kore', systemPrompt = '', handle = null } = {}) {
  const setup = {
    model: model.startsWith('models/') ? model : 'models/' + model,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // Uzun seanslar (15 dəq+) kəsilməsin və goAway-dən sonra davam etmək olsun.
    contextWindowCompression: { slidingWindow: {} },
    sessionResumption: handle ? { handle } : {},
    // Psixoloji söhbətdə insan tez-tez fikirləşib dayanır: AI araya girməsin,
    // fon səsi (öskürək, qapı) də AI-ın sözünü yarıda kəsməsin.
    realtimeInputConfig: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
        endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
        prefixPaddingMs: 300,
        silenceDurationMs: 1200,
      },
    },
  };
  if (systemPrompt) setup.systemInstruction = { parts: [{ text: systemPrompt }] };
  return { setup };
}

export const MESSAGES = {
  'mic-denied': 'Mikrofona icazə verilmədi. Ünvan sətrindəki kilid işarəsinə toxunub mikrofona icazə verin və yenidən cəhd edin.',
  'mic-missing': 'Mikrofon tapılmadı. Mikrofonun qoşulu olduğunu yoxlayın və yenidən cəhd edin.',
  'mic-insecure': 'Bu brauzer mikrofona çıxışı yalnız təhlükəsiz (https) səhifədə verir.',
  'mic-busy': 'Mikrofon başqa proqram tərəfindən istifadə olunur. Onu bağlayın və yenidən cəhd edin.',
  token: 'Görüş üçün giriş açarı alınmadı. Bir az sonra yenidən cəhd edin.',
  network: 'İnternet bağlantısında problem var. Bağlantını yoxlayın və yenidən cəhd edin.',
  closed: 'Bağlantı kəsildi. Söhbət yadda saxlanıldı — yenidən qoşula və ya görüşü tamamlaya bilərsiniz.',
};

function micMessage(e) {
  const n = e && e.name;
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return MESSAGES['mic-missing'];
  if (n === 'NotSupportedError' || n === 'TypeError') return MESSAGES['mic-insecure'];
  if (n === 'NotReadableError' || n === 'AbortError') return MESSAGES['mic-busy'];
  return MESSAGES['mic-denied'];
}

function codeErr(code, extra) { return Object.assign(new Error(code), { code }, extra); }

const decoder = new TextDecoder();
function parse(data) {
  try { return JSON.parse(typeof data === 'string' ? data : decoder.decode(data)); } catch { return null; }
}

function detach(ws) {
  if (!ws) return;
  ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
  try { ws.close(1000); } catch {}
}

export class LiveSession extends EventTarget {
  constructor({ systemPrompt = '', voice = 'Kore', tokenUrl = '/api/token', greeting = 'Salam' } = {}) {
    super();
    this.systemPrompt = systemPrompt;
    this.voice = voice;
    this.tokenUrl = tokenUrl;
    this.greeting = greeting;
    /** Bütün söhbət: [{who:"you"|"ai", text, final}] — bağlantı kəsilsə də qalır. */
    this.transcript = [];
    this._state = 'ended';
    this._muted = false;
    this._run = 0;
    this._active = false;
    this._ready = false;
    this._ws = null;
    this._mic = null;
    this._player = null;
    this._handle = null;
    this._reconnecting = false;
    this._aiDone = true;
    this._cur = { you: null, ai: null };
    this._lvl = 0;
    this._lvlT = 0;
    this._onPageHide = () => this.stop();
  }

  get state() { return this._state; }
  get muted() { return this._muted; }

  /** Orb üçün 0..1 hamar səviyyə: AI danışanda çıxış, əks halda mikrofon. */
  get level() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = this._lvlT ? Math.min(0.1, Math.max(0.001, (now - this._lvlT) / 1000)) : 0.016;
    this._lvlT = now;
    let rms = 0;
    if (this._active) {
      if (this._player && this._player.playing) rms = this._player.rms();
      else if (this._ready && !this._muted && this._mic) rms = this._mic.rms();
    }
    const target = Math.min(1, Math.sqrt(Math.max(0, rms - 0.004)) * 2.2);
    const tau = target > this._lvl ? 0.035 : 0.3; // sürətli qalxma, yavaş enmə
    this._lvl += (target - this._lvl) * (1 - Math.exp(-dt / tau));
    if (this._lvl < 0.0005) this._lvl = 0;
    return this._lvl;
  }

  /** Klik hadisəsinin içində çağır (AudioContext jestlə açılır). Xətalar `error` hadisəsi ilə gəlir. */
  start() {
    if (this._active) return this._startPromise;
    const run = ++this._run;
    this._active = true;
    this._ready = false;
    this._setState('connecting');
    try {
      this._mic = new Mic();
      this._player = new Player();
    } catch (e) {
      this._startPromise = Promise.resolve(this._fail(run, 'network', 'Bu brauzer səsli söhbəti dəstəkləmir. Saytı Chrome və ya Edge-də açın.'));
      return this._startPromise;
    }
    this._player.onstart = () => { if (run === this._run && this._ready) this._setState('speaking'); };
    this._player.onidle = () => { if (run === this._run && this._ready) this._setState('listening'); };
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this._onPageHide);
    this._startPromise = this._boot(run);
    return this._startPromise;
  }

  stop() {
    if (!this._active && this._state === 'ended') return;
    this._run++;
    this._teardown();
    this._setState('ended');
  }

  mute(on) {
    this._muted = !!on;
    if (this._mic) this._mic.setMuted(this._muted);
    if (this._muted) this._send({ realtimeInput: { audioStreamEnd: true } });
  }

  /** Yazılı mesaj göndərir. Qoşulu deyilsə false qaytarır. */
  sendText(t) {
    const text = String(t ?? '').trim();
    if (!text || !this._ready) return false;
    this._finalize('you');
    this._finalize('ai');
    if (this._player && this._player.playing) this._player.interrupt();
    const entry = { who: 'you', text, final: true };
    this.transcript.push(entry);
    this._emitTranscript('you', text, true);
    return this._send({ realtimeInput: { text } });
  }

  // ---------------------------------------------------------------- daxili

  _stale(run) { return run !== this._run; }

  async _boot(run) {
    try {
      await this._mic.open();
    } catch (e) {
      if (this._stale(run)) return;
      return this._fail(run, 'mic-denied', micMessage(e));
    }
    if (this._stale(run)) return;
    this._mic.setMuted(this._muted);
    this._mic.onchunk = i16 => this._sendAudio(i16);

    let res;
    try {
      res = await this._connectBest(run);
    } catch (e) {
      if (this._stale(run) || e.code === 'stale') return;
      return this._fail(run, e.code === 'token' ? 'token' : 'network', undefined, e.reason);
    }
    if (this._stale(run)) return;
    this._attach(run, res.ws);
    this._ready = true;
    this._setState(this._player.playing ? 'speaking' : 'listening');
    this._kickoff(res.resumed);
  }

  /** Mümkünsə əvvəlki seansı davam etdir (resumption handle), olmazsa təzə seans. */
  async _connectBest(run) {
    if (this._handle) {
      try {
        return { ws: await this._openSocket(run, this._handle, this.systemPrompt), resumed: true };
      } catch (e) {
        if (e.code === 'token' || e.code === 'stale' || !e.serverRejected) throw e;
        this._handle = null; // köhnəlib — təzə seans açırıq
      }
    }
    const prompt = this.transcript.length ? this._promptWithHistory() : this.systemPrompt;
    return { ws: await this._openSocket(run, null, prompt), resumed: false };
  }

  _kickoff(resumed) {
    if (resumed) return;
    if (this.transcript.length) {
      this._send({ realtimeInput: { text: '(Bağlantı bir anlıq kəsildi və bərpa olundu. Söhbəti qaldığımız yerdən qısa və təbii davam etdir.)' } });
    } else if (this.greeting) {
      this._send({ realtimeInput: { text: this.greeting } });
    }
  }

  _promptWithHistory() {
    const lines = this.transcript.slice(-40).map(e => (e.who === 'you' ? 'İstifadəçi: ' : 'Sən: ') + e.text.trim());
    return this.systemPrompt + '\n\nBu söhbətin davamıdır, bağlantı kəsilmişdi. İndiyə qədərki söhbət:\n' + lines.join('\n');
  }

  async _fetchToken() {
    let r;
    try {
      r = await fetch(this.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    } catch {
      throw codeErr('network');
    }
    if (!r.ok) throw codeErr('token', { reason: 'HTTP ' + r.status });
    let j;
    try { j = await r.json(); } catch { throw codeErr('token', { reason: 'bad json' }); }
    if (!j || !j.token) throw codeErr('token', { reason: 'no token' });
    return j;
  }

  /** Token al, WebSocket aç, setup göndər, setupComplete-i gözlə. */
  async _openSocket(run, handle, systemPrompt) {
    const tok = await this._fetchToken();
    if (this._stale(run)) throw codeErr('stale');
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(buildLiveUrl(tok.token)); } catch { reject(codeErr('network')); return; }
      ws.binaryType = 'arraybuffer';
      let settled = false;
      let opened = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) { detach(ws); reject(err); }
        else resolve(ws);
      };
      const timer = setTimeout(() => finish(codeErr('network', { reason: 'setup timeout' })), SETUP_TIMEOUT_MS);
      ws.onopen = () => {
        opened = true;
        if (this._stale(run)) { finish(codeErr('stale')); return; }
        ws.send(JSON.stringify(buildSetup({ model: tok.model || DEFAULT_MODEL, voice: this.voice, systemPrompt, handle })));
      };
      ws.onmessage = ev => {
        const msg = parse(ev.data);
        if (!msg || !msg.setupComplete) return;
        if (this._stale(run)) { finish(codeErr('stale')); return; }
        finish(null);
      };
      ws.onerror = () => {}; // ardınca close gəlir
      ws.onclose = e => {
        const reason = `${e.code} ${e.reason || ''}`.trim();
        const auth = /token|auth|expired|permission|credential|api key|unauthor/i.test(e.reason || '');
        finish(codeErr(auth ? 'token' : 'network', { reason, serverRejected: opened }));
      };
    });
  }

  _attach(run, ws) {
    const old = this._ws;
    this._ws = ws;
    ws.onmessage = ev => {
      if (this._stale(run) || ws !== this._ws) return;
      const msg = parse(ev.data);
      if (msg) this._onMessage(run, msg);
    };
    ws.onerror = () => {};
    ws.onclose = e => {
      if (this._stale(run) || ws !== this._ws) return;
      this._ws = null;
      this._ready = false;
      console.warn('[voice] Live bağlantısı bağlandı:', e.code, e.reason);
      this._reconnect(run, false);
    };
    if (old && old !== ws) detach(old);
  }

  _onMessage(run, msg) {
    const up = msg.sessionResumptionUpdate;
    // resumable:false model danışarkən gəlir — onda köhnə handle qalır.
    if (up && up.resumable && up.newHandle) this._handle = up.newHandle;
    if (msg.goAway) {
      // Server tezliklə bağlayacaq: yeni bağlantını öncədən açıb səssizcə keçirik.
      this._reconnect(run, true);
    }
    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      this._player.interrupt();
      this._finalize('ai');
      this._aiDone = true;
      if (this._ready) this._setState('listening');
    }

    const youText = sc.inputTranscription && sc.inputTranscription.text;
    if (youText) {
      // Model generasiyanı bitirib, amma bufer hələ çalır və istifadəçi danışır → yerli dayandırma.
      if (this._aiDone && this._player.playing) this._player.interrupt();
      this._append('you', youText);
    }

    const aiText = sc.outputTranscription && sc.outputTranscription.text;
    if (aiText) {
      this._finalize('you');
      this._aiDone = false;
      this._append('ai', aiText);
    }

    const parts = sc.modelTurn && sc.modelTurn.parts;
    if (parts) {
      for (const p of parts) {
        const d = p.inlineData;
        if (!d || !d.data || p.thought) continue;
        if (d.mimeType && !/^audio\/pcm/i.test(d.mimeType)) continue;
        this._finalize('you');
        this._aiDone = false;
        this._player.push(b64ToInt16(d.data));
      }
    }

    if (sc.turnComplete) {
      this._finalize('you');
      this._finalize('ai');
      this._aiDone = true;
      this._player.markTurnEnd();
      if (this._ready && !this._player.playing) this._setState('listening');
    }
  }

  async _reconnect(run, graceful) {
    if (this._reconnecting || this._stale(run)) return;
    this._reconnecting = true;
    if (!graceful) this._setState('connecting');
    const delays = [0, 800, 2000];
    for (const d of delays) {
      if (d) await new Promise(r => setTimeout(r, d));
      if (this._stale(run)) return;
      try {
        const res = await this._connectBest(run);
        if (this._stale(run)) { detach(res.ws); return; }
        this._attach(run, res.ws);
        this._reconnecting = false;
        this._ready = true;
        this._setState(this._player.playing ? 'speaking' : 'listening');
        this._kickoff(res.resumed);
        return;
      } catch (e) {
        if (this._stale(run) || e.code === 'stale') return;
        console.warn('[voice] yenidən qoşulma alınmadı:', e.code, e.reason || '');
        if (graceful && this._ws) continue; // köhnə bağlantı hələ işləyir
      }
    }
    this._reconnecting = false;
    if (graceful && this._ws) return; // köhnə bağlantı bağlananda yenidən cəhd olunacaq
    this._fail(run, 'closed');
  }

  _sendAudio(i16) {
    if (!this._ready || this._muted) return;
    this._send({ realtimeInput: { audio: { data: int16ToB64(i16), mimeType: 'audio/pcm;rate=' + IN_RATE } } }, true);
  }

  _send(obj, droppable = false) {
    const ws = this._ws;
    if (!ws || ws.readyState !== 1) return false;
    if (droppable && ws.bufferedAmount > MAX_BUFFERED) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
  }

  _append(who, chunk) {
    let e = this._cur[who];
    if (!e) {
      e = { who, text: '', final: false };
      this._cur[who] = e;
      this.transcript.push(e);
    }
    e.text += chunk;
    this._emitTranscript(who, chunk, false, e.text);
  }

  _finalize(who) {
    const e = this._cur[who];
    if (!e) return;
    this._cur[who] = null;
    e.text = e.text.trim();
    e.final = true;
    if (!e.text) {
      const i = this.transcript.indexOf(e);
      if (i >= 0) this.transcript.splice(i, 1);
      return;
    }
    this._emitTranscript(who, e.text, true);
  }

  _emitTranscript(who, text, final, full = text) {
    // text: final:false olanda yeni hissə (delta), final:true olanda növbənin tam mətni.
    // full: həmişə növbənin indiyə qədərki tam mətni.
    this.dispatchEvent(new CustomEvent('transcript', { detail: { who, text, final, full } }));
  }

  _setState(s) {
    if (this._state === s) return;
    this._state = s;
    this.dispatchEvent(new CustomEvent('state', { detail: { state: s } }));
  }

  _fail(run, code, message, reason) {
    if (this._stale(run)) return;
    this._run++;
    this._teardown();
    this.dispatchEvent(new CustomEvent('error', { detail: { code, message: message || MESSAGES[code], reason } }));
    this._setState('ended');
  }

  _teardown() {
    this._finalize('you');
    this._finalize('ai');
    this._active = false;
    this._ready = false;
    this._reconnecting = false;
    this._aiDone = true;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this._onPageHide);
    detach(this._ws);
    this._ws = null;
    if (this._mic) { this._mic.close(); this._mic = null; }
    if (this._player) { this._player.close(); this._player = null; }
    this._lvl = 0;
  }
}
