/**
 * The furniture sheet, as sprites.
 *
 * One entry per {@link FurnitureShape}, keyed by the same shape name the
 * catalogue and every save already use, so the art can be replaced without the
 * simulation, the grid or a saved diner noticing. Floor pieces are built up from
 * the tile plane at the centre of their footprint; the three wall pieces are
 * drawn on the skewed plane of the wall they hang on.
 *
 * Every piece is drawn to the approved sheet: cream, tomato and oak, one warm
 * dark line round each silhouette, a lit top and a single shaded flank. Colours
 * come from the definition's palette rather than from constants here, so the
 * late-game marble and brass variants stay distinct while sharing the look.
 */

import { TILE_H, TILE_W, TILE_Z } from '../engine/iso';
import type { FurnitureDef, FurnitureShape } from '../game/data/furniture';
import { blob, groundShadow, inkOf, LINE, panel, shapeOf, SHEET, sheen } from './art';
import {
  diamondCorners,
  diamondPath,
  isoCylinder,
  isoEllipse,
  roundPoly,
  roundRect,
  shade,
  softBox,
  softDisc,
  softPost,
  withAlpha,
} from './shapes';

export interface FurnitureDrawOptions {
  /** Animation clock in seconds, for flames and water. */
  time: number;
  /** Table needs cleaning. */
  dirty?: boolean;
  /** Stove is actively cooking. */
  active?: boolean;
  /** Render at reduced opacity, for build-mode ghosts. */
  ghost?: boolean;
  /** Tint applied over the piece (placement validity feedback). */
  tint?: string;
}

/** The four colours a piece is painted from. */
export interface PropPalette {
  /** Body: the frame, the carcass, the pot. */
  base: string;
  /** Legs, plinths and anything in shadow under the piece. */
  shade: string;
  /** Work surface, seat pad or foliage — the lit face the eye lands on. */
  top: string;
  /** One detail colour: a knob, a bloom, a bottle, a light. */
  accent: string;
}

/** Draws one floor piece, centred on the tile plane at (cx, cy). */
export type PropSprite = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  pal: PropPalette,
  opts: FurnitureDrawOptions,
) => void;

/** Draws one wall piece, in the wall's own plane with the anchor at the origin. */
export type WallPropSprite = (
  ctx: CanvasRenderingContext2D,
  pal: PropPalette,
  time: number,
) => void;

export type WallPropId = 'painting' | 'clock' | 'neonSign';
export type FloorPropId = Exclude<FurnitureShape, WallPropId>;

// ------------------------------------------------------------------ helpers

/** The sheet's line, warmed towards the fill it surrounds. */
const lined = (base: string): { line: number; outline: string } => ({
  line: LINE,
  outline: inkOf(base, 0.5),
});

/**
 * A flat rounded surface on the tile plane — a table top, a seat pad, an inlay —
 * with the sheet's line round its edge so a top never reads as a hole.
 */
