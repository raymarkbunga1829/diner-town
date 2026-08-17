import { NEIGHBOURS } from '../engine/iso';
import type { Grid } from './grid';

/**
 * 4-directional A* over the restaurant floor. The board is at most 16x16 plus a
 * short entry corridor, so a plain binary-heap A* is far more than fast enough
 * and keeps movement predictable.
 */

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
}

class MinHeap {
  private readonly items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node): void {
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent]!.f <= this.items[i]!.f) break;
      [this.items[parent], this.items[i]] = [this.items[i]!, this.items[parent]!];
      i = parent;
    }
  }

  pop(): Node | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.items.length && this.items[l]!.f < this.items[smallest]!.f) smallest = l;
        if (r < this.items.length && this.items[r]!.f < this.items[smallest]!.f) smallest = r;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i]!, this.items[smallest]!];
        i = smallest;
      }
    }
    return top;
  }
}

const encode = (x: number, y: number): number => (x + 32) * 128 + (y + 32);

/**
 * Find a walking route from (sx, sy) to any tile in `goals`.
 * Returns the tiles to step through, excluding the start. Empty when already
 * standing on a goal; `null` when no route exists.
 */
export function findPath(
  grid: Grid,
  sx: number,
  sy: number,
  goals: Array<[number, number]>,
): Array<[number, number]> | null {
  if (!goals.length) return null;
  const goalSet = new Set(goals.map(([x, y]) => encode(x, y)));
  if (goalSet.has(encode(sx, sy))) return [];

  const heuristic = (x: number, y: number): number => {
    let best = Infinity;
    for (const [gx, gy] of goals) {
      const d = Math.abs(x - gx) + Math.abs(y - gy);
      if (d < best) best = d;
    }
    return best;
  };

  const open = new MinHeap();
  const cameFrom = new Map<number, number>();
  const bestG = new Map<number, number>();

  const startKey = encode(sx, sy);
  bestG.set(startKey, 0);
  open.push({ x: sx, y: sy, g: 0, f: heuristic(sx, sy) });

  let guard = 4096;
  while (open.size && guard-- > 0) {
    const current = open.pop()!;
    const currentKey = encode(current.x, current.y);
    if (current.g > (bestG.get(currentKey) ?? Infinity)) continue;

    if (goalSet.has(currentKey)) {
      const path: Array<[number, number]> = [];
      let k: number | undefined = currentKey;
      while (k !== undefined && k !== startKey) {
        path.push([Math.floor(k / 128) - 32, (k % 128) - 32]);
        k = cameFrom.get(k);
      }
      path.reverse();
      return path;
    }

    for (const [dx, dy] of NEIGHBOURS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!grid.isWalkable(nx, ny)) continue;
      const nk = encode(nx, ny);
      const g = current.g + 1;
      if (g >= (bestG.get(nk) ?? Infinity)) continue;
      bestG.set(nk, g);
      cameFrom.set(nk, currentKey);
      open.push({ x: nx, y: ny, g, f: g + heuristic(nx, ny) });
    }
  }
  return null;
}

/** Walking speed in tiles per second. */
export const WALK_SPEED = 2.35;

/**
 * Advance an actor along its path. Returns true once the path is exhausted.
 * Positions are fractional so movement renders smoothly between tiles.
 */
export function advanceAlongPath(
  actor: { tx: number; ty: number; path: Array<[number, number]> },
  dt: number,
  speed = WALK_SPEED,
): boolean {
  let budget = speed * dt;
  while (budget > 0 && actor.path.length) {
    const [nx, ny] = actor.path[0]!;
    const dx = nx - actor.tx;
    const dy = ny - actor.ty;
    const dist = Math.hypot(dx, dy);
    if (dist <= budget || dist < 1e-4) {
      actor.tx = nx;
      actor.ty = ny;
      actor.path.shift();
      budget -= dist;
    } else {
      actor.tx += (dx / dist) * budget;
      actor.ty += (dy / dist) * budget;
      budget = 0;
    }
  }
  return actor.path.length === 0;
}
