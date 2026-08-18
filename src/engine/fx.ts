/**
 * Short-lived visual effects: the coins that pop when a guest pays, the steam
 * off a finished plate, the confetti at a level-up.
 *
 * Everything lives in world-pixel space so the renderer can draw it inside the
 * camera transform alongside the scene. State is session-only — effects are pure
 * decoration and are never saved. The pool is capped so a busy restaurant can
 * never spiral into thousands of particles.
 */

import { tileToWorld } from './iso';

export type FxKind = 'coin' | 'spark' | 'steam' | 'confetti' | 'crumb';

export interface Particle {
  kind: FxKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** World px per second squared, pulling the particle down. */
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  colour: string;
  rot: number;
  spin: number;
  /** Extra horizontal drift, which is what makes confetti flutter. */
  wobble: number;
}

/** Above this the oldest particles are recycled rather than the list growing. */
const CAP = 240;

const CONFETTI = ['#ffd15c', '#ff7a6a', '#7ad4b0', '#8fc7f2', '#ffffff', '#f6a5d0'] as const;

export class Fx {
  readonly particles: Particle[] = [];

  /**
   * Warm wash over the whole room, 0..1, used for the moment a level lands. It
   * decays on its own so callers only ever have to set it.
   */
  flash = 0;

  update(dt: number): void {
    const list = this.particles;
    let write = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      p.x += (p.vx + Math.sin(p.rot * 2) * p.wobble) * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      list[write++] = p;
    }
    list.length = write;
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  clear(): void {
    this.particles.length = 0;
    this.flash = 0;
  }

  private push(p: Particle): void {
    if (this.particles.length >= CAP) this.particles.shift();
    this.particles.push(p);
  }

  /** Coins tumbling out of a till. `strength` scales with the size of the payment. */
  coins(tx: number, ty: number, strength = 1): void {
    const w = tileToWorld(tx + 0.5, ty + 0.5);
    const count = Math.min(9, 3 + Math.round(strength * 4));
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (i / count - 0.5) * 1.5;
      const speed = 62 + Math.random() * 46;
      this.push({
        kind: 'coin',
        x: w.x + (Math.random() - 0.5) * 10,
        y: w.y - 44,
        vx: Math.cos(a) * speed * 0.75,
        vy: Math.sin(a) * speed,
        gravity: 240,
        life: 0.85 + Math.random() * 0.3,
        maxLife: 1.15,
        size: 3.4 + Math.random() * 1.6,
        colour: '#ffd45c',
        rot: Math.random() * 6.28,
        spin: 6 + Math.random() * 5,
        wobble: 0,
      });
    }
    this.sparks(w.x, w.y - 46, 4, '#fff3c4');
  }

  /** Steam curling off a plate the kitchen has just finished. */
  steam(tx: number, ty: number, lift = 0.7): void {
    const w = tileToWorld(tx + 0.5, ty + 0.5);
    for (let i = 0; i < 5; i++) {
      this.push({
        kind: 'steam',
        x: w.x + (Math.random() - 0.5) * 12,
        y: w.y - lift * 32 - Math.random() * 6,
        vx: (Math.random() - 0.5) * 9,
        vy: -20 - Math.random() * 14,
        gravity: -6,
        life: 0.9 + Math.random() * 0.5,
        maxLife: 1.4,
        size: 3.5 + Math.random() * 3,
        colour: '#fffaf0',
        rot: Math.random() * 6.28,
        spin: 1.2,
        wobble: 9,
      });
    }
    this.sparks(w.x, w.y - lift * 32 - 6, 5, '#ffe9a8');
  }

  /** A quick ring of sparkles, used for "that worked" moments. */
  sparks(x: number, y: number, count: number, colour: string): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random();
      const speed = 26 + Math.random() * 40;
      this.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.7 - 18,
        gravity: 40,
        life: 0.34 + Math.random() * 0.3,
        maxLife: 0.64,
        size: 2 + Math.random() * 2.2,
        colour,
        rot: 0,
        spin: 0,
        wobble: 0,
      });
    }
  }

  /**
   * Acknowledgement that a tap was read as an order: a bright ring over whatever
   * the player just pointed at. Deliberately distinct from the warm suds and
   * coins, so "I heard you" never reads as "that job is finished".
   */
  command(tx: number, ty: number): void {
    const w = tileToWorld(tx + 0.5, ty + 0.5);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.push({
        kind: 'spark',
        x: w.x + Math.cos(a) * 15,
        y: w.y - 14 + Math.sin(a) * 7,
        vx: Math.cos(a) * 34,
        vy: Math.sin(a) * 17 - 12,
        gravity: 24,
        life: 0.32 + Math.random() * 0.18,
        maxLife: 0.5,
        size: 2.2 + Math.random() * 1.4,
        colour: i % 2 === 0 ? '#ffe9a8' : '#fff8ea',
        rot: 0,
        spin: 0,
        wobble: 0,
      });
    }
  }

  /** Suds and shine when a table gets wiped down. */
  clean(tx: number, ty: number): void {
    const w = tileToWorld(tx + 0.5, ty + 0.5);
    for (let i = 0; i < 7; i++) {
      this.push({
        kind: 'spark',
        x: w.x + (Math.random() - 0.5) * 26,
        y: w.y - 20 - Math.random() * 12,
        vx: (Math.random() - 0.5) * 24,
        vy: -26 - Math.random() * 20,
        gravity: 60,
        life: 0.5 + Math.random() * 0.35,
        maxLife: 0.85,
        size: 2 + Math.random() * 2.6,
        colour: i % 2 === 0 ? '#ffffff' : '#bfeaf5',
        rot: 0,
        spin: 0,
        wobble: 6,
      });
    }
  }

  /** Grey puff for a guest who storms out, or a plate that gets binned. */
  puff(tx: number, ty: number, colour = '#b9a894'): void {
    const w = tileToWorld(tx + 0.5, ty + 0.5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.push({
        kind: 'crumb',
        x: w.x,
        y: w.y - 26,
        vx: Math.cos(a) * (26 + Math.random() * 20),
        vy: Math.sin(a) * 12 - 18,
        gravity: 30,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        size: 3 + Math.random() * 3,
        colour,
        rot: 0,
        spin: 0,
        wobble: 0,
      });
    }
  }

  /** The full level-up celebration: confetti over the room and a warm flash. */
  levelUp(centreTx: number, centreTy: number): void {
    const w = tileToWorld(centreTx, centreTy);
    this.flash = 1;
    for (let i = 0; i < 54; i++) {
      const spread = 210;
      this.push({
        kind: 'confetti',
        x: w.x + (Math.random() - 0.5) * spread * 2,
        y: w.y - 150 - Math.random() * 90,
        vx: (Math.random() - 0.5) * 40,
        vy: 30 + Math.random() * 60,
        gravity: 46,
        life: 1.5 + Math.random() * 1.1,
        maxLife: 2.6,
        size: 3 + Math.random() * 3.4,
        colour: CONFETTI[Math.floor(Math.random() * CONFETTI.length)]!,
        rot: Math.random() * 6.28,
        spin: (Math.random() - 0.5) * 12,
        wobble: 22,
      });
    }
    this.sparks(w.x, w.y - 90, 12, '#fff3c4');
  }
}