function top(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  lift: number,
  fill: string,
  round = 5,
  line = LINE,
): void {
  const c = diamondCorners(cx, cy, sx, sy, lift);
  const trace = (): void => roundPoly(ctx, [c.n, c.e, c.s, c.w], round);
  trace();
  ctx.fillStyle = fill;
  ctx.fill();
  if (line <= 0) return;
  trace();
  ctx.strokeStyle = inkOf(fill, 0.42);
  ctx.lineWidth = line;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** Four legs at the corners of a footprint. */
function legs(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spread: number,
  height: number,
  colour: string,
  radius = 0.08,
): void {
  for (const [ox, oy] of [
    [spread, spread],
    [spread, -spread],
    [-spread, spread],
    [-spread, -spread],
  ] as const) {
    const px = cx + ((ox - oy) * TILE_W) / 4;
    const py = cy + ((ox + oy) * TILE_H) / 4;
    softPost(ctx, px, py, radius, height, colour);
  }
}

/** Grain lines across a table top, clipped to the surface. */
function grain(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  lift: number,
  size: number,
  colour: string,
): void {
  const y = cy - lift * TILE_Z;
  ctx.save();
  diamondPath(ctx, cx, y, size, size);
  ctx.clip();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    const off = i * 5;
    ctx.beginPath();
    ctx.moveTo(cx - TILE_W * 0.5, y + off - TILE_H * 0.25);
    ctx.lineTo(cx + TILE_W * 0.5, y + off + TILE_H * 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

/** A back rest standing along the two far edges of a seat. */
function backRest(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  height: number,
  lift: number,
  frame: string,
  pad?: string,
): void {
  const bx = cx - TILE_W * 0.15;
  const by = cy - TILE_H * 0.15;
  softBox(ctx, bx, by, 0.13, 0.52, height, frame, lift, { round: 5, ...lined(frame) });
  if (!pad) return;
  softBox(ctx, bx - 1, by - 0.5, 0.1, 0.42, height * 0.62, pad, lift + height * 0.2, {
    round: 4,
    ...lined(pad),
  });
}

/** Control knobs along the front of a cooker. */
function knobs(ctx: CanvasRenderingContext2D, cx: number, cy: number, colour: string): void {
  for (let i = -1; i <= 1; i++) {
    blob(ctx, cx + i * 8 + 7, cy + 3, 2.6, 2.2, colour, { line: 1 });
  }
}

/** One black burner ring, with a pot and a flame when the stove is working. */
function burner(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  lift: number,
  opts: FurnitureDrawOptions,
  accent: string,
): void {
  isoEllipse(ctx, cx, cy, size, SHEET.iron, lift);
  isoEllipse(ctx, cx, cy, size * 0.62, shade(SHEET.iron, 0.72), lift + 0.005);
  if (!opts.active) return;
  const pulse = 0.7 + Math.sin(opts.time * 8) * 0.3;
  isoEllipse(ctx, cx, cy, size * 0.55 * pulse, withAlpha(accent, 0.9), lift + 0.01);
  flame(ctx, cx, cy - lift * TILE_Z, opts.time, 1);
  isoCylinder(ctx, cx, cy, size * 0.72, 0.22, SHEET.steelDeep, lift + 0.02);
}

function flame(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  time: number,
  scale: number,
): void {
  for (let i = 0; i < 3; i++) {
    const t = time * 6 + i * 2;
    const h = (9 + Math.sin(t) * 4) * scale;
    const w = (4 + Math.cos(t * 1.3) * 1.4) * scale;
    const x = cx + (i - 1) * 4 * scale;
    ctx.fillStyle = i === 1 ? 'rgba(255,214,120,0.9)' : 'rgba(255,140,60,0.75)';
    ctx.beginPath();
    ctx.moveTo(x, cy - 2);
    ctx.quadraticCurveTo(x - w, cy - h * 0.5, x, cy - h);
    ctx.quadraticCurveTo(x + w, cy - h * 0.5, x, cy - 2);
    ctx.fill();
  }
}

/** A rounded clump of leaves, for the pot plants and the palm. */
function leaves(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  light: string,
  dark: string,
  count: number,
  radius: number,
  time: number,
): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.sin(time * 0.6 + i) * 0.06;
    const rx = Math.cos(a) * radius;
    const ry = Math.sin(a) * radius * 0.55 - radius * 0.35;
    ctx.save();
    ctx.translate(cx + rx, cy + ry);
    ctx.rotate(a);
    blob(ctx, 0, 0, radius * 0.54, radius * 0.34, i % 2 === 0 ? light : dark, { line: 1 });
    ctx.restore();
  }
  blob(ctx, cx, cy - radius * 0.3, radius * 0.56, radius * 0.44, light, { line: 1.1 });
}

/**
 * A striped pot, which is the sheet's planter: cream body, two tomato bands and
 * a lipped rim.
 */
function stripedPot(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  height: number,
  body: string,
  stripe: string,
): void {
  const w = TILE_W * radius;
  const h = height * TILE_Z;
  panel(ctx, cx - w / 2, cy - h, w, h, 3, body, lined(body));
  ctx.save();
  roundRect(ctx, cx - w / 2, cy - h, w, h, 3);
  ctx.clip();
  ctx.fillStyle = stripe;
  ctx.fillRect(cx - w / 2, cy - h * 0.72, w, h * 0.2);
  ctx.fillRect(cx - w / 2, cy - h * 0.3, w, h * 0.16);
  ctx.restore();
  panel(ctx, cx - w * 0.58, cy - h - 2.4, w * 1.16, 5, 2.4, shade(body, 1.06), lined(body));
}

/**
 * Dressing on a table. Laid, it gets the sheet's ketchup bottle, a cruet and a
 * folded napkin; used, a smeared plate, dropped cutlery and crumbs. Clearing
 * tables is half the loop, so the difference has to read across the room.
 */
function tableSetting(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  lift: number,
  time: number,
  dirty = false,
): void {
  const y = cy - lift * TILE_Z;

  if (dirty) {
    ctx.fillStyle = 'rgba(150, 116, 62, 0.28)';
    ctx.beginPath();
    ctx.ellipse(cx + 2, y - 1, 17, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    blob(ctx, cx - 5, y - 4, 10.5, 4.6, '#f5eddc', { line: 1 });
    blob(ctx, cx - 5, y - 4, 6.8, 2.9, '#d8c9a8', { line: 0 });
    ctx.fillStyle = '#8d5a2a';
    ctx.beginPath();
    ctx.ellipse(cx - 7, y - 4.6, 2.6, 1.5, -0.3, 0, Math.PI * 2);
    ctx.ellipse(cx - 2.4, y - 3.2, 1.9, 1.1, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = SHEET.steelDeep;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 10, y - 6.5);
    ctx.lineTo(cx - 1, y - 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx + 9, y - 4);
    ctx.rotate(1.15);
    panel(ctx, -3, -5, 6.4, 8, 1.6, '#e4dac6', { line: 1 });
    ctx.restore();
    ctx.fillStyle = 'rgba(120, 78, 40, 0.45)';
    ctx.beginPath();
    ctx.ellipse(cx + 13, y - 1, 4.4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(126, 88, 44, 0.75)';
    for (let i = 0; i < 6; i++) {
      const a = i * 1.9;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 13, y - 1 + Math.sin(a) * 5.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Ketchup bottle: the one prop that says "diner" from any distance.
  panel(ctx, cx + 6.4, y - 12, 5.6, 11, 2, SHEET.tomato, lined(SHEET.tomato));
  panel(ctx, cx + 7.6, y - 14.6, 3.2, 3.4, 1.2, SHEET.cream, { line: 1 });
  sheen(ctx, cx + 7.8, y - 8.6, 1.1, 3.2, 0.4);

  // Cruet pair.
  for (const [dx, cap] of [
    [-1.5, SHEET.cream],
    [2.4, '#5d4a3a'],
  ] as const) {
    panel(ctx, cx + dx, y - 7, 3.2, 6.4, 1.2, '#efe7d5', { line: 1 });
    ctx.fillStyle = cap;
    roundRect(ctx, cx + dx, y - 7, 3.2, 1.8, 1);
    ctx.fill();
  }

  // Folded napkin with cutlery on it.
  shapeOf(
    ctx,
    [
      [cx - 15, y - 4.5],
      [cx - 8, y - 7],
      [cx - 6.5, y - 4.5],
      [cx - 13.5, y - 2],
    ],
    '#fffaf0',
    { line: 1 },
  );
  ctx.strokeStyle = SHEET.steelDeep;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 12.6, y - 5.4);
  ctx.lineTo(cx - 8.4, y - 3.8);
  ctx.stroke();

  // A single bloom in a bud vase, drifting in the draught, so a laid table is
  // never quite still.
  const vx = cx - 1;
  const sway = Math.sin(time * 1.1) * 0.6;
  panel(ctx, vx - 1.6, y - 11, 3.2, 5.4, 1.4, '#9dc3d4', { line: 0.9 });
  ctx.strokeStyle = SHEET.leafDeep;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(vx, y - 11);
  ctx.lineTo(vx + sway, y - 15.4);
  ctx.stroke();
  blob(ctx, vx + sway, y - 16.2, 2.1, 2.1, '#e2707f', { line: 0.9 });
}

// ------------------------------------------------------------- floor pieces

const FLOOR_PROPS: Record<FloorPropId, PropSprite> = {
  // ------------------------------------------------------------- tables
  tableSquare: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.36, TILE_H * 0.34);
    legs(ctx, cx, cy, 0.5, 0.52, pal.shade);
    softBox(ctx, cx, cy, 0.84, 0.84, 0.1, pal.base, 0.5, { round: 5, ...lined(pal.base) });
    top(ctx, cx, cy, 0.74, 0.74, 0.6, pal.top, 5);
    grain(ctx, cx, cy, 0.6, 0.7, withAlpha(pal.shade, 0.22));
    tableSetting(ctx, cx, cy, 0.61, opts.time, opts.dirty);
  },
  tableRound: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.34, TILE_H * 0.32);
    // Cast base, slim column, red disc: the bistro table off the sheet.
    isoEllipse(ctx, cx, cy, 0.34, shade(pal.shade, 0.9));
    isoEllipse(ctx, cx, cy, 0.26, pal.shade, 0.04);
    softPost(ctx, cx, cy, 0.1, 0.52, pal.shade);
    softDisc(ctx, cx, cy, 0.42, pal.top, 0.56);
    isoEllipse(ctx, cx, cy, 0.3, shade(pal.top, 1.08), 0.567);
    tableSetting(ctx, cx, cy, 0.58, opts.time, opts.dirty);
  },
  tableMarble: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.37, TILE_H * 0.35);
    softPost(ctx, cx, cy, 0.15, 0.5, pal.shade);
    softBox(ctx, cx, cy, 0.86, 0.86, 0.1, pal.top, 0.5, { round: 6, ...lined(pal.top) });
    // Veining, clipped to the slab.
    ctx.save();
    diamondPath(ctx, cx, cy - 0.6 * TILE_Z, 0.86, 0.86);
    ctx.clip();
    ctx.strokeStyle = withAlpha(pal.accent, 0.35);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 26 + i * 8, cy - 0.6 * TILE_Z - 10 + i * 3);
      ctx.quadraticCurveTo(cx + i * 4, cy - 0.6 * TILE_Z + 4, cx + 26, cy - 0.6 * TILE_Z - 4 + i * 5);
      ctx.stroke();
    }
    ctx.restore();
    tableSetting(ctx, cx, cy, 0.61, opts.time, opts.dirty);
  },
  tableBooth: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.4, TILE_H * 0.38);
    // Padded benches along the two far edges, banded cream like the sheet's
    // booth, with the table laid between them.
    for (const [bx, by, sx, sy] of [
      [-TILE_W * 0.24, -TILE_H * 0.24, 0.2, 0.95],
      [TILE_W * 0.24, -TILE_H * 0.24, 0.95, 0.2],
    ] as const) {
      softBox(ctx, cx + bx, cy + by, sx, sy, 0.62, pal.base, 0, { round: 6, ...lined(pal.base) });
      // Buttoned bands down the back, which is what makes vinyl read as padded.
      const seam = diamondCorners(cx + bx, cy + by, sx, sy, 0.62);
      const [a, b] = sx > sy ? [seam.s, seam.e] : [seam.w, seam.s];
      ctx.save();
      ctx.globalAlpha *= 0.45;
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.8;
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        ctx.beginPath();
        ctx.moveTo(x, y + 3);
        ctx.lineTo(x, y + 0.5 * TILE_Z);
        ctx.stroke();
      }
      ctx.restore();
    }
    legs(ctx, cx, cy, 0.42, 0.5, pal.shade);
    softBox(ctx, cx, cy, 0.72, 0.72, 0.1, pal.top, 0.5, { round: 5, ...lined(pal.top) });
    grain(ctx, cx, cy, 0.6, 0.66, withAlpha(pal.shade, 0.2));
    tableSetting(ctx, cx, cy, 0.61, opts.time, opts.dirty);
  },

  // ------------------------------------------------------------- chairs
  stool: (ctx, cx, cy, pal) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.2, TILE_H * 0.2);
    legs(ctx, cx, cy, 0.3, 0.44, pal.shade, 0.07);
    // Stretcher ring, which is what makes a stool a stool and not a plinth.
    isoEllipse(ctx, cx, cy, 0.34, withAlpha(inkOf(pal.shade), 0.55), 0.16);
    isoEllipse(ctx, cx, cy, 0.3, pal.shade, 0.17);
    softDisc(ctx, cx, cy, 0.3, pal.top, 0.48);
    isoEllipse(ctx, cx, cy, 0.22, shade(pal.top, 1.1), 0.487);
  },
  chairWood: (ctx, cx, cy, pal) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.22, TILE_H * 0.21);
    legs(ctx, cx, cy, 0.32, 0.42, pal.shade, 0.07);
    softBox(ctx, cx, cy, 0.54, 0.54, 0.09, pal.top, 0.42, { round: 6, ...lined(pal.top) });
    // Curved back with spindles, straight off the sheet.
    const bx = cx - TILE_W * 0.15;
    const by = cy - TILE_H * 0.15;
    softBox(ctx, bx, by, 0.11, 0.5, 0.46, pal.base, 0.48, { round: 6, ...lined(pal.base) });
    ctx.strokeStyle = inkOf(pal.base, 0.4);
    ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) {
      const px = bx + i * 6;
      const py = by + i * 3;
      ctx.beginPath();
      ctx.moveTo(px, py - 0.52 * TILE_Z);
      ctx.lineTo(px, py - 0.86 * TILE_Z);
      ctx.stroke();
    }
  },
  chairPadded: (ctx, cx, cy, pal) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.24, TILE_H * 0.23);
    legs(ctx, cx, cy, 0.34, 0.36, pal.shade, 0.075);
    softBox(ctx, cx, cy, 0.58, 0.58, 0.16, pal.top, 0.36, { round: 7, ...lined(pal.top) });
    backRest(ctx, cx, cy, 0.44, 0.5, pal.base, pal.top);
  },
  chairThrone: (ctx, cx, cy, pal) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.26, TILE_H * 0.25);
    legs(ctx, cx, cy, 0.36, 0.3, pal.shade, 0.08);
    softBox(ctx, cx, cy, 0.64, 0.64, 0.2, pal.top, 0.3, { round: 8, ...lined(pal.top) });
    backRest(ctx, cx, cy, 0.6, 0.48, pal.base, pal.top);
    // Arm rests, then a button on the crown of the back.
    softBox(ctx, cx + TILE_W * 0.02, cy - TILE_H * 0.2, 0.5, 0.12, 0.2, pal.base, 0.5, {
      round: 6,
      ...lined(pal.base),
    });
    softBox(ctx, cx - TILE_W * 0.2, cy + TILE_H * 0.02, 0.12, 0.5, 0.2, pal.base, 0.5, {
      round: 6,
      ...lined(pal.base),
    });
    blob(ctx, cx - TILE_W * 0.15, cy - TILE_H * 0.15 - 1.06 * TILE_Z, 4.4, 2.8, pal.accent, {
      line: 1,
    });
  },

  // ------------------------------------------------------------- stoves
  stoveCamp: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.28, TILE_H * 0.27);
    // One-burner camp stove off the sheet: a tomato box on a dark plinth, a
    // cream cooking top, one black burner and a lid standing up behind it.
    softBox(ctx, cx, cy, 0.6, 0.6, 0.1, pal.shade, 0, { round: 4, ...lined(pal.shade) });
    softBox(ctx, cx, cy, 0.64, 0.64, 0.36, pal.base, 0.1, { round: 5, ...lined(pal.base) });
    softBox(ctx, cx, cy, 0.68, 0.68, 0.06, pal.top, 0.46, { round: 5, ...lined(pal.top) });
    // The lid, hinged along the far edge and propped open.
    const back = diamondCorners(cx, cy, 0.68, 0.68, 0.52);
    shapeOf(
      ctx,
      [
        [back.w.x, back.w.y],
        [back.n.x, back.n.y],
        [back.n.x + 3, back.n.y - 0.4 * TILE_Z],
        [back.w.x + 3, back.w.y - 0.4 * TILE_Z],
      ],
      pal.top,
      lined(pal.top),
    );
    burner(ctx, cx + 3, cy + 3, 0.28, 0.52, opts, pal.accent);
    blob(ctx, cx + 14, cy + 6, 2.6, 2.2, pal.accent, { line: 1 });
  },
  stoveGas: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.34, TILE_H * 0.32);
    // Cream range with a tomato plinth, a black cooktop and a row of red knobs.
    softBox(ctx, cx, cy, 0.8, 0.8, 0.12, pal.shade, 0, { round: 3, ...lined(pal.shade) });
    softBox(ctx, cx, cy, 0.78, 0.78, 0.44, pal.base, 0.12, { round: 4, ...lined(pal.base) });
    ovenDoor(ctx, cx, cy, 0.16, 0.34, pal);
    softBox(ctx, cx, cy, 0.84, 0.84, 0.06, SHEET.iron, 0.56, { round: 4, ...lined(SHEET.iron) });
    burner(ctx, cx - 9, cy - 4, 0.26, 0.62, opts, pal.accent);
    burner(ctx, cx + 9, cy + 4, 0.26, 0.62, opts, pal.accent);
    knobs(ctx, cx, cy, pal.accent);
  },
  stovePro: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.38, TILE_H * 0.36);
    softBox(ctx, cx, cy, 0.9, 0.9, 0.14, pal.shade, 0, { round: 3, ...lined(pal.shade) });
    softBox(ctx, cx, cy, 0.88, 0.88, 0.48, pal.base, 0.14, { round: 4, ...lined(pal.base) });
    ovenDoor(ctx, cx, cy, 0.18, 0.38, pal);
    softBox(ctx, cx, cy, 0.94, 0.94, 0.07, SHEET.iron, 0.62, { round: 4, ...lined(SHEET.iron) });
    burner(ctx, cx - 11, cy - 5, 0.24, 0.69, opts, pal.accent);
    burner(ctx, cx + 11, cy + 5, 0.24, 0.69, opts, pal.accent);
    burner(ctx, cx + 6, cy - 10, 0.21, 0.69, opts, pal.accent);
    knobs(ctx, cx, cy, pal.accent);
    // Extraction hood over the top, on a pair of stays.
    ctx.strokeStyle = inkOf(SHEET.steel, 0.4);
    ctx.lineWidth = 1.6;
    for (const dx of [-14, 14]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx, cy - 0.72 * TILE_Z);
      ctx.lineTo(cx + dx, cy - 1.34 * TILE_Z);
      ctx.stroke();
    }
    softBox(ctx, cx, cy, 0.95, 0.95, 0.14, SHEET.steel, 1.34, { round: 6, ...lined(SHEET.steel) });
  },
  stoveTandoor: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.32, TILE_H * 0.3);
    isoCylinder(ctx, cx, cy, 0.36, 0.72, pal.base);
    // The sheet line round the drum, traced by hand: a cylinder is the one shape
    // the box and blob helpers cannot outline for us.
    drumOutline(ctx, cx, cy, 0.36, 0.72, inkOf(pal.base, 0.5));
    // Two banded courses, so the drum reads as built rather than extruded.
    for (const lift of [0.24, 0.5]) {
      isoEllipse(ctx, cx, cy, 0.365, withAlpha(inkOf(pal.base), 0.35), lift);
    }
    isoEllipse(ctx, cx, cy, 0.24, '#1d0f06', 0.72);
    const glow = 0.6 + Math.sin(opts.time * 4) * 0.12;
    ctx.save();
    ctx.globalAlpha *= opts.active ? 1 : 0.7;
    isoEllipse(ctx, cx, cy, 0.19 * glow + 0.06, pal.accent, 0.73);
    ctx.restore();
    if (opts.active) flame(ctx, cx, cy - 0.76 * TILE_Z, opts.time, 1.4);
  },

  // ----------------------------------------------------------- counters
  counterWood: (ctx, cx, cy, pal) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.36, TILE_H * 0.34);
    // Panelled oak front with a lighter top: the sheet's pickup counter.
    softBox(ctx, cx, cy, 0.84, 0.84, 0.5, pal.base, 0, { round: 3.5, ...lined(pal.base) });
    frontPanels(ctx, cx, cy, 0.84, 0.5, withAlpha(inkOf(pal.base), 0.5));
    softBox(ctx, cx, cy, 0.9, 0.9, 0.07, pal.top, 0.5, { round: 5, ...lined(pal.top) });
    grain(ctx, cx, cy, 0.57, 0.8, withAlpha(pal.shade, 0.18));
  },
  counterSteel: (ctx, cx, cy, pal) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.36, TILE_H * 0.34);
    softBox(ctx, cx, cy, 0.82, 0.82, 0.48, pal.base, 0, { round: 3, ...lined(pal.base) });
    softBox(ctx, cx, cy, 0.9, 0.9, 0.07, pal.top, 0.48, { round: 4, ...lined(pal.top) });
    // The pass shelf on legs above the top, which is what a pass is.
    ctx.strokeStyle = inkOf(pal.base, 0.4);
    ctx.lineWidth = 1.6;
    for (const dx of [-16, 16]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx, cy - 0.55 * TILE_Z);
      ctx.lineTo(cx + dx, cy - 0.84 * TILE_Z);
      ctx.stroke();
    }
    softBox(ctx, cx, cy, 0.76, 0.76, 0.06, shade(pal.top, 1.04), 0.84, {
      round: 4,
      ...lined(pal.top),
    });
    ctx.strokeStyle = withAlpha(pal.accent, 0.6);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - TILE_W * 0.3, cy + TILE_H * 0.02);
    ctx.lineTo(cx, cy + TILE_H * 0.18);
    ctx.lineTo(cx + TILE_W * 0.3, cy + TILE_H * 0.02);
    ctx.stroke();
  },
  sinkBasic: (ctx, cx, cy, pal) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.34, TILE_H * 0.32);
    // Tomato cabinet, steel basin, a tap arching over it.
    softBox(ctx, cx, cy, 0.8, 0.8, 0.48, pal.base, 0, { round: 3.5, ...lined(pal.base) });
    frontPanels(ctx, cx, cy, 0.8, 0.48, withAlpha(inkOf(pal.base), 0.5));
    softBox(ctx, cx, cy, 0.86, 0.86, 0.07, pal.top, 0.48, { round: 4, ...lined(pal.top) });
    isoEllipse(ctx, cx, cy, 0.32, shade(pal.top, 0.62), 0.552);
    isoEllipse(ctx, cx, cy, 0.26, withAlpha(pal.accent, 0.85), 0.556);
    ctx.strokeStyle = SHEET.steelDeep;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 0.56 * TILE_Z - 2);
    ctx.lineTo(cx - 10, cy - 0.56 * TILE_Z - 14);
    ctx.quadraticCurveTo(cx - 10, cy - 0.56 * TILE_Z - 18, cx - 2, cy - 0.56 * TILE_Z - 16);
    ctx.stroke();
  },
  dishwasher: (ctx, cx, cy, pal) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.34, TILE_H * 0.32);
    softBox(ctx, cx, cy, 0.8, 0.8, 0.5, pal.base, 0, { round: 3.5, ...lined(pal.base) });
    softBox(ctx, cx, cy, 0.86, 0.86, 0.07, pal.top, 0.5, { round: 4, ...lined(pal.top) });
    // Door with a porthole and a pull, on the face towards the camera.
    const f = diamondCorners(cx, cy, 0.8, 0.8, 0.5);
    ctx.save();
    ctx.transform(1, 0.5, 0, 1, f.w.x + 6, f.w.y + 4);
    panel(ctx, 0, 0, TILE_W * 0.3, 0.36 * TILE_Z, 3, shade(pal.base, 1.08), lined(pal.base));
    blob(ctx, TILE_W * 0.15, 0.18 * TILE_Z, 6, 5, withAlpha(pal.accent, 0.8), { line: 1 });
    ctx.restore();
  },
  binSmall: (ctx, cx, cy, pal) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.18, TILE_H * 0.18);
    // Cream drum, tomato band, a lid a shade wider than the body.
    isoCylinder(ctx, cx, cy, 0.26, 0.44, pal.base);
    ctx.save();
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = pal.accent;
    ctx.fillRect(cx - TILE_W * 0.13, cy - 0.3 * TILE_Z, TILE_W * 0.26, 5);
    ctx.restore();
    isoEllipse(ctx, cx, cy, 0.3, pal.top, 0.46);
    isoEllipse(ctx, cx, cy, 0.12, shade(pal.top, 0.7), 0.47);
    // The little "use me" figure the sheet paints on the front.
    ctx.strokeStyle = withAlpha(SHEET.cream, 0.85);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - 0.2 * TILE_Z);
    ctx.lineTo(cx - 2, cy - 0.1 * TILE_Z);
    ctx.moveTo(cx - 5, cy - 0.17 * TILE_Z);
    ctx.lineTo(cx + 1, cy - 0.17 * TILE_Z);
    ctx.stroke();
  },

  // -------------------------------------------------------------- decor
  plant: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.2, TILE_H * 0.2);
    stripedPot(ctx, cx, cy, 0.28, 0.34, pal.base, pal.shade);
    leaves(ctx, cx, cy - 0.4 * TILE_Z, pal.top, pal.accent, 5, 13, opts.time);
  },
  palm: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.24, TILE_H * 0.23);
    stripedPot(ctx, cx, cy, 0.32, 0.38, pal.base, pal.shade);
    ctx.strokeStyle = inkOf(pal.base, 0.5);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 0.4 * TILE_Z);
    ctx.quadraticCurveTo(cx + 4, cy - 1.1 * TILE_Z, cx + 1, cy - 1.6 * TILE_Z);
    ctx.stroke();
    leaves(ctx, cx + 1, cy - 1.62 * TILE_Z, pal.top, pal.accent, 7, 19, opts.time);
  },
  lamp: (ctx, cx, cy, pal) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.16, TILE_H * 0.16);
    // Round foot, slim post, and the sheet's cream dome shade.
    isoEllipse(ctx, cx, cy, 0.28, inkOf(pal.base, 0.4));
    isoEllipse(ctx, cx, cy, 0.24, pal.base, 0.03);
    panel(ctx, cx - 2, cy - 1.7 * TILE_Z, 4, 1.7 * TILE_Z, 2, pal.shade, { line: 1 });
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy - 1.62 * TILE_Z);
    ctx.quadraticCurveTo(cx, cy - 1.58 * TILE_Z, cx + 15, cy - 1.62 * TILE_Z);
    ctx.lineTo(cx + 9, cy - 2.06 * TILE_Z);
    ctx.quadraticCurveTo(cx, cy - 2.16 * TILE_Z, cx - 9, cy - 2.06 * TILE_Z);
    ctx.closePath();
    ctx.fillStyle = pal.top;
    ctx.fill();
    ctx.strokeStyle = inkOf(pal.top, 0.45);
    ctx.lineWidth = LINE;
    ctx.stroke();
    sheen(ctx, cx - 5, cy - 1.9 * TILE_Z, 4, 5, 0.3);
    const g = ctx.createRadialGradient(cx, cy - 1.6 * TILE_Z, 2, cx, cy - 1.6 * TILE_Z, 40);
    g.addColorStop(0, withAlpha(pal.accent, 0.42));
    g.addColorStop(1, withAlpha(pal.accent, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy - 1.6 * TILE_Z, 40, 0, Math.PI * 2);
    ctx.fill();
  },
  jukebox: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.3, TILE_H * 0.28);
    // Cabinet, arched crown, lit columns down each side, a record window.
    softBox(ctx, cx, cy, 0.66, 0.66, 0.86, pal.base, 0, { round: 5, ...lined(pal.base) });
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy - 0.86 * TILE_Z);
    ctx.quadraticCurveTo(cx, cy - 1.36 * TILE_Z, cx + 15, cy - 0.86 * TILE_Z);
    ctx.closePath();
    ctx.fillStyle = pal.top;
    ctx.fill();
    ctx.strokeStyle = inkOf(pal.top, 0.45);
    ctx.lineWidth = LINE;
    ctx.stroke();
    const beat = 0.5 + Math.sin(opts.time * 6) * 0.5;
    for (const dx of [-12, 12]) {
      panel(ctx, cx + dx - 2, cy - 0.82 * TILE_Z, 4, 0.4 * TILE_Z, 2, withAlpha(pal.accent, 0.45 + beat * 0.5), {
        line: 1,
      });
    }
    panel(ctx, cx - 9, cy - 0.76 * TILE_Z, 18, 9, 3, SHEET.cream, { line: 1 });
    blob(ctx, cx, cy - 0.76 * TILE_Z + 4.5, 4.4, 3.4, SHEET.iron, { line: 1 });
    panel(ctx, cx - 11, cy - 0.44 * TILE_Z, 22, 5, 2.5, withAlpha(pal.accent, 0.5 + beat * 0.5), {
      line: 1,
    });
  },
  aquarium: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.34, TILE_H * 0.32);
    softBox(ctx, cx, cy, 0.8, 0.8, 0.42, pal.base, 0, { round: 4, ...lined(pal.base) });
    ctx.save();
    ctx.globalAlpha *= 0.6;
    softBox(ctx, cx, cy, 0.76, 0.76, 0.62, pal.top, 0.42, { round: 4, ...lined(pal.top) });
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const t = opts.time * 0.9 + i * 2.1;
      blob(ctx, cx + Math.sin(t) * 12, cy - 0.7 * TILE_Z - ((i * 7) % 18), 4, 2.6, pal.accent, {
        line: 0.9,
      });
    }
  },
  fountain: (ctx, cx, cy, pal, opts) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.4, TILE_H * 0.38);
    isoCylinder(ctx, cx, cy, 0.46, 0.22, pal.base);
    isoEllipse(ctx, cx, cy, 0.42, withAlpha(pal.accent, 0.8), 0.23);
    isoCylinder(ctx, cx, cy, 0.16, 0.5, pal.top, 0.23);
    isoEllipse(ctx, cx, cy, 0.24, withAlpha(pal.accent, 0.9), 0.74);
    ctx.strokeStyle = withAlpha('#ffffff', 0.55);
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + opts.time * 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 0.95 * TILE_Z);
      ctx.quadraticCurveTo(
        cx + Math.cos(a) * 8,
        cy - 1.15 * TILE_Z,
        cx + Math.cos(a) * 17,
        cy - 0.78 * TILE_Z + Math.abs(Math.sin(a)) * 4,
      );
      ctx.stroke();
    }
  },
  statue: (ctx, cx, cy, pal) => {
    groundShadow(ctx, cx, cy, TILE_W * 0.24, TILE_H * 0.23);
    softBox(ctx, cx, cy, 0.5, 0.5, 0.3, pal.shade, 0, { round: 5, ...lined(pal.shade) });
    softPost(ctx, cx, cy, 0.16, 0.55, pal.top, 0.3);
    blob(ctx, cx, cy - 1.0 * TILE_Z, 8, 8, pal.accent, { line: LINE });
    shapeOf(
      ctx,
      [
        [cx - 10, cy - 0.86 * TILE_Z],
        [cx + 10, cy - 0.86 * TILE_Z],
        [cx, cy - 1.12 * TILE_Z],
      ],
      pal.top,
      lined(pal.top),
    );
  },

  // --------------------------------------------------------------- rugs
  rugSmall: (ctx, cx, cy, pal) => {
    rug(ctx, cx, cy, pal, false);
  },
  rugFancy: (ctx, cx, cy, pal) => {
    rug(ctx, cx, cy, pal, true);
  },
};

