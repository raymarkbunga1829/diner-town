import { NEIGHBOURS } from '../engine/iso';
import { blocksWalking, isWallMounted, type FurnitureDef } from './data/furniture';
import type { Game } from './state';
import type { Placed } from './types';

export const key = (tx: number, ty: number): string => `${tx},${ty}`;

/** Tiles of the footprint of `def` placed at (tx, ty) with rotation `rot`. */
export function footprint(
  def: FurnitureDef,
  tx: number,
  ty: number,
  rot: 0 | 1 | 2 | 3,
): Array<[number, number]> {
  const w = rot % 2 === 0 ? def.w : def.h;
  const h = rot % 2 === 0 ? def.h : def.w;
  const tiles: Array<[number, number]> = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) tiles.push([tx + dx, ty + dy]);
  }
  return tiles;
}

/**
 * Spatial index over the placed furniture. Rebuilt lazily whenever the game's
 * revision counter changes, which every mutation bumps.
 */
export class Grid {
  private syncedRevision = -1;

  /** Tiles that actors cannot walk through. */
  readonly blocked = new Set<string>();
  /** Floor-occupying furniture by tile. */
  readonly solid = new Map<string, Placed>();
  /** Flat items (rugs) by tile. */
  readonly flat = new Map<string, Placed>();
  /** Wall-mounted items by tile. */
  readonly wall = new Map<string, Placed>();

  constructor(private readonly game: Game) {}

  sync(): void {
    if (this.syncedRevision === this.game.revision) return;
    this.syncedRevision = this.game.revision;
    this.blocked.clear();
    this.solid.clear();
    this.flat.clear();
    this.wall.clear();

    for (const p of this.game.data.placed) {
      const def = this.game.defOf(p);
      if (!def) continue;
      const tiles = footprint(def, p.tx, p.ty, p.rot);
      if (isWallMounted(def.role)) {
        for (const [tx, ty] of tiles) this.wall.set(key(tx, ty), p);
        continue;
      }
      if (!blocksWalking(def.role)) {
        for (const [tx, ty] of tiles) this.flat.set(key(tx, ty), p);
        continue;
      }
      for (const [tx, ty] of tiles) {
        this.solid.set(key(tx, ty), p);
        this.blocked.add(key(tx, ty));
      }
    }
  }

  get size(): number {
    return this.game.data.gridSize;
  }

  get doorX(): number {
    return this.game.data.doorX;
  }

  /** Inside the dining room proper. */
  isInterior(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.size && ty < this.size;
  }

  /** The short entry corridor outside the door gap. */
  isDoorway(tx: number, ty: number): boolean {
    return tx === this.doorX && (ty === -1 || ty === -2);
  }

  /** A back-wall tile, where wall decor can hang. */
  isWallTile(tx: number, ty: number): boolean {
    if (ty === -1 && tx >= 0 && tx < this.size) return tx !== this.doorX;
    if (tx === -1 && ty >= 0 && ty < this.size) return true;
    return false;
  }

  isFloor(tx: number, ty: number): boolean {
    return this.isInterior(tx, ty) || this.isDoorway(tx, ty);
  }

  isWalkable(tx: number, ty: number): boolean {
    return this.isFloor(tx, ty) && !this.blocked.has(key(tx, ty));
  }

  solidAt(tx: number, ty: number): Placed | undefined {
    return this.solid.get(key(tx, ty));
  }

  flatAt(tx: number, ty: number): Placed | undefined {
    return this.flat.get(key(tx, ty));
  }

  wallAt(tx: number, ty: number): Placed | undefined {
    return this.wall.get(key(tx, ty));
  }

  /** Anything placed on this tile, preferring the topmost layer. */
  anyAt(tx: number, ty: number): Placed | undefined {
    return this.solidAt(tx, ty) ?? this.wallAt(tx, ty) ?? this.flatAt(tx, ty);
  }

  /** Whether `def` may be placed at (tx, ty), optionally ignoring one piece. */
  canPlace(
    def: FurnitureDef,
    tx: number,
    ty: number,
    rot: 0 | 1 | 2 | 3,
    ignoreUid?: number,
  ): boolean {
    const tiles = footprint(def, tx, ty, rot);
    const wallMounted = isWallMounted(def.role);

    for (const [x, y] of tiles) {
      if (wallMounted) {
        if (!this.isWallTile(x, y)) return false;
        const existing = this.wall.get(key(x, y));
        if (existing && existing.uid !== ignoreUid) return false;
        continue;
      }
      if (!this.isInterior(x, y)) return false;
      if (!blocksWalking(def.role)) {
        const existing = this.flat.get(key(x, y));
        if (existing && existing.uid !== ignoreUid) return false;
        continue;
      }
      const existing = this.solid.get(key(x, y));
      if (existing && existing.uid !== ignoreUid) return false;
    }

    // A solid piece must never seal the room off; verify the door can still
    // reach every remaining walkable tile.
    if (!wallMounted && blocksWalking(def.role)) {
      if (!this.reachableWithout(tiles, ignoreUid)) return false;
    }
    return true;
  }

