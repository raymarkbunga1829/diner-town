import type { Camera } from '../engine/camera';
import type { Fx } from '../engine/fx';
import { depthOf, facingTowards, TILE_W, TILE_Z, tileToWorld, type Facing } from '../engine/iso';
import { DISHES_BY_ID } from '../game/data/dishes';
import { FURNITURE_BY_ID } from '../game/data/furniture';
import { UNIFORM } from '../game/data/people';
import type { Grid } from '../game/grid';
import { footprint } from '../game/grid';
import { timeOfDay } from '../game/progression';
import type { Game } from '../game/state';
import type { Customer, Placed, Staff } from '../game/types';
import {
  drawBench,
  drawFloorGlow,
  drawFloorTile,
  drawHedge,
  drawLawnTile,
  drawPathTile,
  drawPaveTile,
  drawPendantLamp,
  drawPlanter,
  drawPlazaTile,
  drawRoadTile,
  drawShopBlock,
  drawStall,
  drawStreetLamp,
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
 * The box the building occupies on screen, in world pixels: the floor diamond
 * plus the slab that oversails it, the walls standing above it and headroom for
 * the hanging sign. The camera frames this, so it lives next to the code that
 * decides how tall the walls are.
 */
export function buildingBox(size: number): { x: number; y: number; w: number; h: number } {
  const o = 0.4;
  const west = tileToWorld(-o, size + o);
  const east = tileToWorld(size + o, -o);
  const north = tileToWorld(-o, -o);
  const south = tileToWorld(size + o, size + o);
  const top = north.y - WALL_HEIGHT * TILE_Z - 34;
  const bottom = south.y + 0.4 * TILE_Z;
  return { x: west.x, y: top, w: east.x - west.x, h: bottom - top };
}

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
    const night = this.darkness(dayT);
    this.updateBounds();

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
    this.drawFloor(opts, night);
    this.drawWalls(opts.time, sky);

    const overlays: Drawable[] = [];
    const sorted: Drawable[] = [];
    this.collectNeighbourhood(sorted, opts.time, night);
    this.collectFurniture(sorted, overlays, opts);
    this.collectActors(sorted, overlays, opts);

    sorted.sort((a, b) => a.depth - b.depth);
    for (const d of sorted) d.draw();
    for (const o of overlays.sort((a, b) => a.depth - b.depth)) o.draw();

    this.drawPreview(opts);
    this.drawLamps(opts.time, night);
    this.drawParticles();
    this.drawFloaters();
    ctx.restore();

    this.drawLighting(dayT, night);
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

  /** World-space bounds of the viewport, refreshed once a frame. */
  private bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };

  private updateBounds(): void {
    const { camera } = this;
    const tl = camera.screenToWorld(0, 0);
    const br = camera.screenToWorld(camera.viewW, camera.viewH);
    this.bounds = { x0: tl.x, y0: tl.y, x1: br.x, y1: br.y };
  }

  /**
   * Whether a prop standing on this tile could show up on screen. The town keeps
   * generating shopfronts and trees well past the edges of the view, and drawing
   * the ones nobody can see is the easiest frame time there is to give back.
   */
  private inView(tx: number, ty: number, height = 1, spread = 44): boolean {
    const w = tileToWorld(tx + 0.5, ty + 0.5);
    const b = this.bounds;
    return (
      w.x + spread > b.x0 &&
      w.x - spread < b.x1 &&
      w.y + 32 > b.y0 &&
      w.y - height * TILE_Z - 32 < b.y1
    );
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
   * The near field is laid out as rings out from the building: pavement, a
   * two-lane road, pavement again. That is what puts the diner on a street corner
   * instead of in the middle of a field, and it works at any grid size.
   */
  private static readonly ROAD_FROM = 2;
  private static readonly ROAD_TO = 3;
  /** Grass verge between the road and the buildings opposite. */
  private static readonly VERGE = 4;
  /** The terrace of shops facing the restaurant occupies this band. */
  private static readonly TERRACE_FROM = 6;
  private static readonly TERRACE_TO = 8;
  /** Beyond the terrace the town falls back to a block lattice. */
  private static readonly BLOCK = 7;
  private static readonly STREET = 1;
  /** Tiles of street frontage per shop in the terrace. */
  private static readonly UNIT = 4;

  /** Where a tile falls in the near-field street plan. */
  private ringOf(tx: number, ty: number): 'inside' | 'pave' | 'road' | 'verge' | 'town' {
    const d = this.outsideBy(tx, ty);
    if (d === 0) return 'inside';
    if (d >= Renderer.ROAD_FROM && d <= Renderer.ROAD_TO) return 'road';
    if (d === Renderer.VERGE) return 'verge';
    if (d >= Renderer.TERRACE_FROM) return 'town';
    return 'pave';
  }

  /** True in the band of ground the facing terrace of shops is built on. */
  private inTerrace(tx: number, ty: number): boolean {
    const d = this.outsideBy(tx, ty);
    return d >= Renderer.TERRACE_FROM && d <= Renderer.TERRACE_TO;
  }

  /**
   * The block lattice used beyond the terrace. Split into two allocation-free
   * lookups rather than one descriptor, because the ground pass asks about every
   * visible tile on every frame.
   */
  private isLatticeStreet(tx: number, ty: number): boolean {
    const { BLOCK, STREET } = Renderer;
    return (
      tx - Math.floor(tx / BLOCK) * BLOCK < STREET ||
      ty - Math.floor(ty / BLOCK) * BLOCK < STREET
    );
  }

  private plotKind(tx: number, ty: number): 'park' | 'build' | 'square' {
    const { BLOCK } = Renderer;
    const roll = tileNoise(
      Math.floor(tx / BLOCK) * 31 + 11,
      Math.floor(ty / BLOCK) * 17 + 5,
    );
    return roll < 0.62 ? 'build' : roll < 0.88 ? 'park' : 'square';
  }

  /**
   * True on the strip of ground guests queue along. Nothing is ever parked here,
   * which also leaves a clear sight line from the door out to the street.
   */
  private isApproach(tx: number, ty: number): boolean {
    return Math.abs(tx - this.grid.doorX) <= 1 && ty < 0 && ty > -6;
  }

  /** Streets, squares and planted blocks, stretching to every edge of the screen. */
  private drawGround(): void {
    const { ctx } = this;
    const view = this.visibleTiles();
    const doorX = this.grid.doorX;

    for (let ty = view.minTy; ty <= view.maxTy; ty++) {
      for (let tx = view.minTx; tx <= view.maxTx; tx++) {
        // Paved under the building too. The slab and floor cover it, and painting
        // it anyway means the wall ring can never be left as a hole.
        if (this.grid.isFloor(tx, ty)) continue;
        const c = this.tileCentre(tx, ty);
        const n = tileNoise(tx, ty);
        const ring = this.ringOf(tx, ty);

        if (ring === 'road') {
          const d = this.outsideBy(tx, ty);
          // The crossing lands square in front of the door, and its bars run
          // along the road, which here is the axis the door does not face.
          const crossing = Math.abs(tx - doorX) <= 1 && ty < 0 ? 'x' : undefined;
          drawRoadTile(ctx, c.x, c.y, n, {
            crossing,
            dash: !crossing && d === Renderer.ROAD_FROM && (tx + ty) % 2 === 0,
          });
          continue;
        }

        if (ring === 'pave' || ring === 'inside') {
          // Kerbs drop towards whichever neighbour is asphalt.
          const kerbs: Array<readonly [number, number]> = [];
          for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
            if (this.ringOf(tx + dx, ty + dy) === 'road') kerbs.push([dx, dy]);
          }
          drawPaveTile(ctx, c.x, c.y, n, kerbs);
          continue;
        }

        if (ring === 'verge') {
          // Planted verge, which keeps the streetscape from turning into a car
          // park of grey and gives the street trees somewhere to stand.
          if (this.isApproach(tx, ty)) drawPaveTile(ctx, c.x, c.y, n);
          else drawLawnTile(ctx, c.x, c.y, n);
          continue;
        }

        if (this.inTerrace(tx, ty)) {
          // The shops' own forecourt, paved like the pavement it runs back from.
          // Most of it ends up under a building anyway.
          drawPaveTile(ctx, c.x, c.y, n);
          continue;
        }

        if (this.isLatticeStreet(tx, ty)) {
          drawRoadTile(ctx, c.x, c.y, n, { dash: (tx + ty) % 4 === 0 });
        } else if (this.plotKind(tx, ty) === 'park') {
          if (this.parkSpine(tx, ty)) drawPathTile(ctx, c.x, c.y, n);
          else drawLawnTile(ctx, c.x, c.y, n);
        } else {
          drawPlazaTile(ctx, c.x, c.y, n);
        }
      }
    }
  }

  /** True on the gravel cross-path that runs through the middle of a park plot. */
  private parkSpine(tx: number, ty: number): boolean {
    const { BLOCK, STREET } = Renderer;
    const mid = STREET + Math.floor((BLOCK - STREET) / 2);
    const ix = tx - Math.floor(tx / BLOCK) * BLOCK;
    const iy = ty - Math.floor(ty / BLOCK) * BLOCK;
    return ix === mid || iy === mid;
  }

  /**
   * Trees, shopfronts, benches and street lamps, added to the depth-sorted pass
   * so they occlude and are occluded by the restaurant correctly.
   */
  private collectNeighbourhood(out: Drawable[], time: number, night: number): void {
    const { ctx } = this;
    const { BLOCK, STREET } = Renderer;
    const view = this.visibleTiles(BLOCK);
    // Zoomed out to survey the town there are a couple of hundred buildings on
    // screen at once, so the buildings are told how much detail is worth drawing.
    const zoom = this.camera.zoom;

    // ---- street trees and benches on the verge across the road
    for (let ty = view.minTy; ty <= view.maxTy; ty++) {
      for (let tx = view.minTx; tx <= view.maxTx; tx++) {
        if (this.ringOf(tx, ty) !== 'verge' || this.isApproach(tx, ty)) continue;
        if (!this.inView(tx, ty, 2)) continue;
        const roll = tileNoise(tx * 17 + 3, ty * 41 + 9);
        const c = this.tileCentre(tx, ty);
        if (roll > 0.56) {
          out.push({
            depth: depthOf(tx, ty, 1),
            draw: () => drawTree(ctx, c.x, c.y, time, tx * 131 + ty),
          });
        } else if (roll > 0.52) {
          out.push({ depth: depthOf(tx, ty, 0.7), draw: () => drawBench(ctx, c.x, c.y) });
        }
      }
    }
    for (const [tx, ty] of this.streetLampTiles()) {
      if (!this.inView(tx, ty, 1.6)) continue;
      const c = this.tileCentre(tx, ty);
      out.push({
        depth: depthOf(tx, ty, 2),
        draw: () => drawStreetLamp(ctx, c.x, c.y, night),
      });
    }

    this.collectTerrace(out, time, night);

    // ---- blocks beyond the verge
    for (let by = Math.floor(view.minTy / BLOCK); by <= Math.floor(view.maxTy / BLOCK); by++) {
      for (let bx = Math.floor(view.minTx / BLOCK); bx <= Math.floor(view.maxTx / BLOCK); bx++) {
        const inner = BLOCK - STREET;
        const kind = this.plotKind(bx * BLOCK + STREET, by * BLOCK + STREET);
        const seed = bx * 137 + by * 29;
        // Blocks that only partly clear the ring road are built on as far as they
        // reach. Insisting on a whole clear block is what left the near field bare.
        const rect = this.buildableRect(bx * BLOCK + STREET, by * BLOCK + STREET, inner);
        if (!rect) continue;

        if (kind === 'build' && rect.w >= 2 && rect.h >= 2) {
          // Buildings take the plot they are given rather than the largest square
          // inside it, so a deep block gets a deep building. Long plots are split
          // into a pair, which stops every street looking like a row of
          // warehouses.
          const splitX = rect.w >= rect.h;
          const long = splitX ? rect.w : rect.h;
          const pair = long >= 5 && tileNoise(seed + 3, seed + 8) > 0.4;
          // Plot centre, then footprint along each grid axis, in tiles.
          const units: Array<[number, number, number, number]> = [];
          if (pair) {
            for (const f of [0.27, 0.73]) {
              units.push(
                splitX
                  ? [rect.x + rect.w * f, rect.y + rect.h / 2, rect.w * 0.46 - 0.3, rect.h - 0.3]
                  : [rect.x + rect.w / 2, rect.y + rect.h * f, rect.w - 0.3, rect.h * 0.46 - 0.3],
              );
            }
          } else {
            units.push([rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w - 0.3, rect.h - 0.3]);
          }
          units.forEach(([cx, cy, sx, sy], i) => {
            const height = 1.6 + tileNoise(seed + i * 11, 9) * 2.6;
            if (!this.inView(cx - 0.5, cy - 0.5, height + 0.8, Math.max(sx, sy) * 40)) return;
            const c = tileToWorld(cx, cy);
            out.push({
              depth: depthOf(cx, cy, height),
              draw: () =>
                drawShopBlock(ctx, c.x, c.y, sx, sy, height, seed + i * 17, night, zoom),
            });
          });
        } else if (kind === 'park' || rect.w < 2 || rect.h < 2) {
          this.collectPark(out, rect, time, seed);
        } else {
          // A paved square: stalls in the middle, trees around the edge.
          for (let ty = rect.y; ty < rect.y + rect.h; ty++) {
            for (let tx = rect.x; tx < rect.x + rect.w; tx++) {
              const edge =
                tx === rect.x || ty === rect.y ||
                tx === rect.x + rect.w - 1 || ty === rect.y + rect.h - 1;
              if (!this.inView(tx, ty, 2)) continue;
              const roll = tileNoise(tx * 23 + 1, ty * 13 + 4);
              const c = this.tileCentre(tx, ty);
              if (edge && roll > 0.6) {
                out.push({
                  depth: depthOf(tx, ty, 1),
                  draw: () => drawTree(ctx, c.x, c.y, time, tx * 131 + ty),
                });
              } else if (!edge && roll > 0.72) {
                out.push({
                  depth: depthOf(tx, ty, 1),
                  draw: () => drawStall(ctx, c.x, c.y, tx * 5 + ty),
                });
              }
            }
          }
        }
      }
    }
  }

  /**
   * The row of shops facing the restaurant across the street, on all four sides.
   *
   * This is the piece that turns the surroundings into a neighbourhood: whatever
   * else is going on further out, the player is always looking at shopfronts on
   * the other side of the road rather than at open ground.
   */
  private collectTerrace(out: Drawable[], time: number, night: number): void {
    const { ctx } = this;
    const zoom = this.camera.zoom;
    const { UNIT, TERRACE_FROM, TERRACE_TO } = Renderer;
    const size = this.grid.size;
    const depth = TERRACE_TO - TERRACE_FROM + 1;
    const mid = TERRACE_FROM + (depth - 1) / 2;

    /** Centres of the shop plots covering a run of street frontage. */
    const units = (lo: number, hi: number): number[] => {
      const found: number[] = [];
      for (let s = Math.floor(lo / UNIT) * UNIT; s + UNIT - 1 <= hi; s += UNIT) {
        if (s >= lo) found.push(s + (UNIT - 1) / 2);
      }
      return found;
    };
    // The rows running along the x axis wrap around the corners; the rows along
    // the y axis stop short of them, so the corner plots are only built once. The
    // corner is what sits directly above the room on screen, so it matters that
    // something substantial ends up there.
    const wrap = units(-TERRACE_TO, size + TERRACE_TO);
    const inner = units(-TERRACE_FROM + 1, size + TERRACE_FROM - 2);

    for (const side of [0, 1, 2, 3]) {
      const across = side < 2 ? -1 - mid : size + mid;
      for (const along of side % 2 === 0 ? wrap : inner) {
        const cx = side % 2 === 0 ? along : across;
        const cy = side % 2 === 0 ? across : along;
        const seed = Math.round(cx * 71 + cy * 131 + side * 17);
        const roll = tileNoise(seed, seed + 5);
        if (!this.inView(cx, cy, 5, UNIT * 34)) continue;
        const c = tileToWorld(cx + 0.5, cy + 0.5);

        // Roughly one plot in eight is a garden rather than a shop, which stops
        // the far side of the street reading as a single unbroken wall.
        if (roll > 0.87) {
          this.collectPark(
            out,
            {
              x: Math.round(cx - (UNIT - 1) / 2),
              y: Math.round(cy - (depth - 1) / 2),
              w: side % 2 === 0 ? UNIT : depth,
              h: side % 2 === 0 ? depth : UNIT,
            },
            time,
            seed,
          );
          continue;
        }

        // The plot is wider along the street than it is deep, so the building is
        // too: a terrace of squares wastes half the frontage and reads as a row
        // of separate cubes. Each plot gives up a little of its width so the
        // joints between neighbours show.
        const frontage = UNIT - 0.15 - tileNoise(seed + 41, seed - 7) * 0.35;
        const back = depth - 0.15 - tileNoise(seed - 19, seed + 23) * 0.3;
        const spanX = side % 2 === 0 ? frontage : back;
        const spanY = side % 2 === 0 ? back : frontage;
        // Tall enough that the facade, not the roof, is what the camera sees.
        const height = 2.3 + tileNoise(seed + 3, seed) * 2.5;
        out.push({
          depth: depthOf(cx, cy, height),
          draw: () => drawShopBlock(ctx, c.x, c.y, spanX, spanY, height, seed, night, zoom),
        });
      }
    }
  }

  /**
   * The largest part of a block that is clear of the ring road and the queue,
   * found by trimming whole rows and columns until nothing blocked is left.
   */
  private buildableRect(
    x0: number,
    y0: number,
    inner: number,
  ): { x: number; y: number; w: number; h: number } | null {
    const free = (tx: number, ty: number): boolean =>
      this.ringOf(tx, ty) === 'town' && !this.inTerrace(tx, ty) && !this.isApproach(tx, ty);
    let x = x0;
    let y = y0;
    let w = inner;
    let h = inner;

    const rowClear = (ty: number): boolean => {
      for (let tx = x; tx < x + w; tx++) if (!free(tx, ty)) return false;
      return true;
    };
    const colClear = (tx: number): boolean => {
      for (let ty = y; ty < y + h; ty++) if (!free(tx, ty)) return false;
      return true;
    };

    for (let guard = 0; guard < inner * 2 && w > 0 && h > 0; guard++) {
      if (!rowClear(y)) {
        y++;
        h--;
      } else if (!rowClear(y + h - 1)) {
        h--;
      } else if (!colClear(x)) {
        x++;
        w--;
      } else if (!colClear(x + w - 1)) {
        w--;
      } else {
        return { x, y, w, h };
      }
    }
    return w > 0 && h > 0 ? { x, y, w, h } : null;
  }

  /** A small public garden: hedged border, trees and a bench on the path. */
  private collectPark(
    out: Drawable[],
    rect: { x: number; y: number; w: number; h: number },
    time: number,
    seed: number,
  ): void {
    const { ctx } = this;
    for (let ty = rect.y; ty < rect.y + rect.h; ty++) {
      for (let tx = rect.x; tx < rect.x + rect.w; tx++) {
        if (!this.inView(tx, ty, 2)) continue;
        const c = this.tileCentre(tx, ty);
        const onPath = this.parkSpine(tx, ty);
        const edge =
          tx === rect.x || ty === rect.y ||
          tx === rect.x + rect.w - 1 || ty === rect.y + rect.h - 1;
        const roll = tileNoise(tx * 13 + 5, ty * 29 + 7);

        if (edge && !onPath && rect.w > 2 && rect.h > 2) {
          out.push({
            depth: depthOf(tx, ty, 0.5),
            draw: () => drawHedge(ctx, c.x, c.y, tx * 3 + ty),
          });
        } else if (onPath && roll > 0.78) {
          out.push({ depth: depthOf(tx, ty, 0.7), draw: () => drawBench(ctx, c.x, c.y) });
        } else if (!onPath && roll > 0.4) {
          out.push({
            depth: depthOf(tx, ty, 1),
            draw: () => drawTree(ctx, c.x, c.y, time, tx * 131 + ty + seed),
          });
        }
      }
    }
  }

  /**
   * Lamp posts, spaced evenly along the pavement that hugs the building. Regular
   * spacing is most of what makes a row of props read as a street.
   */
  private streetLampTiles(): Array<[number, number]> {
    const size = this.grid.size;
    const near = -2;
    const far = size + 1;
    const out: Array<[number, number]> = [];
    for (let t = near; t <= far; t += 5) {
      out.push([t, near], [near, t], [t, far], [far, t]);
    }
    return out.filter(
      ([tx, ty]) => this.outsideBy(tx, ty) === 1 && !this.isApproach(tx, ty),
    );
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

  /** Street dressing outside the entrance. */
  private drawOutside(time: number): void {
    const { ctx } = this;
    const size = this.grid.size;
    const doorX = this.grid.doorX;

    // Entry mat on the pavement, pointing at the door.
    const c = this.tileCentre(doorX, -1);
    diamondPath(ctx, c.x, c.y - 2, 0.9, 0.9);
    ctx.fillStyle = '#b52f26';
    ctx.fill();
    diamondPath(ctx, c.x, c.y - 2, 0.68, 0.68);
    ctx.fillStyle = '#c73a2e';
    ctx.fill();
    ctx.strokeStyle = withAlpha('#fff1d6', 0.5);
    ctx.lineWidth = 1.4;
    diamondPath(ctx, c.x, c.y - 2, 0.5, 0.5);
    ctx.stroke();

    // Planters flanking the door.
    for (const dx of [-2, 2]) {
      const tx = doorX + dx;
      if (tx < 0 || tx >= size) continue;
      const p = this.tileCentre(tx, -1);
      drawPlanter(ctx, p.x, p.y - 2, time, tx * 7 + 3);
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

  private drawFloor(opts: RenderOptions, night: number): void {
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
    const strength = 0.09 + night * 0.26;
    for (const [tx, ty] of this.lampTiles()) {
      const c = this.tileCentre(tx, ty);
      drawFloorGlow(ctx, c.x, c.y, 3.1, '#ffcf8a', strength);
    }

    // Daylight falling through each window onto the floor inside.
    const day = 1 - night;
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

  private drawLamps(time: number, night: number): void {
    for (const [tx, ty] of this.lampTiles()) {
      const c = this.tileCentre(tx, ty);
      drawPendantLamp(this.ctx, c.x, c.y, time, night);
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
          // Plates waiting to be collected. They sit in a warm pool of light and
          // ride a slow bob, so a full counter is findable at a glance.
          const plates = p.plates ?? [];
          plates.forEach((orderId, i) => {
            const order = this.game.orders.find((o) => o.id === orderId);
            const dish = order ? DISHES_BY_ID[order.dishId] : undefined;
            if (!dish) return;
            const lift = def.role === 'stove' ? 0.68 : 0.62;
            const bob = Math.sin(opts.time * 2.6 + i * 1.7) * 1.6;
            drawPlatedDish(
              ctx,
              dish,
              c.x + (i - (plates.length - 1) / 2) * 15,
              c.y - lift * TILE_Z + bob,
              1,
              { ready: true },
            );
          });
        },
      });

      if (progress !== undefined) {
        overlays.push({
          depth: depthOf(p.tx, p.ty, 4),
          draw: () => this.cookBar(c.x, c.y - 1.62 * TILE_Z, progress, opts.time),
        });
      }
      if (p.dirty) {
        overlays.push({
          depth: depthOf(p.tx, p.ty, 4),
          draw: () => this.dirtyBadge(c.x, c.y - 1.42 * TILE_Z, opts.time),
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
        draw: () => this.customerBubble(c, w.x, w.y, opts.time),
      });

      // A regular is only a regular if the player can tell who walked in.
      if (c.regularId !== null) {
        overlays.push({
          depth: depthOf(c.tx, c.ty, 6),
          draw: () => this.nameTag(c.name, w.x, w.y - 2.92 * TILE_Z),
        });
      }
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
            role: s.role,
            carrying: dish,
            prop: this.staffProp(s),
            exhausted: s.state === 'exhausted',
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

  /**
   * What a guest is waiting for, as a round thought bubble with the patience
   * timer wrapped around it. Round because the timer is a ring: a rounded box
   * inside a circle just read as two unrelated shapes at phone size.
   */
  private customerBubble(c: Customer, x: number, y: number, time: number): void {
    const { ctx } = this;
    if (c.state === 'leaving' || c.state === 'walkingToSeat' || c.state === 'entering') return;

    const r = 15;
    // High enough that the bubble clears the tallest head under it; the tail is
    // what reaches back down to the guest.
    const top = y - 2.38 * TILE_Z + Math.sin(time * 1.8 + c.id) * 0.8;
    const showPatience =
      c.state === 'queueing' || c.state === 'awaitingWaiter' || c.state === 'awaitingFood';

    ctx.save();

    // Tail: two dots shrinking towards the guest's head, the classic thought cue.
    ctx.fillStyle = '#fff8ea';
    ctx.strokeStyle = '#c73a2e';
    ctx.lineWidth = 2;
    for (const [dy, rr] of [[r + 5, 3.4], [r + 11, 2.2]] as const) {
      ctx.beginPath();
      ctx.arc(x + 3, top + dy, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,250,238,0.97)';
    ctx.beginPath();
    ctx.arc(x, top, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c73a2e';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    if (c.state === 'deciding') {
      // Dots that fill in turn, so "reading the menu" reads as a wait.
      for (let i = -1; i <= 1; i++) {
        const on = Math.floor(time * 2.2) % 3 === i + 1;
        ctx.fillStyle = on ? '#c73a2e' : 'rgba(199,58,46,0.28)';
        ctx.beginPath();
        ctx.arc(x + i * 6.4, top, on ? 2.8 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (c.dishId) {
      const dish = DISHES_BY_ID[c.dishId];
      if (dish) drawPlatedDish(ctx, dish, x, top + 6, 0.82);
    } else {
      ctx.fillStyle = '#c0402f';
      ctx.font = '700 18px Fredoka, Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x, top + 1);
    }

    if (showPatience) {
      const p = c.patience;
      const color = p > 0.55 ? '#4fb85f' : p > 0.28 ? '#eaa72c' : '#e0453a';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(74, 36, 24, 0.18)';
      ctx.beginPath();
      ctx.arc(x, top, r + 3.6, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, top, r + 3.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, p));
      ctx.stroke();
      // Running out of patience is worth shouting about.
      if (p < 0.28) {
        ctx.globalAlpha = 0.35 + Math.abs(Math.sin(time * 6)) * 0.5;
        ctx.strokeStyle = '#e0453a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, top, r + 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Name plate over a guest the player is meant to recognise. Cream on cherry
   * like the rest of the diner's signage, and sat above the thought bubble so
   * the two never fight for the same pixels.
   */
  private nameTag(name: string, x: number, y: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.font = '700 10px Fredoka, Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(name).width + 14;
    ctx.fillStyle = 'rgba(52, 28, 18, 0.22)';
    roundRect(ctx, x - w / 2, y - 7.5, w, 17, 8.5);
    ctx.fill();
    ctx.fillStyle = '#c73a2e';
    roundRect(ctx, x - w / 2, y - 9, w, 17, 8.5);
    ctx.fill();
    ctx.strokeStyle = '#fff8ea';
    ctx.lineWidth = 1.6;
    roundRect(ctx, x - w / 2, y - 9, w, 17, 8.5);
    ctx.stroke();
    ctx.fillStyle = '#fff8ea';
    ctx.fillText(name, x, y - 0.2);
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

  /**
   * How far along an order is. Chunky, outlined and colour-shifted towards done,
   * because on a phone this is the only readout of whether the kitchen is coping.
   */
  private cookBar(x: number, y: number, value: number, time: number): void {
    const { ctx } = this;
    const w = 42;
    const h = 10;
    const nearly = value > 0.82;
    ctx.save();
    ctx.fillStyle = 'rgba(52, 28, 18, 0.82)';
    roundRect(ctx, x - w / 2 - 1.5, y - 1.5, w + 3, h + 3, (h + 3) / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 244, 220, 0.22)';
    roundRect(ctx, x - w / 2, y, w, h, h / 2);
    ctx.fill();

    const grad = ctx.createLinearGradient(x - w / 2, y, x + w / 2, y);
    grad.addColorStop(0, '#f0862c');
    grad.addColorStop(1, nearly ? '#ffe06a' : '#ffb648');
    ctx.fillStyle = grad;
    roundRect(ctx, x - w / 2 + 1, y + 1, Math.max(h - 2, (w - 2) * value), h - 2, (h - 2) / 2);
    ctx.fill();
    // Gloss along the top of the fill.
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    roundRect(ctx, x - w / 2 + 2.5, y + 2, Math.max(4, (w - 5) * value), 2.4, 1.2);
    ctx.fill();

    if (nearly) {
      ctx.globalAlpha = 0.4 + Math.abs(Math.sin(time * 7)) * 0.6;
      ctx.strokeStyle = '#ffe89a';
      ctx.lineWidth = 1.6;
      roundRect(ctx, x - w / 2 - 2.5, y - 2.5, w + 5, h + 5, (h + 5) / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Marker over a table that needs wiping. An icon rather than a word, so it
   * still reads when a phone is showing the whole room at once.
   */
  private dirtyBadge(x: number, y: number, time: number): void {
    const { ctx } = this;
    const bob = Math.sin(time * 3) * 1.6;
    const cy = y + bob;
    ctx.save();
    ctx.fillStyle = 'rgba(52, 28, 18, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 13, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#a75f27';
    ctx.beginPath();
    ctx.arc(x, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff4dc';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // A used plate with a smear across it.
    ctx.fillStyle = '#fff1d8';
    ctx.beginPath();
    ctx.ellipse(x, cy + 1.5, 7, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7c4a1e';
    ctx.beginPath();
    ctx.ellipse(x - 1.5, cy + 0.8, 2.6, 1.5, -0.3, 0, Math.PI * 2);
    ctx.ellipse(x + 2.6, cy + 2.2, 1.8, 1.1, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Wafting stink lines, which is what makes it read as "clean me".
    ctx.strokeStyle = 'rgba(255,244,220,0.85)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const phase = time * 3 + i;
      ctx.beginPath();
      ctx.moveTo(x + i * 4, cy - 4);
      ctx.quadraticCurveTo(x + i * 4 + Math.sin(phase) * 2.4, cy - 7, x + i * 4, cy - 9.5);
      ctx.stroke();
    }
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

  /**
   * Time of day, in two passes.
   *
   * First the whole frame is multiplied down towards dusk, which keeps every
   * colour in its own family as it darkens — a translucent black or blue laid on
   * top just greys the picture out instead. Then the light is added back where it
   * actually comes from: the pendants, the windows, the lamp posts and the open
   * door. That contrast between a dark street and a lit room is the whole effect.
   */
  private drawLighting(t: number, night: number): void {
    const { ctx, camera } = this;

    // Early morning still gets a plain warm wash; nothing needs darkening yet.
    if (t < 0.12) {
      ctx.fillStyle = withAlpha('#ffb168', 0.14 * (1 - t / 0.12));
      ctx.fillRect(0, 0, camera.viewW, camera.viewH);
    }

    if (night > 0.01) {
      // Dusk runs amber before it runs blue, so evening reads as sunset rather
      // than as an instant switch to night.
      const dusk = mix('#ffb072', '#2f3f74', Math.min(1, night * 1.15));
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = mix('#ffffff', dusk, Math.min(0.9, night * 0.92));
      ctx.fillRect(0, 0, camera.viewW, camera.viewH);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      camera.applyTo(ctx);
      this.addLight(night);
      ctx.restore();
    }

    // Level-up flash: a warm bloom over the room that fades in under half a second.
    const flash = this.game.fx.flash;
    if (flash > 0.01) {
      const g = ctx.createRadialGradient(
        camera.viewW / 2, camera.viewH * 0.45, 0,
        camera.viewW / 2, camera.viewH * 0.45, Math.max(camera.viewW, camera.viewH) * 0.6,
      );
      g.addColorStop(0, withAlpha('#fff0c0', 0.34 * flash));
      g.addColorStop(1, withAlpha('#ffd37a', 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, camera.viewW, camera.viewH);
    }

    // A soft vignette keeps the eye on the dining room.
    const g = ctx.createRadialGradient(
      camera.viewW / 2, camera.viewH / 2, Math.min(camera.viewW, camera.viewH) * 0.35,
      camera.viewW / 2, camera.viewH / 2, Math.max(camera.viewW, camera.viewH) * 0.75,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(46, 26, 14, ${0.16 + night * 0.2})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, camera.viewW, camera.viewH);
  }

  /** Additive glows for every light source, drawn in world space. */
  private addLight(night: number): void {
    const { ctx } = this;
    const blob = (x: number, y: number, r: number, colour: string, strength: number): void => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, withAlpha(colour, strength));
      g.addColorStop(0.6, withAlpha(colour, strength * 0.38));
      g.addColorStop(1, withAlpha(colour, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    // Pendants over the dining room: a pool on the floor and a haze in the air.
    for (const [tx, ty] of this.lampTiles()) {
      const c = this.tileCentre(tx, ty);
      blob(c.x, c.y, TILE_W * 1.7, '#ffc773', 0.3 * night);
      blob(c.x, c.y - 2.05 * TILE_Z, TILE_W * 0.5, '#ffe6b0', 0.42 * night);
    }
    // Light escaping through the windows and out of the doorway.
    for (const tx of this.windowTiles()) {
      const c = this.tileCentre(tx, -0.4);
      blob(c.x, c.y - TILE_Z, TILE_W * 0.72, '#ffdc9c', 0.34 * night);
    }
    const door = this.tileCentre(this.grid.doorX, -0.9);
    blob(door.x, door.y, TILE_W * 1.1, '#ffd694', 0.3 * night);
    // Lamp posts on the pavements.
    for (const [tx, ty] of this.streetLampTiles()) {
      const c = this.tileCentre(tx, ty);
      blob(c.x, c.y - 56, TILE_W * 0.55, '#ffd79a', 0.34 * night);
      blob(c.x, c.y, TILE_W * 0.95, '#ffcf8c', 0.2 * night);
    }
  }

  /** Particles for pay-outs, finished plates, wiped tables and level-ups. */
  private drawParticles(): void {
    const { ctx } = this;
    const fx: Fx = this.game.fx;
    if (fx.particles.length === 0) return;

    ctx.save();
    for (const p of fx.particles) {
      const fade = Math.min(1, p.life / (p.maxLife * 0.45));
      ctx.globalAlpha = fade;
      switch (p.kind) {
        case 'coin': {
          // A coin flipping edge-on: the squash comes from its own spin.
          const squash = Math.abs(Math.cos(p.rot));
          ctx.fillStyle = '#c98a12';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 1, p.size * squash + 0.6, p.size + 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = p.colour;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * squash, p.size, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'confetti': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.colour;
          ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
          ctx.restore();
          break;
        }
        case 'steam': {
          const grow = 1 + (1 - p.life / p.maxLife) * 1.5;
          ctx.globalAlpha = fade * 0.5;
          ctx.fillStyle = p.colour;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * grow, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'spark': {
          ctx.fillStyle = p.colour;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        default: {
          ctx.fillStyle = p.colour;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    }
    ctx.restore();
  }
}