/** The sheet line round an upright drum: two flanks and the rim on top. */
function drumOutline(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  height: number,
  colour: string,
): void {
  const rx = (TILE_W / 2) * radius;
  const ry = (TILE_H / 2) * radius;
  const top = cy - height * TILE_Z;
  ctx.strokeStyle = colour;
  ctx.lineWidth = LINE;
  ctx.beginPath();
  ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI * 2);
  ctx.moveTo(cx - rx, top);
  ctx.lineTo(cx - rx, cy);
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(cx + rx, top);
  ctx.stroke();
}

/**
 * Panelling across the front faces of a carcass: a rail under the top and a pair
 * of stiles down each face, which is what stops a counter reading as a crate.
 */
function frontPanels(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  height: number,
  colour: string,
): void {
  const c = diamondCorners(cx, cy, size, size, height);
  const h = height * TILE_Z;
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.4;
  for (const [a, b] of [
    [c.w, c.s],
    [c.s, c.e],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + h * 0.16);
    ctx.lineTo(b.x, b.y + h * 0.16);
    ctx.stroke();
    for (const t of [0.24, 0.76]) {
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.24);
      ctx.lineTo(x, y + h * 0.82);
      ctx.stroke();
    }
  }
}

/** The oven door on the camera-facing side of a range. */
function ovenDoor(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  lift: number,
  height: number,
  pal: PropPalette,
): void {
  const c = diamondCorners(cx, cy, 0.78, 0.78, lift + height);
  ctx.save();
  ctx.transform(1, 0.5, 0, 1, c.w.x + 7, c.w.y + 5);
  panel(ctx, 0, 0, TILE_W * 0.28, height * TILE_Z * 0.8, 3, shade(pal.base, 0.95), lined(pal.base));
  panel(ctx, 3, 3, TILE_W * 0.28 - 6, height * TILE_Z * 0.34, 2, withAlpha(SHEET.iron, 0.55), {
    line: 0,
  });
  ctx.fillStyle = pal.shade;
  roundRect(ctx, 2, height * TILE_Z * 0.62, TILE_W * 0.28 - 4, 3, 1.5);
  ctx.fill();
  ctx.restore();
}