  /**
   * Flood fill from the doorway assuming `extraBlocked` tiles are filled and
   * `ignoreUid`'s tiles are cleared, then confirm nothing walkable is stranded.
   */
  private reachableWithout(
    extraBlocked: Array<[number, number]>,
    ignoreUid?: number,
  ): boolean {
    const blocked = new Set(this.blocked);
    if (ignoreUid !== undefined) {
      for (const [k, p] of this.solid) if (p.uid === ignoreUid) blocked.delete(k);
    }
    for (const [x, y] of extraBlocked) blocked.add(key(x, y));

    const start: [number, number] = [this.doorX, 0];
    if (blocked.has(key(start[0], start[1]))) return false;

    const seen = new Set<string>([key(start[0], start[1])]);
    const queue: Array<[number, number]> = [start];
    while (queue.length) {
      const [cx, cy] = queue.pop()!;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = cx + dx;
        const ny = cy + dy;
        const k = key(nx, ny);
        if (seen.has(k) || !this.isFloor(nx, ny) || blocked.has(k)) continue;
        seen.add(k);
        queue.push([nx, ny]);
      }
    }

    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        const k = key(x, y);
        if (blocked.has(k)) continue;
        if (!seen.has(k)) return false;
      }
    }
    return true;
  }

  /**
   * Map a fractional tile pick onto the back-wall cell the pointer is over.
   *
   * The walls are drawn as vertical planes rising from the `ty = 0` and `tx = 0`
   * edges, so a point `k` tiles up the north-east wall inverts to the grid
   * position `(index + u - k, -k)`. Recovering `index` is therefore just
   * `floor(tx - ty)`, and the mirrored case gives `floor(ty - tx)`. World-space
   * x decides which of the two walls the pointer is actually over.
   */
  resolveWallTarget(tx: number, ty: number): [number, number] | null {
    if (this.isInterior(Math.floor(tx), Math.floor(ty))) return null;

    if (tx >= ty) {
      if (ty >= 0) return null;
      const index = Math.floor(tx - ty);
      if (index < 0 || index >= this.size || index === this.doorX) return null;
      return [index, -1];
    }

    if (tx >= 0) return null;
    const index = Math.floor(ty - tx);
    if (index < 0 || index >= this.size) return null;
    return [-1, index];
  }

  /** Walkable tiles orthogonally touching a placed item's footprint. */
  accessTiles(p: Placed): Array<[number, number]> {
    const def = this.game.defOf(p);
    if (!def) return [];
    const own = new Set(footprint(def, p.tx, p.ty, p.rot).map(([x, y]) => key(x, y)));
    const out: Array<[number, number]> = [];
    const seen = new Set<string>();
    for (const [x, y] of footprint(def, p.tx, p.ty, p.rot)) {
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        const k = key(nx, ny);
        if (own.has(k) || seen.has(k)) continue;
        seen.add(k);
        if (this.isWalkable(nx, ny)) out.push([nx, ny]);
      }
    }
    return out;
  }

  /** Tables orthogonally adjacent to a chair. */
  tableForChair(chair: Placed): Placed | undefined {
    for (const [dx, dy] of NEIGHBOURS) {
      const p = this.solidAt(chair.tx + dx, chair.ty + dy);
      if (p && this.game.defOf(p)?.role === 'table') return p;
    }
    return undefined;
  }

  /** Chairs orthogonally adjacent to a table, capped by the table's capacity. */
  chairsForTable(table: Placed): Placed[] {
    const def = this.game.defOf(table);
    const cap = def?.tableCapacity ?? 4;
    const out: Placed[] = [];
    for (const [x, y] of footprint(def!, table.tx, table.ty, table.rot)) {
      for (const [dx, dy] of NEIGHBOURS) {
        const p = this.solidAt(x + dx, y + dy);
        if (p && this.game.defOf(p)?.role === 'chair' && !out.includes(p)) out.push(p);
      }
    }
    return out.slice(0, cap);
  }

  /** A chair counts as usable only if it is paired with a reachable table. */
  isUsableSeat(chair: Placed): boolean {
    const table = this.tableForChair(chair);
    if (!table) return false;
    if (this.accessTiles(chair).length === 0) return false;
    return this.accessTiles(table).length > 0;
  }
}
