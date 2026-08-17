/**
 * All sound is synthesised with the Web Audio API so the game ships with no
 * binary assets. Browsers require a user gesture before audio may start, so the
 * context is created lazily on the first `unlock()` call.
 */

type SfxName =
  | 'tap'
  | 'coin'
  | 'place'
  | 'sell'
  | 'error'
  | 'levelup'
  | 'sizzle'
  | 'bell'
  | 'unhappy';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.32, this.ctx.currentTime, 0.05);
    }
  }

  play(name: SfxName): void {
    if (this.muted) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    switch (name) {
      case 'tap':
        this.blip(180, 0.05, 'triangle', 0.25);
        break;
      case 'place':
        this.blip(320, 0.07, 'square', 0.2);
        this.blip(160, 0.12, 'sine', 0.18, 0.03);
        break;
      case 'sell':
        this.sweep(520, 200, 0.16, 'sawtooth', 0.16);
        break;
      case 'coin':
        this.blip(1046, 0.06, 'triangle', 0.22);
        this.blip(1568, 0.1, 'triangle', 0.16, 0.05);
        break;
      case 'bell':
        this.blip(1200, 0.18, 'sine', 0.18);
        this.blip(1800, 0.14, 'sine', 0.1, 0.02);
        break;
      case 'error':
        this.sweep(220, 110, 0.18, 'square', 0.14);
        break;
      case 'unhappy':
        this.sweep(300, 120, 0.3, 'sine', 0.16);
        break;
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.16, 'triangle', 0.2, i * 0.09));
        break;
      case 'sizzle':
        this.noise(0.22, 0.06);
        break;
    }
  }

  private blip(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private sweep(
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    gain: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration);
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noise(duration: number, gain: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2200;
    const env = ctx.createGain();
    env.gain.value = gain;
    src.connect(filter).connect(env).connect(master);
    src.start();
  }
}

export const audio = new AudioEngine();
