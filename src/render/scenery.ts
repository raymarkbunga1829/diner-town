/**
 * Environment art: the room shell, its lighting, and the street outside.
 *
 * These are the pieces that make the diner feel like a place rather than a grid
 * of props — tiled flooring, panelled walls, hanging lamps that pool light on
 * the floor, windows, and the pavement and skyline beyond the door. Everything
 * is procedural and deterministic, so no assets are needed and a given tile
 * always looks the same.
 */

import { TILE_H, TILE_W, TILE_Z } from '../engine/iso';
import { diamondPath, mix, roundRect, shade, withAlpha } from './shapes';

export interface Point {
  x: number;
  y: number;
}

/**
 * Stable pseudo-random value for a tile, used to vary tones so large floors do
 * not look printed. A cheap integer hash rather than a PRNG, because this runs
 * for every tile of every frame.
 */
export function tileNoise(tx: number, ty: number): number {
  let h = Math.imul((tx * 73856093) ^ (ty * 19349663), 0x45d9f3b);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * `shade` and `withAlpha` allocate a string on every call, which is wasteful
 * when the same handful of tones are requested every frame. Memoise both on the
 * rounded amount.
 */
const toneCache = new Map<string, string>();
export function tone(base: string, amount: number): string {
  const key = `${base}|${amount.toFixed(3)}`;
  let hit = toneCache.get(key);
  if (hit === undefined) {
    hit = shade(base, amount);
    toneCache.set(key, hit);
  }
  return hit;
}

const alphaCache = new Map<string, string>();
function alpha(base: string, a: number): string {
  const key = `${base}|${a.toFixed(3)}`;
  let hit = alphaCache.get(key);
  if (hit === undefined) {
    hit = withAlpha(base, a);
    alphaCache.set(key, hit);
  }
  return hit;
}

// ------------------------------------------------------------------- flooring

/**
 * One floor tile: a grout bed with an inset face on top, so the seams read as
 * gaps between real tiles rather than lines drawn onto a flat surface.
 */
export function drawFloorTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  base: string,
  n: number,
): void {
  diamondPath(ctx, cx, cy, 1, 1);
  ctx.fillStyle = tone(base, 0.74);
  ctx.fill();

  diamondPath(ctx, cx, cy, 0.94, 0.94);
  ctx.fillStyle = tone(base, 0.955 + n * 0.09);
  ctx.fill();

  // Sheen along the two edges facing the light, which sits up and to the left.
  ctx.strokeStyle = alpha('#ffffff', 0.07 + n * 0.05);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - TILE_W * 0.47, cy);
  ctx.lineTo(cx, cy - TILE_H * 0.47);
  ctx.lineTo(cx + TILE_W * 0.47, cy);
  ctx.stroke();
}

/** Soft elliptical light or shadow laid flat on the floor plane. */
export function drawFloorGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  strength: number,
): void {
  const r = (TILE_W / 2) * radius;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, TILE_H / TILE_W);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, alpha(color, strength));
  g.addColorStop(0.55, alpha(color, strength * 0.45));
  g.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------- walls

export interface WallStyle {
  /** Colour of the upper wall, above the chair rail. */
  base: string;
  /** Colour of the panelled section below the chair rail. */
  wainscot: string;
  /** Moulding and skirting colour. */
  trim: string;
}

/** The north-west wall catches less light than the north-east one. */
const litness = (side: 'ne' | 'nw'): number => (side === 'ne' ? 1 : 0.86);

/**
 * A single tile-wide wall panel, built up as upper wall, chair rail, panelled
 * lower section and skirting.
 */
export function drawWallPanel(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  h: number,
  style: WallStyle,
  side: 'ne' | 'nw',
): void {
  const lit = litness(side);
  const railTop = h * 0.36;
  const skirtTop = h * 0.06;

  // Upper wall, shaded so it darkens towards the floor.
  const grad = ctx.createLinearGradient(0, a.y - h, 0, a.y);
  grad.addColorStop(0, tone(style.base, 1.06 * lit));
  grad.addColorStop(1, tone(style.base, 0.9 * lit));
  ctx.fillStyle = grad;
  wallQuad(ctx, a, b, 0, h);

  // Panelled lower section.
  ctx.fillStyle = tone(style.wainscot, lit);
  wallQuad(ctx, a, b, 0, railTop);

  // Recessed panel within the wainscot, inset from both ends.
  const pa = lerpPoint(a, b, 0.18);
  const pb = lerpPoint(a, b, 0.82);
  ctx.fillStyle = tone(style.wainscot, 0.88 * lit);
  wallQuad(ctx, pa, pb, skirtTop * 1.8, railTop * 0.8);
  ctx.fillStyle = tone(style.wainscot, 1.1 * lit);
  wallQuad(ctx, pa, pb, skirtTop * 2.2, railTop * 0.74);

  // Chair rail sitting on top of the wainscot.
  ctx.fillStyle = tone(style.trim, 1.12 * lit);
  wallQuad(ctx, a, b, railTop, railTop + h * 0.045);

  // Skirting board along the floor.
  ctx.fillStyle = tone(style.trim, 0.94 * lit);
  wallQuad(ctx, a, b, 0, skirtTop);
}

