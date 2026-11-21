// Səs köməkçiləri: mikrofon (16 kHz PCM16 çıxış) və oxuyucu (24 kHz PCM16 giriş).
// Asılılıq yoxdur, brauzer ES modulu.

export const IN_RATE = 16000;
export const OUT_RATE = 24000;

const WORKLET_URL = new URL('./worklet.js', import.meta.url);

export function b64ToInt16(b64) {
  const bin = atob(b64);
  const len = bin.length & ~1; // PCM16 üçün cüt bayt
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return new Int16Array(u8.buffer);
}

export function int16ToB64(i16) {
  const u8 = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function makeContext(opts) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) throw new Error('AudioContext dəstəklənmir');
  try { return new AC(opts); } catch { return new AC(); }
}

function keepRunning(ctx, isAlive) {
  // iOS/Safari zəng və ya fon zamanı konteksti "interrupted/suspended" edir — geri qaytarırıq.
  ctx.onstatechange = () => {
    if (isAlive() && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
  };
}

function analyserRms(analyser, buf) {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/** Mikrofon: getUserMedia → AudioWorklet → onchunk(Int16Array 16 kHz). */
export class Mic {
  constructor() {
    // Kontekst sinxron yaradılır ki, istifadəçi jesti (klik) daxilində resume olunsun.
    this.ctx = makeContext({ latencyHint: 'interactive' });
    this.ctx.resume().catch(() => {});
    this.closed = false;
    this.muted = false;
    this.onchunk = null;
    this.stream = null;
    this.src = null;
    this.node = null;
    this.analyser = null;
    this._buf = null;
    keepRunning(this.ctx, () => !this.closed);
  }

  async open() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const e = new Error('getUserMedia yoxdur'); e.name = 'NotSupportedError'; throw e;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    if (this.closed) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream;
    stream.getAudioTracks().forEach(t => { t.enabled = !this.muted; });

    await this.ctx.audioWorklet.addModule(WORKLET_URL);
    if (this.closed) return;

    this.src = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0;
    this._buf = new Float32Array(this.analyser.fftSize);
    this.node = new AudioWorkletNode(this.ctx, 'pcm16-capture', {
      processorOptions: { targetRate: IN_RATE, chunk: 800 },
    });
    this.node.port.onmessage = e => { if (!this.muted && !this.closed && this.onchunk) this.onchunk(e.data); };
    this.src.connect(this.analyser);
    this.src.connect(this.node); // node təyinata qoşulmur: səs dinamikdən çıxmır
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
  }

  setMuted(on) {
    this.muted = !!on;
    if (this.stream) this.stream.getAudioTracks().forEach(t => { t.enabled = !this.muted; });
  }

  rms() {
    if (!this.analyser || this.muted) return 0;
    return analyserRms(this.analyser, this._buf);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.onchunk = null;
    if (this.node) { this.node.port.onmessage = null; try { this.node.port.close(); } catch {} try { this.node.disconnect(); } catch {} }
    if (this.src) try { this.src.disconnect(); } catch {}
    if (this.analyser) try { this.analyser.disconnect(); } catch {}
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.ctx.onstatechange = null;
    this.ctx.close().catch(() => {});
    this.node = this.src = this.analyser = this.stream = null;
  }
}

/**
 * Oxuyucu: 24 kHz PCM16 hissələri boşluqsuz ardıcıl planlaşdırır.
 * Kontekst 24 kHz-dədir ki, hissələrin sərhədində resampling xırıltısı olmasın.
 * interrupt(): 12 ms-də səsi sıfıra endirib bütün mənbələri dayandırır (klik olmadan).
 */
export class Player {
  constructor() {
    this.ctx = makeContext({ sampleRate: OUT_RATE, latencyHint: 'interactive' });
    this.ctx.resume().catch(() => {});
    this.closed = false;
    this.onstart = null; // səs başlayanda
    this.onidle = null;  // planlaşdırılmış səs bitəndə
    this.sources = new Set();
    this.endAt = 0;
    this.lead = 0.06;     // jitter buferi (san); orta-növbə boşluğu olarsa böyüyür
    this.streaming = false;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0;
    this._buf = new Float32Array(this.analyser.fftSize);
    this.analyser.connect(this.ctx.destination);
    this._newBus();
    keepRunning(this.ctx, () => !this.closed);
  }

  _newBus() {
    this.bus = this.ctx.createGain();
    this.bus.connect(this.analyser);
  }

  get playing() { return this.sources.size > 0; }

  push(i16) {
    if (this.closed || !i16.length) return;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, i16.length, OUT_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768;

    const now = ctx.currentTime;
    let t = this.endAt;
    if (t < now + 0.005) {
      // Növbə ortasında bufer boşaldısa, şəbəkə titrəyir — buferi bir az artırırıq.
      if (this.streaming && this.endAt > 0) this.lead = Math.min(0.2, this.lead + 0.03);
      t = now + this.lead;
      // Sükutdan başlayanda kiçik fade-in (2 ms) — klik olmasın.
      const f = Math.min(ch.length, 48);
      for (let i = 0; i < f; i++) ch[i] *= i / f;
    }
    this.streaming = true;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.bus);
    src.start(t);
    this.endAt = t + buf.duration;
    const wasIdle = this.sources.size === 0;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      try { src.disconnect(); } catch {}
      if (!this.sources.size && !this.closed && this.onidle) this.onidle();
    };
    if (wasIdle && this.onstart) this.onstart();
  }

  /** Model növbəsi bitdi: növbəti hissə yeni növbədir (jitter sayğacı üçün). */
  markTurnEnd() { this.streaming = false; }

  interrupt() {
    if (this.closed) return;
    const had = this.sources.size > 0;
    const now = this.ctx.currentTime;
    const bus = this.bus;
    const g = bus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.012);
    const old = [...this.sources];
    for (const s of old) { s.onended = null; try { s.stop(now + 0.015); } catch {} }
    this.sources.clear();
    this.endAt = 0;
    this.streaming = false;
    this._newBus();
    setTimeout(() => {
      old.forEach(s => { try { s.disconnect(); } catch {} });
      try { bus.disconnect(); } catch {}
    }, 80);
    if (had && this.onidle) this.onidle();
  }

  rms() {
    if (!this.sources.size) return 0;
    return analyserRms(this.analyser, this._buf);
  }

  close() {
    if (this.closed) return;
    for (const s of this.sources) { s.onended = null; try { s.stop(); } catch {} try { s.disconnect(); } catch {} }
    this.sources.clear();
    this.closed = true;
    this.onstart = this.onidle = null;
    this.ctx.onstatechange = null;
    this.ctx.close().catch(() => {});
  }
}