/** A woven rug: banded border, checked field, fringe on the near edges. */
function rug(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  pal: PropPalette,
  fancy: boolean,
): void {
  top(ctx, cx, cy, 0.96, 0.96, 0, pal.base, 6, 1.2);
  top(ctx, cx, cy, 0.84, 0.84, 0, pal.top, 5, 1);
  // Checked field, clipped to the rug so it cannot creep onto the floor. Four
  // squares each way at quarter-tile pitch, which lands the sheet's small check.
  ctx.save();
  diamondPath(ctx, cx, cy, 0.8, 0.8);
  ctx.clip();
  ctx.fillStyle = fancy ? pal.accent : pal.shade;
  for (let i = -2; i < 2; i++) {
    for (let j = -2; j < 2; j++) {
      if ((i + j) % 2 !== 0) continue;
      const x = cx + (i - j) * (TILE_W / 8);
      const y = cy + (i + j + 1) * (TILE_H / 8);
      diamondPath(ctx, x, y, 0.25, 0.25);
      ctx.fill();
    }
  }
  ctx.restore();
  if (fancy) top(ctx, cx, cy, 0.3, 0.3, 0, pal.base, 4, 1);
  // Fringe.
  const c = diamondCorners(cx, cy, 0.96, 0.96, 0);
  ctx.strokeStyle = withAlpha(inkOf(pal.base), 0.5);
  ctx.lineWidth = 1;
  for (const [a, b] of [
    [c.w, c.s],
    [c.s, c.e],
  ] as const) {
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 3);
      ctx.stroke();
    }
  }
}

