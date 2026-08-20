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

// ----------------------------------------------------- rounded 2.5D volumes

/**
 * A line dark enough to hold a shape together against whatever is behind it.
 * Mixed out of the shape's own colour rather than plain black, so the outline
 * reads as the form turning away at its edge and not as a drawn-on border.
 */
export function ink(base: string, amount = 0.55): string {
  return mix(base, '#1f1710', amount);
}

/**
 * A soft top-to-bottom ramp across one volume. This is most of the difference
 * between a rounded shape and a flat sticker: lit where the light lands, sunk
 * underneath, and no hard seam anywhere in between.
 */
export function verticalRamp(
  ctx: CanvasRenderingContext2D,
  base: string,
  top: number,
  bottom: number,
  light = 1.14,
  dark = 0.74,
): CanvasGradient {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, shade(base, light));
  g.addColorStop(0.52, base);
  g.addColorStop(1, shade(base, dark));
  return g;
}

/**
 * One rounded upright volume in screen pixels — a squoval head, the bell of a
 * body, a stubby limb, a cushion. `halfTop` narrower than `half` tapers it, and
 * `bulge` bows the sides out at mid height so nothing has a straight flank.
 */
export interface RoundedVolume {
  cx: number;
  top: number;
  bottom: number;
  /** Half width at the base. */
  half: number;
  /** Half width at the top; defaults to `half`. */
  halfTop?: number;
  /** Corner rounding at each end, as a fraction of the half width there. */
  roundTop?: number;
  roundBottom?: number;
  bulge?: number;
}

/** A {@link RoundedVolume} with every derived measurement worked out once. */
interface SolvedVolume {
  cx: number;
  top: number;
  bottom: number;
  half: number;
  halfTop: number;
  /** Corner radii, clamped so they can never fold the shape inside out. */
  rt: number;
  rb: number;
  /** How far out the control point of each flank sits. */
  ctrl: number;
  midY: number;
}

function solveVolume(v: RoundedVolume): SolvedVolume {
  const halfTop = v.halfTop ?? v.half;
  const span = Math.max(0.01, v.bottom - v.top);
  return {
    cx: v.cx,
    top: v.top,
    bottom: v.bottom,
    half: v.half,
    halfTop,
    rt: Math.min((v.roundTop ?? 0.6) * halfTop, span * 0.5),
    rb: Math.min((v.roundBottom ?? 0.5) * v.half, span * 0.5),
    ctrl: (halfTop + v.half) / 2 + (v.bulge ?? 0),
    midY: v.top + span / 2,
  };
}

/** Trace the silhouette of a {@link RoundedVolume}. Every flank is a curve. */
export function volumePath(ctx: CanvasRenderingContext2D, v: RoundedVolume): void {
  const g = solveVolume(v);
  ctx.beginPath();
  ctx.moveTo(g.cx - g.halfTop, g.top + g.rt);
  ctx.quadraticCurveTo(g.cx - g.halfTop, g.top, g.cx - g.halfTop + g.rt, g.top);
  ctx.lineTo(g.cx + g.halfTop - g.rt, g.top);
  ctx.quadraticCurveTo(g.cx + g.halfTop, g.top, g.cx + g.halfTop, g.top + g.rt);
  ctx.quadraticCurveTo(g.cx + g.ctrl, g.midY, g.cx + g.half, g.bottom - g.rb);
  ctx.quadraticCurveTo(g.cx + g.half, g.bottom, g.cx + g.half - g.rb, g.bottom);
  ctx.lineTo(g.cx - g.half + g.rb, g.bottom);
  ctx.quadraticCurveTo(g.cx - g.half, g.bottom, g.cx - g.half, g.bottom - g.rb);
  ctx.quadraticCurveTo(g.cx - g.ctrl, g.midY, g.cx - g.halfTop, g.top + g.rt);
  ctx.closePath();
}

export interface SoftVolumeOptions {
  /** Outline width. Zero leaves the shape unlined. */
  line?: number;
  outline?: string;
  /** Strength of the lit crown and the shaded flank, 0..1. */
  light?: number;
}

/**
 * Paint a rounded volume so it has weight: a soft ramp for the body, a lit crown
 * where the light catches the turn of the top, a shaded flank down the away side
 * and one dark line around the whole silhouette.
 *
 * The crown and the flank are taken from {@link faces} — the same three-tone
 * ramp every box in the game is lit with — so a figure built out of these sits
 * in the same light as the chair beside it.
 */
