// AudioWorklet: mikrofon səsini 16 kHz mono PCM16 hissələrə çevirir.
// Kontekst istənilən tezlikdə ola bilər (44.1/48 kHz); burada qutu filtri ilə
// azaldılır (box-filter decimation) — nitq üçün kifayət qədər təmiz və ucuzdur.
class Pcm16Capture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.target = o.targetRate || 16000;
    this.ratio = Math.max(1, sampleRate / this.target);
    this.size = o.chunk || 800; // 800 nümunə = 50 ms
    this.out = new Int16Array(this.size);
    this.n = 0;
    this.acc = 0;
    this.cnt = 0;
    this.phase = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i];
      this.cnt++;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        let x = this.acc / this.cnt;
        this.acc = 0;
        this.cnt = 0;
        x = x < -1 ? -1 : x > 1 ? 1 : x;
        this.out[this.n++] = x < 0 ? x * 32768 : x * 32767;
        if (this.n === this.size) {
          this.port.postMessage(this.out, [this.out.buffer]);
          this.out = new Int16Array(this.size);
          this.n = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('pcm16-capture', Pcm16Capture);