// -------------------------------------------------------------- wall pieces

const WALL_PROPS: Record<WallPropId, WallPropSprite> = {
  // The sheet's framed burger: a gilt frame, a cream mount and the house dish.
  painting: (ctx, pal) => {
    const y = -46;
    panel(ctx, -17, y, 34, 26, 2.5, pal.base, lined(pal.base));
    panel(ctx, -13.5, y + 3.5, 27, 19, 1.5, pal.top, { line: 1 });
    // Bun, filling, bun: small, but unmistakably the burger off the menu sheet.
    const bx = 0;
    const by = y + 15;
    ctx.beginPath();
    ctx.moveTo(bx - 8, by - 2);
    ctx.quadraticCurveTo(bx - 8, by - 9, bx, by - 9);
    ctx.quadraticCurveTo(bx + 8, by - 9, bx + 8, by - 2);
    ctx.closePath();
    ctx.fillStyle = SHEET.oakLight;
    ctx.fill();
    ctx.strokeStyle = inkOf(SHEET.oakLight, 0.45);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = SHEET.leaf;
    ctx.fillRect(bx - 8.4, by - 2, 16.8, 2);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(bx - 7.6, by, 15.2, 2.4);
    panel(ctx, bx - 8, by + 2.4, 16, 3.4, 1.6, SHEET.oak, { line: 1 });
  },
  // Diner clock: tomato rim, cream face, hands that turn with the day.
  clock: (ctx, pal, time) => {
    const cy = -46 + 13;
    blob(ctx, 0, cy, 13.5, 13.5, pal.base, { line: LINE });
    blob(ctx, 0, cy, 10.5, 10.5, pal.top, { line: 1 });
    ctx.fillStyle = withAlpha(inkOf(pal.top), 0.6);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 8.4, cy + Math.sin(a) * 8.4, i % 3 === 0 ? 1.2 : 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = SHEET.ink;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    const a = time * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(Math.cos(a) * 6.5, cy + Math.sin(a) * 6.5);
    ctx.moveTo(0, cy);
    ctx.lineTo(Math.cos(a * 12) * 4, cy + Math.sin(a * 12) * 4);
    ctx.stroke();
    blob(ctx, 0, cy, 1.6, 1.6, pal.accent, { line: 0 });
  },
  neonSign: (ctx, pal, time) => {
    const y = -46;
    panel(ctx, -21, y, 42, 26, 4, pal.base, lined(pal.base));
    const glow = 0.65 + Math.sin(time * 3) * 0.35;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = withAlpha(pal.top, glow);
    ctx.beginPath();
    ctx.moveTo(-14, y + 19);
    ctx.lineTo(-14, y + 7);
    ctx.lineTo(-7, y + 19);
    ctx.lineTo(-7, y + 7);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(pal.accent, glow);
    ctx.beginPath();
    ctx.arc(3, y + 13, 6, 0.4, Math.PI * 1.7);
    ctx.moveTo(14, y + 7);
    ctx.lineTo(14, y + 19);
    ctx.stroke();
  },
};

