import { lerp, TILE_H, TILE_W, TILE_Z, type Facing } from '../engine/iso';
import { hashString } from '../engine/rng';
import type { Dish, PlateStyle } from '../game/data/dishes';
import type { FurnitureDef } from '../game/data/furniture';
import type { Ingredient } from '../game/data/ingredients';
import type { Appearance } from '../game/types';
import {
  diamondCorners,
  diamondPath,
  faces,
  ink,
  isoCylinder,
  isoEllipse,
  mix,
  type RoundedVolume,
  roundPoly,
  roundRect,
  shade,
  softBox,
  softDisc,
  softPost,
  softShadow,
  softVolume,
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

/**
 * A flat rounded surface on the tile plane — a table top, an inlay, a seat pad.
 * The same diamond {@link diamondPath} traces, with the corners taken off, so a
 * top edge is never the one sharp line left on an otherwise softened piece.
 */
function softTop(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  lift: number,
  fill: string,
  round = 6,
): void {
  const c = diamondCorners(cx, cy, sx, sy, lift);
  roundPoly(ctx, [c.n, c.e, c.s, c.w], round);
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * Draws one piece of floor furniture. `cx`/`cy` is the centre of its footprint
 * on the tile plane; everything is built upward from there out of soft-shaded,
 * round-cornered iso boxes, so the room the people stand in is made of the same
 * material they are. Footprints and heights are untouched by the softening —
 * {@link softBox} takes exactly the measurements {@link isoBox} would.
 */
export function drawFurniture(
  ctx: CanvasRenderingContext2D,
  def: FurnitureDef,
  cx: number,
  cy: number,
  opts: FurnitureDrawOptions,
): void {
  const pal = def.palette;
  ctx.save();
  if (opts.ghost) ctx.globalAlpha = 0.6;

  switch (def.shape) {
    // ------------------------------------------------------------- tables
    case 'tableSquare': {
      softShadow(ctx, cx, cy, 0.72);
      legs(ctx, cx, cy, 0.5, 0.52, pal.shade);
      softBox(ctx, cx, cy, 0.82, 0.82, 0.09, pal.base, 0.52, { round: 5 });
      softTop(ctx, cx, cy, 0.7, 0.7, 0.61, faces(pal.top).top, 5);
      woodGrain(ctx, cx, cy, 0.62, 0.68, withAlpha(pal.shade, 0.2));
      tableSetting(ctx, cx, cy, 0.62, opts.time, opts.dirty);
      break;
    }
    case 'tableRound': {
      softShadow(ctx, cx, cy, 0.7);
      softPost(ctx, cx, cy, 0.14, 0.5, pal.shade);
      isoEllipse(ctx, cx, cy, 0.4, shade(pal.base, 0.8), 0.5);
      softDisc(ctx, cx, cy, 0.4, pal.top, 0.56);
      isoEllipse(ctx, cx, cy, 0.3, shade(pal.top, 1.06), 0.565);
      tableSetting(ctx, cx, cy, 0.57, opts.time, opts.dirty);
      break;
    }
    case 'tableMarble': {
      softShadow(ctx, cx, cy, 0.74);
      softPost(ctx, cx, cy, 0.16, 0.5, pal.shade);
      softBox(ctx, cx, cy, 0.86, 0.86, 0.1, pal.top, 0.5, { round: 6 });
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
      break;
    }
    case 'tableBooth': {
      softShadow(ctx, cx, cy, 0.8);
      // Bench backs along the two far edges.
      softBox(ctx, cx - TILE_W * 0.24, cy - TILE_H * 0.24, 0.2, 0.95, 0.62, pal.base, 0, { round: 4 });
      softBox(ctx, cx + TILE_W * 0.24, cy - TILE_H * 0.24, 0.95, 0.2, 0.62, shade(pal.base, 0.92), 0, { round: 4 });
      legs(ctx, cx, cy, 0.42, 0.5, pal.shade);
      softBox(ctx, cx, cy, 0.72, 0.72, 0.09, pal.top, 0.5, { round: 5 });
      woodGrain(ctx, cx, cy, 0.6, 0.7, withAlpha(pal.shade, 0.2));
      tableSetting(ctx, cx, cy, 0.6, opts.time, opts.dirty);
      break;
    }

    // ------------------------------------------------------------- chairs
    case 'stool': {
      softShadow(ctx, cx, cy, 0.44);
      legs(ctx, cx, cy, 0.3, 0.42, pal.shade);
      softBox(ctx, cx, cy, 0.48, 0.48, 0.08, pal.base, 0.42, { round: 5 });
      break;
    }
    case 'chairWood': {
      softShadow(ctx, cx, cy, 0.46);
      legs(ctx, cx, cy, 0.32, 0.4, pal.shade);
      softBox(ctx, cx, cy, 0.52, 0.52, 0.08, pal.base, 0.4, { round: 5 });
      softBox(ctx, cx - TILE_W * 0.14, cy - TILE_H * 0.14, 0.12, 0.5, 0.42, pal.top, 0.48, { round: 4 });
      break;
    }
    case 'chairPadded': {
      softShadow(ctx, cx, cy, 0.5);
      legs(ctx, cx, cy, 0.34, 0.36, pal.shade);
      softBox(ctx, cx, cy, 0.58, 0.58, 0.14, pal.base, 0.36, { round: 6 });
      softBox(ctx, cx - TILE_W * 0.15, cy - TILE_H * 0.15, 0.16, 0.56, 0.44, pal.top, 0.5, { round: 4 });
      break;
    }
    case 'chairThrone': {
      softShadow(ctx, cx, cy, 0.54);
      legs(ctx, cx, cy, 0.36, 0.3, pal.shade);
      softBox(ctx, cx, cy, 0.64, 0.64, 0.18, pal.base, 0.3, { round: 6 });
      softBox(ctx, cx - TILE_W * 0.16, cy - TILE_H * 0.16, 0.16, 0.62, 0.6, pal.top, 0.48, { round: 4 });
      // Arm rests.
      softBox(ctx, cx + TILE_W * 0.02, cy - TILE_H * 0.2, 0.5, 0.12, 0.2, pal.base, 0.48, { round: 5 });
      softBox(ctx, cx - TILE_W * 0.2, cy + TILE_H * 0.02, 0.12, 0.5, 0.2, pal.base, 0.48, { round: 5 });
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 1.02 * TILE_Z, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    // ------------------------------------------------------------- stoves
    case 'stoveCamp': {
      softShadow(ctx, cx, cy, 0.5);
      softBox(ctx, cx, cy, 0.62, 0.62, 0.36, pal.base, 0, { round: 4 });
      burner(ctx, cx, cy, 0.38, 0.18, opts, pal.accent);
      break;
    }
    case 'stoveGas': {
      softShadow(ctx, cx, cy, 0.66);
      softBox(ctx, cx, cy, 0.8, 0.8, 0.55, pal.base, 0, { round: 3.5 });
      softBox(ctx, cx, cy, 0.84, 0.84, 0.05, pal.top, 0.55, { round: 4 });
      burner(ctx, cx - 8, cy - 4, 0.28, 0.62, opts, pal.accent);
      burner(ctx, cx + 8, cy + 4, 0.28, 0.62, opts, pal.accent);
      knobs(ctx, cx, cy, pal.accent);
      break;
    }
    case 'stovePro': {
      softShadow(ctx, cx, cy, 0.74);
      softBox(ctx, cx, cy, 0.9, 0.9, 0.6, pal.base, 0, { round: 3.5 });
      softBox(ctx, cx, cy, 0.94, 0.94, 0.06, pal.top, 0.6, { round: 4 });
      burner(ctx, cx - 10, cy - 5, 0.26, 0.68, opts, pal.accent);
      burner(ctx, cx + 10, cy + 5, 0.26, 0.68, opts, pal.accent);
      burner(ctx, cx + 6, cy - 9, 0.22, 0.68, opts, pal.accent);
      knobs(ctx, cx, cy, pal.accent);
      // Extraction hood floating above.
      softBox(ctx, cx, cy, 0.95, 0.95, 0.12, shade(pal.base, 1.1), 1.35, { round: 6 });
      break;
    }
    case 'stoveTandoor': {
      softShadow(ctx, cx, cy, 0.6);
      isoCylinder(ctx, cx, cy, 0.36, 0.72, pal.base);
      isoEllipse(ctx, cx, cy, 0.24, '#1d0f06', 0.72);
      const glow = 0.6 + Math.sin(opts.time * 4) * 0.12;
      ctx.globalAlpha = opts.active ? 1 : 0.7;
      isoEllipse(ctx, cx, cy, 0.19 * glow + 0.06, pal.accent, 0.73);
      ctx.globalAlpha = opts.ghost ? 0.6 : 1;
      if (opts.active) flame(ctx, cx, cy - 0.76 * TILE_Z, opts.time, 1.4);
      break;
    }

    // ----------------------------------------------------------- counters
    case 'counterWood':
    case 'counterSteel': {
      softShadow(ctx, cx, cy, 0.7);
      softBox(ctx, cx, cy, 0.84, 0.84, 0.5, pal.base, 0, { round: 3.5 });
      softBox(ctx, cx, cy, 0.9, 0.9, 0.06, pal.top, 0.5, { round: 4 });
      if (def.shape === 'counterSteel') {
        ctx.strokeStyle = withAlpha(pal.accent, 0.6);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - TILE_W * 0.3, cy + TILE_H * 0.02);
        ctx.lineTo(cx, cy + TILE_H * 0.18);
        ctx.lineTo(cx + TILE_W * 0.3, cy + TILE_H * 0.02);
        ctx.stroke();
      }
      break;
    }
    case 'sinkBasic':
    case 'dishwasher': {
      softShadow(ctx, cx, cy, 0.66);
      softBox(ctx, cx, cy, 0.82, 0.82, 0.5, pal.base, 0, { round: 3.5 });
      softBox(ctx, cx, cy, 0.86, 0.86, 0.06, pal.top, 0.5, { round: 4 });
      if (def.shape === 'sinkBasic') {
        isoEllipse(ctx, cx, cy, 0.3, shade(pal.base, 0.55), 0.565);
        isoEllipse(ctx, cx, cy, 0.24, withAlpha(pal.accent, 0.85), 0.57);
        ctx.strokeStyle = shade(pal.top, 0.7);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx - 9, cy - 0.56 * TILE_Z - 2);
        ctx.lineTo(cx - 9, cy - 0.56 * TILE_Z - 13);
        ctx.lineTo(cx - 1, cy - 0.56 * TILE_Z - 13);
        ctx.stroke();
      } else {
        ctx.fillStyle = withAlpha(pal.accent, 0.75);
        ctx.beginPath();
        ctx.ellipse(cx + 6, cy - 0.22 * TILE_Z, 9, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'binSmall': {
      softShadow(ctx, cx, cy, 0.4);
      isoCylinder(ctx, cx, cy, 0.26, 0.42, pal.base);
      isoEllipse(ctx, cx, cy, 0.29, pal.top, 0.44);
      isoEllipse(ctx, cx, cy, 0.1, pal.accent, 0.45);
      break;
    }

    // -------------------------------------------------------------- decor
    case 'plant': {
      softShadow(ctx, cx, cy, 0.42);
      isoCylinder(ctx, cx, cy, 0.22, 0.28, pal.base);
      leafCluster(ctx, cx, cy - 0.3 * TILE_Z, pal.top, pal.accent, 5, 13, opts.time);
      break;
    }
    case 'palm': {
      softShadow(ctx, cx, cy, 0.48);
      isoCylinder(ctx, cx, cy, 0.24, 0.32, pal.base);
      ctx.strokeStyle = shade(pal.base, 0.85);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 0.32 * TILE_Z);
      ctx.quadraticCurveTo(cx + 4, cy - 1.1 * TILE_Z, cx + 1, cy - 1.6 * TILE_Z);
      ctx.stroke();
      leafCluster(ctx, cx + 1, cy - 1.62 * TILE_Z, pal.top, pal.accent, 7, 19, opts.time);
      break;
    }
    case 'lamp': {
      softShadow(ctx, cx, cy, 0.34);
      isoEllipse(ctx, cx, cy, 0.26, pal.base);
      ctx.fillStyle = pal.shade;
      ctx.fillRect(cx - 1.5, cy - 1.7 * TILE_Z, 3, 1.7 * TILE_Z);
      ctx.fillStyle = pal.top;
      ctx.beginPath();
      ctx.moveTo(cx - 13, cy - 1.66 * TILE_Z);
      ctx.lineTo(cx + 13, cy - 1.66 * TILE_Z);
      ctx.lineTo(cx + 9, cy - 2.0 * TILE_Z);
      ctx.lineTo(cx - 9, cy - 2.0 * TILE_Z);
      ctx.closePath();
      ctx.fill();
      const g = ctx.createRadialGradient(cx, cy - 1.6 * TILE_Z, 2, cx, cy - 1.6 * TILE_Z, 40);
      g.addColorStop(0, withAlpha(pal.accent, 0.42));
      g.addColorStop(1, withAlpha(pal.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy - 1.6 * TILE_Z, 40, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'jukebox': {
      softShadow(ctx, cx, cy, 0.56);
      softBox(ctx, cx, cy, 0.66, 0.66, 1.0, pal.base, 0, { round: 4 });
      ctx.fillStyle = pal.top;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 0.82 * TILE_Z, 12, 9, 0, Math.PI, 0);
      ctx.fill();
      const beat = 0.5 + Math.sin(opts.time * 6) * 0.5;
      ctx.fillStyle = withAlpha(pal.accent, 0.5 + beat * 0.5);
      ctx.fillRect(cx - 10, cy - 0.5 * TILE_Z, 20, 4);
      break;
    }
    case 'aquarium': {
      softShadow(ctx, cx, cy, 0.66);
      softBox(ctx, cx, cy, 0.8, 0.8, 0.42, pal.base, 0, { round: 4 });
      ctx.save();
      ctx.globalAlpha *= 0.55;
      softBox(ctx, cx, cy, 0.76, 0.76, 0.62, pal.top, 0.42, { round: 4 });
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const t = opts.time * 0.9 + i * 2.1;
        const fx = cx + Math.sin(t) * 12;
        const fy = cy - 0.7 * TILE_Z - ((i * 7) % 18);
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.ellipse(fx, fy, 4, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'fountain': {
      softShadow(ctx, cx, cy, 0.8);
      isoCylinder(ctx, cx, cy, 0.46, 0.22, pal.base);
      isoEllipse(ctx, cx, cy, 0.42, withAlpha(pal.accent, 0.8), 0.23);
      isoCylinder(ctx, cx, cy, 0.16, 0.5, pal.top, 0.23);
      isoEllipse(ctx, cx, cy, 0.22, withAlpha(pal.accent, 0.9), 0.74);
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
      break;
    }
    case 'statue': {
      softShadow(ctx, cx, cy, 0.5);
      softBox(ctx, cx, cy, 0.5, 0.5, 0.3, shade(pal.base, 0.8), 0, { round: 5 });
      softPost(ctx, cx, cy, 0.16, 0.55, pal.top, 0.3);
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(cx, cy - 1.0 * TILE_Z, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.top;
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy - 0.86 * TILE_Z);
      ctx.lineTo(cx + 10, cy - 0.86 * TILE_Z);
      ctx.lineTo(cx, cy - 1.12 * TILE_Z);
      ctx.closePath();
      ctx.fill();
      break;
    }

    // --------------------------------------------------------------- rugs
    case 'rugSmall':
    case 'rugFancy': {
      softTop(ctx, cx, cy, 0.94, 0.94, 0, pal.base, 6);
      softTop(ctx, cx, cy, 0.72, 0.72, 0, pal.top, 5);
      softTop(ctx, cx, cy, 0.44, 0.44, 0, def.shape === 'rugFancy' ? pal.accent : pal.shade, 5);
      if (def.shape === 'rugFancy') softTop(ctx, cx, cy, 0.2, 0.2, 0, pal.base, 3);
      break;
    }

    default:
      // Wall pieces are drawn by drawWallItem.
      break;
  }

  if (opts.tint) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = opts.tint;
    ctx.fillRect(cx - TILE_W, cy - TILE_Z * 3, TILE_W * 2, TILE_Z * 4);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();
}

function legs(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spread: number,
  height: number,
  color: string,
): void {
  const offsets: Array<[number, number]> = [
    [spread, spread],
    [spread, -spread],
    [-spread, spread],
    [-spread, -spread],
  ];
  for (const [ox, oy] of offsets) {
    const px = cx + ((ox - oy) * TILE_W) / 4;
    const py = cy + ((ox + oy) * TILE_H) / 4;
    softPost(ctx, px, py, 0.08, height, color);
  }
}

function knobs(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.fillStyle = color;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(cx + i * 7 + 8, cy + 4, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function burner(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  lift: number,
  opts: FurnitureDrawOptions,
  accent: string,
): void {
  isoEllipse(ctx, cx, cy, size, '#2c2e31', lift);
  isoEllipse(ctx, cx, cy, size * 0.6, '#1a1c1e', lift + 0.005);
  if (!opts.active) return;
  const pulse = 0.7 + Math.sin(opts.time * 8) * 0.3;
  isoEllipse(ctx, cx, cy, size * 0.55 * pulse, withAlpha(accent, 0.9), lift + 0.01);
  flame(ctx, cx, cy - lift * TILE_Z, opts.time, 1);
  // A pot on the heat sells the "cooking" read at a glance.
  isoCylinder(ctx, cx, cy, size * 0.72, 0.22, '#5e646b', lift + 0.02);
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

function leafCluster(
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
    ctx.fillStyle = i % 2 === 0 ? light : dark;
    ctx.beginPath();
    ctx.ellipse(cx + rx, cy + ry, radius * 0.52, radius * 0.34, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(cx, cy - radius * 0.3, radius * 0.55, radius * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
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
  const pal = def.palette;
  ctx.save();
  /*
   * Skew into the wall plane. Local +x is one screen pixel of horizontal travel
   * along the wall, which in isometric also drops half a pixel; local +y is a
   * plain screen pixel downward. The negative determinant on the north-west
   * wall mirrors the artwork, which is exactly what that wall's facing needs.
   */
  const dir = wall === 'ne' ? 1 : -1;
  ctx.transform(dir, 0.5, 0, 1, originX, originY);

  const y = -46;
  switch (def.shape) {
    case 'painting': {
      ctx.fillStyle = pal.base;
      roundRect(ctx, -15, y, 30, 24, 2);
      ctx.fill();
      ctx.fillStyle = pal.top;
      ctx.fillRect(-11.5, y + 3.5, 23, 17);
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(-11.5, y + 20.5);
      ctx.lineTo(-3, y + 9);
      ctx.lineTo(3, y + 15);
      ctx.lineTo(11.5, y + 6);
      ctx.lineTo(11.5, y + 20.5);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'clock': {
      const cy = y + 13;
      ctx.fillStyle = pal.base;
      ctx.beginPath();
      ctx.arc(0, cy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.top;
      ctx.beginPath();
      ctx.arc(0, cy, 10.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      const a = time * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(Math.cos(a) * 6.5, cy + Math.sin(a) * 6.5);
      ctx.moveTo(0, cy);
      ctx.lineTo(Math.cos(a * 12) * 4, cy + Math.sin(a * 12) * 4);
      ctx.stroke();
      break;
    }
    case 'neonSign': {
      ctx.fillStyle = pal.base;
      roundRect(ctx, -20, y, 40, 24, 4);
      ctx.fill();
      const glow = 0.65 + Math.sin(time * 3) * 0.35;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = withAlpha(pal.top, glow);
      ctx.beginPath();
      ctx.moveTo(-14, y + 18);
      ctx.lineTo(-14, y + 6);
      ctx.lineTo(-7, y + 18);
      ctx.lineTo(-7, y + 6);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(pal.accent, glow);
      ctx.beginPath();
      ctx.arc(3, y + 12, 6, 0.4, Math.PI * 1.7);
      ctx.moveTo(14, y + 6);
      ctx.lineTo(14, y + 18);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- people

/** Overall figure scale, on top of each character's own build. */
const PERSON_SCALE = 1.1;

export interface PersonOptions {
  facing: Facing;
  /** Seconds; drives the walk cycle and idle breathing. */
  time: number;
  walking: boolean;
  sitting: boolean;
  /** Overrides the shirt colour, for staff uniforms. */
  uniform?: { shirt: string; trim: string };
  /** Job, which decides the headgear and trimmings that name it at a glance. */
  role?: 'waiter' | 'chef' | 'cleaner';
  /** Dish carried on a tray. */
  carrying?: Dish | null;
  /** Small prop in hand. */
  prop?: 'notepad' | 'cloth' | 'pan' | null;
  /** Out of energy: the figure slumps instead of standing to attention. */
  exhausted?: boolean;
  /** Fade the whole figure. */
  alpha?: number;
}

/** One of the two faces of a box the camera can see. */
type Plane = 'left' | 'right';

/**
 * Which way a figure is turned, said in the terms its body is built from: the
 * grid axis it faces, the axis across its shoulders — always chosen to point at
 * the camera, so "near arm" needs no special case per facing — and which of a
 * box's two visible faces its front and back land on.
 */
interface Frame {
  fwd: readonly [number, number];
  side: readonly [number, number];
  /** Null on the two facings where the figure has its back to the camera. */
  front: Plane | null;
  /** Set instead of `front` on those two facings. */
  back: Plane | null;
  /** The flank towards the camera, in view whichever way the figure is turned. */
  flank: Plane;
}

const FRAMES: Record<Facing, Frame> = {
  se: { fwd: [1, 0], side: [0, 1], front: 'right', back: null, flank: 'left' },
  sw: { fwd: [0, 1], side: [1, 0], front: 'left', back: null, flank: 'right' },
  ne: { fwd: [0, -1], side: [1, 0], front: null, back: 'left', flank: 'right' },
  nw: { fwd: [-1, 0], side: [0, 1], front: null, back: 'right', flank: 'left' },
};

interface Figure extends Frame {
  ctx: CanvasRenderingContext2D;
  /** Centre of the tile the figure is standing on. */
  cx: number;
  cy: number;
  /** Build scale, applied to every measurement below. */
  s: number;
}

/**
 * One rounded piece of a body, in the figure's own frame: `u` runs across the
 * body towards the camera, `v` runs the way the figure faces, `y` is the lift off
 * the floor and `h` the height. `r` is the half width at the base and `rTop` at
 * the top, so a single piece can be a pill, a barrel or a bell. Tile units,
 * before the build scale, exactly like the furniture.
 */
interface Part {
  u: number;
  v: number;
  y: number;
  h: number;
  r: number;
  rTop?: number;
  roundTop?: number;
  roundBottom?: number;
  bulge?: number;
}

/** Where a point in the figure's frame lands on screen. */
function spot(f: Figure, u: number, v: number, y = 0): { x: number; y: number } {
  const gx = (f.side[0] * u + f.fwd[0] * v) * f.s;
  const gy = (f.side[1] * u + f.fwd[1] * v) * f.s;
  return {
    x: f.cx + (gx - gy) * (TILE_W / 2),
    y: f.cy + (gx + gy) * (TILE_H / 2) - y * f.s * TILE_Z,
  };
}

/** Where a part lands on screen, in the terms the shape helpers paint in. */
function volumeOf(f: Figure, p: Part): RoundedVolume {
  const at = spot(f, p.u, p.v);
  const bottom = at.y - p.y * f.s * TILE_Z;
  const across = (r: number): number => (TILE_W / 2) * r * f.s;
  return {
    cx: at.x,
    bottom,
    top: bottom - p.h * f.s * TILE_Z,
    half: across(p.r),
    halfTop: across(p.rTop ?? p.r),
    roundTop: p.roundTop,
    roundBottom: p.roundBottom,
    bulge: across(p.bulge ?? 0),
  };
}

/** One rounded body part: soft ramp, lit crown, shaded flank, dark outline. */
function paint(
  f: Figure,
  p: Part,
  base: string,
  opts: { light?: number; outline?: number } = {},
): void {
  softVolume(f.ctx, volumeOf(f, p), base, {
    line: 1.05 * f.s,
    light: opts.light,
    outline: opts.outline === undefined ? undefined : ink(base, opts.outline),
  });
}

/** A stubby capsule with a nub of an end: the shape every limb is made of. */
function pill(u: number, v: number, y: number, h: number, r: number): Part {
  return { u, v, y, h, r, rTop: r * 0.94, roundTop: 0.9, roundBottom: 0.9, bulge: r * 0.14 };
}

/**
 * A local frame laid on the surface of a rounded part: the origin sits `out`
 * tiles in front of its axis, `up` of the way up it; local x runs across the
 * surface, local y straight down the screen, and the whole frame is sheared with
 * the facing. A face or a row of buttons painted here leans with the body it
 * belongs to instead of floating flat across the front of the figure — which is
 * the whole difference between a painted face and a decal.
 *
 * The part's half width at that height and its full height come back to the
 * caller, so a feature can be sized against the piece it sits on.
 */
function onSurface(
  f: Figure,
  p: Part,
  which: Plane | null,
  out: number,
  up: number,
  paintOn: (half: number, height: number) => void,
): void {
  if (!which) return;
  const at = spot(f, p.u, p.v + out, p.y + p.h * up);
  const half = (TILE_W / 2) * lerp(p.r, p.rTop ?? p.r, up) * f.s;
  const { ctx } = f;
  ctx.save();
  ctx.transform(1, which === 'right' ? -0.5 : 0.5, 0, 1, at.x, at.y);
  paintOn(half, p.h * f.s * TILE_Z);
  ctx.restore();
}

/**
 * Lift of the hips, which every other measurement hangs off. Seats in this game
 * stand half a tile-height off the floor, which on a body this short is already
 * hip height — so sitting down folds the legs up rather than lowering the head.
 */
const HIP_STAND = 0.28;
const HIP_SIT = 0.4;
/** How far the legs and the arms sit either side of the middle. */
const LEG_U = 0.115;
const ARM_U = 0.3;
/** Shoe leather, which every foot and every seated ankle is painted in. */
const SHOE = '#42332a';

/**
 * People are rounded 2.5D toys. Every piece is a soft-shaded capsule with a lit
 * crown where the light catches the turn of it, a shaded flank down the away
 * side and one dark line round its silhouette — the same three-tone ramp the
 * furniture is lit with, so a figure standing on the tiles belongs to the chair
 * beside it rather than to a different game.
 *
 * Nothing is mirrored: a body is assembled in its own frame, so the two away
 * facings simply show the back of a head, and every piece of detail is painted
 * on the surface of the part it belongs to.
 *
 * Proportions are deliberately top-heavy — a squoval head about as tall as the
 * whole body under it, stubby pill limbs with nubs for hands and feet and no
 * elbow or knee anywhere — because that is what keeps a face readable when a
 * tile is 64px wide on a phone.
 */
export function drawPerson(
  ctx: CanvasRenderingContext2D,
  look: Appearance,
  cx: number,
  cy: number,
  opts: PersonOptions,
): void {
  const f: Figure = { ctx, cx, cy, s: look.build * PERSON_SCALE, ...FRAMES[opts.facing] };
  const shirt = opts.uniform?.shirt ?? look.shirt;
  const trim = opts.uniform?.trim ?? shade(shirt, 0.7);

  const stride = opts.walking ? Math.sin(opts.time * 9) : 0;
  // Breathing when still, a bounce when walking; either way the whole upper body
  // rides it, which is what stops a figure looking like it is sliding along.
  const bob = opts.walking
    ? Math.abs(Math.cos(opts.time * 9)) * 0.05
    : Math.sin(opts.time * 1.6) * 0.012;
  // Spent staff settle onto their hips and lean over their toes.
  const lean = opts.exhausted ? 0.05 : 0;
  const settle = opts.exhausted ? 0.05 : 0;
  const sway = opts.walking ? -stride * 0.015 : 0;
  const hip = (opts.sitting ? HIP_SIT : HIP_STAND) + bob - settle;

  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  // A small translucent disc on the floor, spreading as the figure lifts off,
  // which is what plants a rounded sprite on the tiles instead of over them.
  softShadow(ctx, cx, cy, (opts.sitting ? 0.3 : 0.34) + bob * 0.4, 0.2);

  drawLeg(f, look, -1, hip, stride, opts.sitting);
  drawLeg(f, look, 1, hip, stride, opts.sitting);
  drawArm(f, look, opts, -1, hip, stride, lean, shirt);
  drawTorso(f, opts, hip, lean, sway, shirt, trim);
  drawHeadGroup(f, look, opts, hip, lean, sway);
  const hand = drawArm(f, look, opts, 1, hip, stride, lean, shirt);
  drawHeld(f, opts, hand);

  ctx.restore();
}

/**
 * One stubby leg with a nub of a foot. Standing, it is a single pill from the hip
 * to the floor with no knee in it, which is most of what separates a rounded toy
 * from a stack of boxes; seated, it folds forward off the chair.
 */
function drawLeg(
  f: Figure,
  look: Appearance,
  side: 1 | -1,
  hip: number,
  stride: number,
  sitting: boolean,
): void {
  const u = side * LEG_U;

  if (sitting) {
    // Shin dropped to the floor in front of the seat, then the thigh laid over
    // the top of it, so the fold reads without a hard joint showing.
    paint(f, pill(u, 0.26, 0.02, hip - 0.1, 0.1), look.pants);
    paint(f, pill(u, 0.3, 0, 0.085, 0.115), SHOE);
    paint(
      f,
      { u, v: 0.14, y: hip - 0.14, h: 0.17, r: 0.12, rTop: 0.115, roundTop: 0.9, roundBottom: 0.9, bulge: 0.02 },
      look.pants,
    );
    return;
  }

  const swing = side * stride;
  // The leading foot clears the tiles, so a stride is a step and not a shuffle.
  const raise = Math.max(0, swing) * 0.03;
  paint(f, pill(u, swing * 0.07, raise + 0.02, hip - raise + 0.03, 0.105), look.pants);
  paint(f, pill(u, swing * 0.1 + 0.05, raise, 0.085, 0.115), SHOE);
}

/**
 * One stubby arm with a nub of a hand, again a single pill so there is no elbow
 * to read. Returns the hand, so whatever is being carried can be placed on it
 * rather than near it.
 */
function drawArm(
  f: Figure,
  look: Appearance,
  opts: PersonOptions,
  side: 1 | -1,
  hip: number,
  stride: number,
  lean: number,
  shirt: string,
): Part {
  // Arms swing against the leg on the same side. The near arm is the one that
  // carries, so a tray is always on the side the camera can see.
  const swing = -side * stride;
  const carrying = side === 1 && !!opts.carrying;
  const u = side * ARM_U;
  // Cleaners work in rubber gloves, which is a surprisingly strong cue for which
  // of three near-identical figures is the one wiping tables.
  const skin = opts.role === 'cleaner' ? '#f4c22e' : look.skin;

  if (carrying) {
    // The arm folds up and forward so the tray rides flat on the palm, out where
    // the plate on it can be seen rather than tucked against the chest.
    paint(f, pill(u * 0.96, 0.04, hip + 0.06, 0.28, 0.09), shirt);
    paint(f, pill(u * 0.92, 0.22, hip + 0.24, 0.18, 0.088), shirt);
    const hand = pill(u * 0.88, 0.3, hip + 0.4, 0.09, 0.1);
    paint(f, hand, skin);
    return hand;
  }

  // Seated, the hands come forward onto the table, which is most of what tells a
  // seated figure apart from one standing with its knees bent.
  const arm = opts.sitting
    ? pill(u * 0.96, 0.08, hip + 0.02, 0.3, 0.09)
    : pill(u, swing * 0.08 + lean * 0.6, hip + 0.02, 0.32, 0.09);
  const hand = opts.sitting
    ? pill(u * 0.9, 0.2, hip - 0.03, 0.1, 0.1)
    : pill(u, swing * 0.11 + lean * 0.6, hip - 0.08, 0.1, 0.1);

  paint(f, arm, shirt);
  // Staff work in long sleeves; guests turn up in short ones, so a bare forearm
  // shows below the cuff.
  if (!opts.role) paint(f, { ...arm, h: arm.h * 0.45, r: arm.r * 0.96, rTop: arm.r * 0.96 }, look.skin);
  paint(f, hand, skin);
  return hand;
}

/**
 * The body: one soft barrel a little wider at the shoulders than at the waist,
 * plus whatever the figure is wearing over it. Uniforms are garments with their
 * own thickness standing off the chest, not a pattern painted on it, so a
 * waistcoat still reads as worn from any angle.
 */
function drawTorso(
  f: Figure,
  opts: PersonOptions,
  hip: number,
  lean: number,
  sway: number,
  shirt: string,
  trim: string,
): void {
  const { ctx } = f;
  const torso: Part = {
    u: sway,
    v: lean,
    y: hip - 0.05,
    h: 0.42,
    r: 0.225,
    rTop: 0.235,
    roundTop: 0.8,
    roundBottom: 0.5,
    bulge: 0.03,
  };

  paint(f, torso, shirt);
  // Hem: the same body a shade wider and much shorter, so the shirt ends in a
  // band that wraps the figure whichever way it is turned.
  paint(
    f,
    { ...torso, y: hip - 0.06, h: 0.13, r: torso.r * 1.05, rTop: torso.r * 1.02, roundTop: 0.2, roundBottom: 0.8 },
    trim,
    { light: 0.7 },
  );
  // Collar at the throat, which does the same job at the other end.
  paint(
    f,
    { u: torso.u, v: torso.v, y: hip + 0.31, h: 0.08, r: 0.145, rTop: 0.12, roundTop: 0.6, roundBottom: 0.4 },
    trim,
    { light: 0.7 },
  );

  if (opts.role === 'chef') {
    // Neckerchief, knotted at the throat.
    paint(
      f,
      { u: torso.u, v: torso.v, y: hip + 0.29, h: 0.11, r: 0.175, rTop: 0.13, roundTop: 0.7, roundBottom: 0.5 },
      trim,
      { light: 0.7 },
    );
    onSurface(f, torso, f.front, 0.13, 0.55, (half, height) => {
      // Double-breasted buttons.
      ctx.fillStyle = '#d8cfbb';
      for (let i = -1; i <= 1; i++) {
        for (const dx of [-0.3, 0.3]) {
          ctx.beginPath();
          ctx.arc(dx * half, i * height * 0.19, 0.8 * f.s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }

  if (opts.role === 'waiter' && f.front) {
    // Waistcoat: a rounded panel standing off the chest, buttons on its own face.
    const vest: Part = {
      u: torso.u,
      v: torso.v + 0.1,
      y: hip + 0.02,
      h: 0.3,
      r: 0.135,
      rTop: 0.15,
      roundTop: 0.7,
      roundBottom: 0.7,
      bulge: 0.012,
    };
    paint(f, vest, trim);
    onSurface(f, vest, f.front, 0.06, 0.5, (_half, height) => {
      ctx.fillStyle = 'rgba(255, 244, 220, 0.9)';
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(0, height * (i * 0.26 - 0.08), 0.7 * f.s, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  if (opts.uniform) {
    // Aprons: a bib for the kitchen, a short bistro apron for the floor. Behind
    // the figure there is nothing to see but the straps, so that is all we draw.
    if (f.front) {
      const apron: Part = {
        u: 0,
        v: lean + 0.1,
        y: hip - 0.05,
        h: opts.role === 'waiter' ? 0.2 : 0.31,
        r: 0.155,
        rTop: 0.13,
        roundTop: 0.35,
        roundBottom: 0.6,
      };
      paint(f, apron, '#f7f2e6', { light: 0.7 });
      onSurface(f, apron, f.front, 0.05, 0.9, (half) => {
        ctx.strokeStyle = 'rgba(186, 172, 150, 0.75)';
        ctx.lineWidth = 0.9 * f.s;
        ctx.beginPath();
        ctx.moveTo(-half * 0.7, 0);
        ctx.lineTo(half * 0.7, 0);
        ctx.stroke();
      });
    } else {
      onSurface(f, torso, f.back, -0.16, 0.5, (half, height) => {
        ctx.strokeStyle = 'rgba(240, 234, 220, 0.85)';
        ctx.lineWidth = 1.3 * f.s;
        ctx.beginPath();
        ctx.moveTo(-half * 0.5, -height * 0.3);
        ctx.lineTo(half * 0.5, height * 0.18);
        ctx.moveTo(half * 0.5, -height * 0.3);
        ctx.lineTo(-half * 0.5, height * 0.18);
        ctx.stroke();
      });
    }
  }
}

/** Neck, head, hair, face and hat, in the order the camera needs them. */
function drawHeadGroup(
  f: Figure,
  look: Appearance,
  opts: PersonOptions,
  hip: number,
  lean: number,
  sway: number,
): void {
  // A squoval: rounded on every corner, a shade wider than it is tall, a touch
  // narrower at the crown, and about as tall as the whole body under it.
  const head: Part = {
    u: sway * 0.6,
    v: lean * 1.2,
    y: hip + 0.36,
    h: 0.58,
    r: 0.37,
    rTop: 0.35,
    roundTop: 0.66,
    roundBottom: 0.6,
    bulge: 0.025,
  };

  // Just enough neck that the head is not glued straight onto the shoulders.
  paint(
    f,
    { u: head.u, v: head.v, y: hip + 0.3, h: 0.1, r: 0.1, rTop: 0.11, roundTop: 0.4, roundBottom: 0.3 },
    look.skin,
    { light: 0.6 },
  );
  drawHairBack(f, look, head);
  paint(f, head, look.skin);
  drawHair(f, look, head);
  drawFace(f, look, head, opts.time);
  if (opts.role) drawUniformHat(f, opts.role, head);
  else drawGuestExtra(f, look, head, hip, lean);
}

/** Whatever is in the near hand, placed on it. */
function drawHeld(f: Figure, opts: PersonOptions, hand: Part): void {
  const { ctx } = f;
  if (opts.carrying) {
    const at = spot(f, hand.u, hand.v, hand.y + hand.h);
    ctx.save();
    ctx.translate(at.x, at.y - 1 * f.s);
    ctx.scale(f.s, f.s);
    drawTray(ctx, opts.carrying);
    ctx.restore();
    return;
  }
  if (opts.prop === 'notepad') {
    const pad: Part = {
      u: hand.u * 0.9,
      v: hand.v + 0.14,
      y: hand.y + 0.06,
      h: 0.05,
      r: 0.13,
      rTop: 0.13,
      roundTop: 0.35,
      roundBottom: 0.35,
    };
    paint(f, pad, '#fdf8ec', { light: 0.6 });
    const at = spot(f, pad.u, pad.v, pad.y + pad.h);
    ctx.strokeStyle = 'rgba(160, 148, 128, 0.9)';
    ctx.lineWidth = 0.8;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(at.x - 5 * f.s, at.y + i * 2.4 * f.s + 1.2 * f.s);
      ctx.lineTo(at.x + 5 * f.s, at.y + i * 2.4 * f.s - 1.2 * f.s);
      ctx.stroke();
    }
  } else if (opts.prop === 'cloth') {
    paint(
      f,
      {
        u: hand.u * 1.05,
        v: hand.v + 0.12,
        y: hand.y - 0.02,
        h: 0.06,
        r: 0.14,
        rTop: 0.13,
        roundTop: 0.6,
        roundBottom: 0.6,
      },
      '#8fd0e8',
      { light: 0.6 },
    );
  } else if (opts.prop === 'pan') {
    const at = spot(f, hand.u * 0.9, hand.v + 0.2, hand.y + 0.06);
    isoCylinder(ctx, at.x, at.y, 0.2 * f.s, 0.06 * f.s, '#4a4f55');
    ctx.strokeStyle = '#37393d';
    ctx.lineWidth = 2 * f.s;
    const grip = spot(f, hand.u, hand.v, hand.y + 0.05);
    ctx.beginPath();
    ctx.moveTo(grip.x, grip.y);
    ctx.lineTo(at.x, at.y - 1 * f.s);
    ctx.stroke();
  }
}

/** Grain lines across a table top, clipped to the surface. */
function woodGrain(
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
  // Lines run along the +x grid axis, which on screen slopes down to the right.
  for (let i = -3; i <= 3; i++) {
    const off = i * 5;
    ctx.beginPath();
    ctx.moveTo(cx - TILE_W * 0.5, y + off - TILE_H * 0.25);
    ctx.lineTo(cx + TILE_W * 0.5, y + off + TILE_H * 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Dressing on a table. A laid table gets a crisp folded napkin, condiments and a
 * posy; a used one gets a smeared plate, a toppled cup and crumbs instead. The
 * difference has to be obvious from across the room, because clearing tables is
 * half the loop.
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
    // A stained cloth, so the whole top reads as soiled and not just littered.
    ctx.fillStyle = 'rgba(150, 116, 62, 0.3)';
    ctx.beginPath();
    ctx.ellipse(cx + 2, y - 1, 17, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Used plate with the last of a meal on it.
    ctx.fillStyle = 'rgba(74, 44, 26, 0.25)';
    ctx.beginPath();
    ctx.ellipse(cx - 4, y - 1.5, 11, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#efe6d4';
    ctx.beginPath();
    ctx.ellipse(cx - 5, y - 4, 10.5, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9b795';
    ctx.beginPath();
    ctx.ellipse(cx - 5, y - 3.6, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d5a2a';
    ctx.beginPath();
    ctx.ellipse(cx - 7, y - 4.4, 2.6, 1.5, -0.3, 0, Math.PI * 2);
    ctx.ellipse(cx - 2.4, y - 3, 1.9, 1.1, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Cutlery dropped across it.
    ctx.strokeStyle = '#9aa4ab';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 10, y - 6.5);
    ctx.lineTo(cx - 1, y - 2);
    ctx.stroke();

    // Toppled cup and a crumpled napkin.
    ctx.fillStyle = '#dfd6c4';
    ctx.save();
    ctx.translate(cx + 9, y - 4);
    ctx.rotate(1.15);
    roundRect(ctx, -3, -5, 6.4, 8, 1.6);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(120, 78, 40, 0.5)';
    ctx.beginPath();
    ctx.ellipse(cx + 13, y - 1, 4.4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f3ece0';
    ctx.beginPath();
    ctx.moveTo(cx + 4, y - 7.5);
    ctx.lineTo(cx + 9.5, y - 9.5);
    ctx.lineTo(cx + 11, y - 6);
    ctx.lineTo(cx + 5.5, y - 4.5);
    ctx.closePath();
    ctx.fill();

    // Crumbs.
    ctx.fillStyle = 'rgba(126, 88, 44, 0.75)';
    for (let i = 0; i < 6; i++) {
      const a = i * 1.9;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 13, y - 1 + Math.sin(a) * 5.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Salt and pepper.
  for (const [dx, cap] of [
    [8, '#f4efe3'],
    [13, '#5d4a3a'],
  ] as const) {
    ctx.fillStyle = '#e9e2d2';
    roundRect(ctx, cx + dx, y - 7, 3.2, 6.4, 1.2);
    ctx.fill();
    ctx.fillStyle = cap;
    roundRect(ctx, cx + dx, y - 7, 3.2, 1.8, 1);
    ctx.fill();
  }

  // Folded napkin with cutlery, which is the crispest "this table is ready" cue.
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.moveTo(cx - 1, y - 4.5);
  ctx.lineTo(cx + 6, y - 7);
  ctx.lineTo(cx + 7.5, y - 4.5);
  ctx.lineTo(cx + 0.5, y - 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#b9c2c8';
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 1.4, y - 5.4);
  ctx.lineTo(cx + 5.6, y - 3.8);
  ctx.stroke();

  // A small vase with two blooms that drift in the draught.
  const vx = cx - 12;
  ctx.fillStyle = '#8fb6c9';
  roundRect(ctx, vx - 2.4, y - 8, 4.8, 8, 1.6);
  ctx.fill();
  ctx.fillStyle = '#a8cbdb';
  roundRect(ctx, vx - 2.4, y - 8, 4.8, 2.2, 1.2);
  ctx.fill();
  ctx.strokeStyle = '#4f8248';
  ctx.lineWidth = 1;
  for (const dir of [-1, 1]) {
    const lean = dir * (2.4 + Math.sin(time * 1.1 + dir) * 0.5);
    ctx.beginPath();
    ctx.moveTo(vx, y - 8);
    ctx.lineTo(vx + lean, y - 14);
    ctx.stroke();
    ctx.fillStyle = dir > 0 ? '#e2707f' : '#efc05c';
    ctx.beginPath();
    ctx.arc(vx + lean, y - 15, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Small deterministic variation so a crowd does not look cloned. Derived from
 * the existing colours rather than a stored field, so saves need no migration.
 */
function wearsGlasses(look: Appearance): boolean {
  return hashString(look.skin + look.hair + look.shirt) % 5 === 0;
}

/**
 * Eyes, brows, blush and mouth, painted onto the front of the rounded head and
 * pushed round towards the way the figure is facing, so the features sit on the
 * turn of the skull rather than square on the middle of it. Nothing is drawn at
 * all on the two away facings, where the face is pointing away from the camera.
 */
function drawFace(f: Figure, look: Appearance, head: Part, time: number): void {
  onSurface(f, head, f.front, 0.19, 0.52, (half, height) => {
    const { ctx } = f;
    const dx = half * 0.26;
    // Each figure gets a different `time` offset, so blinks never synchronise.
    const blinking = (time * 0.31) % 1 < 0.05;

    ctx.lineCap = 'round';
    if (blinking) {
      ctx.strokeStyle = '#3a2b21';
      ctx.lineWidth = 1.2 * f.s;
      ctx.beginPath();
      ctx.moveTo(-dx - half * 0.15, 0);
      ctx.lineTo(-dx + half * 0.15, 0);
      ctx.moveTo(dx - half * 0.15, 0);
      ctx.lineTo(dx + half * 0.15, 0);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fbf7ef';
      ctx.beginPath();
      ctx.ellipse(-dx, 0, half * 0.17, height * 0.15, 0, 0, Math.PI * 2);
      ctx.ellipse(dx, 0, half * 0.17, height * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2118';
      ctx.beginPath();
      ctx.arc(-dx + half * 0.03, height * 0.02, half * 0.11, 0, Math.PI * 2);
      ctx.arc(dx + half * 0.03, height * 0.02, half * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(-dx - half * 0.045, -height * 0.05, half * 0.045, 0, Math.PI * 2);
      ctx.arc(dx - half * 0.045, -height * 0.05, half * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = shade(look.hair, 0.7);
    ctx.lineWidth = 1.1 * f.s;
    ctx.beginPath();
    ctx.moveTo(-dx - half * 0.18, -height * 0.155);
    ctx.lineTo(-dx + half * 0.15, -height * 0.19);
    ctx.moveTo(dx - half * 0.15, -height * 0.19);
    ctx.lineTo(dx + half * 0.18, -height * 0.155);
    ctx.stroke();

    ctx.fillStyle = withAlpha('#e87a7a', 0.4);
    ctx.beginPath();
    ctx.ellipse(-half * 0.32, height * 0.14, half * 0.12, height * 0.06, 0, 0, Math.PI * 2);
    ctx.ellipse(half * 0.32, height * 0.14, half * 0.12, height * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(80, 40, 30, 0.85)';
    ctx.lineWidth = 1.2 * f.s;
    ctx.beginPath();
    ctx.arc(0, height * 0.1, half * 0.21, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    if (wearsGlasses(look)) {
      ctx.strokeStyle = 'rgba(58, 46, 38, 0.9)';
      ctx.lineWidth = 0.9 * f.s;
      ctx.beginPath();
      ctx.arc(-dx, 0, half * 0.2, 0, Math.PI * 2);
      ctx.arc(dx, 0, half * 0.2, 0, Math.PI * 2);
      ctx.moveTo(-dx + half * 0.2, 0);
      ctx.lineTo(dx - half * 0.2, 0);
      ctx.stroke();
    }
  });
}

/**
 * Headgear by job, each its own rounded volume on the crown. Silhouette does the
 * work: a tall toque, a peaked cap and a low bandana still tell you who is who
 * from across the room, and from behind, where no uniform is in view.
 */
function drawUniformHat(f: Figure, role: 'waiter' | 'chef' | 'cleaner', head: Part): void {
  const crown = head.y + head.h;

  switch (role) {
    case 'chef': {
      // Toque: a band round the brow and a fat pleated puff standing over it,
      // wider at the top than the bottom, which is what makes a toque a toque.
      paint(
        f,
        { u: head.u, v: head.v, y: crown - 0.11, h: 0.13, r: head.r * 1.05, rTop: head.r * 1.02, roundTop: 0.35, roundBottom: 0.35 },
        '#fdf9ef',
        { outline: 0.34 },
      );
      paint(
        f,
        {
          u: head.u,
          v: head.v,
          y: crown - 0.03,
          h: 0.3,
          r: head.r * 0.72,
          rTop: head.r * 1.02,
          roundTop: 1,
          roundBottom: 0.5,
          bulge: head.r * 0.2,
        },
        '#fffdf8',
        { outline: 0.34 },
      );
      break;
    }
    case 'waiter': {
      // Peaked cap: the bill is drawn first so the crown laps over its root.
      paint(
        f,
        { u: head.u, v: head.v + 0.24, y: crown - 0.11, h: 0.05, r: head.r * 0.6, rTop: head.r * 0.58, roundTop: 0.9, roundBottom: 0.9 },
        '#a12b23',
      );
      paint(
        f,
        { u: head.u, v: head.v, y: crown - 0.12, h: 0.19, r: head.r * 1.07, rTop: head.r * 0.86, roundTop: 0.9, roundBottom: 0.3 },
        '#c73a2e',
      );
      break;
    }
    default: {
      // Bandana, wrapped low, with the knot out on the side the camera can see.
      paint(
        f,
        { u: head.u, v: head.v, y: crown - 0.2, h: 0.22, r: head.r * 1.06, rTop: head.r, roundTop: 0.45, roundBottom: 0.3 },
        '#2f8b83',
      );
      paint(f, pill(head.u + 0.26, head.v - 0.06, crown - 0.19, 0.13, 0.085), '#2a6f68');
      break;
    }
  }
}

/**
 * A hat or a scarf on some of the guests, chosen from their existing colours so
 * no save data changes. Guests wearing something the staff never wear is what
 * keeps the two crowds apart at a glance.
 */
function drawGuestExtra(f: Figure, look: Appearance, head: Part, hip: number, lean: number): void {
  const pick = hashString(look.shirt + look.pants + look.hairStyle) % 6;
  const crown = head.y + head.h;

  if (pick === 0) {
    // Bobble hat: turned-up brim, dome, pom-pom.
    paint(
      f,
      { u: head.u, v: head.v, y: crown - 0.15, h: 0.14, r: head.r * 1.09, rTop: head.r * 1.05, roundTop: 0.4, roundBottom: 0.4 },
      shade(look.shirt, 1.12),
    );
    paint(
      f,
      { u: head.u, v: head.v, y: crown - 0.04, h: 0.14, r: head.r * 0.94, rTop: head.r * 0.42, roundTop: 0.95, roundBottom: 0.3 },
      look.shirt,
    );
    paint(
      f,
      { u: head.u, v: head.v, y: crown + 0.06, h: 0.1, r: 0.075, rTop: 0.075, roundTop: 1, roundBottom: 1 },
      '#fff6e4',
    );
  } else if (pick === 1) {
    // Scarf, round the neck with the tail hanging down the front. Darker than the
    // shirt it is picked from, or the two would read as one garment.
    paint(
      f,
      { u: head.u, v: head.v, y: hip + 0.27, h: 0.14, r: 0.19, rTop: 0.165, roundTop: 0.6, roundBottom: 0.5 },
      shade(look.shirt, 0.58),
    );
    if (f.front) {
      paint(
        f,
        { u: head.u + 0.05, v: lean + 0.13, y: hip + 0.03, h: 0.27, r: 0.065, rTop: 0.06, roundTop: 0.5, roundBottom: 0.9 },
        shade(look.shirt, 0.52),
      );
    }
  }
}

/**
 * Hair that hangs behind or around the head, drawn before it so what shows is
 * only the part sitting outside the skull. Which is also how a bald head gets its
 * horseshoe: a band a shade wider than the head, with the head then drawn over
 * everything but its rim.
 */
function drawHairBack(f: Figure, look: Appearance, head: Part): void {
  if (look.hairStyle === 'long') {
    // A mass wider than the head at the crown and set back from it, falling to
    // the shoulders and narrowing on the way down rather than ending in a hem.
    paint(
      f,
      {
        u: head.u,
        v: head.v - 0.04,
        y: head.y - 0.24,
        h: head.h * 1.22,
        r: head.r * 0.82,
        rTop: head.r * 1.06,
        roundTop: 0.7,
        roundBottom: 0.85,
        bulge: head.r * 0.06,
      },
      look.hair,
    );
  } else if (look.hairStyle === 'bun') {
    // High enough on the back of the head to break the crown line, or a bun would
    // be a style you could only tell somebody had from behind.
    paint(
      f,
      {
        u: head.u,
        v: head.v - 0.2,
        y: head.y + head.h * 0.8,
        h: head.h * 0.42,
        r: head.r * 0.34,
        rTop: head.r * 0.32,
        roundTop: 1,
        roundBottom: 1,
      },
      look.hair,
    );
  } else if (look.hairStyle === 'bald') {
    paint(
      f,
      {
        u: head.u,
        v: head.v,
        y: head.y + head.h * 0.14,
        h: head.h * 0.42,
        r: head.r * 1.06,
        rTop: head.r * 1.05,
        roundTop: 0.5,
        roundBottom: 0.5,
      },
      look.hair,
    );
  }
}

/**
 * The hair on the crown: one rounded cap a shade wider than the skull, sitting
 * proud of it. The step where it meets the forehead is what gives a round head a
 * hairline, so a head reads as a head and not as an egg.
 */
function drawHair(f: Figure, look: Appearance, head: Part): void {
  if (look.hairStyle === 'bald') return;

  const cap: Part = {
    u: head.u,
    v: head.v,
    y: head.y + head.h * 0.5,
    h: head.h * 0.55,
    // A shade wider than the skull, so the hair wraps the sides of the head, with
    // a generously rounded hairline: cut that square and the outline along it
    // turns into a swimming cap strapped over the brows.
    r: head.r * 1.05,
    rTop: head.r * 0.72,
    roundTop: 0.9,
    roundBottom: 0.66,
    bulge: head.r * 0.04,
  };

  switch (look.hairStyle) {
    case 'cap':
      // The same cap dropped low with a flat hairline, which reads as a blunt
      // fringe cut straight across the brow.
      paint(
        f,
        { ...cap, y: head.y + head.h * 0.38, h: head.h * 0.67, rTop: head.r * 0.84, roundBottom: 0.12 },
        look.hair,
      );
      break;
    case 'curly': {
      paint(f, { ...cap, h: head.h * 0.45, rTop: head.r * 0.86 }, look.hair);
      // Puffs round the crown, far side first so the near ones lap over them.
      // None of them stray forward over the face.
      const puffs: Array<[number, number]> = [
        [-0.26, -0.08],
        [-0.16, 0.12],
        [0, -0.16],
        [0.1, 0.12],
        [0.26, -0.04],
      ];
      for (const [u, v] of puffs) {
        paint(
          f,
          {
            u: head.u + u,
            v: head.v + v,
            y: head.y + head.h * 0.84,
            h: head.h * 0.24,
            r: head.r * 0.26,
            rTop: head.r * 0.26,
            roundTop: 1,
            roundBottom: 1,
          },
          shade(look.hair, u > 0 ? 1.07 : 0.93),
        );
      }
      break;
    }
    default:
      // Short, bun and long all share the same rounded cap.
      paint(f, cap, look.hair);
      break;
  }
}

function drawTray(ctx: CanvasRenderingContext2D, dish: Dish): void {
  ctx.fillStyle = '#8d6b45';
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade('#8d6b45', 1.25);
  ctx.beginPath();
  ctx.ellipse(0, -1, 8.5, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink('#8d6b45', 0.45);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2);
  ctx.stroke();
  drawPlatedDish(ctx, dish, 0, -3, 0.62);
}

// ------------------------------------------------------------------- food

export interface PlatedDishOptions {
  /** Waiting to be collected: adds a warm pool of light behind the plate. */
  ready?: boolean;
}

/** A plated dish, sized to sit on a table or a tray. */
export function drawPlatedDish(
  ctx: CanvasRenderingContext2D,
  dish: Dish,
  cx: number,
  cy: number,
  scale = 1,
  opts: PlatedDishOptions = {},
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  if (opts.ready) {
    const g = ctx.createRadialGradient(0, -3, 0, 0, -3, 26);
    g.addColorStop(0, 'rgba(255, 220, 140, 0.6)');
    g.addColorStop(1, 'rgba(255, 220, 140, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -3, 26, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawPlateBase(ctx, dish.plate);
  drawFood(ctx, dish.plate, dish.color, dish.accent);
  ctx.restore();
}

/**
 * The plate under a meal. It carries the same dark rim the people and the
 * furniture do, so a dish on a table is not the one crisp-edged thing in a room
 * of softly lined shapes.
 */
function drawPlateBase(ctx: CanvasRenderingContext2D, style: PlateStyle): void {
  if (style === 'cup') return;
  // A contact shadow is what stops plates looking like stickers on the table.
  ctx.fillStyle = 'rgba(74, 44, 26, 0.22)';
  ctx.beginPath();
  ctx.ellipse(1, 1.6, 13, 5.4, 0, 0, Math.PI * 2);
  ctx.fill();

  const rim = (rx: number, ry: number): void => {
    ctx.strokeStyle = ink('#fdfaf2', 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  };

  if (style === 'bowl' || style === 'salad') {
    ctx.fillStyle = '#fdfaf2';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12.5, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d5ccb9';
    ctx.beginPath();
    ctx.ellipse(0, 0.4, 9.6, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    rim(12.5, 6.2);
    return;
  }
  ctx.fillStyle = '#fdfaf2';
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 6.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e6dfcd';
  ctx.beginPath();
  ctx.ellipse(0, 0.3, 10.2, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(0, -0.6, 12.6, 5.4, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  rim(14, 6.4);
}

function drawFood(
  ctx: CanvasRenderingContext2D,
  style: PlateStyle,
  color: string,
  accent: string,
): void {
  switch (style) {
    case 'burger': {
      // Domed sesame bun over a visibly stacked filling: the tallest, roundest
      // silhouette on the menu, so it never gets mistaken for anything else.
      ctx.fillStyle = shade(color, 1.14);
      ctx.beginPath();
      ctx.moveTo(-8.5, -8.5);
      ctx.quadraticCurveTo(-8.5, -17, 0, -17);
      ctx.quadraticCurveTo(8.5, -17, 8.5, -8.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = withAlpha('#fff4d8', 0.9);
      for (const [sx, sy] of [[-4, -12.6], [0.4, -14.4], [4.4, -11.8]] as const) {
        ctx.beginPath();
        ctx.ellipse(sx, sy, 1.5, 0.9, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Lettuce frill, wider than the bun so it reads as filling spilling out.
      ctx.fillStyle = '#7cc257';
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        ctx.arc(-9 + i * 3.6, -7.6, 2.1, Math.PI, 0);
      }
      ctx.lineTo(9.4, -5.6);
      ctx.lineTo(-9.4, -5.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2c02e';
      roundRect(ctx, -8.6, -6, 17.2, 2.4, 1.2);
      ctx.fill();
      ctx.fillStyle = accent;
      roundRect(ctx, -8.2, -4.2, 16.4, 3.6, 1.6);
      ctx.fill();
      ctx.fillStyle = shade(color, 1.02);
      roundRect(ctx, -7.6, -1.2, 15.2, 3.4, 1.7);
      ctx.fill();
      break;
    }
    case 'fries': {
      // Fries fan up out of a carton: a tall, spiky, unmistakable outline.
      ctx.fillStyle = color;
      for (let i = 0; i < 7; i++) {
        ctx.save();
        ctx.translate(-5.4 + i * 1.8, -6);
        ctx.rotate((i - 3) * 0.17);
        ctx.fillStyle = i % 2 === 0 ? color : shade(color, 1.12);
        roundRect(ctx, -1.3, -11, 2.6, 12, 1);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#d24f3d';
      ctx.beginPath();
      ctx.moveTo(-7.6, -7.5);
      ctx.lineTo(7.6, -7.5);
      ctx.lineTo(5.6, 2.4);
      ctx.lineTo(-5.6, 2.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff2e2';
      ctx.beginPath();
      ctx.moveTo(-7.1, -5.2);
      ctx.lineTo(7.1, -5.2);
      ctx.lineTo(6.6, -2.8);
      ctx.lineTo(-6.6, -2.8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(120, 30, 20, 0.22)';
      ctx.beginPath();
      ctx.moveTo(2.4, -7.5);
      ctx.lineTo(7.6, -7.5);
      ctx.lineTo(5.6, 2.4);
      ctx.lineTo(3.4, 2.4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'salad': {
      // A loose pile of leaves with tomato and cucumber: wide, ragged and green.
      ctx.fillStyle = shade(color, 0.82);
      ctx.beginPath();
      ctx.ellipse(0, -2, 9.6, 4.6, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.4;
        ctx.fillStyle = i % 2 === 0 ? color : shade(color, 1.16);
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 6, -4 + Math.sin(a) * 2.6, 4.4, 3, a * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const [tx, ty] of [[-4.4, -5.4], [3.6, -6.4]] as const) {
        ctx.fillStyle = '#e0523c';
        ctx.beginPath();
        ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f4907a';
        ctx.beginPath();
        ctx.arc(tx, ty, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#cfe8a8';
      ctx.beginPath();
      ctx.ellipse(0.4, -2.4, 2.6, 1.7, 0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'bowl':
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, -1.5, 9, 4.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(-2, -2.5, 2.6, 1.5, 0.3, 0, Math.PI * 2);
      ctx.ellipse(3, -1.2, 2.2, 1.3, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, -2.4, 6.4, 2.8, 0, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      break;
    case 'slice':
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-9, 1);
      ctx.lineTo(0, -8);
      ctx.lineTo(9, 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = accent;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-4 + i * 4, -1 - (i % 2) * 2, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'cake':
      ctx.fillStyle = color;
      roundRect(ctx, -7, -11, 14, 11, 2);
      ctx.fill();
      ctx.fillStyle = accent;
      roundRect(ctx, -7, -11, 14, 3.4, 2);
      ctx.fill();
      ctx.fillStyle = '#f6e8d2';
      ctx.fillRect(-7, -6.5, 14, 1.6);
      break;
    case 'skewer':
      ctx.strokeStyle = '#c8a97a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-9, -8);
      ctx.lineTo(8, -1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 === 0 ? color : accent;
        ctx.beginPath();
        ctx.ellipse(-5 + i * 5, -6.5 + i * 2.2, 3.2, 2.6, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'sushi':
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = color;
        roundRect(ctx, -8 + i * 5.6, -6, 5, 6, 2);
        ctx.fill();
        ctx.fillStyle = accent;
        roundRect(ctx, -8.4 + i * 5.6, -8, 5.8, 3, 1.4);
        ctx.fill();
      }
      break;
    case 'cup':
      ctx.fillStyle = '#f2efe6';
      roundRect(ctx, -5.5, -12, 11, 13, 2);
      ctx.fill();
      ctx.fillStyle = color;
      roundRect(ctx, -4.4, -10.6, 8.8, 9, 1.6);
      ctx.fill();
      ctx.strokeStyle = '#f2efe6';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(6.4, -6, 3.2, -1.2, 1.2);
      ctx.stroke();
      break;
    default:
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, -2.5, 7.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(2.5, -3.5, 3, 2, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8fc46b';
      ctx.beginPath();
      ctx.ellipse(-4, -3.2, 2.4, 1.5, -0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

// ---------------------------------------------------- 2D icons for the UI

/** Ingredient icon drawn in plain screen space for shop and market lists. */
export function drawIngredientIcon(
  ctx: CanvasRenderingContext2D,
  ing: Ingredient,
  x: number,
  y: number,
  size: number,
): void {
  const s = size / 32;
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.scale(s, s);
  ctx.fillStyle = ing.color;
  ctx.strokeStyle = ing.accent;
  ctx.lineWidth = 1.6;

  switch (ing.icon) {
    case 'loaf':
      roundRect(ctx, -12, -7, 24, 14, 6);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(i * 6, -5);
        ctx.lineTo(i * 6 + 3, 1);
      }
      ctx.stroke();
      break;
    case 'sack':
      ctx.beginPath();
      ctx.moveTo(-9, 11);
      ctx.quadraticCurveTo(-13, -6, -5, -9);
      ctx.lineTo(5, -9);
      ctx.quadraticCurveTo(13, -6, 9, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'grain':
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 7, i === 0 ? -2 : 3, 4, 8, i * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    case 'round':
      ctx.beginPath();
      ctx.arc(0, 1, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = ing.accent;
      ctx.beginPath();
      ctx.ellipse(0, -9, 4, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(0, 11);
      ctx.quadraticCurveTo(-14, 0, 0, -11);
      ctx.quadraticCurveTo(14, 0, 0, 11);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(0, -10);
      ctx.stroke();
      break;
    case 'slab':
      roundRect(ctx, -12, -8, 24, 16, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = mix(ing.color, '#ffffff', 0.35);
      roundRect(ctx, -7, -4, 14, 8, 2);
      ctx.fill();
      break;
    case 'drop':
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.quadraticCurveTo(10, 2, 0, 11);
      ctx.quadraticCurveTo(-10, 2, 0, -12);
      ctx.fill();
      ctx.stroke();
      break;
    case 'bean':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-6 + i * 6, i % 2 === 0 ? -1 : 4, 5, 3.6, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    case 'sheet':
      roundRect(ctx, -11, -11, 22, 22, 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = mix(ing.color, '#ffffff', 0.3);
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(-9, i * 6);
        ctx.lineTo(9, i * 6);
      }
      ctx.stroke();
      break;
  }
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
    const scale = Math.min(w / 54, h / 34);
    ctx.scale(scale, scale);
    // The item is authored 46..22 px above its wall anchor; offset to centre it.
    drawWallItem(ctx, def, 0, 34, 'ne', time);
  } else {
    ctx.translate(x + w / 2, y + h * 0.78);
    const scale = Math.min(w / 92, h / 80);
    ctx.scale(scale, scale);
    drawFurniture(ctx, def, 0, 0, { time, active: def.role === 'stove' });
  }
  ctx.restore();
}
