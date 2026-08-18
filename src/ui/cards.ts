/**
 * Which celebration the loop is allowed to put up this frame.
 *
 * A card is claimed a beat before it covers the room — the confetti is given
 * time to land first — so between claiming one and showing it there is a window
 * where nothing is pending and no modal is open yet. Anything that only asks
 * "is a card on screen?" walks straight through that window and queues a second
 * card on top of the first, which is how a player earning a level and a fame
 * star in the same helping of experience never got to read the level's unlocks.
 * `hold` is what closes it.
 */

export type CelebrationCard = 'level' | 'star' | 'recap';

export interface CelebrationQueue {
  /** A missed shift is still owed its card, and it goes before everything. */
  awayPending: boolean;
  levelUp: boolean;
  starUp: boolean;
  dayRecap: boolean;
  /** Something is already covering the room. */
  modalOpen: boolean;
  /** Seconds left of the beat a card in flight has claimed. */
  hold: number;
}

/**
 * One card at a time, in the order the moment deserves: the level just earned,
 * then the star, then the day that ended. Null means this frame belongs to a
 * card that is already on its way.
 */
export function nextCelebration(q: CelebrationQueue): CelebrationCard | null {
  if (q.awayPending || q.modalOpen || q.hold > 0) return null;
  if (q.levelUp) return 'level';
  if (q.starUp) return 'star';
  if (q.dayRecap) return 'recap';
  return null;
}
