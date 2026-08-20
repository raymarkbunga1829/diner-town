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
import {
  diamondCorners,
  diamondPath,
  faces,
  isoBox,
  isoCylinder,
  isoSides,
  mix,
  roundRect,
  shade,
  withAlpha,
  type BoxColors,
  type Corner,
} from './shapes';

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

/**
 * The same treatment for `mix` and `faces`, which the street asks for hardest:
 * a storey of windows wants a lit tone and an unlit one, and each of them is a
 * blend that changes only as slowly as the evening does. Two decimal places of
 * the blend is finer than the eye, and both palettes are fixed, so the keys
 * stop multiplying.
 */
const blendCache = new Map<string, string>();
function blend(a: string, b: string, t: number): string {
  const key = `${a}|${b}|${t.toFixed(2)}`;
  let hit = blendCache.get(key);
  if (hit === undefined) {
    hit = mix(a, b, t);
    blendCache.set(key, hit);
  }
  return hit;
}

const faceCache = new Map<string, BoxColors>();
function facesOf(base: string): BoxColors {
  let hit = faceCache.get(base);
  if (hit === undefined) {
    hit = faces(base);
    faceCache.set(base, hit);
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
  /** 0 at midday, 1 after dark. Drives how hard the lamp reads as a light source. */
  glow: number,
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

  // Halo around the bulb. It grows through the evening, which is what makes the
  // lamps look like they are doing the work once the daylight has gone.
  const haloR = rx * (2.2 + glow * 1.5);
  const halo = ctx.createRadialGradient(x, shadeY + 4, 0, x, shadeY + 4, haloR);
  halo.addColorStop(0, alpha('#ffd9a0', 0.3 + glow * 0.42));
  halo.addColorStop(1, alpha('#ffd9a0', 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, shadeY + 4, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Conical shade: painted outside, warm underside.
  ctx.fillStyle = '#c9553f';
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.28, top);
  ctx.lineTo(x + rx * 0.28, top);
  ctx.lineTo(x + rx, shadeY);
  ctx.lineTo(x - rx, shadeY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#e2705a';
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.28, top);
  ctx.lineTo(x, top + 1.6);
  ctx.lineTo(x + rx * 0.28, top);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = mix('#ffe8b8', '#fffdf2', glow);
  ctx.beginPath();
  ctx.ellipse(x, shadeY, rx, rx * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff6dd';
  ctx.beginPath();
  ctx.ellipse(x, shadeY + 2, rx * (0.3 + glow * 0.14), rx * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Cast-iron street lamp on the pavement. These are what keep the streetscape
 * from going flat and unreadable once the sun is down.
 */
export function drawStreetLamp(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  night: number,
): void {
  const h = 36;
  ctx.fillStyle = alpha('#2a1c14', 0.22);
  ctx.beginPath();
  ctx.ellipse(cx + 3, cy + 1, 7, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3f4d55';
  roundRect(ctx, cx - 3.6, cy - 5, 7.2, 5, 2);
  ctx.fill();
  ctx.fillStyle = '#55666f';
  roundRect(ctx, cx - 1.3, cy - h, 2.6, h - 3, 1.3);
  ctx.fill();
  ctx.fillStyle = '#6c7f89';
  ctx.fillRect(cx - 1.3, cy - h, 1, h - 3);

  // Lantern: a warm cage that lights up after dark.
  const lampY = cy - h - 3;
  ctx.fillStyle = '#3f4d55';
  ctx.beginPath();
  ctx.moveTo(cx - 4.6, lampY + 5.4);
  ctx.lineTo(cx - 2.6, lampY - 3);
  ctx.lineTo(cx + 2.6, lampY - 3);
  ctx.lineTo(cx + 4.6, lampY + 5.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = mix('#cfd6d0', '#ffe6a8', night);
  ctx.beginPath();
  ctx.moveTo(cx - 3.3, lampY + 4.2);
  ctx.lineTo(cx - 1.8, lampY - 1.8);
  ctx.lineTo(cx + 1.8, lampY - 1.8);
  ctx.lineTo(cx + 3.3, lampY + 4.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2f3a41';
  roundRect(ctx, cx - 3.6, lampY - 5, 7.2, 2.2, 1.1);
  ctx.fill();

  if (night > 0.02) {
    const r = 28 + night * 14;
    const g = ctx.createRadialGradient(cx, lampY + 2, 0, cx, lampY + 2, r);
    g.addColorStop(0, alpha('#ffd79a', 0.34 * night));
    g.addColorStop(1, alpha('#ffd79a', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, lampY + 2, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Park bench, seen end-on so it reads at any zoom. */
export function drawBench(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = alpha('#2a1c14', 0.2);
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 1, 17, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5d6a70';
  ctx.fillRect(cx - 13, cy - 8, 3, 8);
  ctx.fillRect(cx + 10, cy - 8, 3, 8);
  ctx.fillStyle = '#a9713f';
  roundRect(ctx, cx - 16, cy - 12, 32, 5, 2);
  ctx.fill();
  ctx.fillStyle = '#c08a52';
  roundRect(ctx, cx - 16, cy - 21, 32, 8, 2.5);
  ctx.fill();
  ctx.fillStyle = alpha('#7c5330', 0.5);
  ctx.fillRect(cx - 16, cy - 17, 32, 1.4);
}

/**
 * The post box on the far pavement. Small, but it is the piece of street
 * furniture that says "this is a town" rather than "this is a road", and the
 * approved street has one standing opposite the door.
 */
export function drawMailbox(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = alpha('#2a1c14', 0.22);
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 1, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs, body, domed lid, and the slot across the front.
  ctx.fillStyle = '#2f4f6b';
  ctx.fillRect(cx - 5, cy - 10, 2.6, 10);
  ctx.fillRect(cx + 2.4, cy - 10, 2.6, 10);
  ctx.fillStyle = '#3d6d94';
  roundRect(ctx, cx - 9, cy - 26, 18, 17, 3);
  ctx.fill();
  ctx.fillStyle = '#4f88b4';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 26, 9, 5, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#22364a';
  roundRect(ctx, cx - 6, cy - 22, 12, 2.6, 1.3);
  ctx.fill();
  ctx.fillStyle = alpha('#ffffff', 0.22);
  roundRect(ctx, cx - 7.5, cy - 18, 3, 7, 1.5);
  ctx.fill();
}

/** A run of clipped hedge, used to edge the little parks. */
export function drawHedge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  seed: number,
): void {
  const n = tileNoise(seed, seed * 3 + 1);
  const h = 0.26 + n * 0.06;
  ctx.fillStyle = alpha('#20301c', 0.18);
  diamondPath(ctx, cx, cy + 2, 0.92, 0.92);
  ctx.fill();
  isoBox(ctx, cx, cy, 0.96, 0.96, h, faces('#508c46'));
  // A scalloped crown, so a run of hedge does not read as a row of green cubes.
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = i === 0 ? '#8ec46c' : '#77b25f';
    ctx.beginPath();
    ctx.ellipse(
      cx + i * 13,
      cy - h * TILE_Z + Math.abs(i) * 3.2,
      8.5,
      4.4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

/** Market stall with a striped canopy, parked on the far pavement. */
export function drawStall(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  seed: number,
): void {
  const stripes = ['#e8695a', '#4f9dd0', '#f0b429'] as const;
  const stripe = stripes[Math.floor(tileNoise(seed, seed + 5) * stripes.length) % stripes.length]!;

  ctx.fillStyle = alpha('#2a1c14', 0.22);
  diamondPath(ctx, cx, cy + 2, 1.05, 1.05);
  ctx.fill();

  isoBox(ctx, cx, cy, 0.9, 0.9, 0.42, faces('#b98d5d'));
  // Produce in crates on the counter.
  for (let i = 0; i < 3; i++) {
    const n = tileNoise(seed + i, seed - i);
    ctx.fillStyle = ['#d94f3d', '#e8a33c', '#5fa84e'][i]!;
    ctx.beginPath();
    ctx.ellipse(cx - 12 + i * 12, cy - 0.46 * TILE_Z - n * 2, 6, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Canopy on four posts.
  ctx.fillStyle = '#8a6a45';
  for (const [ox, oy] of [[-0.42, 0], [0.42, 0], [0, -0.42], [0, 0.42]] as const) {
    const px = cx + (ox - oy) * TILE_W * 0.5;
    const py = cy + (ox + oy) * TILE_H * 0.5;
    ctx.fillRect(px - 1.2, py - 1.15 * TILE_Z, 2.4, 1.15 * TILE_Z);
  }
  isoBox(ctx, cx, cy, 1.12, 1.12, 0.08, faces('#fff3dc'), 1.15);
  ctx.save();
  diamondPath(ctx, cx, cy - 1.23 * TILE_Z, 1.12, 1.12);
  ctx.clip();
  ctx.fillStyle = stripe;
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 10 - 4, cy - 1.5 * TILE_Z);
    ctx.lineTo(cx + i * 10 + 1, cy - 1.5 * TILE_Z);
    ctx.lineTo(cx + i * 10 + 21, cy - 0.9 * TILE_Z);
    ctx.lineTo(cx + i * 10 + 16, cy - 0.9 * TILE_Z);
    ctx.closePath();
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
  road: '#8f8b8a',
  roadJoint: '#7a7675',
  pave: '#cfc7b8',
  paveJoint: '#a89e8d',
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
  ctx.strokeStyle = alpha(road ? WORLD.roadJoint : WORLD.plazaJoint, 0.4);
  ctx.lineWidth = 1;
  ctx.stroke();
}

export interface RoadTileOptions {
  /** Paint half of a lane divider along this tile. */
  dash?: boolean;
  /** Paint zebra bars across the tile, running along the given grid axis. */
  crossing?: 'x' | 'y';
  /** Draw a raised kerb on the far side of the tile along the given axis. */
  kerb?: Array<'nw' | 'ne' | 'se' | 'sw'>;
}

/**
 * Asphalt. The road is the piece that turns a field of tiles into a street, so
 * it carries its own markings rather than relying on props for legibility.
 */
export function drawRoadTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  n: number,
  opts: RoadTileOptions = {},
): void {
  diamondPath(ctx, cx, cy, 1, 1);
  ctx.fillStyle = tone(WORLD.road, 0.95 + n * 0.1);
  ctx.fill();
  // Faint aggregate speckle; two dots a tile is enough to kill the flatness.
  ctx.fillStyle = alpha('#ffffff', 0.05);
  ctx.beginPath();
  ctx.arc(cx + (n - 0.5) * 22, cy + (n - 0.5) * 10, 2.4, 0, Math.PI * 2);
  ctx.arc(cx - (n - 0.5) * 16, cy - (n - 0.5) * 7, 1.6, 0, Math.PI * 2);
  ctx.fill();

  if (opts.crossing) {
    ctx.save();
    diamondPath(ctx, cx, cy, 1, 1);
    ctx.clip();
    ctx.fillStyle = alpha('#fdf6e6', 0.82);
    for (let i = -1; i <= 1; i++) {
      // Bars run across the road, so they follow the axis traffic crosses.
      const along = opts.crossing === 'x' ? [TILE_W / 2, TILE_H / 2] : [-TILE_W / 2, TILE_H / 2];
      const across = opts.crossing === 'x' ? [-TILE_W / 2, TILE_H / 2] : [TILE_W / 2, TILE_H / 2];
      const ox = cx + (across[0]! * i) / 3;
      const oy = cy + (across[1]! * i) / 3;
      ctx.beginPath();
      ctx.moveTo(ox - along[0]! * 0.5 - across[0]! * 0.11, oy - along[1]! * 0.5 - across[1]! * 0.11);
      ctx.lineTo(ox + along[0]! * 0.5 - across[0]! * 0.11, oy + along[1]! * 0.5 - across[1]! * 0.11);
      ctx.lineTo(ox + along[0]! * 0.5 + across[0]! * 0.11, oy + along[1]! * 0.5 + across[1]! * 0.11);
      ctx.lineTo(ox - along[0]! * 0.5 + across[0]! * 0.11, oy - along[1]! * 0.5 + across[1]! * 0.11);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else if (opts.dash) {
    ctx.fillStyle = alpha('#f4e9c8', 0.5);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 9, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Pavement slab, a shade warmer and lighter than the road it edges. */
export function drawPaveTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  n: number,
  /** Kerb faces to drop, as offsets towards the neighbouring road tile. */
  kerbs: ReadonlyArray<readonly [number, number]> = [],
): void {
  // One fill and one stroke rather than a stacked slab: the pavement covers a
  // large share of the screen, so it is the last place to spend fill rate.
  diamondPath(ctx, cx, cy, 1, 1);
  ctx.fillStyle = tone(WORLD.pave, 0.95 + n * 0.11);
  ctx.fill();
  ctx.strokeStyle = alpha(WORLD.paveJoint, 0.55);
  ctx.lineWidth = 1;
  ctx.stroke();

  // The kerb is the 2px step down to the asphalt. Small, but it is what makes
  // the pavement read as a pavement rather than as lighter tarmac.
  for (const [dx, dy] of kerbs) {
    const ex = ((dx - dy) * TILE_W) / 2;
    const ey = ((dx + dy) * TILE_H) / 2;
    const px = cx + ex / 2;
    const py = cy + ey / 2;
    const ax = -ey / 2;
    const ay = ex / 2;
    ctx.fillStyle = tone(WORLD.pave, 0.72);
    ctx.beginPath();
    ctx.moveTo(px - ax * 0.5, py - ay * 0.5);
    ctx.lineTo(px + ax * 0.5, py + ay * 0.5);
    ctx.lineTo(px + ax * 0.5, py + ay * 0.5 + 3);
    ctx.lineTo(px - ax * 0.5, py - ay * 0.5 + 3);
    ctx.closePath();
    ctx.fill();
  }
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

  // Mown banding on some tiles, so it reads as a kept lawn rather than a green
  // diamond. Every tile would be both busier and slower.
  if (n > 0.45) {
    ctx.strokeStyle = alpha('#ffffff', 0.07);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - TILE_W * 0.42, cy - TILE_H * 0.04);
    ctx.lineTo(cx + TILE_W * 0.06, cy + TILE_H * 0.2);
    ctx.stroke();
  }

  // An occasional bed of flowers, kept as one tight clump rather than scattered
  // across the tile, which just read as confetti dropped on the grass.
  if (n > 0.84) {
    const petals = ['#f2617a', '#f7c548', '#f28e5a', '#d986d4'] as const;
    const petal = petals[Math.floor(n * 997) % petals.length]!;
    const bx = cx + (n - 0.9) * 40;
    const by = cy - TILE_Z * 0.05 + (n - 0.88) * 20;
    ctx.fillStyle = alpha('#3f6b36', 0.5);
    ctx.beginPath();
    ctx.ellipse(bx, by, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = n * 41 + i * 1.05;
      ctx.fillStyle = i % 2 === 0 ? petal : '#fff3d4';
      ctx.beginPath();
      ctx.arc(bx + Math.cos(a) * 5.5, by + Math.sin(a) * 2.8, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Gravel path through a park, laid over the lawn. */
export function drawPathTile(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  n: number,
): void {
  diamondPath(ctx, cx, cy - TILE_Z * 0.05, 0.98, 0.98);
  ctx.fillStyle = tone('#d8c49c', 0.94 + n * 0.12);
  ctx.fill();
  ctx.fillStyle = alpha('#8f7a56', 0.28);
  ctx.beginPath();
  ctx.arc(cx + (n - 0.5) * 18, cy + (n - 0.5) * 8, 1.8, 0, Math.PI * 2);
  ctx.fill();
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

// ------------------------------------------------------- street architecture

/**
 * Where a horizontal plane `level` tile-heights above a footprint centre lands
 * on screen.
 *
 * Every piece of a street building — each storey, the roof, the gear standing on
 * it — is positioned from the footprint centre plus a level, never from a
 * separately derived copy of either, and no horizontal plate is ever drawn wider
 * than the walls it caps. Those two rules are the whole of what keeps a roof on
 * its building; {@link roofSeam} hands both sides of the seam to the headless
 * checks so they cannot quietly drift apart again.
 */
export function planeOrigin(cx: number, cy: number, level: number): Point {
  return { x: cx, y: cy - level * TILE_Z };
}

/** What a street building is made of. Deliberately not a row of pastels. */
interface BuildingStyle {
  wall: string;
  /** Mouldings, sills, stallrisers, glazing bars. */
  trim: string;
  /** Awnings, doors, signs: the one colour allowed to shout. */
  accent: string;
  /** Course lines across the wall, as brick and stone have and render does not. */
  courses: boolean;
}

const STYLES: readonly BuildingStyle[] = [
  { wall: '#b4614a', trim: '#f6e8d2', accent: '#2f6b76', courses: true },
  { wall: '#9c554c', trim: '#eedcc0', accent: '#e0b048', courses: true },
  { wall: '#e0cba2', trim: '#fffaf0', accent: '#c04a35', courses: false },
  { wall: '#a4c4b0', trim: '#fdf6e4', accent: '#d8813a', courses: false },
  { wall: '#82909f', trim: '#eef2f6', accent: '#e4b84c', courses: true },
  { wall: '#cf9a4e', trim: '#fff3d8', accent: '#375563', courses: false },
  { wall: '#8a6a84', trim: '#f6e8ef', accent: '#e8a63f', courses: false },
  { wall: '#9ca36c', trim: '#fbf4dd', accent: '#a94b39', courses: false },
  { wall: '#c8b9a6', trim: '#fffdf5', accent: '#7a4a6e', courses: true },
];

const AWNINGS = [
  '#c0483a',
  '#2c6f8c',
  '#d9942a',
  '#3f7d4c',
  '#7c4f95',
  '#b8354f',
  '#2f5f7a',
] as const;

/**
 * The five shops the approved street draws, in the order they run along it. The
 * row opposite the diner is always these five, cycling, so the view a player
 * opens the game on is the view that was signed off.
 */
export type Trade = 'books' | 'pets' | 'cleaners' | 'bakery' | 'flowers';

export const TRADES: readonly Trade[] = ['books', 'pets', 'cleaners', 'bakery', 'flowers'];

interface TradeStyle {
  /** What the name board says. */
  label: string;
  /** Awning and door colour. */
  awning: string;
  /** Wall colour, kept muted so the awnings and boards do the shouting. */
  wall: string;
  trim: string;
}

const TRADE_STYLES: Record<Trade, TradeStyle> = {
  books: { label: 'BOOKS', awning: '#3f7d4c', wall: '#e3d3b4', trim: '#fdf6e4' },
  pets: { label: 'PET SHOP', awning: '#c0483a', wall: '#b4614a', trim: '#fdf1dc' },
  cleaners: { label: 'CLEANERS', awning: '#3c86b0', wall: '#c8d3da', trim: '#fbfdff' },
  bakery: { label: 'BAKERY', awning: '#b8654a', wall: '#c9a877', trim: '#fff6e2' },
  flowers: { label: 'FLOWERS', awning: '#4f8f5a', wall: '#dcd3bc', trim: '#fffaec' },
};

/** The trade of the plot `index` places along a row. */
export function tradeAt(index: number): Trade {
  const n = TRADES.length;
  return TRADES[((index % n) + n) % n]!;
}

/** Roof deck surfaces: felt, gravel, lead. */
const DECKS = ['#8d8778', '#9a9081', '#7f8a8c', '#a09681'] as const;

/** One storey of a street building. */
export interface Storey {
  /** Level of its floor and of its ceiling, in tile-height units. */
  base: number;
  top: number;
  /** Footprint along the two grid axes, in tiles. */
  sx: number;
  sy: number;
}

export interface RoofPlan {
  kind: 'deck' | 'gable';
  /** The plane the roof sits on. Always the top of the storey beneath it. */
  level: number;
  /**
   * Roof footprint. Never larger than that storey's: a lid that oversails its
   * walls is exactly what makes a roof look like it slid off the building.
   */
  sx: number;
  sy: number;
  /** Parapet wall standing on the edge of a deck roof. */
  parapet: number;
  /** How far a gable's ridge rises above its eaves, and the axis it runs along. */
  rise: number;
  ridge: 'x' | 'y';
  /** A raised parapet section carrying a painted name board, main-street style. */
  crown: boolean;
}

export interface RoofGear {
  kind: 'tank' | 'condenser' | 'vent' | 'stair' | 'chimney' | 'planter' | 'billboard';
  /** Offset from the footprint centre along the grid axes, in tiles. */
  dx: number;
  dy: number;
  /** Footprint, in tiles, and height in tile-height units. */
  sx: number;
  sy: number;
  h: number;
}

export interface BuildingPlan {
  /** Ground floor first. Each storey stands on the one below it. */
  storeys: Storey[];
  roof: RoofPlan;
  gear: RoofGear[];
  style: BuildingStyle;
  awning: string;
  deck: string;
  /** Which camera-facing wall carries the shopfront; the other is the flank. */
  front: 'left' | 'right';
  /** 0 none, 1 a straight valance, 2 a scalloped one. */
  valance: 0 | 1 | 2;
  /** A name board over the shopfront. */
  sign: boolean;
  /** Set on the shops in the row opposite the diner; null further out in town. */
  trade: Trade | null;
  seed: number;
}

/** Stable pseudo-random draw `k` for a building. */
const roll = (seed: number, k: number): number =>
  tileNoise(Math.round(seed * 3 + k * 101), Math.round(seed - k * 37 + 11));

const pick = <T>(items: readonly T[], at: number): T =>
  items[Math.floor(at * items.length) % items.length]!;

/**
 * Design a building for a plot.
 *
 * Footprint and height come from the plot; how many storeys it splits into,
 * whether the top steps back, what the roof does and what stands on it all come
 * from the seed. That is what makes a run of eight plots eight different
 * buildings rather than eight tinted copies of one crate.
 */
export function planStreetBuilding(
  spanX: number,
  spanY: number,
  height: number,
  seed: number,
): BuildingPlan {
  const storeys: Storey[] = [];
  // A trading floor is taller than the flats above it, and needs the headroom
  // for an awning and a name board.
  const shopH = Math.min(height * 0.62, 1.3 + roll(seed, 2) * 0.4);
  const above = height - shopH;

  if (above < 0.55) {
    storeys.push({ base: 0, top: height, sx: spanX, sy: spanY });
  } else if (above > 1.8 && roll(seed, 3) > 0.5) {
    // Tall buildings step back at the top, which gives the skyline a shoulder
    // instead of one more flat-topped slab.
    const shoulder = shopH + above * (0.54 + roll(seed, 4) * 0.22);
    const inset = Math.min(0.85, Math.min(spanX, spanY) * 0.26);
    storeys.push({ base: 0, top: shopH, sx: spanX, sy: spanY });
    storeys.push({ base: shopH, top: shoulder, sx: spanX, sy: spanY });
    storeys.push({ base: shoulder, top: height, sx: spanX - inset, sy: spanY - inset });
  } else {
    storeys.push({ base: 0, top: shopH, sx: spanX, sy: spanY });
    storeys.push({ base: shopH, top: height, sx: spanX, sy: spanY });
  }

  const cap = storeys[storeys.length - 1]!;
  const gabled = height < 3.4 && roll(seed, 5) > 0.52;
  const roof: RoofPlan = {
    kind: gabled ? 'gable' : 'deck',
    level: cap.top,
    // The roof is the top storey's own footprint. Not a scaled copy of it.
    sx: cap.sx,
    sy: cap.sy,
    parapet: gabled ? 0 : 0.14 + roll(seed, 6) * 0.2,
    rise: gabled ? 0.4 + roll(seed, 7) * 0.36 : 0,
    ridge: cap.sx >= cap.sy ? 'x' : 'y',
    crown: !gabled && storeys.length < 3 && roll(seed, 8) > 0.48,
  };

  // The wider elevation gets the shopfront, so frontages face along the street.
  // Where the plot is square there is nothing to choose between them, so the
  // seed picks.
  const front: 'left' | 'right' =
    Math.abs(spanX - spanY) < 0.4
      ? roll(seed, 10) > 0.5
        ? 'right'
        : 'left'
      : spanX > spanY
        ? 'left'
        : 'right';

  return {
    storeys,
    roof,
    gear: planRoofGear(roof, seed),
    style: pick(STYLES, roll(seed, 1)),
    awning: pick(AWNINGS, roll(seed, 9)),
    deck: pick(DECKS, roll(seed, 14)),
    front,
    valance: roll(seed, 11) < 0.22 ? 0 : roll(seed, 12) > 0.45 ? 2 : 1,
    sign: roll(seed, 13) > 0.18,
    trade: null,
    seed,
  };
}

/**
 * A shop in the row across the street from the diner.
 *
 * This is the one building in the game the approved street draws in full, so its
 * plan is fixed rather than rolled: one storey, a flat roof sitting on the walls
 * it caps at exactly the plane they stop at, a low parapet, nothing standing on
 * top of it and a striped awning over a named shopfront. A neighbour's roof on
 * the pavement is the bug this shape exists to make impossible, so
 * {@link roofSeam} holds for these plans just as it does for the town's.
 */
export function planShopRow(
  spanX: number,
  spanY: number,
  height: number,
  seed: number,
  trade: Trade,
): BuildingPlan {
  const t = TRADE_STYLES[trade];
  const storeys: Storey[] = [{ base: 0, top: height, sx: spanX, sy: spanY }];
  const roof: RoofPlan = {
    kind: 'deck',
    level: height,
    sx: spanX,
    sy: spanY,
    parapet: 0.13,
    rise: 0,
    ridge: spanX >= spanY ? 'x' : 'y',
    crown: false,
  };

  return {
    storeys,
    roof,
    gear: [],
    style: { wall: t.wall, trim: t.trim, accent: t.awning, courses: false },
    awning: t.awning,
    deck: '#9a9384',
    // The wider elevation faces along the street, which is where the frontage
    // belongs; the row is always laid out wider than it is deep.
    front: spanX > spanY ? 'left' : 'right',
    valance: 2,
    sign: true,
    trade,
    seed,
  };
}

/**
 * What stands on the roof. Positions are tile offsets from the footprint centre
 * and every one is pulled back inside the roof before it is returned, because a
 * vent hanging off the edge of the parapet is the same bug as a roof hanging off
 * the walls, just smaller.
 */
function planRoofGear(roof: RoofPlan, seed: number): RoofGear[] {
  if (roof.kind === 'gable') {
    // A chimney on the ridge, and nothing else: a pitched roof has nowhere flat
    // to stand a water tank.
    const along = roof.ridge === 'x' ? roof.sx : roof.sy;
    const at = (roll(seed, 20) - 0.5) * along * 0.5;
    return [
      fitGear(roof, {
        kind: 'chimney',
        dx: roof.ridge === 'x' ? at : 0,
        dy: roof.ridge === 'x' ? 0 : at,
        sx: 0.34,
        sy: 0.34,
        h: 0.5 + roll(seed, 21) * 0.32,
      }),
    ];
  }

  const kinds = ['tank', 'condenser', 'vent', 'stair', 'planter', 'billboard'] as const;
  const want = 1 + Math.floor(roll(seed, 22) * 3);
  const out: RoofGear[] = [];
  for (let i = 0; i < want; i++) {
    const kind = pick(kinds, roll(seed, 23 + i * 4));
    // Spread them across opposite quarters of the deck rather than piling them
    // all on the middle of it.
    const dx = (roll(seed, 24 + i * 4) - 0.5) * roof.sx * 0.34 + (i % 2 ? 1 : -1) * roof.sx * 0.17;
    const dy = (roll(seed, 25 + i * 4) - 0.5) * roof.sy * 0.34 + (i < 2 ? -1 : 1) * roof.sy * 0.15;
    out.push(
      fitGear(roof, {
        kind,
        dx,
        dy,
        sx: Math.min(kind === 'billboard' ? 1.1 : kind === 'stair' ? 0.72 : 0.54, roof.sx * 0.44),
        sy: Math.min(kind === 'billboard' ? 0.22 : kind === 'stair' ? 0.72 : 0.54, roof.sy * 0.44),
        h:
          kind === 'vent'
            ? 0.18
            : kind === 'tank'
              ? 0.62
              : kind === 'billboard'
                ? 0.8
                : kind === 'planter'
                  ? 0.22
                  : 0.34,
      }),
    );
  }
  return out;
}

/** Pull a piece of gear back until it stands entirely on the roof. */
function fitGear(roof: RoofPlan, gear: RoofGear): RoofGear {
  // The parapet takes a slice off each edge, so the standable deck is a little
  // smaller than the roof that carries it.
  const margin = 0.18;
  const limX = Math.max(0, (roof.sx - gear.sx) / 2 - margin);
  const limY = Math.max(0, (roof.sy - gear.sy) / 2 - margin);
  return {
    ...gear,
    dx: clampTo(gear.dx, limX),
    dy: clampTo(gear.dy, limY),
  };
}

const clampTo = (v: number, lim: number): number => (v < -lim ? -lim : v > lim ? lim : v);

/**
 * The roof plane and the top of the walls under it, worked out independently
 * from the plan. They have to agree: a roof is not a separate object that
 * happens to be parked near a building. The headless checks compare them, along
 * with the two footprints, for every shape of building the town can generate.
 */
export function roofSeam(
  cx: number,
  cy: number,
  plan: BuildingPlan,
): { walls: Point; roof: Point; wallFoot: [number, number]; roofFoot: [number, number] } {
  const cap = plan.storeys[plan.storeys.length - 1]!;
  return {
    walls: planeOrigin(cx, cy, cap.top),
    roof: planeOrigin(cx, cy, plan.roof.level),
    wallFoot: [cap.sx, cap.sy],
    roofFoot: [plan.roof.sx, plan.roof.sy],
  };
}

/**
 * A neighbouring building: a glazed trading floor under an awning, storeys of
 * windows that light up after dark, and a roof that sits on top of them. These
 * fill the streetscape around the restaurant, so they have to read as buildings
 * at a glance from a long way off.
 */
export function drawShopBlock(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spanX: number,
  spanY: number,
  height: number,
  seed: number,
  night = 0,
  /**
   * Camera zoom, used only to decide how much detail is worth drawing. Zoomed
   * out to survey the town there are a couple of hundred buildings on screen and
   * a window pane is a few pixels across, so the glazing bars, course lines,
   * shutters and felt seams cost real frame time and buy nothing.
   */
  zoom = 1,
): void {
  drawBuilding(ctx, cx, cy, planStreetBuilding(spanX, spanY, height, seed), night, zoom);
}

/** Draws a building from a plan, whoever planned it. */
export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  plan: BuildingPlan,
  night = 0,
  zoom = 1,
): void {
  const { style } = plan;
  const ground = plan.storeys[0]!;
  const fine = zoom > 0.72;

  // Contact shadow, sized to the footprint it belongs to.
  const reach = (ground.sx + ground.sy) / 2;
  ctx.fillStyle = alpha('#281c16', 0.22);
  ctx.beginPath();
  ctx.ellipse(cx + 6, cy + 4, TILE_W * reach * 0.36, TILE_H * reach * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();

  plan.storeys.forEach((s, i) => {
    // Storey walls only. No lid: the storey above, or the roof, closes the top,
    // and a lid drawn here would land across the facade below.
    const wall = i === 0 ? style.wall : shade(style.wall, 1.03 - i * 0.05);
    isoSides(ctx, cx, cy, s.sx, s.sy, s.top - s.base, facesOf(wall), s.base);

    for (const side of ['right', 'left'] as const) {
      ctx.save();
      const w = storeyPlane(ctx, cx, cy, s, side);
      const h = (s.top - s.base) * TILE_Z;
      const lit = side === 'right' ? 1 : 0.84;
      const front = side === plan.front;
      if (i === 0) {
        if (front) drawShopElevation(ctx, w, h, plan, lit, night, fine, side === 'left');
        else drawFlankElevation(ctx, w, h, plan, lit, night);
      } else {
        drawUpperElevation(ctx, w, h, plan, lit, night, i, fine);
      }
      ctx.restore();
    }

    // Where the storey above steps back, what is left of this storey's ceiling
    // is a terrace. It is this storey's own lid, at this storey's own top.
    const up = plan.storeys[i + 1];
    if (up && (up.sx < s.sx - 1e-6 || up.sy < s.sy - 1e-6)) {
      const o = planeOrigin(cx, cy, s.top);
      diamondPath(ctx, o.x, o.y, s.sx, s.sy);
      ctx.fillStyle = tone(plan.deck, 1.04);
      ctx.fill();
      ctx.strokeStyle = alpha(style.trim, 0.7);
      ctx.lineWidth = 2;
      diamondPath(ctx, o.x, o.y - 3, s.sx * 0.98, s.sy * 0.98);
      ctx.stroke();
    }
  });

  drawRoof(ctx, cx, cy, plan, night, fine);
}

/**
 * Set up a drawing plane on one of a storey's two camera-facing walls, so an
 * elevation can be laid out as if on flat paper: local x runs along the wall
 * from the near corner, local y runs down the screen from the storey's floor
 * line. Returns the wall's width in local units.
 *
 * Taking the plane from the storey means a set-back upper floor is drawn in the
 * plane of its own walls rather than in the plane of the walls below it. The
 * caller owns the surrounding save/restore.
 */
function storeyPlane(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: Storey,
  side: 'left' | 'right',
): number {
  // Both visible walls meet at the near (south) corner of the footprint.
  const near = diamondCorners(cx, cy, s.sx, s.sy, s.base).s;
  const dir = side === 'right' ? 1 : -1;
  ctx.transform(dir, -0.5, 0, 1, near.x, near.y);
  // The right-hand wall runs along the y axis of the footprint, the left-hand
  // one along the x axis.
  return (TILE_W / 2) * (side === 'right' ? s.sy : s.sx);
}

/** How a shopfront divides up its wall, in local pixels down from the ceiling. */
function shopLayout(h: number): { sign: number; signH: number; glass: number; riser: number } {
  const signH = Math.min(h * 0.22, 11);
  return {
    sign: -h + 2,
    signH,
    glass: -h + 4 + signH,
    riser: Math.min(h * 0.2, 10),
  };
}

/**
 * The trading floor, on the wall that faces the street: a stallriser, a glazed
 * bay, a door, an awning over them and a painted name board above.
 */
function drawShopElevation(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  plan: BuildingPlan,
  lit: number,
  night: number,
  fine: boolean,
  /** The left-hand wall's plane is mirrored, which lettering has to undo. */
  mirrored: boolean,
): void {
  const { style } = plan;
  const trim = tone(style.trim, lit);
  const { sign, signH, glass, riser } = shopLayout(h);
  const pad = Math.max(3, w * 0.05);
  const glassTone = blend(tone('#8fa9bb', lit), '#ffd89a', 0.1 + night * 0.78);

  // Stallriser: the solid base a shopfront stands on. Without it the glazing
  // reads as a hole cut down to the pavement.
  ctx.fillStyle = tone(style.accent, lit * 0.68);
  ctx.fillRect(pad * 0.5, -riser, w - pad, riser);
  ctx.fillStyle = trim;
  ctx.fillRect(pad * 0.5, -riser - 2.2, w - pad, 2.2);

  const doorW = Math.min(Math.max(w * 0.19, 9), 22);
  const paneW = Math.max(8, w - pad * 2 - doorW - 3);

  ctx.fillStyle = glassTone;
  ctx.fillRect(pad, glass, paneW, -glass - riser);

  // Glazing bars and the frame, batched into one path: a street of shops is
  // drawn every frame, so a fill per bar shows up on a phone.
  ctx.fillStyle = trim;
  ctx.beginPath();
  if (fine) {
    const bays = Math.max(1, Math.round(paneW / 22));
    for (let i = 1; i < bays; i++) ctx.rect(pad + (paneW / bays) * i - 1, glass, 2, -glass - riser);
  }
  ctx.rect(pad, glass, paneW, 2.4);
  ctx.rect(pad - 1.6, glass - 1.8, paneW + 3.2, 1.8);
  ctx.fill();
  if (fine) {
    ctx.fillStyle = alpha('#ffffff', 0.15);
    ctx.fillRect(pad + 2, glass + 3, paneW * 0.44, (-glass - riser) * 0.32);
  }

  // Door, with a fanlight over it and a handle.
  const doorX = w - pad - doorW;
  const doorTop = glass + 1.5;
  ctx.fillStyle = tone(style.accent, lit * 0.92);
  ctx.fillRect(doorX, doorTop, doorW, -doorTop);
  ctx.fillStyle = blend(tone('#8fa9bb', lit), '#ffe0a8', 0.14 + night * 0.74);
  ctx.fillRect(doorX + 2.4, doorTop + 2.5, doorW - 4.8, -doorTop * 0.44);
  ctx.fillStyle = trim;
  ctx.beginPath();
  ctx.rect(doorX - 1.4, doorTop - 1.8, doorW + 2.8, 1.8);
  if (fine) ctx.rect(doorX + doorW - 4.2, -h * 0.22, 1.6, 4.2);
  ctx.fill();

  // What the shop sells, in its window. Five displays rather than five signs is
  // what makes the row read as a parade of shops from across the street.
  if (fine && plan.trade) {
    drawWindowDisplay(ctx, pad, glass, paneW, -glass - riser, plan.trade, lit);
  }

  if (plan.valance) drawValance(ctx, pad - 2.5, glass - 1, paneW + 5, plan, lit, fine);
  if (plan.sign) {
    drawNameBoard(ctx, pad - 2.5, sign, w - pad * 2 + 5, signH, plan, lit, night, fine, mirrored);
  }
}

/**
 * The goods behind the glass, one arrangement per trade. Drawn inside the pane
 * and clipped to it, in the wall's own plane, so a display leans with the
 * building rather than floating in front of it.
 */
function drawWindowDisplay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  trade: Trade,
  lit: number,
): void {
  if (w < 12 || h < 10) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const floor = y + h;
  const shelf = (at: number): number => y + h * at;

  switch (trade) {
    case 'books': {
      // Two shelves of spines.
      for (const at of [0.42, 0.78]) {
        ctx.fillStyle = tone('#8a6a45', lit);
        ctx.fillRect(x + 2, shelf(at), w - 4, 2);
        const spines = Math.max(3, Math.floor((w - 6) / 4));
        for (let i = 0; i < spines; i++) {
          const n = tileNoise(i * 7 + Math.round(at * 10), i * 3);
          ctx.fillStyle = tone(['#b8474b', '#3f6f8f', '#c58a2e', '#4f8f5a'][i % 4]!, lit);
          const bh = 8 + n * 4;
          ctx.fillRect(x + 3 + i * 4, shelf(at) - bh, 3, bh);
        }
      }
      break;
    }
    case 'pets': {
      // A hutch with straw, and a bird cage hanging beside it.
      ctx.fillStyle = tone('#c8a877', lit);
      ctx.fillRect(x + 3, floor - 14, Math.min(20, w * 0.5), 12);
      ctx.fillStyle = tone('#e8c46a', lit);
      ctx.fillRect(x + 5, floor - 6, Math.min(16, w * 0.42), 4);
      ctx.strokeStyle = tone('#7d8890', lit);
      ctx.lineWidth = 1.2;
      const cage = x + w - 10;
      ctx.beginPath();
      ctx.arc(cage, y + 12, 6, 0, Math.PI * 2);
      ctx.moveTo(cage, y + 2);
      ctx.lineTo(cage, y + 6);
      ctx.stroke();
      ctx.fillStyle = tone('#f2c14e', lit);
      ctx.beginPath();
      ctx.arc(cage, y + 12, 2.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'cleaners': {
      // A rail of pressed shirts under wraps.
      ctx.strokeStyle = tone('#98a2a8', lit);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 8);
      ctx.lineTo(x + w - 2, y + 8);
      ctx.stroke();
      const shirts = Math.max(2, Math.floor((w - 6) / 8));
      for (let i = 0; i < shirts; i++) {
        const sx = x + 4 + i * 8;
        ctx.fillStyle = tone(i % 2 === 0 ? '#fbfdff' : '#dfe8ee', lit);
        ctx.beginPath();
        ctx.moveTo(sx, y + 9);
        ctx.lineTo(sx + 6, y + 9);
        ctx.lineTo(sx + 5, floor - 6);
        ctx.lineTo(sx + 1, floor - 6);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'bakery': {
      // A counter of loaves and a tray of buns.
      ctx.fillStyle = tone('#a9713f', lit);
      ctx.fillRect(x + 2, floor - 10, w - 4, 8);
      for (let i = 0; i * 9 < w - 8; i++) {
        ctx.fillStyle = tone(i % 2 === 0 ? '#d8a25c' : '#c08a44', lit);
        ctx.beginPath();
        ctx.ellipse(x + 7 + i * 9, floor - 12, 4, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = tone('#e8c46a', lit);
      ctx.fillRect(x + 3, y + 7, Math.min(14, w * 0.4), 3);
      break;
    }
    default: {
      // Buckets of blooms on the floor of the window.
      for (let i = 0; i * 10 < w - 6; i++) {
        const bx = x + 6 + i * 10;
        ctx.fillStyle = tone('#6f7f88', lit);
        ctx.fillRect(bx - 3.5, floor - 9, 7, 7);
        for (let j = 0; j < 3; j++) {
          ctx.fillStyle = tone(['#e2607f', '#f2b04a', '#c76ec0'][(i + j) % 3]!, lit);
          ctx.beginPath();
          ctx.arc(bx - 3 + j * 3, floor - 12 - (j % 2) * 3, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = tone('#4f8f5a', lit);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx, floor - 9);
        ctx.lineTo(bx, floor - 13);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

/**
 * The other camera-facing wall of the trading floor. Giving it a flank rather
 * than a second shopfront is most of what stops a building looking like a
 * mirrored cardboard cut-out.
 */
function drawFlankElevation(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  plan: BuildingPlan,
  lit: number,
  night: number,
): void {
  const { style } = plan;
  const { riser } = shopLayout(h);

  ctx.fillStyle = tone(style.accent, lit * 0.6);
  ctx.fillRect(0, -riser, w, riser);
  ctx.fillStyle = tone(style.trim, lit * 0.9);
  ctx.fillRect(0, -riser - 1.8, w, 1.8);

  // A service door at one end, high windows along the rest, and a downpipe.
  const doorW = Math.min(Math.max(w * 0.16, 8), 18);
  ctx.fillStyle = tone(style.wall, lit * 0.6);
  ctx.fillRect(w * 0.08, -h * 0.62, doorW, h * 0.62);
  ctx.fillStyle = tone(style.trim, lit * 0.82);
  ctx.fillRect(w * 0.08, -h * 0.62, doorW, 1.8);

  const panes = Math.max(1, Math.floor((w - doorW - w * 0.2) / 20));
  const paneW = Math.min(14, (w - doorW - w * 0.24) / panes - 4);
  if (paneW > 4) {
    ctx.fillStyle = blend(tone('#7f97a6', lit), '#ffd89a', night * 0.5);
    ctx.beginPath();
    for (let i = 0; i < panes; i++) {
      ctx.rect(w * 0.1 + doorW + 6 + i * (paneW + 6), -h * 0.72, paneW, h * 0.24);
    }
    ctx.fill();
  }

  ctx.fillStyle = tone(style.trim, lit * 0.7);
  ctx.fillRect(w - 4.5, -h, 2.6, h);
}

/**
 * A residential storey: course lines if the wall is brick or stone, a grid of
 * windows with sills, and shutters on some of them. Panes light up unevenly
 * after dark, which is what makes the street look inhabited rather than switched
 * off.
 */
function drawUpperElevation(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  plan: BuildingPlan,
  lit: number,
  night: number,
  storey: number,
  fine: boolean,
): void {
  const { style, seed } = plan;

  if (style.courses && fine) {
    ctx.fillStyle = alpha(shade(style.wall, 0.82), 0.5);
    ctx.beginPath();
    for (let y = -6; y > -h + 3; y -= 9) ctx.rect(0, y, w, 1.1);
    ctx.fill();
  }
  // A string course marking the floor line, which is what breaks a tall wall up
  // into storeys from a distance.
  ctx.fillStyle = tone(style.trim, lit * 0.94);
  ctx.fillRect(0, -3.2, w, 3.2);

  const rows = Math.max(1, Math.min(3, Math.round(h / 30)));
  const cols = Math.max(1, Math.min(5, Math.round(w / 24)));
  const cell = w / cols;
  const paneW = Math.min(cell * 0.52, 15);
  const paneH = Math.min((h / rows) * 0.52, 17);
  const shutters = fine && roll(seed, 30 + storey) > 0.62 && paneW > 7;

  // Reveals, sills, dark panes and lit panes are each one path for the same
  // reason the glazing bars are.
  const reveal = tone(style.wall, lit * 0.66);
  const sill = tone(style.trim, lit);
  const off = blend(tone('#7d94a4', lit), '#ffdf9e', night * 0.14);
  const on = blend(tone('#7d94a4', lit), '#ffe2a4', 0.1 + night * 0.86);
  const bars: Array<[number, number]> = [];
  const litPanes: Array<[number, number]> = [];
  const darkPanes: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    const y = -h + (h / rows) * (r + 0.5) - paneH / 2 + 2;
    for (let c = 0; c < cols; c++) {
      const x = cell * (c + 0.5) - paneW / 2;
      bars.push([x, y]);
      const alight = tileNoise(Math.round(seed + r * 13 + c * 5 + storey * 3), Math.round(seed + c));
      (alight < 0.5 ? litPanes : darkPanes).push([x, y]);
    }
  }

  ctx.fillStyle = reveal;
  ctx.beginPath();
  for (const [x, y] of bars) ctx.rect(x - 1.8, y - 1.8, paneW + 3.6, paneH + 3.6);
  ctx.fill();
  ctx.fillStyle = off;
  ctx.beginPath();
  for (const [x, y] of darkPanes) ctx.rect(x, y, paneW, paneH);
  ctx.fill();
  ctx.fillStyle = on;
  ctx.beginPath();
  for (const [x, y] of litPanes) ctx.rect(x, y, paneW, paneH);
  ctx.fill();
  ctx.fillStyle = sill;
  ctx.beginPath();
  for (const [x, y] of bars) {
    ctx.rect(x - 3, y + paneH + 1.8, paneW + 6, 2.2);
    // Transom bar across each pane, so a window is not a plain rectangle.
    if (fine) ctx.rect(x, y + paneH * 0.4, paneW, 1.4);
  }
  ctx.fill();

  // Shutters, a shade down from the sills so they read as joinery beside the
  // window rather than as a bright pilaster running up the whole wall.
  if (shutters) {
    ctx.fillStyle = tone(style.trim, lit * 0.78);
    ctx.beginPath();
    for (const [x, y] of bars) {
      ctx.rect(x - 5.2, y - 1, 3.4, paneH + 2);
      ctx.rect(x + paneW + 1.8, y - 1, 3.4, paneH + 2);
    }
    ctx.fill();
  }
}

/** Striped awning valance hanging over a shopfront. */
function drawValance(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  plan: BuildingPlan,
  lit: number,
  fine: boolean,
): void {
  // The shops opposite the diner carry the deep striped awnings the sheet draws;
  // the rest of the town gets the shallower valance that reads at a distance.
  const drop = plan.trade ? 13 : 9;
  const bands = Math.max(3, Math.round(w / 11));
  const bandW = w / bands;
  const bandA = tone(plan.awning, lit);
  const bandB = tone('#fff2dc', lit);

  for (const parity of [0, 1]) {
    ctx.fillStyle = parity === 0 ? bandA : bandB;
    ctx.beginPath();
    for (let i = parity; i < bands; i += 2) ctx.rect(x + i * bandW, y, bandW + 0.6, drop);
    ctx.fill();
  }
  if (plan.valance === 2 && fine) {
    // Scalloped hem: the same two colours again, as half-discs on the bottom
    // edge, so the awning does not end in a ruler-straight line.
    for (const parity of [0, 1]) {
      ctx.fillStyle = parity === 0 ? bandA : bandB;
      ctx.beginPath();
      for (let i = parity; i < bands; i += 2) {
        ctx.moveTo(x + i * bandW, y + drop);
        ctx.arc(x + (i + 0.5) * bandW, y + drop, bandW / 2, Math.PI, 0, true);
      }
      ctx.fill();
    }
  }
  ctx.fillStyle = alpha('#2b1c14', 0.2);
  ctx.fillRect(x, y - 1.6, w, 1.8);
}

/** Painted name board over a shopfront, lit from below after dark. */
function drawNameBoard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  plan: BuildingPlan,
  lit: number,
  night: number,
  fine: boolean,
  mirrored = false,
): void {
  ctx.fillStyle = tone(plan.style.accent, lit * 0.86);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = alpha('#000000', 0.16);
  ctx.fillRect(x, y + h - 1.6, w, 1.6);
  if (!fine) return;

  // The shops opposite the diner have names, and they are close enough to the
  // camera to read them. The board is already in the wall's plane, so the
  // lettering leans with the building rather than floating across it.
  const label = plan.trade ? TRADE_STYLES[plan.trade].label : null;
  if (label) {
    const colour = blend(tone('#fff6de', lit), '#ffe9b0', night * 0.6);
    ctx.save();
    // The wall plane this board is painted on runs backwards on the left-hand
    // elevation, so the lettering is flipped back before it is set.
    if (mirrored) {
      ctx.translate(x * 2 + w, 0);
      ctx.scale(-1, 1);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.min(h * 0.72, 9);
    ctx.font = `700 ${size}px Fredoka, Nunito, system-ui, sans-serif`;
    const room = w - 6;
    const measured = ctx.measureText(label).width;
    // A long trade name gets set smaller rather than clipped or squeezed.
    if (measured > room && measured > 0) {
      size = Math.max(5, (size * room) / measured);
      ctx.font = `700 ${size}px Fredoka, Nunito, system-ui, sans-serif`;
    }
    ctx.fillStyle = colour;
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
    ctx.restore();
    return;
  }

  // Lettering, as a run of bars. Real glyphs would be unreadable at this size
  // and would need a font; a rhythm of bars reads as a shop name and does not.
  const words = 2 + Math.floor(roll(plan.seed, 40) * 2);
  const inset = Math.max(3, w * 0.08);
  const run = w - inset * 2;
  ctx.fillStyle = blend(tone('#fff6de', lit), '#ffe9b0', night * 0.6);
  ctx.beginPath();
  let at = inset;
  for (let word = 0; word < words && at < w - inset; word++) {
    const letters = 3 + Math.floor(roll(plan.seed, 41 + word) * 4);
    for (let i = 0; i < letters && at < w - inset; i++) {
      ctx.rect(x + at, y + h * 0.3, Math.min(2.2, run * 0.05), h * 0.4);
      at += 3.4;
    }
    at += 4;
  }
  ctx.fill();
}

// ------------------------------------------------------------------- roofs

/**
 * The roof, drawn from the plan's own footprint at the plan's own level — the
 * same two numbers the top storey's walls were drawn from.
 */
function drawRoof(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  plan: BuildingPlan,
  night: number,
  fine: boolean,
): void {
  const { roof, style } = plan;

  // Cornice capping the walls. It takes its thickness out of the top of the
  // wall rather than adding it on, so it cannot push the roof up or out.
  const cornice = Math.min(0.09, (roof.level - plan.storeys[plan.storeys.length - 1]!.base) * 0.3);
  isoSides(ctx, cx, cy, roof.sx, roof.sy, cornice, facesOf(style.trim), roof.level - cornice);

  if (roof.kind === 'gable') drawGableRoof(ctx, cx, cy, plan, fine);
  else drawDeckRoof(ctx, cx, cy, plan, night, fine);
}

/** Level of the standable surface of a deck roof. */
const deckLevel = (roof: RoofPlan): number => roof.level + roof.parapet - 0.06;

/**
 * A flat roof inside a parapet: felt deck, coping rail around the edge, and an
 * optional raised name board on the street side.
 */
function drawDeckRoof(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  plan: BuildingPlan,
  night: number,
  fine: boolean,
): void {
  const { roof, style } = plan;
  const coping = tone(style.trim, 0.94);
  // The parapet stands on the roof edge, so it shares the roof's footprint.
  isoSides(ctx, cx, cy, roof.sx, roof.sy, roof.parapet, facesOf(shade(style.wall, 0.92)), roof.level);

  const top = roof.level + roof.parapet;
  const rim = Math.min(0.3, Math.min(roof.sx, roof.sy) * 0.1);
  const capTop = planeOrigin(cx, cy, top);
  diamondPath(ctx, capTop.x, capTop.y, roof.sx, roof.sy);
  ctx.fillStyle = coping;
  ctx.fill();

  // Inside of the parapet, then the deck a little below the coping. Drawing the
  // deck lower is what leaves the inner face of the far parapet showing, which
  // is what makes the roof read as a tray rather than as a painted lid.
  diamondPath(ctx, capTop.x, capTop.y, roof.sx - rim, roof.sy - rim);
  ctx.fillStyle = shade(style.wall, 0.7);
  ctx.fill();

  const surface = planeOrigin(cx, cy, deckLevel(roof));
  diamondPath(ctx, surface.x, surface.y, roof.sx - rim, roof.sy - rim);
  ctx.fillStyle = plan.deck;
  ctx.fill();
  if (fine) {
    // Felt seams, clipped to the deck so they cannot run off the side of it.
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = alpha('#5f5b51', 0.34);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const reach = (roof.sx + roof.sy) * 8;
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(surface.x - TILE_W * roof.sx * 0.5, surface.y + i * 11 - reach * 0.25);
      ctx.lineTo(surface.x + TILE_W * roof.sx * 0.5, surface.y + i * 11 + reach * 0.25);
    }
    ctx.stroke();
    ctx.restore();
  }

  for (const g of plan.gear) drawRoofGear(ctx, cx, cy, plan, g, night);

  // The near two runs of coping again, so gear standing at the front edge sits
  // behind the parapet instead of on top of it.
  const outer = diamondCorners(cx, cy, roof.sx, roof.sy, top);
  const inner = diamondCorners(cx, cy, roof.sx - rim, roof.sy - rim, top);
  ctx.fillStyle = coping;
  ctx.beginPath();
  ctx.moveTo(outer.s.x, outer.s.y);
  ctx.lineTo(outer.e.x, outer.e.y);
  ctx.lineTo(inner.e.x, inner.e.y);
  ctx.lineTo(inner.s.x, inner.s.y);
  ctx.closePath();
  ctx.moveTo(outer.s.x, outer.s.y);
  ctx.lineTo(outer.w.x, outer.w.y);
  ctx.lineTo(inner.w.x, inner.w.y);
  ctx.lineTo(inner.s.x, inner.s.y);
  ctx.closePath();
  ctx.fill();

  if (roof.crown) drawParapetCrown(ctx, cx, cy, plan, top, night);
}

/**
 * A raised parapet section standing over the shopfront, carrying the trade name.
 * The false front is the most main-street thing a small building can do, and it
 * gives the skyline something other than parapets all cut to one height.
 */
function drawParapetCrown(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  plan: BuildingPlan,
  base: number,
  night: number,
): void {
  const { roof, style } = plan;
  // The crown stands on the front edge, inside the footprint on both counts.
  const alongY = plan.front === 'right';
  const sx = alongY ? Math.min(0.3, roof.sx * 0.16) : roof.sx * 0.72;
  const sy = alongY ? roof.sy * 0.72 : Math.min(0.3, roof.sy * 0.16);
  const dx = alongY ? (roof.sx - sx) / 2 : 0;
  const dy = alongY ? 0 : (roof.sy - sy) / 2;
  const at = gearCentre(cx, cy, dx, dy);
  const h = 0.34 + roll(plan.seed, 45) * 0.22;

  isoSides(ctx, at.x, at.y, sx, sy, h, facesOf(style.accent), base);
  diamondPath(ctx, at.x, at.y - (base + h) * TILE_Z, sx, sy);
  ctx.fillStyle = tone(style.trim, 1.02);
  ctx.fill();
  if (night > 0.05) {
    // A run of bulbs along the top of the board.
    ctx.fillStyle = alpha('#ffe7ab', 0.5 + night * 0.4);
    const corners = diamondCorners(at.x, at.y, sx, sy, base + h);
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      ctx.beginPath();
      ctx.arc(
        corners.s.x + (corners.e.x - corners.s.x) * t,
        corners.s.y + (corners.e.y - corners.s.y) * t,
        1.8,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

/**
 * A pitched roof, built out of the four corners of the footprint it caps. The
 * eaves land exactly on the walls: a real roof would oversail them a little, but
 * an overhang is indistinguishable at this size from the lid-slid-off-the-box
 * bug, so it stays flush.
 */
function drawGableRoof(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  plan: BuildingPlan,
  fine: boolean,
): void {
  const { roof, style } = plan;
  const c = diamondCorners(cx, cy, roof.sx, roof.sy, roof.level);
  const rise = roof.rise * TILE_Z;
  const alongX = roof.ridge === 'x';
  const mid = (a: Corner, b: Corner): Corner => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2 - rise,
  });
  // The ridge runs between the midpoints of the two end walls.
  const a = alongX ? mid(c.n, c.w) : mid(c.n, c.e);
  const b = alongX ? mid(c.e, c.s) : mid(c.w, c.s);
  // The far corner is the same either way; which of the other two the far slope
  // reaches, and which the near one does, swaps with the ridge.
  const farEnd = alongX ? c.e : c.w;
  const near = alongX ? c.w : c.e;

  const tile = shade(style.accent, 0.86);
  const quad = (p: Corner[], fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(p[0]!.x, p[0]!.y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i]!.x, p[i]!.y);
    ctx.closePath();
    ctx.fill();
  };

  // Far slope, then near slope, then the gable end that faces the camera.
  quad([c.n, a, b, farEnd], shade(tile, 1.16));
  quad([near, a, b, c.s], shade(tile, 0.84));
  quad([near, c.s, b], shade(style.wall, 0.76));

  // Courses down each slope and a ridge cap, which is what turns two flat
  // quads into a tiled roof.
  if (fine) {
    ctx.strokeStyle = alpha('#2b1f18', 0.2);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      ctx.moveTo(near.x + (a.x - near.x) * t, near.y + (a.y - near.y) * t);
      ctx.lineTo(c.s.x + (b.x - c.s.x) * t, c.s.y + (b.y - c.s.y) * t);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = tone(style.trim, 1.02);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  // Fascia along the near eave, so the roof has a visible edge on the wall.
  ctx.strokeStyle = tone(style.trim, 0.96);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(near.x, near.y + 1);
  ctx.lineTo(c.s.x, c.s.y + 1);
  ctx.stroke();
}

/** Screen position of a point `dx`, `dy` tiles from a footprint centre. */
function gearCentre(cx: number, cy: number, dx: number, dy: number): Point {
  return { x: cx + (dx - dy) * (TILE_W / 2), y: cy + (dx + dy) * (TILE_H / 2) };
}

/** Water tanks, plant, stair heads and hoardings, standing on the roof deck. */
function drawRoofGear(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  plan: BuildingPlan,
  g: RoofGear,
  night: number,
): void {
  const { roof, style } = plan;
  const at = gearCentre(cx, cy, g.dx, g.dy);
  // Gear on a pitched roof emerges from the slope; everything else stands on
  // the deck. Either way the level comes from the roof, not from a guess.
  const base = roof.kind === 'gable' ? roof.level + roof.rise * 0.55 : deckLevel(roof);

  switch (g.kind) {
    case 'tank': {
      // A tank on legs, with the legs actually under it.
      ctx.fillStyle = '#6a6157';
      const feet = diamondCorners(at.x, at.y, g.sx * 0.7, g.sy * 0.7, base);
      for (const p of [feet.e, feet.s, feet.w]) {
        ctx.fillRect(p.x - 1.3, p.y - g.h * 0.42 * TILE_Z, 2.6, g.h * 0.42 * TILE_Z);
      }
      isoCylinder(ctx, at.x, at.y, g.sx * 0.5, g.h * 0.58, '#bfae92', base + g.h * 0.42);
      break;
    }
    case 'condenser': {
      isoBox(ctx, at.x, at.y, g.sx, g.sy, g.h, facesOf('#a7b0b5'), base);
      // Fan grille on the lid.
      const lid = at.y - (base + g.h) * TILE_Z;
      ctx.fillStyle = '#7f888d';
      ctx.beginPath();
      ctx.ellipse(at.x, lid, TILE_W * g.sx * 0.22, TILE_H * g.sy * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cfd6da';
      ctx.beginPath();
      ctx.ellipse(at.x, lid, TILE_W * g.sx * 0.09, TILE_H * g.sy * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'vent': {
      isoCylinder(ctx, at.x, at.y, g.sx * 0.5, g.h, '#9aa3a8', base);
      isoCylinder(ctx, at.x, at.y, g.sx * 0.62, 0.05, '#c3cacd', base + g.h);
      break;
    }
    case 'stair': {
      // Stair head: rendered blockwork rather than another slab of wall colour,
      // with a lip on top so it does not read as a lid of its own.
      isoBox(ctx, at.x, at.y, g.sx, g.sy, g.h, facesOf('#b8b0a2'), base);
      isoBox(ctx, at.x, at.y, g.sx * 0.94, g.sy * 0.94, 0.05, facesOf('#6e6a62'), base + g.h);
      // Door on the corner that looks at the camera.
      const face = diamondCorners(at.x, at.y, g.sx, g.sy, base + g.h);
      const doorH = g.h * TILE_Z * 0.66;
      ctx.fillStyle = shade(style.accent, 0.78);
      ctx.beginPath();
      ctx.moveTo(face.s.x - 7, face.s.y + 3.5 + g.h * TILE_Z - doorH);
      ctx.lineTo(face.s.x, face.s.y + g.h * TILE_Z - doorH);
      ctx.lineTo(face.s.x, face.s.y + g.h * TILE_Z);
      ctx.lineTo(face.s.x - 7, face.s.y + 3.5 + g.h * TILE_Z);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'planter': {
      isoBox(ctx, at.x, at.y, g.sx, g.sy, g.h, facesOf('#8a6a4c'), base);
      const top = at.y - (base + g.h) * TILE_Z;
      for (let i = -1; i <= 1; i++) {
        ctx.fillStyle = i === 0 ? '#79b25f' : '#5f9a52';
        ctx.beginPath();
        ctx.ellipse(at.x + i * TILE_W * g.sx * 0.22, top - 3, 6.5, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'chimney': {
      isoBox(ctx, at.x, at.y, g.sx, g.sy, g.h, facesOf('#9c5f4c'), base);
      isoBox(ctx, at.x, at.y, g.sx * 0.9, g.sy * 0.9, 0.07, facesOf('#d8cdba'), base + g.h);
      break;
    }
    default: {
      // Hoarding: a braced panel standing across the deck on two legs. The legs
      // start at the deck and the bracing runs back to it, so the board reads as
      // standing on the roof rather than hovering over it.
      const legs = diamondCorners(at.x, at.y, g.sx, g.sy, base);
      // The middle of the footprint at deck level, which is where the raking
      // props have to land. Taking it from the unlifted centre would run them
      // half way down the building.
      const foot = planeOrigin(at.x, at.y, base);
      const hpx = g.h * TILE_Z;
      const boardTop = hpx;
      const boardLow = hpx * 0.44;
      ctx.strokeStyle = '#5e5a52';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const p of [legs.e, legs.w]) {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - boardTop);
        // Raking prop back down to the deck.
        ctx.moveTo(p.x, p.y - boardLow);
        ctx.lineTo(p.x + (foot.x - p.x) * 0.45, p.y + (foot.y - p.y) * 0.45);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(legs.w.x, legs.w.y - boardTop);
      ctx.lineTo(legs.e.x, legs.e.y - boardTop);
      ctx.lineTo(legs.e.x, legs.e.y - boardLow);
      ctx.lineTo(legs.w.x, legs.w.y - boardLow);
      ctx.closePath();
      ctx.fillStyle = blend(shade(plan.awning, 1.05), '#ffe6ad', night * 0.4);
      ctx.fill();
      // Frame, so the board has an edge instead of floating as a flat colour.
      ctx.strokeStyle = alpha('#2b1f18', 0.45);
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.fillStyle = alpha('#fff6de', 0.8);
      const bars = 4;
      for (let i = 0; i < bars; i++) {
        const t = 0.18 + (i / bars) * 0.62;
        const x = legs.w.x + (legs.e.x - legs.w.x) * t;
        const y = legs.w.y + (legs.e.y - legs.w.y) * t;
        ctx.fillRect(x, y - boardTop + hpx * 0.13, 2.4, hpx * 0.24);
      }
      break;
    }
  }
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
    top: blend(lo.p.top, hi.p.top, k),
    mid: blend(lo.p.mid, hi.p.mid, k),
    ground: blend(lo.p.ground, hi.p.ground, k),
    sun: blend(lo.p.sun, hi.p.sun, k),
    far: blend(lo.p.far, hi.p.far, k),
    near: blend(lo.p.near, hi.p.near, k),
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
