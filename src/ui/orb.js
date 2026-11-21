// Nəfəs alan orb — Canvas, requestAnimationFrame, LiveSession.level-ə reaksiya verir.
// Rejimlər: connecting | listening | you | ai | idle | ended
import { prefersReducedMotion } from './dom.js';

const PALETTE = {
  light: {
    connecting: [154, 176, 166],
    listening: [53, 104, 89], // #356859 adaçayı
    you: [74, 140, 116], // daha canlı adaçayı
    ai: [184, 116, 91], // #B8745B gil
    idle: [53, 104, 89],
    ended: [168, 162, 154],
    glowAlpha: 0.22,
  },
  dark: {
    connecting: [96, 122, 112],
    listening: [136, 192, 172], // #88C0AC
    you: [170, 214, 196],
    ai: [184, 116, 91],
    idle: [136, 192, 172],
    ended: [110, 116, 112],
    glowAlpha: 0.28,
  },
};

const TAU = Math.PI * 2;

export function createOrb(canvas, { getLevel = () => 0, getMode = () => 'idle' } = {}) {
  const ctx = canvas.getContext('2d');
  const darkMq = window.matchMedia?.('(prefers-color-scheme: dark)');
  let raf = 0;
  let w = 0;
  let hgt = 0;
  let dpr = 1;
  let smooth = 0; // hamarlanmış səs səviyyəsi
  let color = null;
  let spin = 0;
  const ripples = []; // { r, a }
  let lastRipple = 0;
  let last = performance.now();
  const reduced = prefersReducedMotion();

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, rect.width);
    hgt = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  resize();

  const pal = () => (darkMq?.matches ? PALETTE.dark : PALETTE.light);
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  function blobPath(cx, cy, r, amp, t, seed) {
    const n = 96;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const wobble =
        Math.sin(a * 3 + t * 0.9 + seed) * 0.5 +
        Math.sin(a * 5 - t * 1.3 + seed * 2) * 0.3 +
        Math.sin(a * 2 + t * 0.6 - seed) * 0.2;
      const rr = r * (1 + amp * wobble);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    const mode = getMode();
    const p = pal();
    const target = p[mode] || p.idle;
    color = color ? mix(color, target, Math.min(1, dt * 3)) : [...target];

    const raw = Math.max(0, Math.min(1, Number(getLevel()) || 0));
    const lv = mode === 'connecting' || mode === 'ended' ? 0 : raw;
    smooth += (lv - smooth) * Math.min(1, dt * (lv > smooth ? 14 : 5));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);

    const cx = w / 2;
    const cy = hgt / 2;
    const base = Math.min(w, hgt) * 0.27;

    // Nəfəs: ~6 saniyəlik dövr (4 saniyə al, 2 ver hissi verən yumşaq sinus)
    const breathSpeed = mode === 'ended' ? 0.4 : 1;
    const breath = reduced ? 0 : Math.sin((t * TAU * breathSpeed) / 6);
    const r = base * (1 + 0.05 * breath + (reduced ? 0.06 : 0.2) * smooth);

    let amp = 0;
    if (!reduced) {
      if (mode === 'you') amp = 0.025 + 0.13 * smooth;
      else if (mode === 'ai') amp = 0.02 + 0.07 * smooth;
      else if (mode === 'connecting') amp = 0.012;
      else amp = 0.018;
    }

    // Arxa parıltı
    const glowR = r * (1.9 + 0.4 * smooth);
    const g = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, glowR);
    g.addColorStop(0, rgba(color, p.glowAlpha + 0.18 * smooth));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hgt);

    // Siz danışanda yumşaq dalğalar
    if (!reduced && mode === 'you' && smooth > 0.12 && now - lastRipple > 520) {
      ripples.push({ r: r * 1.02, a: 0.35 * Math.min(1, smooth * 1.6) });
      lastRipple = now;
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += dt * base * 0.55;
      rp.a -= dt * 0.28;
      if (rp.a <= 0) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, rp.r, 0, TAU);
      ctx.strokeStyle = rgba(color, rp.a);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Üç qat yumşaq blob
    const layers = [
      { s: 1.12, a: 0.18, seed: 0.0, sp: 0.7 },
      { s: 1.04, a: 0.32, seed: 2.1, sp: 1.0 },
      { s: 1.0, a: 0.9, seed: 4.2, sp: 1.2 },
    ];
    for (const L of layers) {
      blobPath(cx, cy, r * L.s, amp * (L.s > 1 ? 1.2 : 1), t * L.sp * (mode === 'ai' ? 0.8 : 1), L.seed);
      const lg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * L.s);
      lg.addColorStop(0, rgba(mix(color, [255, 255, 255], 0.35), L.a));
      lg.addColorStop(1, rgba(color, L.a));
      ctx.fillStyle = lg;
      ctx.fill();
    }

    // İşıq ləkəsi
    const hl = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.38, 0, cx - r * 0.32, cy - r * 0.38, r * 0.7);
    hl.addColorStop(0, 'rgba(255,255,255,0.28)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();

    // Qoşulur: orbun ətrafında fırlanan nöqtələr
    if (mode === 'connecting') {
      spin += dt * (reduced ? 0.6 : 1.6);
      const dots = 12;
      for (let i = 0; i < dots; i++) {
        const a = spin + (i / dots) * TAU;
        const fade = (i / dots) ** 1.6;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * 1.35, 2.2 + fade * 1.6, 0, TAU);
        ctx.fillStyle = rgba(color, 0.15 + fade * 0.6);
        ctx.fill();
      }
    }

    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    },
  };
}