// ---------------------------------------------------------------- the catalogue

/**
 * Every sprite in the furniture sheet, by the shape id the catalogue uses. Two
 * maps rather than one because a wall piece is drawn on a different plane, and
 * the split is what lets the type checker prove nothing is missing.
 */
export const PROP_SPRITES = { floor: FLOOR_PROPS, wall: WALL_PROPS } as const;

/** The wall-mounted shapes, for anything that has to tell the two apart. */
export const WALL_PROP_IDS: readonly WallPropId[] = ['painting', 'clock', 'neonSign'];

export function isWallProp(shape: FurnitureShape): shape is WallPropId {
  return shape in WALL_PROPS;
}

/** The sprite for a shape, whichever plane it lives on. */
export function propSpriteFor(
  shape: FurnitureShape,
): { plane: 'floor'; draw: PropSprite } | { plane: 'wall'; draw: WallPropSprite } {
  if (isWallProp(shape)) return { plane: 'wall', draw: WALL_PROPS[shape] };
  return { plane: 'floor', draw: FLOOR_PROPS[shape as FloorPropId] };
}

/**
 * Draws one piece of floor furniture. `cx`/`cy` is the centre of its footprint
 * on the tile plane. Footprints and heights are the same numbers the grid and the
 * simulation use; only the paint on them belongs to this file.
 */