/** Crown moulding capping the wall, which also gives it apparent thickness. */
export function drawWallCap(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  h: number,
  style: WallStyle,
  side: 'ne' | 'nw',
): void {
  const lit = litness(side);
  const dx = side === 'ne' ? -6 : 6;

  ctx.fillStyle = tone(style.trim, 1.2 * lit);
  wallQuad(ctx, a, b, h - TILE_Z * 0.16, h);

  ctx.fillStyle = tone(style.base, 1.3 * lit);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - h);
  ctx.lineTo(b.x, b.y - h);
  ctx.lineTo(b.x + dx, b.y - h - 4);
  ctx.lineTo(a.x + dx, a.y - h - 4);
  ctx.closePath();
  ctx.fill();
}

/** A window punched into a wall panel, with sky beyond it and a sill below. */
export function drawWindow(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  h: number,
  sky: readonly [string, string],
  side: 'ne' | 'nw',
): void {
  const lit = litness(side);
  const lo = h * 0.44;
  const hi = h * 0.86;
  const ia = lerpPoint(a, b, 0.16);
  const ib = lerpPoint(a, b, 0.84);

  // Glass, brighter at the top where more sky shows.
  const g = ctx.createLinearGradient(0, a.y - hi, 0, a.y - lo);
  g.addColorStop(0, sky[0]);
  g.addColorStop(1, sky[1]);
  ctx.fillStyle = g;
  wallQuad(ctx, ia, ib, lo, hi);

  // Reflection streak across the pane.
  ctx.fillStyle = alpha('#ffffff', 0.13);
  wallQuad(ctx, lerpPoint(ia, ib, 0.08), lerpPoint(ia, ib, 0.42), lo * 1.06, hi * 0.97);

  // Glazing bars.
  ctx.fillStyle = tone('#f2e7d2', lit);
  const mid = (lo + hi) / 2;
  wallQuad(ctx, ia, ib, mid - h * 0.012, mid + h * 0.012);
  wallQuad(ctx, lerpPoint(ia, ib, 0.47), lerpPoint(ia, ib, 0.53), lo, hi);

  // Frame.
  ctx.strokeStyle = tone('#e8dcc4', lit);
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(ia.x, ia.y - hi);
  ctx.lineTo(ib.x, ib.y - hi);
  ctx.lineTo(ib.x, ib.y - lo);
  ctx.lineTo(ia.x, ia.y - lo);
  ctx.closePath();
  ctx.stroke();

  // Sill, slightly wider than the opening.
  ctx.fillStyle = tone('#cbb896', lit);
  wallQuad(ctx, lerpPoint(a, b, 0.12), lerpPoint(a, b, 0.88), lo - h * 0.035, lo);
}

// --------------------------------------------------------------------- lights

/**
 * Pendant lamp hanging over the room. Drawn in front of everything else; its
 * light pool is laid down separately during the floor pass.
 */
