import { TILE_H, TILE_W, TILE_Z } from '../engine/iso';

/** Parse #rgb / #rrggbb into components. */
function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number): string =>
  `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b))
    .toString(16)
    .slice(1)}`;

/** Multiply a colour's brightness. `amount` > 1 lightens, < 1 darkens. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  const f = (v: number) =>
    amount >= 1
      ? Math.min(255, v + (255 - v) * (amount - 1))
      : Math.max(0, v * amount);
  return toHex(f(r), f(g), f(b));
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Trace a tile-aligned diamond centred on (cx, cy). */
export function diamondPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
): void {
  const ax = (TILE_W / 4) * sx;
  const ay = (TILE_H / 4) * sx;
  const bx = (TILE_W / 4) * sy;
  const by = (TILE_H / 4) * sy;
  ctx.beginPath();
  ctx.moveTo(cx - ax + bx, cy - ay - by);
  ctx.lineTo(cx + ax + bx, cy + ay - by);
  ctx.lineTo(cx + ax - bx, cy + ay + by);
  ctx.lineTo(cx - ax - bx, cy - ay + by);
  ctx.closePath();
}

export interface Corner {
  x: number;
  y: number;
}

/** The corners of a footprint, named for where they land on screen. */
export interface Corners {
  /** Far corner. */
  n: Corner;
  /** Right-hand corner. */
  e: Corner;
  /** Near corner, where the two camera-facing walls meet. */
  s: Corner;
  /** Left-hand corner. */
  w: Corner;
}

/**
 * The same four points {@link diamondPath} traces, handed back rather than
 * stroked, `lift` tile-heights above the tile plane.
 *
 * This is how anything that is not a flat fill — a pitched roof, a parapet rim —
 * gets built from the very footprint its walls were drawn from, instead of from
 * a separately derived guess at where that footprint is.
 */
export function diamondCorners(
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  lift = 0,
): Corners {
  const ax = (TILE_W / 4) * sx;
  const ay = (TILE_H / 4) * sx;
  const bx = (TILE_W / 4) * sy;
  const by = (TILE_H / 4) * sy;
  const y = cy - lift * TILE_Z;
  return {
    n: { x: cx - ax + bx, y: y - ay - by },
    e: { x: cx + ax + bx, y: y + ay - by },
    s: { x: cx + ax - bx, y: y + ay + by },
    w: { x: cx - ax - bx, y: y - ay + by },
  };
}

export interface BoxColors {
  top: string;
  left: string;
  right: string;
}

/** Derive the three visible face colours from a single base colour. */
export function faces(base: string): BoxColors {
  return { top: shade(base, 1.18), left: shade(base, 0.7), right: shade(base, 0.9) };
}

/**
 * The two camera-facing side faces of a box, with no lid on top.
 *
 * Reach for this whenever something else is going to cover the top — a roof, the
 * storey above. A lid is a horizontal plate, and a horizontal plate drawn part
 * way up a building lands square across the facade below it; if it is also wider
 * than the walls it caps, it hangs off the sides as well. That combination is
 * what makes a roof look like it slid off its building.
 */
export function isoSides(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  height: number,
  colors: BoxColors,
  lift = 0,
): void {
  const h = height * TILE_Z;
  const { e, s, w } = diamondCorners(cx, cy, sx, sy, lift + height);

  // Right face (towards +x, lower-right on screen).
  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(s.x, s.y);
  ctx.lineTo(s.x, s.y + h);
  ctx.lineTo(e.x, e.y + h);
  ctx.closePath();
  ctx.fill();

  // Left face (towards +y, lower-left on screen).
  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(w.x, w.y);
  ctx.lineTo(w.x, w.y + h);
  ctx.lineTo(s.x, s.y + h);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw an axis-aligned box sitting on the tile plane.
 *
 * `sx`/`sy` are footprint fractions of a tile along the two grid axes, `height`
 * is in tile-height units, and `lift` raises the whole box off the floor.
 */
export function isoBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  height: number,
  colors: BoxColors,
  lift = 0,
): void {
  isoSides(ctx, cx, cy, sx, sy, height, colors, lift);
  ctx.fillStyle = colors.top;
  diamondPath(ctx, cx, cy - (lift + height) * TILE_Z, sx, sy);
  ctx.fill();
}

/** A vertical cylinder rendered as an ellipse-topped column. */
export function isoCylinder(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  height: number,
  base: string,
  lift = 0,
): void {
  const rx = (TILE_W / 2) * radius;
  const ry = (TILE_H / 2) * radius;
  const h = height * TILE_Z;
  const baseY = cy - lift * TILE_Z;
  const topY = baseY - h;

  ctx.fillStyle = shade(base, 0.78);
  ctx.beginPath();
  ctx.moveTo(cx - rx, topY);
  ctx.lineTo(cx - rx, baseY);
  ctx.ellipse(cx, baseY, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(cx + rx, topY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shade(base, 1.16);
  ctx.beginPath();
  ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Flat ellipse used for plates, rugs and shadows. */
export function isoEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fill: string,
  lift = 0,
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(cx, cy - lift * TILE_Z, (TILE_W / 2) * radius, (TILE_H / 2) * radius, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function softShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  alpha = 0.22,
): void {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, (TILE_W / 2) * radius, (TILE_H / 2) * radius, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