export function drawFurniture(
  ctx: CanvasRenderingContext2D,
  def: FurnitureDef,
  cx: number,
  cy: number,
  opts: FurnitureDrawOptions,
): void {
  if (isWallProp(def.shape)) return;
  ctx.save();
  if (opts.ghost) ctx.globalAlpha = 0.6;
  FLOOR_PROPS[def.shape as FloorPropId](ctx, cx, cy, def.palette, opts);

  if (opts.tint) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = opts.tint;
    ctx.fillRect(cx - TILE_W, cy - TILE_Z * 3, TILE_W * 2, TILE_Z * 4);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/** Wall-mounted decor, drawn on a skewed plane matching the wall it hangs on. */
export function drawWallItem(
  ctx: CanvasRenderingContext2D,
  def: FurnitureDef,
  originX: number,
  originY: number,
  wall: 'ne' | 'nw',
  time: number,
): void {
  if (!isWallProp(def.shape)) return;
  ctx.save();
  /*
   * Skew into the wall plane. Local +x is one screen pixel of horizontal travel
   * along the wall, which in isometric also drops half a pixel; local +y is a
   * plain screen pixel downward. The negative determinant on the north-west
   * wall mirrors the artwork, which is exactly what that wall's facing needs.
   */
  const dir = wall === 'ne' ? 1 : -1;
  ctx.transform(dir, 0.5, 0, 1, originX, originY);
  WALL_PROPS[def.shape](ctx, def.palette, time);
  ctx.restore();
}

/**
 * Shop-card preview, fitted to the given box. Wall decor is much smaller than
 * a piece of furniture, so it gets its own fit or it would swim in the card.
 */
export function drawFurniturePreview(
  ctx: CanvasRenderingContext2D,
  def: FurnitureDef,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number,
): void {
  ctx.save();
  if (def.role === 'wallDecor') {
    ctx.translate(x + w / 2, y + h * 0.5);
    const scale = Math.min(w / 58, h / 36);
    ctx.scale(scale, scale);
    // The item is authored 46..20 px above its wall anchor; offset to centre it.
    ctx.translate(0, 33);
    drawWallItem(ctx, def, 0, 0, 'ne', time);
  } else {
    ctx.translate(x + w / 2, y + h * 0.78);
    const scale = Math.min(w / 92, h / 84);
    ctx.scale(scale, scale);
    drawFurniture(ctx, def, 0, 0, { time, active: def.role === 'stove' });
  }
  ctx.restore();
}