export function drawPendantLamp(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  time: number,
  lit: boolean,
): void {
  // A slow sway keeps the room from feeling frozen.
  const sway = Math.sin(time * 0.6 + cx * 0.05) * 1.1;
  const x = cx + sway;
  // The cord stops just above the wall line so lamps read as hanging from a
  // ceiling rather than trailing off into the sky.
  const shadeY = cy - 2.05 * TILE_Z;
  const rx = TILE_W * 0.22;
  const top = shadeY - 10;
  const cordTop = cy - 2.75 * TILE_Z;

  ctx.save();
  ctx.strokeStyle = '#3d2d21';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx, cordTop);
  ctx.lineTo(x, top);
  ctx.stroke();

  if (lit) {
    const glow = ctx.createRadialGradient(x, shadeY + 4, 0, x, shadeY + 4, rx * 2.6);
    glow.addColorStop(0, alpha('#ffd9a0', 0.4));
    glow.addColorStop(1, alpha('#ffd9a0', 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, shadeY + 4, rx * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Conical shade: painted outside, warm underside.
  ctx.fillStyle = lit ? '#c9553f' : '#8d4436';
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.28, top);
  ctx.lineTo(x + rx * 0.28, top);
  ctx.lineTo(x + rx, shadeY);
  ctx.lineTo(x - rx, shadeY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = lit ? '#e2705a' : '#a3564a';
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.28, top);
  ctx.lineTo(x, top + 1.6);
  ctx.lineTo(x + rx * 0.28, top);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = lit ? '#ffe8b8' : '#6f4a3c';
  ctx.beginPath();
  ctx.ellipse(x, shadeY, rx, rx * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  if (lit) {
    ctx.fillStyle = '#fff6dd';
    ctx.beginPath();
    ctx.ellipse(x, shadeY + 2, rx * 0.34, rx * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// -------------------------------------------------------------------- outside

const PAVING = '#8e8a80';

/** Paving slab with a joint around it, matching the floor tile treatment. */
export function drawPavingTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  n: number,
): void {
  diamondPath(ctx, cx, cy, 1, 1);
  ctx.fillStyle = tone(PAVING, 0.7);
  ctx.fill();
  diamondPath(ctx, cx, cy, 0.93, 0.93);
  ctx.fillStyle = tone(PAVING, 0.94 + n * 0.12);
  ctx.fill();
}

/** Planter box with shrubbery, used to dress the frontage. */
export function drawPlanter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  time: number,
  seed: number,
): void {
  const w = TILE_W * 0.3;
  const boxH = TILE_Z * 0.5;

  ctx.fillStyle = alpha('#000000', 0.2);
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, w * 1.05, w * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 5; i++) {
    const n = tileNoise(seed + i, seed - i);
    const bx = cx - w * 0.7 + (i / 4) * w * 1.4;
    const sway = Math.sin(time * 0.9 + i + seed) * 1.3;
    ctx.fillStyle = i % 2 === 0 ? '#4e8f4a' : '#5da356';
    ctx.beginPath();
    ctx.ellipse(bx + sway, cy - boxH - 5 - n * 4, 5.5, 7 + n * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#7b5638';
  roundRect(ctx, cx - w, cy - boxH, w * 2, boxH, 3);
  ctx.fill();
  ctx.fillStyle = '#8d6440';
  roundRect(ctx, cx - w, cy - boxH, w * 2, boxH * 0.32, 3);
  ctx.fill();
}

// ------------------------------------------------------------------- backdrop

export interface SkyPalette {
  top: string;
  mid: string;
  ground: string;
  sun: string;
  far: string;
  near: string;
}

/**
 * Keyframes blended by time of day. The trading day runs 9am to 11pm, so `t` of
 * 0 is a bright mid-morning rather than dawn, and only the last third darkens.
 */
const SKY_KEYS: ReadonlyArray<{ at: number; p: SkyPalette }> = [
  {
    at: 0,
    p: { top: '#7cb4dc', mid: '#cfe2f0', ground: '#8e97a4', sun: '#fff4d4', far: '#93a8bd', near: '#6f7f8e' },
  },
  {
    at: 0.35,
    p: { top: '#6ba8d6', mid: '#c6dcee', ground: '#919aa6', sun: '#fff8e0', far: '#8ba0b6', near: '#687888' },
  },
  {
    at: 0.62,
    p: { top: '#78add0', mid: '#e3d5b8', ground: '#8d9298', sun: '#fff0b8', far: '#93a1ac', near: '#6f7a80' },
  },
  {
    at: 0.8,
    p: { top: '#5f5288', mid: '#e8925f', ground: '#5f5766', sun: '#ffbe78', far: '#655d7a', near: '#423c55' },
  },
  {
    at: 0.93,
    p: { top: '#22284a', mid: '#4b3f63', ground: '#333747', sun: '#ffd0a0', far: '#2f3453', near: '#20253c' },
  },
  {
    at: 1,
    p: { top: '#111731', mid: '#212a49', ground: '#242835', sun: '#cfd9ff', far: '#1e2440', near: '#161b2c' },
  },
];

export function skyPalette(t: number): SkyPalette {
  let lo = SKY_KEYS[0]!;
  let hi = SKY_KEYS[SKY_KEYS.length - 1]!;
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    if (t >= SKY_KEYS[i]!.at && t <= SKY_KEYS[i + 1]!.at) {
      lo = SKY_KEYS[i]!;
      hi = SKY_KEYS[i + 1]!;
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const k = Math.min(1, Math.max(0, (t - lo.at) / span));
  return {
    top: mix(lo.p.top, hi.p.top, k),
    mid: mix(lo.p.mid, hi.p.mid, k),
    ground: mix(lo.p.ground, hi.p.ground, k),
    sun: mix(lo.p.sun, hi.p.sun, k),
    far: mix(lo.p.far, hi.p.far, k),
    near: mix(lo.p.near, hi.p.near, k),
  };
}

/**
 * Sky, sun and a parallaxed city silhouette behind the restaurant, so the scene
 * sits in a world instead of floating on a flat fill. Drawn in screen space;
 * `panX` shifts the skyline a little as the camera moves.
 */
export function drawSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  palette: SkyPalette,
  panX: number,
  dayT: number,
  night: number,
): void {
  const horizon = h * 0.54;

  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, palette.top);
  g.addColorStop(1, palette.mid);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, horizon + 1);

  // Sun or moon, tracking across the day.
  const sunX = w * (0.12 + dayT * 0.76);
  const sunY = horizon - Math.sin(dayT * Math.PI) * horizon * 0.62 - h * 0.02;
  const sunR = Math.min(w, h) * 0.085;
  const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 3.6);
  halo.addColorStop(0, alpha(palette.sun, 0.45));
  halo.addColorStop(1, alpha(palette.sun, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = alpha(palette.sun, 0.8);
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Rooftops recede towards the sky colour, which reads as distance.
  drawSkylineLayer(ctx, w, horizon, {
    colour: mix(palette.far, palette.mid, 0.45),
    scale: 0.05,
    rise: h * 0.15,
    step: 104,
    seed: 11,
    panX,
    night: 0,
  });

  // Haze sitting on the horizon, separating the two layers.
  const haze = ctx.createLinearGradient(0, horizon - h * 0.1, 0, horizon);
  haze.addColorStop(0, alpha(palette.mid, 0));
  haze.addColorStop(1, alpha(palette.mid, 0.55));
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizon - h * 0.1, w, h * 0.1);

  drawSkylineLayer(ctx, w, horizon, {
    colour: mix(palette.near, palette.mid, 0.16),
    scale: 0.11,
    rise: h * 0.1,
    step: 148,
    seed: 29,
    panX,
    night,
  });

  // Ground beyond the restaurant, darkening towards the viewer. Drawn last so it
  // covers the feet of the rooftops rather than letting them show as legs.
  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  // Lighten towards the horizon so the ground recedes rather than reading as a
  // flat slab butted up against the sky.
  ground.addColorStop(0, mix(palette.ground, palette.mid, 0.4));
  ground.addColorStop(1, shade(palette.ground, 0.72));
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, w, h - horizon);
}

interface SkylineLayer {
  colour: string;
  /** How much of the camera pan this layer follows, for parallax. */
  scale: number;
  /** Maximum building height in pixels. */
  rise: number;
  step: number;
  seed: number;
  panX: number;
  /** 0..1; above 0 some windows light up. */
  night: number;
}

/** One band of rooftops standing on the horizon. */
function drawSkylineLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizon: number,
  layer: SkylineLayer,
): void {
  const offset = -layer.panX * layer.scale;
  const first = Math.floor((-240 - offset) / layer.step) - 1;
  const last = Math.ceil((w + 240 - offset) / layer.step) + 1;

  ctx.fillStyle = layer.colour;
  ctx.beginPath();
  ctx.moveTo(-240, horizon);
  for (let i = first; i <= last; i++) {
    const x = i * layer.step + offset;
    const n = tileNoise(i, layer.seed);
    const top = horizon - layer.rise * (0.25 + n);
    ctx.lineTo(x, top);
    ctx.lineTo(x + layer.step * 0.78, top);
    ctx.lineTo(x + layer.step * 0.78, horizon);
  }
  ctx.lineTo(w + 240, horizon);
  ctx.closePath();
  ctx.fill();

  if (layer.night <= 0.05) return;

  // A scatter of lit windows once it is dark enough for them to show.
  ctx.fillStyle = alpha('#ffd98a', 0.5 * layer.night);
  for (let i = first; i <= last; i++) {
    const x = i * layer.step + offset;
    const n = tileNoise(i, layer.seed);
    const top = horizon - layer.rise * (0.25 + n);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        if (tileNoise(i * 31 + col, layer.seed + row * 7) < 0.55) continue;
        ctx.fillRect(x + 10 + col * 22, top + 12 + row * 18, 7, 9);
      }
    }
  }
}

// ----------------------------------------------------------------- primitives

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Fill the slice of a wall face between `a` and `b` spanning heights `bottom` to
 * `top`, both measured up from the floor line.
 */
function wallQuad(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  bottom: number,
  top: number,
): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - top);
  ctx.lineTo(b.x, b.y - top);
  ctx.lineTo(b.x, b.y - bottom);
  ctx.lineTo(a.x, a.y - bottom);
  ctx.closePath();
  ctx.fill();
}
