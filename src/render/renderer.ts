import type { Camera } from '../engine/camera';
import { depthOf, facingTowards, TILE_Z, tileToWorld, type Facing } from '../engine/iso';
import { DISHES_BY_ID } from '../game/data/dishes';
import { FURNITURE_BY_ID } from '../game/data/furniture';
import { UNIFORM } from '../game/data/people';
import type { Grid } from '../game/grid';
import { footprint } from '../game/grid';
import { timeOfDay } from '../game/progression';
import type { Game } from '../game/state';
import type { Customer, Placed, Staff } from '../game/types';
import {
  drawFloorGlow,
  drawFloorTile,
  drawLawnTile,
  drawPavingTile,
  drawPendantLamp,
  drawPlanter,
  drawPlazaTile,
  drawShopBlock,
  drawTree,
  drawWallCap,
  drawWallPanel,
  drawWindow,
  skyPalette,
  tileNoise,
  WORLD,
  type SkyPalette,
  type WallStyle,
} from './scenery';
import { diamondPath, mix, roundRect, withAlpha } from './shapes';
import { drawFurniture, drawPerson, drawPlatedDish, drawWallItem } from './sprites';

/** Height of the two back walls, in tile-height units. */
const WALL_HEIGHT = 2.35;

/**
 * Warm two-tone checker. The room reads as cream against the green streetscape
 * outside, so the tiles stay buttery rather than competing for attention.
 */
const FLOOR_A = '#fbeccb';
const FLOOR_B = '#eccb96';

const WALL_STYLE: WallStyle = {
  base: '#fff4dc',
  wainscot: '#c44536',
  trim: '#fff8ea',
};

/** Lamps hang on this spacing, in tiles, and are inset from the walls. */
const LAMP_SPACING = 3;

export interface BuildPreview {
  defId: string;
  tx: number;
  ty: number;
  rot: 0 | 1 | 2 | 3;
  valid: boolean;
}

export interface RenderOptions {
  time: number;
  hoverTile: { tx: number; ty: number } | null;
  preview: BuildPreview | null;
  /** Highlight tiles the player may act on in build mode. */
  buildMode: boolean;
  selectedUid: number | null;
}

interface Drawable {
  depth: number;
  draw: () => void;
}

