// Fully synthesized WebAudio sound effects – no assets needed.
export class AudioFX {
  ctx = null;
  master = null;
  noiseBuf = null;
  sirenGain = null;
  sirenOsc = null;
  sirenLfo = null;
  windGain = null;
  windSrc = null;
  heliSrc = null;
  heliLfo = null;
  geigerAcc = 0;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  ready() {
    return !!(this.ctx && this.ctx.state === 'running');
  }

  noise(duration, freq, q, vol, type = 'lowpass', attack = 0.002, delay = 0) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + duration + 0.05);
  }

  tone(freq, duration, vol, type = 'sine', endFreq) {
    if (!this.ready()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  gunshot(kind, distance = 0) {
    const att = Math.max(0.08, 1 - distance / 120);
    const pitch = 0.92 + Math.random() * 0.16;
    if (kind === 'shotgun') {
      this.noise(0.55, 1800 * pitch, 0.7, 0.9 * att);
      this.noise(0.25, 300 * pitch, 1, 0.8 * att);
    } else if (kind === 'sniper') {
      this.noise(0.85, 2400 * pitch, 0.45, 0.95 * att);
      this.noise(0.42, 260 * pitch, 1, 0.8 * att);
      this.tone(95, 0.32, 0.24, 'sawtooth', 38);
    } else if (kind === 'rifle') {
      this.noise(0.22, 3500 * pitch, 0.6, 0.6 * att);
      this.noise(0.12, 600 * pitch, 1, 0.5 * att);
    } else if (kind === 'fists') {
      this.noise(0.08, 500 * pitch, 1, 0.4);
    } else {
      this.noise(0.28, 2600 * pitch, 0.6, 0.65 * att);
      this.noise(0.1, 450 * pitch, 1, 0.5 * att);
    }
  }

  click() {
    this.tone(1400, 0.04, 0.08, 'square');
  }

  reload() {
    this.tone(700, 0.05, 0.12, 'square');
    setTimeout(() => this.tone(500, 0.06, 0.12, 'square'), 350);
  }

  glass() {
    for (let i = 0; i < 6; i++) {
      this.noise(0.15 + Math.random() * 0.3, 5000 + Math.random() * 4000, 4, 0.25, 'bandpass', 0.002, i * 0.04);
    }
  }

  alarm() {
    if (!this.ctx) return;
    for (let i = 0; i < 6; i++) setTimeout(() => this.tone(i % 2 ? 900 : 1200, 0.25, 0.12, 'square'), i * 260);
  }

  pickup() {
    this.tone(660, 0.08, 0.15, 'triangle');
    setTimeout(() => this.tone(990, 0.12, 0.15, 'triangle'), 70);
  }

  hurt() {
    this.noise(0.18, 300, 2, 0.5);
    this.tone(160, 0.2, 0.2, 'sawtooth', 90);
  }

  growl() {
    this.tone(110, 0.5, 0.18, 'sawtooth', 70);
  }

  eat() {
    this.noise(0.1, 900, 2, 0.25, 'bandpass');
    this.noise(0.1, 900, 2, 0.25, 'bandpass', 0.002, 0.15);
  }

  explosion(vol = 1) {
    this.noise(7.5, 160, 0.9, 1.0 * vol, 'lowpass', 0.04);
    this.noise(4.2, 850, 0.5, 0.7 * vol, 'lowpass', 0.01);
    this.noise(1.6, 2400, 0.7, 0.45 * vol, 'bandpass', 0.005);
    this.tone(42, 6, 0.75 * vol, 'sine', 20);
  }

  throwGrenade() {
    this.tone(920, 0.04, 0.1, 'triangle');
    this.noise(0.16, 1100, 1.4, 0.25, 'bandpass', 0.02);
  }

  footstep(surface = 'concrete') {
    if (!this.ready()) return;
    const pitch = 0.9 + Math.random() * 0.22;
    if (surface === 'water' || surface === 'puddle') {
      this.noise(0.16, 1300 * pitch, 1.2, 0.18, 'bandpass', 0.004);
      this.tone(360 * pitch, 0.09, 0.05, 'sine', 640);
    } else if (surface === 'gravel') {
      this.noise(0.085, 2900 * pitch, 0.9, 0.14, 'bandpass', 0.002);
    } else if (surface === 'snow') {
      this.noise(0.11, 2100 * pitch, 1.4, 0.12, 'bandpass', 0.003);
    } else if (surface === 'drought' || surface === 'dirt' || surface === 'grass') {
      this.noise(0.07, 650 * pitch, 1.1, 0.11, 'lowpass', 0.002);
    } else {
      this.noise(0.045, 520 * pitch, 1.2, 0.09, 'lowpass', 0.002);
    }
  }

  geiger(rate, dt) {
    if (!this.ctx || rate <= 0.02) return;
    this.geigerAcc += dt * Math.min(rate * 6, 40);
    while (this.geigerAcc > 1) {
      this.geigerAcc -= Math.random() * 2;
      this.noise(0.012, 4000, 1, 0.22, 'highpass', 0.001, Math.random() * 0.05);
    }
  }

  startSiren() {
    if (!this.ready() || this.sirenOsc) return;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 450;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lg = this.ctx.createGain();
    lg.gain.value = 230;
    lfo.connect(lg).connect(o.frequency);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    o.connect(f).connect(g).connect(this.master);
    o.start();
    lfo.start();
    this.sirenOsc = o;
    this.sirenLfo = lfo;
    this.sirenGain = g;
  }

  setSiren(v) {
    if (this.sirenGain && this.ready()) this.sirenGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.5);
  }

  stopSiren() {
    try {
      this.sirenOsc?.stop();
      this.sirenLfo?.stop();
    } catch {
      /* noop */
    }
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenGain = null;
  }

  startWind(vol = 0.15) {
    if (!this.ready()) return;
    this.stopWind();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500;
    f.Q.value = 0.6;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lg = this.ctx.createGain();
    lg.gain.value = 250;
    lfo.connect(lg).connect(f.frequency);
    lfo.start();
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.windSrc = src;
    this.windGain = g;
  }

  stopWind() {
    try {
      this.windSrc?.stop();
    } catch {
      /* noop */
    }
    this.windSrc = null;
  }

  startHeli(vol = 0.24) {
    if (!this.ready()) return;
    this.stopHeli();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 11.5;
    const lg = this.ctx.createGain();
    lg.gain.value = vol * 0.65;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.heliSrc = src;
    this.heliLfo = lfo;
  }

  stopHeli() {
    try {
      this.heliSrc?.stop();
      this.heliLfo?.stop();
    } catch {
      /* noop */
    }
    this.heliSrc = null;
    this.heliLfo = null;
  }

  stopAll() {
    this.stopSiren();
    this.stopWind();
    this.stopHeli();
  }
}

export const audio = new AudioFX();
