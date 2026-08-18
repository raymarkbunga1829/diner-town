/**
 * Turning a pointer position into the thing the player meant.
 *
 * Actors are drawn at the centre of the tile they stand on, and they spend most
 * of their lives on fractional positions between tiles — a queue outside the
 * door is a good example, since it shuffles along by fractions of a tile and
 * never sits neatly on one. Rounding a pick to a tile and matching that made
 * those guests feel unclickable, so picks compare distance instead.
 */

export interface Positioned {
  tx: number;
  ty: number;
}

/** How far from an actor's centre, in tiles, still counts as aiming at them. */
export const PICK_RADIUS = 0.85;

/** The actor nearest to a fractional tile pick, or null when none is close. */
export function nearestActor<T extends Positioned>(
  actors: readonly T[],
  fx: number,
  fy: number,
  radius = PICK_RADIUS,
): T | null {
  let best: T | null = null;
  let bestDistance = radius;
  for (const a of actors) {
    const d = Math.hypot(fx - (a.tx + 0.5), fy - (a.ty + 0.5));
    if (d < bestDistance) {
      bestDistance = d;
      best = a;
    }
  }
  return best;
}