export class Renderer {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly game: Game,
    private readonly grid: Grid,
    private readonly camera: Camera,
  ) {}

  render(opts: RenderOptions): void {
    const { ctx, camera } = this;
    this.grid.sync();

    const dayT = timeOfDay(this.game.data.clock);
    const sky = skyPalette(dayT);

    ctx.save();
    ctx.clearRect(0, 0, camera.viewW, camera.viewH);
    // Flat base coat so no pixel is ever left transparent, whatever the zoom.
    ctx.fillStyle = WORLD.plaza;
    ctx.fillRect(0, 0, camera.viewW, camera.viewH);

    ctx.save();
    camera.applyTo(ctx);

    // No sky: the camera looks down on the world, so ground runs to every edge.
    this.drawGround();
    this.drawOutside(opts.time);
    this.drawBuildingBase();
    this.drawFloor(opts, dayT);
    this.drawWalls(opts.time, sky);

    const overlays: Drawable[] = [];
    const sorted: Drawable[] = [];
    this.collectNeighbourhood(sorted, opts.time);
    this.collectFurniture(sorted, overlays, opts);
    this.collectActors(sorted, overlays, opts);

    sorted.sort((a, b) => a.depth - b.depth);
    for (const d of sorted) d.draw();
    for (const o of overlays.sort((a, b) => a.depth - b.depth)) o.draw();

    this.drawPreview(opts);
    this.drawLamps(opts.time);
    this.drawFloaters();
    ctx.restore();

    this.drawLighting(dayT);
    ctx.restore();
  }

  // -------------------------------------------------------------- backdrop

  /**
   * How dark the world is, 0 in the middle of the day and 1 at night. Drives the
   * lamps, their floor pools and the evening colour wash.
   */
  private darkness(dayT: number): number {
    // Trading runs 9am to 11pm, so the room only needs to darken towards the end
    // of the day; there is no dawn to account for.
    if (dayT < 0.66) return 0;
    return Math.min(1, (dayT - 0.66) / 0.26);
  }

  /** The range of tiles currently on screen, padded so nothing pops in at the edge. */
  private visibleTiles(pad = 2): { minTx: number; maxTx: number; minTy: number; maxTy: number } {
    const { camera } = this;
    const corners = [
      camera.screenToTile(0, 0),
      camera.screenToTile(camera.viewW, 0),
      camera.screenToTile(0, camera.viewH),
      camera.screenToTile(camera.viewW, camera.viewH),
    ];
    let minTx = Infinity;
    let maxTx = -Infinity;
    let minTy = Infinity;
    let maxTy = -Infinity;
    for (const c of corners) {
      minTx = Math.min(minTx, c.tx);
      maxTx = Math.max(maxTx, c.tx);
      minTy = Math.min(minTy, c.ty);
      maxTy = Math.max(maxTy, c.ty);
    }
    return {
      minTx: Math.floor(minTx) - pad,
      maxTx: Math.ceil(maxTx) + pad,
      minTy: Math.floor(minTy) - pad,
      maxTy: Math.ceil(maxTy) + pad,
    };
  }

  /** How far outside the building a tile is, in tiles. Zero means inside. */
  private outsideBy(tx: number, ty: number): number {
    const size = this.grid.size;
    const dx = Math.max(-1 - tx, tx - size, 0);
    const dy = Math.max(-1 - ty, ty - size, 0);
    return Math.max(dx, dy);
  }

  /**
   * The town is laid out on blocks of this many tiles, the outer ring of which is
   * street. Structure beats noise here: streets and blocks read as a place,
   * whereas randomly scattered greenery reads as a patchwork quilt.
   */
  private static readonly BLOCK = 6;
  private static readonly STREET = 2;
  /** Tiles this close to the restaurant stay clear paving, for the queue. */
  private static readonly CLEARANCE = 2;

  /** Where a tile falls in the town plan. */
  private plotOf(tx: number, ty: number): {
    street: boolean;
    kind: 'lawn' | 'build' | 'square';
    bx: number;
    by: number;
  } {
    const { BLOCK, STREET } = Renderer;
    const bx = Math.floor(tx / BLOCK);
    const by = Math.floor(ty / BLOCK);
    const ix = tx - bx * BLOCK;
    const iy = ty - by * BLOCK;
    const roll = tileNoise(bx * 31 + 11, by * 17 + 5);
    return {
      street: ix < STREET || iy < STREET,
      kind: roll < 0.4 ? 'build' : roll < 0.85 ? 'lawn' : 'square',
      bx,
      by,
    };
  }

  /** Streets, squares and planted blocks, stretching to every edge of the screen. */
  private drawGround(): void {
    const { ctx } = this;
    const view = this.visibleTiles();

    for (let ty = view.minTy; ty <= view.maxTy; ty++) {
      for (let tx = view.minTx; tx <= view.maxTx; tx++) {
        // Paved under the building too. The slab and floor cover it, and painting
        // it anyway means the wall ring can never be left as a hole.
        if (this.grid.isFloor(tx, ty)) continue;
        const c = this.tileCentre(tx, ty);
        const n = tileNoise(tx, ty);
        const plot = this.plotOf(tx, ty);
        const clear = this.outsideBy(tx, ty) < Renderer.CLEARANCE;
        if (!plot.street && plot.kind === 'lawn' && !clear) {
          drawLawnTile(ctx, c.x, c.y, n);
        } else {
          // Roadway reads a shade cooler than the squares it connects, which is
          // what makes the town plan legible from above.
          drawPlazaTile(ctx, c.x, c.y, n, plot.street && !clear);
        }
      }
    }
  }

  /**
   * Trees and neighbouring shopfronts, added to the depth-sorted pass so they
   * occlude and are occluded by the restaurant correctly.
   */
  private collectNeighbourhood(out: Drawable[], time: number): void {
    const { ctx } = this;
    const { BLOCK, STREET } = Renderer;
    const view = this.visibleTiles(BLOCK);
    const doorX = this.grid.doorX;

    // A building fills the interior of its block; trees dot the planted ones.
    for (let by = Math.floor(view.minTy / BLOCK); by <= Math.floor(view.maxTy / BLOCK); by++) {
      for (let bx = Math.floor(view.minTx / BLOCK); bx <= Math.floor(view.maxTx / BLOCK); bx++) {
        const inner = BLOCK - STREET;
        const x0 = bx * BLOCK + STREET;
        const y0 = by * BLOCK + STREET;
        const plot = this.plotOf(x0, y0);
        const seed = bx * 137 + by * 29;

        // A tile is free for planting if it clears the restaurant and its queue.
        const free = (tx: number, ty: number): boolean =>
          this.outsideBy(tx, ty) >= Renderer.CLEARANCE &&
          !(Math.abs(tx - doorX) <= 1 && ty < 0);

        // A building fills its whole block, so it needs the whole block clear.
        // Blocks that cannot take one are planted with trees instead, which keeps
        // the ground near the restaurant furnished rather than bare.
        let roomForBlock = plot.kind === 'build';
        for (let ty = y0; roomForBlock && ty < y0 + inner; ty++) {
          for (let tx = x0; tx < x0 + inner; tx++) {
            if (!free(tx, ty)) {
              roomForBlock = false;
              break;
            }
          }
        }

        if (roomForBlock) {
          const span = inner - 1;
          const height = 1.5 + tileNoise(seed, 9) * 2.2;
          const cx = x0 + inner / 2;
          const cy = y0 + inner / 2;
          const c = tileToWorld(cx, cy);
          out.push({
            depth: depthOf(cx, cy, height),
            draw: () => drawShopBlock(ctx, c.x, c.y, span, height, seed),
          });
        } else if (plot.kind !== 'square') {
          for (let ty = y0; ty < y0 + inner; ty += 2) {
            for (let tx = x0; tx < x0 + inner; tx += 2) {
              if (!free(tx, ty)) continue;
              if (tileNoise(tx * 13 + 5, ty * 29 + 7) < 0.34) continue;
              const c = this.tileCentre(tx, ty);
              const s = tx * 131 + ty;
              out.push({
                depth: depthOf(tx, ty, 1),
                draw: () => drawTree(ctx, c.x, c.y, time, s),
              });
            }
          }
        }
      }
    }
  }

  /**
   * The building sits on a raised slab. Seeing its thickness is what stops the
   * room reading as a flat drawing pasted onto the ground.
   */
  private drawBuildingBase(): void {
    const { ctx } = this;
    const size = this.grid.size;
    const lip = 0.4 * TILE_Z;

    // Corners of the floor diamond, extended half a tile so the slab oversails.
    const o = 0.35;
    const north = tileToWorld(-o, -o);
    const east = tileToWorld(size + o, -o);
    const south = tileToWorld(size + o, size + o);
    const west = tileToWorld(-o, size + o);

    // The building's own shadow, thrown down and to the right because the light
    // sits up and to the left. This is what stops the room looking like a drawing
    // laid flat on the ground.
    const sx = 26;
    const sy = 15;
    ctx.fillStyle = 'rgba(58, 40, 30, 0.2)';
    ctx.beginPath();
    ctx.moveTo(north.x + sx, north.y + sy);
    ctx.lineTo(east.x + sx, east.y + sy);
    ctx.lineTo(south.x + sx, south.y + lip + sy);
    ctx.lineTo(west.x + sx, west.y + lip + sy);
    ctx.closePath();
    ctx.fill();

    // Tighter contact shadow where the slab actually meets the ground.
    ctx.fillStyle = 'rgba(40, 28, 22, 0.2)';
    ctx.beginPath();
    ctx.moveTo(north.x, north.y + 6);
    ctx.lineTo(east.x + 8, east.y + 6);
    ctx.lineTo(south.x, south.y + lip + 11);
    ctx.lineTo(west.x - 8, west.y + 6);
    ctx.closePath();
    ctx.fill();

    // The two side faces facing the camera.
    ctx.fillStyle = '#a98a6a';
    ctx.beginPath();
    ctx.moveTo(west.x, west.y);
    ctx.lineTo(south.x, south.y);
    ctx.lineTo(south.x, south.y + lip);
    ctx.lineTo(west.x, west.y + lip);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#c2a07c';
    ctx.beginPath();
    ctx.moveTo(south.x, south.y);
    ctx.lineTo(east.x, east.y);
    ctx.lineTo(east.x, east.y + lip);
    ctx.lineTo(south.x, south.y + lip);
    ctx.closePath();
    ctx.fill();

    // Top of the slab, which frames the floor as a skirt of stone.
    ctx.fillStyle = '#dcc09a';
    ctx.beginPath();
    ctx.moveTo(north.x, north.y);
    ctx.lineTo(east.x, east.y);
    ctx.lineTo(south.x, south.y);
    ctx.lineTo(west.x, west.y);
    ctx.closePath();
    ctx.fill();
  }

  /** Paving and street dressing outside the entrance. */
  private drawOutside(time: number): void {
    const { ctx } = this;
    const size = this.grid.size;
    const doorX = this.grid.doorX;

    // Paving outside the door, drawn as a path rather than as a full-width apron.
    // Because "outside" is north of the room it projects above the wall tops, and
    // a plane spanning the whole frontage there reads as a roof; a narrow path
    // that fades out at its edges reads as ground leading away from the door.
    const reach = 3.4;
    for (let ty = -4; ty <= -1; ty++) {
      for (let tx = doorX - 3; tx <= doorX + 3; tx++) {
        if (this.grid.isFloor(tx, ty) || this.grid.isWallTile(tx, ty)) continue;
        const d = Math.hypot(tx + 0.5 - (doorX + 0.5), (ty + 0.5) * 1.15);
        if (d > reach) continue;
        const c = this.tileCentre(tx, ty);
        ctx.save();
        // Feather the last of the paving so it dissolves into the distance.
        ctx.globalAlpha = Math.min(1, (reach - d) / 1.1);
        drawPavingTile(ctx, c.x, c.y, tileNoise(tx, ty));
        ctx.restore();
      }
    }

    // Entry mat leading to the door.
    for (const ty of [-2, -1]) {
      const c = this.tileCentre(doorX, ty);
      diamondPath(ctx, c.x, c.y, 0.92, 0.92);
      ctx.fillStyle = ty === -1 ? '#c73a2e' : '#9d261c';
      ctx.fill();
    }

    // Planters flanking the door.
    for (const dx of [-2, 2]) {
      const tx = doorX + dx;
      if (tx < 0 || tx >= size) continue;
      const c = this.tileCentre(tx, -1);
      drawPlanter(ctx, c.x, c.y, time, tx * 7 + 3);
    }
  }

  /**
   * Soft shadow thrown onto the floor by one of the two back walls, fading out
   * about a tile into the room.
   */
  private drawWallShadow(size: number, side: 'nw' | 'ne'): void {
    const { ctx } = this;
    const reach = side === 'nw' ? 1.05 : 0.8;
    // The north-east wall faces the light, so it casts the shorter shadow.
    const depth = side === 'nw' ? 0.34 : 0.24;

    const at = (along: number, into: number) =>
      side === 'nw' ? tileToWorld(into, along) : tileToWorld(along, into);

    const near0 = at(0, 0);
    const near1 = at(size, 0);
    const far0 = at(0, reach);
    const far1 = at(size, reach);

    const g = ctx.createLinearGradient(near0.x, near0.y, far0.x, far0.y);
    g.addColorStop(0, `rgba(88, 52, 34, ${depth})`);
    g.addColorStop(0.5, `rgba(88, 52, 34, ${depth * 0.34})`);
    g.addColorStop(1, 'rgba(88, 52, 34, 0)');

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(near0.x, near0.y);
    ctx.lineTo(near1.x, near1.y);
    ctx.lineTo(far1.x, far1.y);
    ctx.lineTo(far0.x, far0.y);
    ctx.closePath();
    ctx.fill();
  }

  private tileCentre(tx: number, ty: number): { x: number; y: number } {
    return tileToWorld(tx + 0.5, ty + 0.5);
  }

  // ----------------------------------------------------------------- floor

  private drawFloor(opts: RenderOptions, dayT: number): void {
    const { ctx } = this;
    const size = this.grid.size;

    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const c = this.tileCentre(tx, ty);
        const base = (tx + ty) % 2 === 0 ? FLOOR_A : FLOOR_B;
        drawFloorTile(ctx, c.x, c.y, base, tileNoise(tx, ty));
        if (this.game.data.settings.showGrid || opts.buildMode) {
          diamondPath(ctx, c.x, c.y, 1, 1);
          ctx.strokeStyle = 'rgba(168, 42, 32, 0.14)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // The walls cast into the room. Seeing the floor darken as it meets them is
    // what makes the two planes read as meeting at a right angle.
    this.drawWallShadow(size, 'nw');
    this.drawWallShadow(size, 'ne');

    // Warm pools under the pendant lamps, laid on the floor before any props so
    // that furniture and diners sit inside the light rather than under it.
    const strength = 0.09 + this.darkness(dayT) * 0.26;
    for (const [tx, ty] of this.lampTiles()) {
      const c = this.tileCentre(tx, ty);
      drawFloorGlow(ctx, c.x, c.y, 3.1, '#ffcf8a', strength);
    }

    // Daylight falling through each window onto the floor inside.
    const day = 1 - this.darkness(dayT);
    if (day > 0.15) {
      for (const tx of this.windowTiles()) {
        const c = this.tileCentre(tx, 0.4);
        drawFloorGlow(ctx, c.x, c.y, 2.4, '#fff3d2', 0.13 * day);
      }
    }

    // Rugs lie flat on the floor and are walked over.
    for (const p of this.game.data.placed) {
      const def = this.game.defOf(p);
      if (def?.role !== 'rug') continue;
      const c = this.footprintCentre(p);
      drawFurniture(ctx, def, c.x, c.y, { time: opts.time });
    }

    if (opts.hoverTile && this.grid.isFloor(opts.hoverTile.tx, opts.hoverTile.ty) && !opts.preview) {
      const c = this.tileCentre(opts.hoverTile.tx, opts.hoverTile.ty);
      diamondPath(ctx, c.x, c.y, 0.98, 0.98);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
  }

  private footprintCentre(p: Placed): { x: number; y: number } {
    const def = this.game.defOf(p);
    if (!def) return this.tileCentre(p.tx, p.ty);
    const tiles = footprint(def, p.tx, p.ty, p.rot);
    let sx = 0;
    let sy = 0;
    for (const [tx, ty] of tiles) {
      sx += tx;
      sy += ty;
    }
    return tileToWorld(sx / tiles.length + 0.5, sy / tiles.length + 0.5);
  }

  // ----------------------------------------------------------------- walls

  /** Tiles on the north-east wall that carry a window rather than bare panelling. */
  private windowTiles(): number[] {
    const size = this.grid.size;
    const doorX = this.grid.doorX;
    const taken = new Set(
      this.game.data.placed
        .filter((p) => this.game.defOf(p)?.role === 'wallDecor' && p.ty === -1)
        .map((p) => p.tx),
    );
    return [1, size - 2, Math.floor(size / 2)].filter(
      (tx, i, all) =>
        tx > 0 &&
        tx < size - 1 &&
        Math.abs(tx - doorX) > 1 &&
        !taken.has(tx) &&
        all.indexOf(tx) === i,
    );
  }

  /** Floor tiles a pendant lamp hangs over. */
  private lampTiles(): Array<[number, number]> {
    const size = this.grid.size;
    const out: Array<[number, number]> = [];
    for (let ty = 1; ty <= size - 2; ty += LAMP_SPACING) {
      for (let tx = 1; tx <= size - 2; tx += LAMP_SPACING) {
        if (this.grid.isFloor(tx, ty)) out.push([tx, ty]);
      }
    }
    return out;
  }

  private drawLamps(time: number): void {
    for (const [tx, ty] of this.lampTiles()) {
      const c = this.tileCentre(tx, ty);
      drawPendantLamp(this.ctx, c.x, c.y, time, true);
    }
  }

  private drawWalls(time: number, sky: SkyPalette): void {
    const { ctx } = this;
    const size = this.grid.size;
    const h = WALL_HEIGHT * TILE_Z;
    const glass: readonly [string, string] = [sky.top, sky.mid];

    // North-west wall (tx === -1), facing down-right.
    for (let ty = 0; ty < size; ty++) {
      const a = tileToWorld(0, ty);
      const b = tileToWorld(0, ty + 1);
      drawWallPanel(ctx, a, b, h, WALL_STYLE, 'nw');
      drawWallCap(ctx, a, b, h, WALL_STYLE, 'nw');
    }
    // North-east wall (ty === -1), facing down-left, with a gap for the door.
    const windows = new Set(this.windowTiles());
    for (let tx = 0; tx < size; tx++) {
      if (tx === this.grid.doorX) continue;
      const a = tileToWorld(tx, 0);
      const b = tileToWorld(tx + 1, 0);
      drawWallPanel(ctx, a, b, h, WALL_STYLE, 'ne');
      if (windows.has(tx)) drawWindow(ctx, a, b, h, glass, 'ne');
      drawWallCap(ctx, a, b, h, WALL_STYLE, 'ne');
    }

    this.drawDoorFrame(h);

    for (const p of this.game.data.placed) {
      const def = this.game.defOf(p);
      if (def?.role !== 'wallDecor') continue;
      if (p.ty === -1) {
        const base = tileToWorld(p.tx + 0.5, 0);
        drawWallItem(ctx, def, base.x, base.y, 'ne', time);
      } else if (p.tx === -1) {
        const base = tileToWorld(0, p.ty + 0.5);
        drawWallItem(ctx, def, base.x, base.y, 'nw', time);
      }
    }
  }

  private drawDoorFrame(h: number): void {
    const { ctx } = this;
    const doorX = this.grid.doorX;
    const a = tileToWorld(doorX, 0);
    const b = tileToWorld(doorX + 1, 0);

    ctx.fillStyle = '#8a2a20';
    const post = 5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - h);
    ctx.lineTo(a.x + post, a.y - h + post * 0.5);
    ctx.lineTo(a.x + post, a.y + post * 0.5);
    ctx.lineTo(a.x, a.y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b.x - post, b.y - h - post * 0.5);
    ctx.lineTo(b.x, b.y - h);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x - post, b.y - post * 0.5);
    ctx.closePath();
    ctx.fill();
    // Lintel
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - h);
    ctx.lineTo(b.x, b.y - h);
    ctx.lineTo(b.x, b.y - h + 9);
    ctx.lineTo(a.x, a.y - h + 9);
    ctx.closePath();
    ctx.fill();

    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2 - h - 6;
    this.drawDoorSign(midX, midY);
  }

  /** Hanging board with the restaurant name, plus the OPEN/CLOSED plaque. */
  private drawDoorSign(midX: number, midY: number): void {
    const { ctx } = this;
    const raw = (this.game.data.restaurantName || 'Diner Town').trim() || 'Diner Town';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 8px Fredoka, Nunito, system-ui, sans-serif';
    let label = raw;
    const maxW = 76;
    if (ctx.measureText(label).width > maxW) {
      ctx.font = '700 7px Fredoka, Nunito, system-ui, sans-serif';
    }
    if (ctx.measureText(label).width > maxW) {
      while (label.length > 2 && ctx.measureText(`${label}…`).width > maxW) {
        label = label.slice(0, -1);
      }
      label = `${label}…`;
    }
    const bw = Math.max(50, ctx.measureText(label).width + 12);
    const signY = midY - 20;

    ctx.strokeStyle = '#8a2a20';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(midX - bw / 2 + 7, signY - 8);
    ctx.lineTo(midX - bw / 2 + 7, signY - 13);
    ctx.moveTo(midX + bw / 2 - 7, signY - 8);
    ctx.lineTo(midX + bw / 2 - 7, signY - 13);
    ctx.stroke();

    ctx.fillStyle = '#fff6e4';
    roundRect(ctx, midX - bw / 2, signY - 8, bw, 16, 3);
    ctx.fill();
    ctx.strokeStyle = '#c73a2e';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#8a2a20';
    ctx.fillText(label, midX, signY);

    const open = this.game.data.open;
    ctx.fillStyle = open ? '#2f9d5c' : '#c73a2e';
    roundRect(ctx, midX - 22, midY - 8, 44, 13, 3);
    ctx.fill();
    ctx.fillStyle = '#fff8ea';
    ctx.font = '700 8px Fredoka, Nunito, system-ui, sans-serif';
    ctx.fillText(open ? 'OPEN' : 'CLOSED', midX, midY - 1);
  }

  // ------------------------------------------------------------- furniture

  private collectFurniture(
    out: Drawable[],
    overlays: Drawable[],
    opts: RenderOptions,
  ): void {
    const { ctx } = this;
    const cookingStoves = new Map<number, number>();
    for (const order of this.game.orders) {
      if (order.state === 'cooking' && order.stoveUid !== null) {
        cookingStoves.set(order.stoveUid, order.progress);
      }
    }

    for (const p of this.game.data.placed) {
      const def = this.game.defOf(p);
      if (!def || def.role === 'rug' || def.role === 'wallDecor') continue;
      const c = this.footprintCentre(p);
      const progress = cookingStoves.get(p.uid);
      const selected = opts.selectedUid === p.uid;

      out.push({
        depth: depthOf(p.tx, p.ty, 0, def.role === 'table' ? 0.1 : 0),
        draw: () => {
          if (selected) {
            diamondPath(ctx, c.x, c.y, 1.02, 1.02);
            ctx.fillStyle = 'rgba(120, 220, 160, 0.35)';
            ctx.fill();
            ctx.strokeStyle = '#7ce0a4';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          drawFurniture(ctx, def, c.x, c.y, {
            time: opts.time,
            dirty: p.dirty,
            active: progress !== undefined,
          });
          // Plates waiting to be collected.
          const plates = p.plates ?? [];
          plates.forEach((orderId, i) => {
            const order = this.game.orders.find((o) => o.id === orderId);
            const dish = order ? DISHES_BY_ID[order.dishId] : undefined;
            if (!dish) return;
            const lift = def.role === 'stove' ? 0.68 : 0.62;
            drawPlatedDish(
              ctx,
              dish,
              c.x + (i - (plates.length - 1) / 2) * 13,
              c.y - lift * TILE_Z,
              0.85,
            );
          });
        },
      });

      if (progress !== undefined) {
        overlays.push({
          depth: depthOf(p.tx, p.ty, 4),
          draw: () => this.progressBar(c.x, c.y - 1.5 * TILE_Z, progress, '#f2a13c'),
        });
      }
      if (p.dirty) {
        overlays.push({
          depth: depthOf(p.tx, p.ty, 4),
          draw: () => this.badge(c.x, c.y - 1.35 * TILE_Z, '#c98b3a', 'dirty'),
        });
      }
    }
  }

  // ---------------------------------------------------------------- actors

  private collectActors(out: Drawable[], overlays: Drawable[], opts: RenderOptions): void {
    const { ctx } = this;

    for (const c of this.game.customers) {
      const w = tileToWorld(c.tx + 0.5, c.ty + 0.5);
      const sitting = c.state === 'deciding' || c.state === 'awaitingWaiter' ||
        c.state === 'ordering' || c.state === 'awaitingFood' || c.state === 'eating';
      const facing = this.customerFacing(c);
      out.push({
        depth: depthOf(c.tx, c.ty, 0, sitting ? 0.4 : 0.3),
        draw: () => {
          drawPerson(ctx, c.look, w.x, w.y, {
            facing,
            time: opts.time + c.id,
            walking: c.path.length > 0 || c.state === 'leaving',
            sitting,
          });
          // The meal in front of a diner who is eating.
          if (c.state === 'eating' && c.dishId) {
            const dish = DISHES_BY_ID[c.dishId];
            const table = c.tableUid !== null ? this.game.placedByUid(c.tableUid) : null;
            if (dish && table) {
              const t = this.footprintCentre(table);
              drawPlatedDish(ctx, dish, t.x, t.y - 0.62 * TILE_Z, 0.9);
            }
          }
        },
      });

      overlays.push({
        depth: depthOf(c.tx, c.ty, 5),
        draw: () => this.customerBubble(c, w.x, w.y),
      });
    }

    for (const s of this.game.data.staff) {
      const w = tileToWorld(s.tx + 0.5, s.ty + 0.5);
      const dish = s.carryDishId ? DISHES_BY_ID[s.carryDishId] : null;
      const facing = this.staffFacing(s);
      out.push({
        depth: depthOf(s.tx, s.ty, 0, 0.35),
        draw: () =>
          drawPerson(ctx, s.look, w.x, w.y, {
            facing,
            time: opts.time + s.id * 0.7,
            walking: s.path.length > 0,
            sitting: false,
            uniform: UNIFORM[s.role],
            carrying: dish,
            prop: this.staffProp(s),
          }),
      });
      overlays.push({
        depth: depthOf(s.tx, s.ty, 5),
        draw: () => this.staffBadge(s, w.x, w.y),
      });
    }
  }

  private staffProp(s: Staff): 'notepad' | 'cloth' | 'pan' | null {
    if (s.carryDishId) return null;
    if (s.state === 'takingOrder') return 'notepad';
    if (s.state === 'cleaning') return 'cloth';
    if (s.state === 'cooking') return 'pan';
    return null;
  }

  private customerFacing(c: Customer): Facing {
    if (c.path.length) {
      const [nx, ny] = c.path[0]!;
      return facingTowards(c.tx, c.ty, nx, ny);
    }
    if (c.tableUid !== null) {
      const table = this.game.placedByUid(c.tableUid);
      if (table) return facingTowards(c.tx, c.ty, table.tx, table.ty);
    }
    return 'se';
  }

  private staffFacing(s: Staff): Facing {
    if (s.path.length) {
      const [nx, ny] = s.path[0]!;
      return facingTowards(s.tx, s.ty, nx, ny);
    }
    if (s.targetUid !== null) {
      const t = this.game.placedByUid(s.targetUid);
      if (t) return facingTowards(s.tx, s.ty, t.tx, t.ty);
    }
    if (s.targetCustomerId !== null) {
      const c = this.game.customers.find((x) => x.id === s.targetCustomerId);
      if (c) return facingTowards(s.tx, s.ty, c.tx, c.ty);
    }
    return 'se';
  }

  // -------------------------------------------------------------- overlays

  private customerBubble(c: Customer, x: number, y: number): void {
    const { ctx } = this;
    const top = y - 2.3 * TILE_Z;
    if (c.state === 'leaving' || c.state === 'walkingToSeat' || c.state === 'entering') return;

    const showPatience =
      c.state === 'queueing' || c.state === 'awaitingWaiter' || c.state === 'awaitingFood';

    ctx.save();
    // Bubble
    ctx.fillStyle = 'rgba(255,248,234,0.96)';
    roundRect(ctx, x - 16, top - 16, 32, 28, 10);
    ctx.fill();
    ctx.strokeStyle = '#c73a2e';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4, top + 11);
    ctx.lineTo(x, top + 18);
    ctx.lineTo(x + 4, top + 11);
    ctx.closePath();
    ctx.fillStyle = '#fff8ea';
    ctx.fill();
    ctx.stroke();

    if (c.state === 'deciding') {
      ctx.fillStyle = '#c73a2e';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(x + i * 6, top - 2, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (c.dishId) {
      const dish = DISHES_BY_ID[c.dishId];
      if (dish) drawPlatedDish(ctx, dish, x, top + 3, 0.72);
    } else {
      ctx.fillStyle = '#8a4e32';
      ctx.font = '700 15px Fredoka, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x, top - 1);
    }

    if (showPatience) {
      const p = c.patience;
      const color = p > 0.55 ? '#5fbf6a' : p > 0.28 ? '#e8b53c' : '#e05a4a';
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, top - 2, 17, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, top - 2, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      ctx.stroke();
    }
    ctx.restore();
  }

  private staffBadge(s: Staff, x: number, y: number): void {
    const { ctx } = this;
    if (s.state === 'exhausted') {
      ctx.save();
      ctx.fillStyle = '#fff8ea';
      ctx.font = '700 13px Fredoka, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.35 + i * 0.22;
        ctx.fillText('z', x + 8 + i * 6, y - 2.3 * TILE_Z - i * 8);
      }
      ctx.restore();
      return;
    }
    if (s.energy < 25) {
      this.badge(x, y - 2.15 * TILE_Z, '#e0a33c', 'tired');
    }
  }

  private badge(x: number, y: number, color: string, label: string): void {
    const { ctx } = this;
    ctx.save();
    ctx.font = '700 9px Fredoka, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = color;
    roundRect(ctx, x - w / 2, y - 8, w, 15, 7);
    ctx.fill();
    ctx.fillStyle = '#fff8ea';
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  private progressBar(x: number, y: number, value: number, color: string): void {
    const { ctx } = this;
    const w = 34;
    ctx.save();
    ctx.fillStyle = 'rgba(20,14,10,0.65)';
    roundRect(ctx, x - w / 2, y, w, 7, 3.5);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, x - w / 2 + 1.5, y + 1.5, Math.max(2, (w - 3) * value), 4, 2);
    ctx.fill();
    ctx.restore();
  }

  private drawFloaters(): void {
    const { ctx } = this;
    ctx.save();
    ctx.font = '700 13px Fredoka, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.game.floaters) {
      const t = 1 - f.life / f.maxLife;
      const w = tileToWorld(f.tx + 0.5, f.ty + 0.5);
      const y = w.y - 2.6 * TILE_Z - t * 26;
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,14,10,0.75)';
      ctx.strokeText(f.text, w.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, w.x, y);
    }
    ctx.restore();
  }

  // ----------------------------------------------------------- build ghost

  private drawPreview(opts: RenderOptions): void {
    const preview = opts.preview;
    if (!preview) return;
    const def = FURNITURE_BY_ID[preview.defId];
    if (!def) return;
    const { ctx } = this;

    if (def.role === 'wallDecor') {
      const onNorthEast = preview.ty === -1;
      const base = onNorthEast
        ? tileToWorld(preview.tx + 0.5, 0)
        : tileToWorld(0, preview.ty + 0.5);
      if (preview.tx !== -1 && !onNorthEast) return;

      // Outline the wall panel the item would hang on.
      const a = onNorthEast ? tileToWorld(preview.tx, 0) : tileToWorld(0, preview.ty);
      const b = onNorthEast ? tileToWorld(preview.tx + 1, 0) : tileToWorld(0, preview.ty + 1);
      const h = WALL_HEIGHT * TILE_Z;
      ctx.save();
      ctx.fillStyle = preview.valid ? 'rgba(110, 220, 150, 0.3)' : 'rgba(230, 90, 80, 0.3)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - h);
      ctx.lineTo(b.x, b.y - h);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(a.x, a.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.7;
      drawWallItem(ctx, def, base.x, base.y, onNorthEast ? 'ne' : 'nw', opts.time);
      ctx.restore();
      return;
    }

    const tiles = footprint(def, preview.tx, preview.ty, preview.rot);
    for (const [tx, ty] of tiles) {
      const c = this.tileCentre(tx, ty);
      diamondPath(ctx, c.x, c.y, 0.98, 0.98);
      ctx.fillStyle = preview.valid ? 'rgba(110, 220, 150, 0.38)' : 'rgba(230, 90, 80, 0.38)';
      ctx.fill();
      ctx.strokeStyle = preview.valid ? '#7ce0a4' : '#f07a6e';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    let sx = 0;
    let sy = 0;
    for (const [tx, ty] of tiles) {
      sx += tx;
      sy += ty;
    }
    const c = tileToWorld(sx / tiles.length + 0.5, sy / tiles.length + 0.5);
    drawFurniture(ctx, def, c.x, c.y, { time: opts.time, ghost: true });
  }

  // -------------------------------------------------------------- lighting

  /** A single translucent wash sells the passage of the trading day. */
  private drawLighting(t: number): void {
    const { ctx, camera } = this;
    let tint = 'rgba(0,0,0,0)';
    if (t < 0.12) tint = withAlpha('#ffb168', 0.16 * (1 - t / 0.12));
    else if (t > 0.68) {
      const k = Math.min(1, (t - 0.68) / 0.32);
      tint = withAlpha(mix('#ff9a4d', '#2b3f6b', k), 0.1 + k * 0.3);
    }
    if (tint !== 'rgba(0,0,0,0)') {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, camera.viewW, camera.viewH);
    }

    // A soft vignette keeps the eye on the dining room.
    const g = ctx.createRadialGradient(
      camera.viewW / 2, camera.viewH / 2, Math.min(camera.viewW, camera.viewH) * 0.35,
      camera.viewW / 2, camera.viewH / 2, Math.max(camera.viewW, camera.viewH) * 0.75,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(80, 40, 16, 0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, camera.viewW, camera.viewH);
  }
}
