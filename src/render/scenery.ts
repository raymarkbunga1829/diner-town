/**
 * Environment art: the room shell, its lighting, and the street outside.
 *
 * These are the pieces that make the diner feel like a place rather than a grid
 * of props — tiled flooring, panelled walls, hanging lamps that pool light on
 * the floor, windows, and the streets, gardens and neighbouring shopfronts of
 * the town it stands in. Everything is procedural and deterministic, so no
 * assets are needed and a given tile always looks the same.
 */

import { TILE_H, TILE_W, TILE_Z } from '../engine/iso';
import { diamondPath, faces, isoBox, mix, roundRect, shade, withAlpha } from './shapes';

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

// ---------------------------------------------------------- the wider world

/**
 * The view looks down on the world at a fixed angle, so there is no horizon and
 * no sky: ground runs to every edge of the screen. These are the colours it is
 * built from.
 */
export const WORLD = {
  plaza: '#e0cba8',
  plazaJoint: '#bda484',
  road: '#c9bda8',
  grass: '#86b96a',
  grassDark: '#5f9450',
  trunk: '#8a6141',
  leafA: '#5da356',
  leafB: '#79bd66',
} as const;

/**
 * One square of paving. Roadway is a shade cooler and darker than the squares it
 * connects, so the street plan is legible from above.
 */
export function drawPlazaTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  n: number,
  road = false,
): void {
  diamondPath(ctx, cx, cy, 1, 1);
  ctx.fillStyle = tone(road ? WORLD.road : WORLD.plaza, 0.93 + n * 0.13);
  ctx.fill();
  ctx.strokeStyle = alpha(WORLD.plazaJoint, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** A bed of lawn, drawn slightly proud of the paving that surrounds it. */
export function drawLawnTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  n: number,
): void {
  diamondPath(ctx, cx, cy, 1, 1);
  ctx.fillStyle = tone(WORLD.grassDark, 0.95);
  ctx.fill();
  diamondPath(ctx, cx, cy - TILE_Z * 0.05, 1, 1);
  ctx.fillStyle = tone(WORLD.grass, 0.94 + n * 0.14);
  ctx.fill();

  // A clump of bedding flowers on some tiles, for colour at ground level.
  if (n > 0.62) {
    const petals = ['#f2617a', '#f7c548', '#f28e5a', '#d986d4'] as const;
    const petal = petals[Math.floor(n * 997) % petals.length]!;
    for (let i = 0; i < 5; i++) {
      const a = n * 41 + i * 1.7;
      const px = cx + Math.cos(a) * 13;
      const py = cy - TILE_Z * 0.05 + Math.sin(a) * 6;
      ctx.fillStyle = i % 2 === 0 ? petal : '#fff3d4';
      ctx.beginPath();
      ctx.arc(px, py, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Street tree: trunk plus three overlapping crowns that drift in the breeze. */
export function drawTree(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  time: number,
  seed: number,
): void {
  const n = tileNoise(seed, seed * 7 + 1);
  const scale = 0.85 + n * 0.4;
  const sway = Math.sin(time * 0.5 + seed) * 1.6;

  ctx.fillStyle = alpha('#000000', 0.22);
  ctx.beginPath();
  ctx.ellipse(cx + 3, cy + 1, 15 * scale, 7 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  const trunkH = 26 * scale;
  ctx.fillStyle = WORLD.trunk;
  roundRect(ctx, cx - 3 * scale, cy - trunkH, 6 * scale, trunkH, 2);
  ctx.fill();
  ctx.fillStyle = shade(WORLD.trunk, 1.2);
  roundRect(ctx, cx - 3 * scale, cy - trunkH, 2.2 * scale, trunkH, 1.4);
  ctx.fill();

  const crownY = cy - trunkH - 8 * scale;
  for (const [dx, dy, r, light] of [
    [-9, 3, 11, 0],
    [9, 2, 10, 0],
    [0, -5, 13, 1],
  ] as const) {
    ctx.fillStyle = light ? WORLD.leafB : WORLD.leafA;
    ctx.beginPath();
    ctx.ellipse(
      cx + dx * scale + sway,
      crownY + dy * scale,
      r * scale,
      r * scale * 0.88,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  // Sunlit top edge.
  ctx.fillStyle = alpha('#ffffff', 0.18);
  ctx.beginPath();
  ctx.ellipse(cx - 3 * scale + sway, crownY - 9 * scale, 8 * scale, 4 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A neighbouring shopfront. These fill the streetscape around the restaurant so
 * the player is looking at a town rather than at empty ground.
 */
export function drawShopBlock(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  span: number,
  height: number,
  seed: number,
): void {
  const walls = ['#e8a9a2', '#9fc4de', '#f0cf95', '#aed49b', '#c9aede', '#efb27f'] as const;
  const wall = walls[Math.floor(tileNoise(seed, seed + 3) * walls.length) % walls.length]!;

  ctx.fillStyle = 'rgba(40, 28, 22, 0.18)';
  ctx.beginPath();
  ctx.ellipse(cx + 4, cy + 3, TILE_W * span * 0.32, TILE_H * span * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Upper storeys.
  isoBox(ctx, cx, cy, span, span, height, faces(wall));
  // A shorter box of glazing over the same footprint covers the lower part of the
  // faces, and its top doubles as the canopy above the shopfront.
  isoBox(ctx, cx, cy, span, span, 0.55, faces('#6d8496'));
  isoBox(ctx, cx, cy, span * 1.1, span * 1.1, 0.1, faces(shade(wall, 0.82)), 0.55);
  // Parapet.
  isoBox(ctx, cx, cy, span * 1.08, span * 1.08, 0.13, faces(shade(wall, 0.8)), height);
}

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
