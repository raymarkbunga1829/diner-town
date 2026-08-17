import { TILE_H, TILE_W, TILE_Z, type Facing } from '../engine/iso';
import type { Dish, PlateStyle } from '../game/data/dishes';
import type { FurnitureDef } from '../game/data/furniture';
import type { Ingredient } from '../game/data/ingredients';
import type { Appearance } from '../game/types';
import {
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
      break;
    }
    case 'tableRound': {
      softShadow(ctx, cx, cy, 0.7);
      isoCylinder(ctx, cx, cy, 0.14, 0.5, pal.shade);
      isoEllipse(ctx, cx, cy, 0.4, shade(pal.base, 0.8), 0.5);
      isoEllipse(ctx, cx, cy, 0.4, pal.top, 0.56);
      isoEllipse(ctx, cx, cy, 0.3, shade(pal.top, 1.06), 0.565);
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
      break;
    }
    case 'tableBooth': {
      softShadow(ctx, cx, cy, 0.8);
      // Bench backs along the two far edges.
      isoBox(ctx, cx - TILE_W * 0.24, cy - TILE_H * 0.24, 0.2, 0.95, 0.62, faces(pal.base));
      isoBox(ctx, cx + TILE_W * 0.24, cy - TILE_H * 0.24, 0.95, 0.2, 0.62, faces(shade(pal.base, 0.92)));
      legs(ctx, cx, cy, 0.42, 0.5, pal.shade);
      isoBox(ctx, cx, cy, 0.72, 0.72, 0.09, faces(pal.top), 0.5);
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

  if (opts.dirty) {
    ctx.fillStyle = 'rgba(120, 96, 40, 0.55)';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 11, cy - 0.62 * TILE_Z + Math.sin(a) * 5, 4.5, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
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

export interface PersonOptions {
  facing: Facing;
  /** Seconds; drives the walk cycle and idle breathing. */
  time: number;
  walking: boolean;
  sitting: boolean;
  /** Overrides the shirt colour, for staff uniforms. */
  uniform?: { shirt: string; trim: string };
  /** Dish carried on a tray. */
  carrying?: Dish | null;
  /** Small prop in hand. */
  prop?: 'notepad' | 'cloth' | 'pan' | null;
  /** Fade the whole figure. */
  alpha?: number;
}

/**
 * Characters are drawn as simple front-facing figures with a mirrored pose for
 * the two left-hand facings and a hidden face for the two away facings, which
 * reads clearly at small sizes without needing sprite sheets.
 */
export function drawPerson(
  ctx: CanvasRenderingContext2D,
  look: Appearance,
  cx: number,
  cy: number,
  opts: PersonOptions,
): void {
  const away = opts.facing === 'ne' || opts.facing === 'nw';
  const flip = opts.facing === 'sw' || opts.facing === 'nw';
  const s = look.build;
  const shirt = opts.uniform?.shirt ?? look.shirt;
  const trim = opts.uniform?.trim ?? shade(shirt, 0.7);

  const stride = opts.walking ? Math.sin(opts.time * 9) : 0;
  const bob = opts.walking ? Math.abs(Math.cos(opts.time * 9)) * 1.6 : Math.sin(opts.time * 1.6) * 0.5;
  const seatDrop = opts.sitting ? 7 : 0;

  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  softShadow(ctx, cx, cy, opts.sitting ? 0.3 : 0.36, 0.2);

  ctx.translate(cx, cy - bob + seatDrop);
  if (flip) ctx.scale(-1, 1);

  const legTop = -13 * s;
  const bodyTop = -26 * s;
  const headY = -34 * s;

  // Legs
  ctx.fillStyle = look.pants;
  if (opts.sitting) {
    // Thighs forward, shins down.
    roundRect(ctx, -6 * s, legTop, 12 * s, 6 * s, 3);
    ctx.fill();
    roundRect(ctx, -5.5 * s, legTop + 5 * s, 4.5 * s, 9 * s, 2);
    ctx.fill();
    roundRect(ctx, 1 * s, legTop + 5 * s, 4.5 * s, 9 * s, 2);
    ctx.fill();
  } else {
    roundRect(ctx, -5.5 * s + stride * 2, legTop, 4.6 * s, 13 * s, 2.2);
    ctx.fill();
    roundRect(ctx, 0.9 * s - stride * 2, legTop, 4.6 * s, 13 * s, 2.2);
    ctx.fill();
    ctx.fillStyle = shade(look.pants, 0.6);
    roundRect(ctx, -6 * s + stride * 2, legTop + 12 * s, 5.6 * s, 3 * s, 1.6);
    ctx.fill();
    roundRect(ctx, 0.5 * s - stride * 2, legTop + 12 * s, 5.6 * s, 3 * s, 1.6);
    ctx.fill();
  }

  // Torso
  ctx.fillStyle = shirt;
  roundRect(ctx, -7.5 * s, bodyTop, 15 * s, 15 * s, 5);
  ctx.fill();
  ctx.fillStyle = trim;
  ctx.fillRect(-7.5 * s, bodyTop + 11 * s, 15 * s, 2.2 * s);
  if (!away) {
    ctx.fillStyle = withAlpha(trim, 0.9);
    ctx.beginPath();
    ctx.moveTo(-2.4 * s, bodyTop);
    ctx.lineTo(0, bodyTop + 5 * s);
    ctx.lineTo(2.4 * s, bodyTop);
    ctx.closePath();
    ctx.fill();
  }

  // Arms
  ctx.fillStyle = shirt;
  const armSwing = opts.walking ? stride * 3 : 0;
  roundRect(ctx, -10.5 * s, bodyTop + 2 * s - armSwing, 3.6 * s, 11 * s, 1.8);
  ctx.fill();
  if (!opts.carrying) {
    roundRect(ctx, 7 * s, bodyTop + 2 * s + armSwing, 3.6 * s, 11 * s, 1.8);
    ctx.fill();
  } else {
    // Carrying arm is raised to hold the tray.
    roundRect(ctx, 7 * s, bodyTop - 1 * s, 3.6 * s, 8 * s, 1.8);
    ctx.fill();
  }
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(-8.7 * s, bodyTop + 13 * s - armSwing, 2.3 * s, 0, Math.PI * 2);
  ctx.fill();
  if (!opts.carrying) {
    ctx.beginPath();
    ctx.arc(8.8 * s, bodyTop + 13 * s + armSwing, 2.3 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(0, headY, 8.2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(look.skin, 0.92);
  ctx.beginPath();
  ctx.ellipse(0, headY + 7.4 * s, 3.4 * s, 2 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  drawHair(ctx, look, headY, s, away);

  if (!away) {
    ctx.fillStyle = '#2b2118';
    ctx.beginPath();
    ctx.arc(-2.9 * s, headY - 0.6 * s, 1.25 * s, 0, Math.PI * 2);
    ctx.arc(2.9 * s, headY - 0.6 * s, 1.25 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,30,0.75)';
    ctx.lineWidth = 1.1 * s;
    ctx.beginPath();
    ctx.arc(0, headY + 2.4 * s, 2.6 * s, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
  }

  // Props
  if (opts.carrying) {
    ctx.save();
    ctx.translate(11 * s, bodyTop - 2 * s);
    // Undo the body mirror so plated food is never drawn back-to-front.
    if (flip) ctx.scale(-1, 1);
    drawTray(ctx, opts.carrying);
    ctx.restore();
  } else if (opts.prop === 'notepad') {
    ctx.fillStyle = '#fdf8ec';
    roundRect(ctx, 8 * s, bodyTop + 8 * s, 7 * s, 8 * s, 1);
    ctx.fill();
    ctx.strokeStyle = '#b9ad95';
    ctx.lineWidth = 0.8;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(9 * s, bodyTop + (8 + i * 1.8) * s);
      ctx.lineTo(14 * s, bodyTop + (8 + i * 1.8) * s);
      ctx.stroke();
    }
  } else if (opts.prop === 'cloth') {
    ctx.fillStyle = '#8fd0e8';
    roundRect(ctx, 8 * s, bodyTop + 9 * s, 8 * s, 6 * s, 2);
    ctx.fill();
  } else if (opts.prop === 'pan') {
    ctx.fillStyle = '#4a4f55';
    roundRect(ctx, 7 * s, bodyTop + 9 * s, 11 * s, 3 * s, 1.4);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(9 * s, bodyTop + 10 * s, 5 * s, 3 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawHair(
  ctx: CanvasRenderingContext2D,
  look: Appearance,
  headY: number,
  s: number,
  away: boolean,
): void {
  ctx.fillStyle = look.hair;
  switch (look.hairStyle) {
    case 'bald':
      ctx.beginPath();
      ctx.arc(0, headY - 1.5 * s, 8.2 * s, Math.PI * 1.15, Math.PI * 1.85);
      ctx.fill();
      break;
    case 'cap':
      ctx.beginPath();
      ctx.arc(0, headY - 1 * s, 8.4 * s, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = shade(look.hair, 0.75);
      ctx.beginPath();
      ctx.ellipse(away ? 0 : 4 * s, headY - 1 * s, 8 * s, 2.2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'bun':
      ctx.beginPath();
      ctx.arc(0, headY - 0.5 * s, 8.5 * s, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-6 * s, headY - 8 * s, 4 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'long':
      ctx.beginPath();
      ctx.ellipse(0, headY + 1 * s, 9.4 * s, 10.5 * s, 0, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      roundRect(ctx, -9.4 * s, headY - 1 * s, 3.4 * s, 13 * s, 2);
      ctx.fill();
      ctx.beginPath();
      roundRect(ctx, 6 * s, headY - 1 * s, 3.4 * s, 13 * s, 2);
      ctx.fill();
      break;
    case 'curly':
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + (i / 5) * Math.PI;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 7 * s, headY + Math.sin(a) * 7 * s, 3.6 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, headY - 0.8 * s, 8.5 * s, Math.PI * 1.02, Math.PI * 1.98);
      ctx.fill();
      ctx.beginPath();
      roundRect(ctx, -8.6 * s, headY - 2.4 * s, 3 * s, 4.5 * s, 1.5);
      ctx.fill();
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

/** A plated dish, sized to sit on a table or a tray. */
export function drawPlatedDish(
  ctx: CanvasRenderingContext2D,
  dish: Dish,
  cx: number,
  cy: number,
  scale = 1,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  drawPlateBase(ctx, dish.plate);
  drawFood(ctx, dish.plate, dish.color, dish.accent);
  ctx.restore();
}

function drawPlateBase(ctx: CanvasRenderingContext2D, style: PlateStyle): void {
  if (style === 'cup') return;
  if (style === 'bowl') {
    ctx.fillStyle = '#e9e4d8';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cfc7b6';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = '#f3efe6';
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e2dccd';
  ctx.beginPath();
  ctx.ellipse(0, 0, 9.5, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFood(
  ctx: CanvasRenderingContext2D,
  style: PlateStyle,
  color: string,
  accent: string,
): void {
  switch (style) {
    case 'burger':
      ctx.fillStyle = shade(color, 1.1);
      roundRect(ctx, -7, -10, 14, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = '#7fbf5a';
      ctx.fillRect(-7.5, -6, 15, 2);
      ctx.fillStyle = accent;
      roundRect(ctx, -7, -4.5, 14, 3.5, 1.4);
      ctx.fill();
      ctx.fillStyle = shade(color, 1.05);
      roundRect(ctx, -7, -1.5, 14, 3.5, 1.6);
      ctx.fill();
      break;
    case 'fries':
      ctx.fillStyle = '#d24f3d';
      roundRect(ctx, -6, -6, 12, 8, 1.5);
      ctx.fill();
      ctx.fillStyle = color;
      for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.translate(-4.5 + i * 2.3, -7);
        ctx.rotate((i - 2) * 0.14);
        ctx.fillRect(-1, -6, 2, 8);
        ctx.restore();
      }
      break;
    case 'bowl':
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, -1.5, 8.5, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(-2, -2.5, 2.6, 1.5, 0.3, 0, Math.PI * 2);
      ctx.ellipse(3, -1.2, 2.2, 1.3, -0.2, 0, Math.PI * 2);
      ctx.fill();
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