export function softVolume(
  ctx: CanvasRenderingContext2D,
  v: RoundedVolume,
  base: string,
  opts: SoftVolumeOptions = {},
): void {
  const g = solveVolume(v);
  const c = faces(base);
  const alpha = ctx.globalAlpha;
  const strength = opts.light ?? 0.85;

  volumePath(ctx, v);
  ctx.fillStyle = verticalRamp(ctx, base, g.top, g.bottom);
  ctx.fill();

  // Lit crown, tucked inside the rounded top so the form reads as turning over
  // rather than as a flat cap sat on a tube.
  const ry = Math.max(0.6, Math.min(g.rt * 0.8, (g.bottom - g.top) * 0.3));
  ctx.globalAlpha = alpha * strength;
  ctx.fillStyle = c.top;
  ctx.beginPath();
  ctx.ellipse(g.cx, g.top + ry * 1.05, g.halfTop * 0.74, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shaded flank down the away side, following the silhouette's own rim so it
  // can never spill past the edge it is meant to be rounding off.
  ctx.globalAlpha = alpha * strength * 0.6;
  ctx.fillStyle = c.left;
  ctx.beginPath();
  ctx.moveTo(g.cx - g.halfTop + g.rt * 0.55, g.top + g.rt * 0.75);
  ctx.quadraticCurveTo(g.cx - g.halfTop, g.top + g.rt * 0.3, g.cx - g.halfTop, g.top + g.rt);
  ctx.quadraticCurveTo(g.cx - g.ctrl, g.midY, g.cx - g.half, g.bottom - g.rb);
  ctx.quadraticCurveTo(g.cx - g.half, g.bottom, g.cx - g.half + g.rb, g.bottom);
  ctx.quadraticCurveTo(
    g.cx - g.half * 0.42,
    g.midY,
    g.cx - g.halfTop + g.rt * 0.55,
    g.top + g.rt * 0.75,
  );
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = alpha;

  if (opts.line !== 0) {
    volumePath(ctx, v);
    ctx.strokeStyle = opts.outline ?? ink(base);
    ctx.lineWidth = opts.line ?? 1.1;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/**
 * Trace a polygon with its corners rounded off, either all by the same number of
 * screen pixels or each by its own.
 */
export function roundPoly(
  ctx: CanvasRenderingContext2D,
  pts: readonly Corner[],
  radius: number | readonly number[],
): void {
  const n = pts.length;
  const at = (i: number): number => (typeof radius === 'number' ? radius : (radius[i] ?? 0));
  const mid = (a: Corner, b: Corner): Corner => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[0]!, pts[1]!);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  // Aiming each arc at the midpoint of the next edge is what keeps the radius
  // achievable however short an edge gets — a table top is only a few px thick.
  for (let i = 1; i <= n; i++) {
    const cur = pts[i % n]!;
    const to = mid(cur, pts[(i + 1) % n]!);
    ctx.arcTo(cur.x, cur.y, to.x, to.y, at(i % n));
  }
  ctx.closePath();
}

export interface SoftBoxOptions {
  /** Corner rounding along the top, in screen pixels. */
  round?: number;
  /**
   * Rounding where the piece meets the floor. Kept tighter than the top by
   * default: a base as round as the lid reads as a cushion floating on the
   * tiles rather than as a table standing on them.
   */
  foot?: number;
  /** Leave the lid off, for anything something else caps. */
  lid?: boolean;
  /** Outline width. Zero leaves the piece unlined. */
  line?: number;
  /** Outline colour; defaults to the ink of the fill. */
  outline?: string;
}

/**
 * The furniture answer to {@link softVolume}: the box {@link isoBox} would draw,
 * with its corners taken off, each face given a soft ramp and the whole
 * silhouette held together by one dark line.
 *
 * Footprint, height and lift mean exactly what they mean for `isoBox`, so a
 * piece can be softened without the sim, the grid or a save noticing.
 */
export function softBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  height: number,
  base: string,
  lift = 0,
  opts: SoftBoxOptions = {},
): void {
  const r = opts.round ?? 5;
  const foot = opts.foot ?? r * 0.45;
  const h = height * TILE_Z;
  const t = diamondCorners(cx, cy, sx, sy, lift + height);
  const down = (c: Corner): Corner => ({ x: c.x, y: c.y + h });
  const c = faces(base);
  const rim: Corner[] = [t.n, t.e, down(t.e), down(t.s), down(t.w), t.w];

  // One rounded silhouette underneath, so the two softened faces cannot leave a
  // notch of floor showing at the near corner they have each taken off.
  roundPoly(ctx, rim, [r, r, foot, foot, foot, r]);
  ctx.fillStyle = base;
  ctx.fill();

  roundPoly(ctx, [t.e, t.s, down(t.s), down(t.e)], [r, r, foot, foot]);
  ctx.fillStyle = verticalRamp(ctx, c.right, t.e.y, t.e.y + h, 1.08, 0.92);
  ctx.fill();

  roundPoly(ctx, [t.s, t.w, down(t.w), down(t.s)], [r, r, foot, foot]);
  ctx.fillStyle = verticalRamp(ctx, c.left, t.s.y, t.s.y + h, 1.08, 0.92);
  ctx.fill();

  if (opts.lid !== false) {
    roundPoly(ctx, [t.n, t.e, t.s, t.w], r);
    ctx.fillStyle = c.top;
    ctx.fill();
  }

  if (opts.line !== 0) {
    roundPoly(ctx, rim, [r, r, foot, foot, foot, r]);
    ctx.strokeStyle = opts.outline ?? ink(base, 0.42);
    ctx.lineWidth = opts.line ?? 1.1;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/** A flat rounded pad on the tile plane: a softened cushion, seat or plinth. */
export function softDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  base: string,
  lift = 0,
): void {
  const rx = (TILE_W / 2) * radius;
  const ry = (TILE_H / 2) * radius;
  const y = cy - lift * TILE_Z;
  ctx.fillStyle = faces(base).top;
  ctx.beginPath();
  ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink(base, 0.4);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** A rounded upright post — a table leg, a stool leg, a stand. */
export function softPost(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  height: number,
  base: string,
  lift = 0,
): void {
  const half = (TILE_W / 2) * radius;
  const bottom = cy - lift * TILE_Z;
  softVolume(
    ctx,
    {
      cx,
      bottom,
      top: bottom - height * TILE_Z,
      half,
      halfTop: half * 0.92,
      roundTop: 0.5,
      roundBottom: 0.7,
    },
    base,
    { line: 1, light: 0.7 },
  );
}
