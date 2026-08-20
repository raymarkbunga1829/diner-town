/**
 * The approved Diner Town look, in one place.
 *
 * The art direction is a set of four hand-drawn sheets — people, furniture,
 * plated food and the street — and everything they have in common lives here:
 * the cream / tomato / oak palette they are painted from, the warm brown ink
 * every silhouette is held together with, and the handful of primitives that put
 * those two together: a lined blob, panel or polygon, a highlight and a shadow.
 *
 * Two rules keep the drawings on-model wherever they are used:
 *
 * 1. Every shape carries one warm dark line round its outside. Black would read
 *    as a comic border; {@link inkOf} mixes the line out of the shape's own
 *    colour instead, so the line reads as the form turning away at its edge.
 * 2. Nothing is lit from more than one direction. The light sits up and to the
 *    left, so a lit face is the top, and the shaded face is the lower left.
 */

import { ink, mix, roundRect } from './shapes';

/**
 * The sheets' palette. Named for what the colour is for rather than what it is,
 * because "the tomato the booths and the awnings share" is the thing a sprite
 * wants to ask for.
 */
export const SHEET = {
  /** Paper cream: walls, plates, chef whites, shop trim. */
  cream: '#fdf4e0',
  creamShade: '#d9c49c',
  /** Diner red, on the booths, the awnings, the signage and the trim. */
  tomato: '#cf4436',
  /** Oak, on every table top, counter front and chair frame. */
  oak: '#b3763c',
  oakLight: '#d19c5c',
  /** Kitchen steel. */
  steel: '#b6bdc2',
  steelDeep: '#7c848a',
  /** Griddle and burner black. */
  iron: '#3a3d41',
  /** The cleaner's mint, and the greens on the street. */
  mint: '#8ed3b4',
  mintDeep: '#3f8f74',
  leaf: '#5da356',
  leafDeep: '#3f7a43',
  /** The waiter's sky blue. */
  sky: '#6fb3dd',
  skyDeep: '#3d7fa8',
  /** Butter and brass: fries, pancakes, name boards, the jukebox. */
  butter: '#f2c14e',
  /** The line every shape is drawn with. */
  ink: '#3b2a1e',
} as const;

/** Bold enough to read at phone size, soft enough not to look like a border. */
export const LINE = 1.35;

/** The warm dark line for a colour: the sheets' ink, pulled towards the fill. */
export function inkOf(base: string, amount = 0.62): string {
  return mix(ink(base, amount), SHEET.ink, 0.35);
}

export interface Lined {
  /** Line width; 0 leaves the shape unlined. */
  line?: number;
  /** Line colour; defaults to the ink of the fill. */
  outline?: string;
}

/** Fill the current path and lay the sheet's line round it. */
function paintPath(
  ctx: CanvasRenderingContext2D,
  fill: string,
  opts: Lined = {},
  retrace?: () => void,
): void {
  ctx.fillStyle = fill;
  ctx.fill();
  const width = opts.line ?? LINE;
  if (width <= 0) return;
  // Canvas keeps the path after a fill, so a retrace is only needed where the
  // caller wants the line on a different path than the fill.
  retrace?.();
  ctx.strokeStyle = opts.outline ?? inkOf(fill);
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** A filled, lined ellipse — the workhorse of every soft shape on the sheets. */
export function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  opts: Lined = {},
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  paintPath(ctx, fill, opts);
}

/** A filled, lined rounded rectangle. */
export function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  opts: Lined = {},
): void {
  roundRect(ctx, x, y, w, h, r);
  paintPath(ctx, fill, opts, () => roundRect(ctx, x, y, w, h, r));
}

/** A filled, lined polygon. */
export function shapeOf(
  ctx: CanvasRenderingContext2D,
  pts: ReadonlyArray<readonly [number, number]>,
  fill: string,
  opts: Lined = {},
): void {
  const trace = (): void => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  };
  trace();
  paintPath(ctx, fill, opts, trace);
}

/**
 * The sheets' highlight: a soft pale sliver up the lit side of a shape, which is
 * what stops a flat fill reading as paper.
 */
export function sheen(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  strength = 0.32,
): void {
  ctx.save();
  ctx.globalAlpha *= strength;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A soft contact shadow, flattened into the tile plane. */
export function groundShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  strength = 0.2,
): void {
  ctx.fillStyle = `rgba(58, 40, 26, ${strength})`;
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.1, y + ry * 0.2, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
