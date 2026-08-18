import { TILE_H, TILE_W, TILE_Z, type Facing } from '../engine/iso';
import { hashString } from '../engine/rng';
import type { Dish, PlateStyle } from '../game/data/dishes';
import type { FurnitureDef } from '../game/data/furniture';
import type { Ingredient } from '../game/data/ingredients';
import type { Appearance } from '../game/types';
import {
  type BoxColors,
  diamondPath,
  faces,
  isoBox,
  isoCylinder,
  isoEllipse,
  mix,
  roundRect,
  shade,
  softShadow,
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
 * Draws one piece of floor furniture. `cx`/`cy` is the centre of its footprint
 * on the tile plane; everything is built upward from there out of iso boxes.
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
      isoBox(ctx, cx, cy, 0.82, 0.82, 0.09, faces(pal.base), 0.52);
      isoBox(ctx, cx, cy, 0.7, 0.7, 0.01, faces(pal.top), 0.61);
      woodGrain(ctx, cx, cy, 0.62, 0.68, withAlpha(pal.shade, 0.2));
      tableSetting(ctx, cx, cy, 0.62, opts.time, opts.dirty);
      break;
    }
    case 'tableRound': {
      softShadow(ctx, cx, cy, 0.7);
      isoCylinder(ctx, cx, cy, 0.14, 0.5, pal.shade);
      isoEllipse(ctx, cx, cy, 0.4, shade(pal.base, 0.8), 0.5);
      isoEllipse(ctx, cx, cy, 0.4, pal.top, 0.56);
      isoEllipse(ctx, cx, cy, 0.3, shade(pal.top, 1.06), 0.565);
      tableSetting(ctx, cx, cy, 0.57, opts.time, opts.dirty);
      break;
    }
    case 'tableMarble': {
      softShadow(ctx, cx, cy, 0.74);
      isoCylinder(ctx, cx, cy, 0.16, 0.5, pal.shade);
      isoBox(ctx, cx, cy, 0.86, 0.86, 0.1, faces(pal.top), 0.5);
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
      isoBox(ctx, cx - TILE_W * 0.24, cy - TILE_H * 0.24, 0.2, 0.95, 0.62, faces(pal.base));
      isoBox(ctx, cx + TILE_W * 0.24, cy - TILE_H * 0.24, 0.95, 0.2, 0.62, faces(shade(pal.base, 0.92)));
      legs(ctx, cx, cy, 0.42, 0.5, pal.shade);
      isoBox(ctx, cx, cy, 0.72, 0.72, 0.09, faces(pal.top), 0.5);
      woodGrain(ctx, cx, cy, 0.6, 0.7, withAlpha(pal.shade, 0.2));
      tableSetting(ctx, cx, cy, 0.6, opts.time, opts.dirty);
      break;
    }

    // ------------------------------------------------------------- chairs
    case 'stool': {
      softShadow(ctx, cx, cy, 0.44);
      legs(ctx, cx, cy, 0.3, 0.42, pal.shade);
      isoBox(ctx, cx, cy, 0.48, 0.48, 0.08, faces(pal.base), 0.42);
      break;
    }
    case 'chairWood': {
      softShadow(ctx, cx, cy, 0.46);
      legs(ctx, cx, cy, 0.32, 0.4, pal.shade);
      isoBox(ctx, cx, cy, 0.52, 0.52, 0.08, faces(pal.base), 0.4);
      isoBox(ctx, cx - TILE_W * 0.14, cy - TILE_H * 0.14, 0.12, 0.5, 0.42, faces(pal.top), 0.48);
      break;
    }
    case 'chairPadded': {
      softShadow(ctx, cx, cy, 0.5);
      legs(ctx, cx, cy, 0.34, 0.36, pal.shade);
      isoBox(ctx, cx, cy, 0.58, 0.58, 0.14, faces(pal.base), 0.36);
      isoBox(ctx, cx - TILE_W * 0.15, cy - TILE_H * 0.15, 0.16, 0.56, 0.44, faces(pal.top), 0.5);
      break;
    }
    case 'chairThrone': {
      softShadow(ctx, cx, cy, 0.54);
      legs(ctx, cx, cy, 0.36, 0.3, pal.shade);
      isoBox(ctx, cx, cy, 0.64, 0.64, 0.18, faces(pal.base), 0.3);
      isoBox(ctx, cx - TILE_W * 0.16, cy - TILE_H * 0.16, 0.16, 0.62, 0.6, faces(pal.top), 0.48);
      // Arm rests.
      isoBox(ctx, cx + TILE_W * 0.02, cy - TILE_H * 0.2, 0.5, 0.12, 0.2, faces(pal.base), 0.48);
      isoBox(ctx, cx - TILE_W * 0.2, cy + TILE_H * 0.02, 0.12, 0.5, 0.2, faces(pal.base), 0.48);
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.ellipse(cx, cy - 1.02 * TILE_Z, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    // ------------------------------------------------------------- stoves
    case 'stoveCamp': {
      softShadow(ctx, cx, cy, 0.5);
      isoBox(ctx, cx, cy, 0.62, 0.62, 0.36, faces(pal.base));
      burner(ctx, cx, cy, 0.38, 0.18, opts, pal.accent);
      break;
    }
    case 'stoveGas': {
      softShadow(ctx, cx, cy, 0.66);
      isoBox(ctx, cx, cy, 0.8, 0.8, 0.55, faces(pal.base));
      isoBox(ctx, cx, cy, 0.84, 0.84, 0.05, faces(pal.top), 0.55);
      burner(ctx, cx - 8, cy - 4, 0.28, 0.62, opts, pal.accent);
      burner(ctx, cx + 8, cy + 4, 0.28, 0.62, opts, pal.accent);
      knobs(ctx, cx, cy, pal.accent);
      break;
    }
    case 'stovePro': {
      softShadow(ctx, cx, cy, 0.74);
      isoBox(ctx, cx, cy, 0.9, 0.9, 0.6, faces(pal.base));
      isoBox(ctx, cx, cy, 0.94, 0.94, 0.06, faces(pal.top), 0.6);
      burner(ctx, cx - 10, cy - 5, 0.26, 0.68, opts, pal.accent);
      burner(ctx, cx + 10, cy + 5, 0.26, 0.68, opts, pal.accent);
      burner(ctx, cx + 6, cy - 9, 0.22, 0.68, opts, pal.accent);
      knobs(ctx, cx, cy, pal.accent);
      // Extraction hood floating above.
      isoBox(ctx, cx, cy, 0.95, 0.95, 0.12, faces(shade(pal.base, 1.1)), 1.35);
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
      isoBox(ctx, cx, cy, 0.84, 0.84, 0.5, faces(pal.base));
      isoBox(ctx, cx, cy, 0.9, 0.9, 0.06, faces(pal.top), 0.5);
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
      isoBox(ctx, cx, cy, 0.82, 0.82, 0.5, faces(pal.base));
      isoBox(ctx, cx, cy, 0.86, 0.86, 0.06, faces(pal.top), 0.5);
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
      isoBox(ctx, cx, cy, 0.66, 0.66, 1.0, faces(pal.base));
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
      isoBox(ctx, cx, cy, 0.8, 0.8, 0.42, faces(pal.base));
      ctx.save();
      ctx.globalAlpha *= 0.55;
      isoBox(ctx, cx, cy, 0.76, 0.76, 0.62, faces(pal.top), 0.42);
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
      isoBox(ctx, cx, cy, 0.5, 0.5, 0.3, faces(shade(pal.base, 0.8)));
      isoCylinder(ctx, cx, cy, 0.16, 0.55, pal.top, 0.3);
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
      diamondPath(ctx, cx, cy, 0.94, 0.94);
      ctx.fillStyle = pal.base;
      ctx.fill();
      diamondPath(ctx, cx, cy, 0.72, 0.72);
      ctx.fillStyle = pal.top;
      ctx.fill();
      diamondPath(ctx, cx, cy, 0.44, 0.44);
      ctx.fillStyle = def.shape === 'rugFancy' ? pal.accent : pal.shade;
      ctx.fill();
      if (def.shape === 'rugFancy') {
        diamondPath(ctx, cx, cy, 0.2, 0.2);
        ctx.fillStyle = pal.base;
        ctx.fill();
      }
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
    isoBox(ctx, px, py, 0.1, 0.1, height, faces(color));
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
 * One box of a body, in the figure's own frame: `u` runs across the body towards
 * the camera, `v` runs the way the figure faces, `y` is the lift off the floor,
 * and `w`/`d`/`h` are its size across, front-to-back and up. Tile units, before
 * the build scale, exactly like the furniture.
 */
interface Limb {
  u: number;
  v: number;
  y: number;
  w: number;
  d: number;
  h: number;
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

/** A limb's footprint on the two grid axes, which swap with the facing. */
function footprint(f: Figure, l: Limb): [number, number] {
  return f.fwd[0] !== 0 ? [l.d * f.s, l.w * f.s] : [l.w * f.s, l.d * f.s];
}

/** One body part, as an iso box with a lit top and two shaded sides. */
function limb(f: Figure, l: Limb, colors: BoxColors): void {
  const at = spot(f, l.u, l.v);
  const [sx, sy] = footprint(f, l);
  isoBox(f.ctx, at.x, at.y, sx, sy, l.h * f.s, colors, l.y * f.s);
}

/**
 * The three face colours of a body part. `faces` shades the left-hand face hard,
 * which is right for a building but would leave half the crowd with their face
 * in shadow, so the plane a figure's front lands on is lifted a little.
 */
function volume(f: Figure, base: string): BoxColors {
  const c = faces(base);
  if (f.front === 'left') return { ...c, left: shade(base, 0.86) };
  if (f.front === 'right') return { ...c, right: shade(base, 0.98) };
  return c;
}

/**
 * Lay flat detail onto one of a limb's two camera-facing planes: local x runs
 * along the plane either side of its centre, local y runs straight down the
 * screen from its top edge, and the plane's width and height are handed to the
 * caller. Because the shear is the plane's own, a face or a row of buttons drawn
 * here leans with the box it belongs to instead of floating across the front of
 * the figure — which is the whole difference between a painted head and a decal.
 */
function onPlane(
  f: Figure,
  l: Limb,
  which: Plane | null,
  paint: (half: number, height: number) => void,
): void {
  if (!which) return;
  const at = spot(f, l.u, l.v, l.y + l.h);
  const [sx, sy] = footprint(f, l);
  const ax = (TILE_W / 4) * sx;
  const ay = (TILE_H / 4) * sx;
  const bx = (TILE_W / 4) * sy;
  const by = (TILE_H / 4) * sy;
  const { ctx } = f;
  ctx.save();
  if (which === 'right') {
    ctx.transform(1, -0.5, 0, 1, at.x + ax, at.y + ay);
    paint(bx, l.h * f.s * TILE_Z);
  } else {
    ctx.transform(1, 0.5, 0, 1, at.x - bx, at.y + by);
    paint(ax, l.h * f.s * TILE_Z);
  }
  ctx.restore();
}

/**
 * Lift of the hips, which every other measurement hangs off. Seats in this game
 * stand half a tile-height off the floor, which on a body this short is already
 * hip height — so sitting down folds the legs up rather than lowering the head.
 */
const HIP_STAND = 0.4;
const HIP_SIT = 0.46;
/** How far the legs and the arms sit either side of the middle. */
const LEG_U = 0.12;
const ARM_U = 0.27;

/**
 * People are built the way the furniture is: a stack of small isometric boxes
 * with a lit top and two shaded sides, so a figure standing on the tiles catches
 * the same light as the chair beside it. Nothing is mirrored — a body is
 * assembled in its own frame, and the two away facings simply show the back of
 * the head — and every piece of detail is painted on the plane of the box it
 * belongs to, so it leans with the figure rather than sitting flat on top of it.
 *
 * Proportions stay chibi: a slightly oversized head on a short body, which is
 * what keeps a face readable when a tile is only 64px wide.
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
  // The shadow spreads as the figure lifts off, which sells the bounce.
  softShadow(ctx, cx, cy, (opts.sitting ? 0.3 : 0.36) + bob * 0.4, 0.2);

  drawLeg(f, look, -1, hip, stride, opts.sitting);
  drawLeg(f, look, 1, hip, stride, opts.sitting);
  drawArm(f, look, opts, -1, hip, stride, lean, shirt);
  drawTorso(f, look, opts, hip, lean, sway, shirt, trim);
  drawHeadGroup(f, look, opts, hip, lean, sway);
  const hand = drawArm(f, look, opts, 1, hip, stride, lean, shirt);
  drawHeld(f, opts, hand);

  ctx.restore();
}

/** Thigh, shin and shoe down one side, either standing or folded onto a chair. */
function drawLeg(
  f: Figure,
  look: Appearance,
  side: 1 | -1,
  hip: number,
  stride: number,
  sitting: boolean,
): void {
  const thigh = volume(f, look.pants);
  // A shin a shade off the thigh is all it takes for a knee to read at this size.
  const shin = volume(f, shade(look.pants, 1.07));
  const shoe = volume(f, '#42332a');
  const u = side * LEG_U;

  if (sitting) {
    // Thighs run forward off the seat, shins drop from the knee to the floor.
    limb(f, { u, v: 0.26, y: 0, w: 0.15, d: 0.18, h: 0.05 }, shoe);
    limb(f, { u, v: 0.26, y: 0.04, w: 0.13, d: 0.14, h: hip - 0.16 }, shin);
    limb(f, { u, v: 0.13, y: hip - 0.12, w: 0.15, d: 0.3, h: 0.13 }, thigh);
    return;
  }

  const swing = side * stride;
  // The leading foot clears the tiles, so a stride is a step and not a shuffle.
  const raise = Math.max(0, swing) * 0.03;
  const knee = hip - 0.2;
  limb(f, { u, v: swing * 0.1 + 0.02, y: raise, w: 0.15, d: 0.2, h: 0.05 }, shoe);
  limb(f, { u, v: swing * 0.09, y: raise + 0.04, w: 0.13, d: 0.14, h: knee - raise - 0.02 }, shin);
  limb(f, { u, v: swing * 0.05, y: knee, w: 0.15, d: 0.16, h: hip - knee + 0.03 }, thigh);
}

/**
 * Upper arm, forearm and hand down one side. Returns the hand, so whatever is
 * being carried can be placed on it rather than near it.
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
): Limb {
  // Arms swing against the leg on the same side. The near arm is the one that
  // carries, so a tray is always on the side the camera can see.
  const swing = -side * stride;
  const carrying = side === 1 && !!opts.carrying;
  const u = side * ARM_U;

  const upper: Limb = { u, v: swing * 0.06 + lean * 0.6, y: hip + 0.14, w: 0.12, d: 0.14, h: 0.22 };
  let fore: Limb = { u, v: swing * 0.12 + lean * 0.5, y: hip - 0.02, w: 0.11, d: 0.13, h: 0.2 };
  let hand: Limb = { u, v: swing * 0.14 + lean * 0.5, y: hip - 0.1, w: 0.12, d: 0.12, h: 0.09 };
  if (carrying) {
    // Forearm up and out under the tray.
    upper.v = 0.03 + lean;
    upper.h = 0.24;
    fore = { u: u * 0.92, v: 0.17, y: hip + 0.26, w: 0.11, d: 0.24, h: 0.1 };
    hand = { u: u * 0.85, v: 0.3, y: hip + 0.24, w: 0.12, d: 0.12, h: 0.08 };
  } else if (opts.sitting) {
    // Forearms come forward onto the table, which is most of what tells a seated
    // figure apart from one standing with its knees bent.
    fore = { u: u * 0.95, v: 0.12, y: hip + 0.02, w: 0.11, d: 0.2, h: 0.1 };
    hand = { u: u * 0.9, v: 0.25, y: hip, w: 0.12, d: 0.12, h: 0.09 };
  }

  // Staff work in long sleeves; guests turn up in short ones.
  const sleeve = volume(f, shirt);
  limb(f, upper, sleeve);
  limb(f, fore, opts.role ? sleeve : volume(f, look.skin));
  // Cleaners work in rubber gloves, which is a surprisingly strong cue for which
  // of three near-identical figures is the one wiping tables.
  limb(f, hand, volume(f, opts.role === 'cleaner' ? '#f4c22e' : look.skin));
  return hand;
}

/**
 * Hips, chest and shoulders, plus whatever the figure is wearing over them.
 * Uniforms are garments with their own thickness standing off the chest, not a
 * pattern painted on it, so a waistcoat still reads as worn from any angle.
 */
function drawTorso(
  f: Figure,
  look: Appearance,
  opts: PersonOptions,
  hip: number,
  lean: number,
  sway: number,
  shirt: string,
  trim: string,
): void {
  const pelvis: Limb = { u: sway * 0.5, v: lean * 0.5, y: hip - 0.06, w: 0.32, d: 0.24, h: 0.15 };
  const torso: Limb = { u: sway, v: lean, y: hip + 0.06, w: 0.4, d: 0.26, h: 0.28 };
  const shoulders: Limb = { u: sway, v: lean, y: hip + 0.26, w: 0.46, d: 0.28, h: 0.1 };
  const { ctx } = f;

  limb(f, pelvis, volume(f, look.pants));
  limb(f, torso, volume(f, shirt));
  limb(f, shoulders, volume(f, shirt));

  // Hem, across both planes the camera can see so it wraps the body.
  for (const plane of [f.front, f.back, f.flank]) {
    onPlane(f, torso, plane, (half, height) => {
      ctx.fillStyle = withAlpha(trim, 0.9);
      ctx.fillRect(-half, height - 2.2 * f.s, half * 2, 2.2 * f.s);
    });
  }

  // Collar, and the same notch on the back of the neck when turned away.
  onPlane(f, shoulders, f.front, (half, height) => {
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(-half * 0.34, 0);
    ctx.lineTo(0, height * 0.8);
    ctx.lineTo(half * 0.34, 0);
    ctx.closePath();
    ctx.fill();
  });
  onPlane(f, shoulders, f.back, (half, height) => {
    ctx.fillStyle = withAlpha(trim, 0.8);
    ctx.fillRect(-half * 0.4, 0, half * 0.8, height * 0.42);
  });

  if (opts.role === 'chef') {
    // Neckerchief, knotted at the throat.
    limb(f, { ...shoulders, y: hip + 0.36, w: 0.34, d: 0.28, h: 0.07 }, volume(f, trim));
    onPlane(f, torso, f.front, (half, height) => {
      // Double-breasted buttons.
      ctx.fillStyle = '#d8cfbb';
      for (let i = 0; i < 3; i++) {
        for (const dx of [-0.32, 0.32]) {
          ctx.beginPath();
          ctx.arc(dx * half, height * (0.22 + i * 0.26), 0.75 * f.s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }

  if (opts.role === 'waiter' && f.front) {
    // Waistcoat: a panel standing off the chest, with the buttons on its own face.
    const vest: Limb = { u: torso.u, v: torso.v + 0.125, y: hip + 0.08, w: 0.32, d: 0.04, h: 0.26 };
    limb(f, vest, volume(f, trim));
    onPlane(f, vest, f.front, (_half, height) => {
      ctx.fillStyle = 'rgba(255, 244, 220, 0.9)';
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(0, height * (0.42 + i * 0.3), 0.7 * f.s, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  if (opts.uniform) {
    // Aprons: a bib for the kitchen, a short bistro apron for the floor. Behind
    // the figure there is nothing to see but the straps, so that is all we draw.
    const bib = opts.role === 'waiter' ? 0.2 : 0.3;
    if (f.front) {
      const apron: Limb = {
        u: 0,
        v: lean + 0.15,
        y: hip - 0.02,
        w: 0.26,
        d: 0.035,
        h: bib,
      };
      limb(f, apron, faces('#f7f2e6'));
      onPlane(f, apron, f.front, (half, height) => {
        ctx.strokeStyle = 'rgba(186, 172, 150, 0.75)';
        ctx.lineWidth = 0.9 * f.s;
        ctx.beginPath();
        ctx.moveTo(-half, height * 0.16);
        ctx.lineTo(half, height * 0.16);
        ctx.stroke();
      });
    } else {
      onPlane(f, torso, f.back, (half, height) => {
        ctx.strokeStyle = 'rgba(240, 234, 220, 0.85)';
        ctx.lineWidth = 1.3 * f.s;
        ctx.beginPath();
        ctx.moveTo(-half * 0.55, height * 0.1);
        ctx.lineTo(half * 0.55, height * 0.62);
        ctx.moveTo(half * 0.55, height * 0.1);
        ctx.lineTo(-half * 0.55, height * 0.62);
        ctx.stroke();
      });
    }
  }
}

/** Neck, head, ears, hair, face and hat, in the order the camera needs them. */
function drawHeadGroup(
  f: Figure,
  look: Appearance,
  opts: PersonOptions,
  hip: number,
  lean: number,
  sway: number,
): void {
  const skin = volume(f, look.skin);
  // Wider than deep, so the face gets as much of the wall as the head can spare.
  const head: Limb = {
    u: sway * 0.6,
    v: lean * 1.3,
    y: hip + 0.42,
    w: 0.46,
    d: 0.36,
    h: 0.32,
  };
  const ear = (side: 1 | -1): Limb => ({
    u: head.u + side * 0.235,
    v: head.v - 0.01,
    y: head.y + 0.1,
    w: 0.04,
    d: 0.1,
    h: 0.09,
  });

  limb(f, { u: head.u, v: head.v, y: hip + 0.34, w: 0.15, d: 0.14, h: 0.09 }, skin);
  // A jaw narrower than the head, which together with the step the hair puts on
  // the crown is what keeps a boxy head from reading as a plain cube.
  limb(f, { u: head.u, v: head.v, y: head.y - 0.05, w: 0.36, d: 0.28, h: 0.06 }, skin);
  limb(f, ear(-1), skin);
  drawHairBack(f, look, head);
  limb(f, head, skin);
  limb(f, ear(1), skin);
  drawHair(f, look, head);
  drawFace(f, look, head, opts.time);
  if (opts.role) drawUniformHat(f, opts.role, head);
  else drawGuestExtra(f, look, head, hip, lean);
}

/** Whatever is in the near hand, placed on it. */
function drawHeld(f: Figure, opts: PersonOptions, hand: Limb): void {
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
    const pad: Limb = { u: hand.u * 0.9, v: hand.v + 0.14, y: hand.y + 0.06, w: 0.17, d: 0.14, h: 0.03 };
    limb(f, pad, faces('#fdf8ec'));
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
    limb(
      f,
      { u: hand.u * 1.05, v: hand.v + 0.12, y: hand.y - 0.02, w: 0.18, d: 0.16, h: 0.04 },
      faces('#8fd0e8'),
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
 * Eyes, brows, blush and mouth, painted onto the plane of the head the figure is
 * facing along. Nothing is drawn at all on the two away facings, where that
 * plane is pointing away from the camera.
 */
function drawFace(f: Figure, look: Appearance, head: Limb, time: number): void {
  onPlane(f, head, f.front, (half, height) => {
    const { ctx } = f;
    const dx = half * 0.46;
    const eyeY = height * 0.46;
    // Each figure gets a different `time` offset, so blinks never synchronise.
    const blinking = (time * 0.31) % 1 < 0.05;

    ctx.lineCap = 'round';
    if (blinking) {
      ctx.strokeStyle = '#3a2b21';
      ctx.lineWidth = 1.2 * f.s;
      ctx.beginPath();
      ctx.moveTo(-dx - half * 0.24, eyeY);
      ctx.lineTo(-dx + half * 0.24, eyeY);
      ctx.moveTo(dx - half * 0.24, eyeY);
      ctx.lineTo(dx + half * 0.24, eyeY);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fbf7ef';
      ctx.beginPath();
      ctx.ellipse(-dx, eyeY, half * 0.28, height * 0.19, 0, 0, Math.PI * 2);
      ctx.ellipse(dx, eyeY, half * 0.28, height * 0.19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2118';
      ctx.beginPath();
      ctx.arc(-dx + half * 0.05, eyeY + height * 0.02, half * 0.17, 0, Math.PI * 2);
      ctx.arc(dx + half * 0.05, eyeY + height * 0.02, half * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(-dx - half * 0.07, eyeY - height * 0.07, half * 0.075, 0, Math.PI * 2);
      ctx.arc(dx - half * 0.07, eyeY - height * 0.07, half * 0.075, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = shade(look.hair, 0.7);
    ctx.lineWidth = 1.1 * f.s;
    ctx.beginPath();
    ctx.moveTo(-dx - half * 0.26, eyeY - height * 0.19);
    ctx.lineTo(-dx + half * 0.22, eyeY - height * 0.23);
    ctx.moveTo(dx - half * 0.22, eyeY - height * 0.23);
    ctx.lineTo(dx + half * 0.26, eyeY - height * 0.19);
    ctx.stroke();

    ctx.fillStyle = withAlpha('#e87a7a', 0.4);
    ctx.beginPath();
    ctx.ellipse(-half * 0.76, eyeY + height * 0.2, half * 0.22, height * 0.09, 0, 0, Math.PI * 2);
    ctx.ellipse(half * 0.76, eyeY + height * 0.2, half * 0.22, height * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(80, 40, 30, 0.85)';
    ctx.lineWidth = 1.2 * f.s;
    ctx.beginPath();
    ctx.arc(0, eyeY + height * 0.2, half * 0.4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    if (wearsGlasses(look)) {
      ctx.strokeStyle = 'rgba(58, 46, 38, 0.9)';
      ctx.lineWidth = 0.9 * f.s;
      ctx.beginPath();
      ctx.arc(-dx, eyeY, half * 0.42, 0, Math.PI * 2);
      ctx.arc(dx, eyeY, half * 0.42, 0, Math.PI * 2);
      ctx.moveTo(-dx + half * 0.42, eyeY);
      ctx.lineTo(dx - half * 0.42, eyeY);
      ctx.stroke();
    }
  });
}

/**
 * Headgear by job, built as its own little volume on the crown. Silhouette does
 * the work: a tall toque, a peaked cap and a low bandana still tell you who is
 * who from across the room, and from behind, where no uniform is in view.
 */
function drawUniformHat(f: Figure, role: 'waiter' | 'chef' | 'cleaner', head: Limb): void {
  const crown = head.y + head.h;
  const { ctx } = f;

  switch (role) {
    case 'chef': {
      const band: Limb = { u: head.u, v: head.v, y: crown - 0.05, w: 0.5, d: 0.4, h: 0.09 };
      limb(f, band, faces('#fffdf8'));
      const at = spot(f, head.u, head.v, crown + 0.04);
      isoCylinder(ctx, at.x, at.y, 0.26 * f.s, 0.2 * f.s, '#fdf9ef');
      // A wider puff over the pleats, which is what makes a toque a toque.
      isoEllipse(ctx, at.x, at.y - 0.2 * f.s * TILE_Z, 0.3 * f.s, '#fffefb');
      break;
    }
    case 'waiter': {
      // Peaked cap: the bill is drawn first so the crown laps over its root.
      limb(
        f,
        { u: head.u, v: head.v + 0.3, y: crown - 0.06, w: 0.44, d: 0.2, h: 0.045 },
        faces('#a12b23'),
      );
      const cap: Limb = { u: head.u, v: head.v, y: crown - 0.07, w: 0.5, d: 0.4, h: 0.16 };
      limb(f, cap, faces('#c73a2e'));
      for (const plane of [f.front, f.back, f.flank]) {
        onPlane(f, cap, plane, (half, height) => {
          ctx.fillStyle = 'rgba(255, 232, 210, 0.5)';
          ctx.fillRect(-half, height - 1.6 * f.s, half * 2, 1.6 * f.s);
        });
      }
      break;
    }
    default: {
      // Bandana, wrapped low, with the knot out on the side the camera can see.
      const wrap: Limb = { u: head.u, v: head.v, y: crown - 0.16, w: 0.49, d: 0.39, h: 0.2 };
      limb(f, wrap, faces('#2f8b83'));
      for (const plane of [f.front, f.back, f.flank]) {
        onPlane(f, wrap, plane, (half, height) => {
          ctx.fillStyle = 'rgba(126, 208, 196, 0.75)';
          ctx.fillRect(-half, height - 2 * f.s, half * 2, 2 * f.s);
        });
      }
      limb(
        f,
        { u: head.u + 0.26, v: head.v - 0.06, y: crown - 0.15, w: 0.13, d: 0.11, h: 0.11 },
        faces('#2a6f68'),
      );
      break;
    }
  }
}

/**
 * A hat or a scarf on some of the guests, chosen from their existing colours so
 * no save data changes. Guests wearing something the staff never wear is what
 * keeps the two crowds apart at a glance.
 */
function drawGuestExtra(f: Figure, look: Appearance, head: Limb, hip: number, lean: number): void {
  const pick = hashString(look.shirt + look.pants + look.hairStyle) % 6;
  const crown = head.y + head.h;

  if (pick === 0) {
    // Bobble hat: turned-up brim, dome, pom-pom.
    limb(
      f,
      { u: head.u, v: head.v, y: crown - 0.1, w: 0.52, d: 0.42, h: 0.15 },
      faces(shade(look.shirt, 1.12)),
    );
    const at = spot(f, head.u, head.v, crown + 0.04);
    isoCylinder(f.ctx, at.x, at.y, 0.22 * f.s, 0.12 * f.s, look.shirt);
    f.ctx.fillStyle = '#fff6e4';
    f.ctx.beginPath();
    f.ctx.arc(at.x, at.y - (0.12 * f.s * TILE_Z + 2.2 * f.s), 2.6 * f.s, 0, Math.PI * 2);
    f.ctx.fill();
  } else if (pick === 1) {
    // Scarf, round the neck with the tail hanging down the front. Darker than the
    // shirt it is picked from, or the two would read as one garment.
    limb(
      f,
      { u: head.u, v: head.v, y: hip + 0.32, w: 0.36, d: 0.3, h: 0.11 },
      faces(shade(look.shirt, 0.58)),
    );
    if (f.front) {
      limb(
        f,
        { u: head.u + 0.06, v: lean + 0.15, y: hip + 0.08, w: 0.1, d: 0.06, h: 0.24 },
        faces(shade(look.shirt, 0.52)),
      );
    }
  }
}

/**
 * Hair that hangs behind the head, drawn before it so the head sits in front of
 * its own hair rather than inside it.
 */
function drawHairBack(f: Figure, look: Appearance, head: Limb): void {
  const crown = head.y + head.h;
  if (look.hairStyle === 'long') {
    // A mass a little wider than the head and deeper behind it, so the hair
    // frames the face on both sides and falls to the shoulders at the back. It
    // narrows on the way down rather than ending in a square hem.
    limb(
      f,
      { u: head.u, v: head.v - 0.05, y: crown - 0.5, w: 0.44, d: 0.34, h: 0.26 },
      faces(shade(look.hair, 0.94)),
    );
    limb(
      f,
      { u: head.u, v: head.v - 0.05, y: crown - 0.28, w: 0.5, d: 0.4, h: 0.28 },
      faces(look.hair),
    );
  } else if (look.hairStyle === 'bun') {
    // High enough on the back of the head to break the crown line, or a bun would
    // be a style you could only tell somebody had from behind.
    const at = spot(f, head.u, head.v - 0.16, crown - 0.04);
    isoCylinder(f.ctx, at.x, at.y, 0.14 * f.s, 0.16 * f.s, look.hair);
  }
}

/**
 * The hair on top of the head, as two slabs: a band round the skull and a
 * narrower one above it. The step is what rounds off the crown, so a head reads
 * as a head rather than as a cube — which is also why a bald one gets the same
 * step in skin, with the hair painted round the back and sides instead.
 */
function drawHair(f: Figure, look: Appearance, head: Limb): void {
  const crown = head.y + head.h;
  const hair = faces(look.hair);
  const band: Limb = { u: head.u, v: head.v, y: crown - 0.09, w: 0.48, d: 0.38, h: 0.12 };
  const top: Limb = { u: head.u, v: head.v, y: crown + 0.01, w: 0.4, d: 0.3, h: 0.07 };

  if (look.hairStyle === 'bald') {
    limb(f, top, volume(f, look.skin));
    for (const plane of [f.back, f.flank]) {
      onPlane(f, head, plane, (half, height) => {
        f.ctx.fillStyle = look.hair;
        f.ctx.fillRect(-half, height * 0.26, half * 2, height * 0.3);
      });
    }
    return;
  }

  switch (look.hairStyle) {
    case 'cap':
      // A flat, wide crop with no step, which reads as a blunt fringe.
      limb(f, { ...band, w: 0.52, d: 0.42, h: 0.16 }, hair);
      break;
    case 'curly': {
      limb(f, band, hair);
      // Curls round the crown, far side first so the near ones lap over them.
      // None of them stray forward over the face.
      const curls: Array<[number, number]> = [
        [-0.2, -0.1],
        [-0.14, 0.09],
        [0, -0.14],
        [0.06, 0.1],
        [0.2, -0.05],
      ];
      for (const [u, v] of curls) {
        limb(
          f,
          { u: head.u + u, v: head.v + v, y: crown - 0.02, w: 0.15, d: 0.14, h: 0.11 },
          faces(shade(look.hair, u > 0 ? 1.07 : 0.93)),
        );
      }
      break;
    }
    default:
      // Short, bun and long all share the same stepped crown.
      limb(f, band, hair);
      limb(f, top, hair);
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

function drawPlateBase(ctx: CanvasRenderingContext2D, style: PlateStyle): void {
  if (style === 'cup') return;
  // A contact shadow is what stops plates looking like stickers on the table.
  ctx.fillStyle = 'rgba(74, 44, 26, 0.22)';
  ctx.beginPath();
  ctx.ellipse(1, 1.6, 13, 5.4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (style === 'bowl' || style === 'salad') {
    ctx.fillStyle = '#fdfaf2';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12.5, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d5ccb9';
    ctx.beginPath();
    ctx.ellipse(0, 0.4, 9.6, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
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
