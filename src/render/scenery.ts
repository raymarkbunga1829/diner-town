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
  diamondPath,
  faces,
  isoBox,
  isoCylinder,
  mix,
  roundRect,
  shade,
  withAlpha,
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

/**
 * Set up a drawing plane on one of a box's two camera-facing walls, so a facade
 * can be laid out as if on flat paper: local x runs along the wall from the near
 * corner, local y runs down the screen. Returns the wall's width in local units.
 * The caller owns the surrounding save/restore.
 */
function facadePlane(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  span: number,
  side: 'left' | 'right',
): number {
  // Both visible walls meet at the near (south) corner of the footprint.
  const nearY = cy + (TILE_H / 2) * span;
  const dir = side === 'right' ? 1 : -1;
  ctx.transform(dir, -0.5, 0, 1, cx, nearY);
  return (TILE_W / 2) * span;
}

const SHOP_WALLS = ['#e8a9a2', '#9fc4de', '#f0cf95', '#aed49b', '#c9aede', '#efb27f'] as const;
const AWNINGS = ['#c9503f', '#2f7f9e', '#e0952c', '#4b8d55', '#8a5aa8'] as const;

/**
 * A neighbouring shopfront: glazed ground floor under a striped awning, windows
 * upstairs that light up after dark, and something on the roof. These fill the
 * streetscape around the restaurant, so they have to read as buildings at a
 * glance from a long way off.
 */
export function drawShopBlock(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  span: number,
  height: number,
  seed: number,
  night = 0,
): void {
  const n = tileNoise(seed, seed + 3);
  const wall = SHOP_WALLS[Math.floor(n * SHOP_WALLS.length) % SHOP_WALLS.length]!;
  const awning = AWNINGS[Math.floor(tileNoise(seed + 7, seed) * AWNINGS.length) % AWNINGS.length]!;
  const shopH = 0.62;
  const canopyH = shopH + 0.06;

  ctx.fillStyle = alpha('#281c16', 0.2);
  ctx.beginPath();
  ctx.ellipse(cx + 6, cy + 4, TILE_W * span * 0.34, TILE_H * span * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  // Upper storeys, then the glazed ground floor set into them.
  isoBox(ctx, cx, cy, span, span, height, faces(wall));
  isoBox(ctx, cx, cy, span, span, shopH, faces('#54646f'));

  for (const side of ['left', 'right'] as const) {
    ctx.save();
    const w = facadePlane(ctx, cx, cy, span, side);
    const lit = side === 'right' ? 1 : 0.84;
    // Colours are hoisted out of the loops below: a street of shops is drawn every
    // frame, so anything that builds a colour string per window shows up on a phone.
    const reveal = tone(wall, lit * 0.72);
    const glassOff = mix(tone('#8fa9bb', lit), '#ffdf9e', night * 0.12);
    const glassOn = mix(tone('#8fa9bb', lit), '#ffdf9e', night);
    const bandA = tone(awning, lit);
    const bandB = tone('#fff2dc', lit);

    // Shopfront: a door and a wide pane, with warm light spilling out at night.
    ctx.fillStyle = mix(tone('#9fb6c2', lit), '#ffd89a', night * 0.85);
    ctx.fillRect(w * 0.08, -shopH * TILE_Z + 3, w * 0.5, shopH * TILE_Z - 6);
    ctx.fillStyle = tone('#6f4a33', lit);
    ctx.fillRect(w * 0.66, -shopH * TILE_Z + 3, w * 0.2, shopH * TILE_Z - 3);
    ctx.fillStyle = alpha('#ffffff', 0.16);
    ctx.fillRect(w * 0.08, -shopH * TILE_Z + 3, w * 0.5, 3);

    // Striped valance hanging off the canopy above the shopfront. Each colour is
    // one path, so the whole valance costs two fills however many stripes it has.
    const vy = -canopyH * TILE_Z;
    const bands = Math.max(3, Math.round(w / 11));
    const bandW = (w * 0.96) / bands;
    for (const parity of [0, 1]) {
      ctx.fillStyle = parity === 0 ? bandA : bandB;
      ctx.beginPath();
      for (let i = parity; i < bands; i += 2) {
        ctx.rect(w * 0.02 + i * bandW, vy, bandW + 0.6, 9);
      }
      ctx.fill();
    }
    ctx.fillStyle = alpha('#2b1c14', 0.18);
    ctx.fillRect(w * 0.02, vy + 7.4, w * 0.96, 1.8);

    // Upper windows, in rows that stop below the parapet. Reveals, dark panes and
    // lit panes are each batched into a single path for the same reason.
    const rows = Math.max(1, Math.min(4, Math.floor((height - shopH) / 0.72)));
    const cols = Math.max(2, Math.min(4, Math.round(w / 20)));
    const cellW = (w * 0.8) / cols;
    const paths: [string, Array<[number, number]>][] = [
      [reveal, []],
      [glassOff, []],
      [glassOn, []],
    ];
    for (let r = 0; r < rows; r++) {
      const wy = -(shopH + 0.42 + r * 0.72) * TILE_Z;
      for (let c = 0; c < cols; c++) {
        const wx = w * 0.1 + c * cellW;
        paths[0]![1].push([wx - 1, wy - 1]);
        const on = tileNoise(seed + r * 13 + c * 5, seed + c) < 0.55;
        paths[on ? 2 : 1]![1].push([wx, wy]);
      }
    }
    paths.forEach(([colour, boxes], i) => {
      if (!boxes.length) return;
      ctx.fillStyle = colour;
      ctx.beginPath();
      for (const [bx, by] of boxes) {
        ctx.rect(bx, by, cellW - (i === 0 ? 3 : 5), i === 0 ? 15 : 13);
      }
      ctx.fill();
    });
    ctx.restore();
  }

  // Canopy plate over the shopfront, and a parapet capping the roof.
  isoBox(ctx, cx, cy, span * 1.09, span * 1.09, 0.06, faces(shade(wall, 0.88)), canopyH);
  isoBox(ctx, cx, cy, span * 1.06, span * 1.06, 0.16, faces(shade(wall, 0.82)), height);
  // A roof deck inside the parapet. Without its own colour the top face is just a
  // pale slab of wall, and from this camera angle that is most of the building.
  const deckY = cy - (height + 0.16) * TILE_Z;
  diamondPath(ctx, cx, deckY, span * 0.94, span * 0.94);
  ctx.fillStyle = '#9b9587';
  ctx.fill();
  ctx.strokeStyle = alpha('#6f6a5e', 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) {
    const off = i * span * 8;
    ctx.moveTo(cx - TILE_W * span * 0.46, deckY + off);
    ctx.lineTo(cx + TILE_W * span * 0.46, deckY + off + TILE_H * span * 0.46);
  }
  ctx.stroke();

  // Roof clutter: a tank, a vent or a stair head, so the skyline is not a plateau.
  const roll = tileNoise(seed + 21, seed - 4);
  if (roll < 0.4) {
    isoBox(ctx, cx - 10, cy + 4, span * 0.3, span * 0.3, 0.4, faces('#a8b0b4'), height + 0.14);
  } else if (roll < 0.72) {
    isoCylinder(ctx, cx + 8, cy - 2, span * 0.24, 0.44, '#c2b39a', height + 0.14);
  } else {
    isoBox(ctx, cx + 4, cy + 6, span * 0.24, span * 0.5, 0.26, faces(shade(wall, 0.94)), height + 0.14);
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
