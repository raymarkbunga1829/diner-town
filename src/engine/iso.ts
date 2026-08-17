/**
 * Isometric projection helpers.
 *
 * The world is a square grid of tiles addressed by integer (tx, ty). Tiles are
 * drawn as 2:1 diamonds, so one tile step along +x moves half a tile right and
 * half a tile down on screen, and +y moves half left / half down.
 */

export const TILE_W = 64;
export const TILE_H = 32;

/** Vertical pixels per unit of "height" when stacking boxes on a tile. */
export const TILE_Z = 32;

export interface Point {
  x: number;
  y: number;
}

/** Grid coordinates. May be fractional for smoothly moving actors. */
export interface Tile {
  tx: number;
  ty: number;
}

/** Project grid space to unscaled world-pixel space (before camera transform). */
export function tileToWorld(tx: number, ty: number, z = 0): Point {
  return {
    x: (tx - ty) * (TILE_W / 2),
    y: (tx + ty) * (TILE_H / 2) - z * TILE_Z,
  };
}

/** Inverse of {@link tileToWorld}, ignoring height. Returns fractional tiles. */
export function worldToTile(x: number, y: number): Tile {
  return {
    tx: (y / (TILE_H / 2) + x / (TILE_W / 2)) / 2,
    ty: (y / (TILE_H / 2) - x / (TILE_W / 2)) / 2,
  };
}

/**
 * Painter's-algorithm sort key. Larger values are drawn later (on top).
 *
 * Depth is dominated by the diagonal (tx + ty) so that objects further from the
 * camera are drawn first. Height contributes a small amount so that a tall
 * object on a tile still sorts above a flat one on the same tile, and `bias`
 * breaks ties for actors that must render above the furniture they use.
 */
export function depthOf(tx: number, ty: number, z = 0, bias = 0): number {
  return (tx + ty) * 16 + z * 0.5 + bias;
}

export function tileDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** The four orthogonal grid neighbours, in screen-clockwise order. */
export const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export type Facing = 'nw' | 'ne' | 'se' | 'sw';

/** Which way an actor at (fromX, fromY) should face to look at (toX, toY). */
export function facingTowards(fromX: number, fromY: number, toX: number, toY: number): Facing {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'se' : 'nw';
  return dy >= 0 ? 'sw' : 'ne';
}
