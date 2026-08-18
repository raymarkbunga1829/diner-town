import { DISHES } from './data/dishes';
import { FURNITURE } from './data/furniture';
import { REGULARS } from './data/regulars';

/** Restaurant level caps out here; the fame stars below carry on from it. */
export const MAX_LEVEL = 20;

/**
 * Anything the catalogue gates behind progress. `unlockStars` is only set on the
 * handful of things that arrive after the restaurant level has capped out, so
 * everything a player meets on the way up reads exactly as it did before.
 */
export interface Unlockable {
  unlockLevel: number;
  unlockStars?: number;
}

export function isUnlocked(item: Unlockable, level: number, stars: number): boolean {
  return level >= item.unlockLevel && stars >= (item.unlockStars ?? 0);
}

/** What the shop and the recipe list put on a locked card. */
export function unlockLabel(item: Unlockable): string {
  return item.unlockStars ? `Fame star ${item.unlockStars}` : `Level ${item.unlockLevel}`;
}

/** Total XP required to reach a given level. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 2; l <= level; l++) total += Math.round(140 * Math.pow(l - 1, 1.55));
  return total;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** XP earned so far within the current level, and the amount needed to advance. */
export function levelProgress(xp: number): { level: number; into: number; span: number } {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 1, span: 1 };
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, into: xp - base, span: next - base };
}

/**
 * Fame is what experience turns into once the restaurant level has nothing left
 * to give. Every star costs more than the one before it, so the first arrives
 * within a shift or two of capping out and the fifth is a fortnight's trading.
 */
export function fameForStar(star: number): number {
  if (star <= 0) return 0;
  let total = 0;
  for (let s = 1; s <= star; s++) total += Math.round(2400 * Math.pow(s, 1.3));
  return total;
}

/**
 * Stars are deliberately uncapped: the rewards run out at five, but the number
 * carries on so a maxed-out diner still has something that moves.
 */
export function starsForFame(fame: number): number {
  if (!Number.isFinite(fame) || fame <= 0) return 0;
  let star = 0;
  while (star < 999 && fame >= fameForStar(star + 1)) star++;
  return star;
}

/** Fame earned into the current star, and what the next one costs. */
export function fameProgress(fame: number): { star: number; into: number; span: number } {
  const star = starsForFame(fame);
  const base = fameForStar(star);
  return { star, into: Math.max(0, fame - base), span: fameForStar(star + 1) - base };
}

/**
 * What each of the first stars is worth. Recipes, furniture and faces are gated
 * on the catalogue itself — see `unlocksAtStar` — so what lives here is the
 * title the diner earns and the capacity the room is allowed past its cap.
 */
export interface StarReward {
  star: number;
  /** Shown on Manage as what the diner is now known as. */
  title: string;
  note: string;
  menuSlots?: number;
  staffSlots?: number;
}

export const STAR_REWARDS: readonly StarReward[] = [
  {
    star: 1,
    title: 'Word of Mouth',
    note: 'A recipe you only cook for people who ask for it by name.',
  },
  {
    star: 2,
    title: 'Corner Institution',
    note: 'One more menu slot than the room was ever meant to hold.',
    menuSlots: 1,
  },
  {
    star: 3,
    title: 'Local Landmark',
    note: 'Framed faces for the wall. The regulars are what got you here.',
  },
  {
    star: 4,
    title: 'Name in the Paper',
    note: 'Another pair of hands on the payroll, and a critic to feed.',
    staffSlots: 1,
  },
  {
    star: 5,
    title: 'Diner of the Year',
    note: 'The bronze goes by the door. After this, stars are simply the score.',
  },
];

/** The last title the diner has earned, or null before the first star. */
export function fameTitle(stars: number): string | null {
  let title: string | null = null;
  for (const reward of STAR_REWARDS) {
    if (reward.star <= stars) title = reward.title;
  }
  return title;
}

function starBonus(stars: number, field: 'menuSlots' | 'staffSlots'): number {
  let total = 0;
  for (const reward of STAR_REWARDS) {
    if (reward.star <= stars) total += reward[field] ?? 0;
  }
  return total;
}

/** Dishes that may be on the menu at once. */
export function menuCapacity(level: number, stars = 0): number {
  return Math.min(12, 4 + Math.floor(level / 2)) + starBonus(stars, 'menuSlots');
}

/**
 * Employees that may be on the payroll at once. Three from the start so a new
 * player can run a waiter, a chef and a cleaner, which is the minimum viable
 * kitchen the tutorial asks them to build.
 */
export function staffCapacity(level: number, stars = 0): number {
  return Math.min(12, 3 + Math.floor(level / 2)) + starBonus(stars, 'staffSlots');
}

export const MIN_GRID = 8;
export const MAX_GRID = 16;

/** Cost to expand the dining room from `size` to `size + 2`. */
export function expansionCost(size: number): number {
  const step = (size - MIN_GRID) / 2;
  return Math.round(2400 * Math.pow(2.15, step));
}

/** Level needed before the next expansion may be bought. */
export function expansionLevel(size: number): number {
  return 4 + ((size - MIN_GRID) / 2) * 3;
}

export function canExpand(size: number): boolean {
  return size + 2 <= MAX_GRID;
}

/** Everything a celebration can name, by what it is. */
export interface Unlocks {
  dishes: string[];
  furniture: string[];
  regulars: string[];
}

/**
 * Everything newly available at `level`, for the level-up celebration. Anything
 * that also wants fame stars belongs to `unlocksAtStar` instead, so reaching the
 * cap never promises something the player cannot go and use.
 */
export function unlocksAtLevel(level: number): Unlocks {
  const byLevel = <T extends Unlockable>(item: T): boolean =>
    item.unlockLevel === level && !item.unlockStars;
  return {
    dishes: DISHES.filter(byLevel).map((d) => d.name),
    furniture: FURNITURE.filter(byLevel).map((f) => f.name),
    regulars: REGULARS.filter((r) => (r.unlockLevel ?? 1) === level && !r.unlockStars)
      .map((r) => r.name),
  };
}

/** Everything a fame star brings with it, for the star celebration. */
export function unlocksAtStar(star: number): Unlocks {
  const byStar = <T extends Unlockable>(item: T): boolean => item.unlockStars === star;
  return {
    dishes: DISHES.filter(byStar).map((d) => d.name),
    furniture: FURNITURE.filter(byStar).map((f) => f.name),
    regulars: REGULARS.filter((r) => r.unlockStars === star).map((r) => r.name),
  };
}

/** Seconds of real time per in-game day at normal speed. */
export const DAY_LENGTH = 360;

/** Fraction of the day that counts as evening, used for lighting. */
export function timeOfDay(clock: number): number {
  return (clock % DAY_LENGTH) / DAY_LENGTH;
}

export function dayNumber(clock: number): number {
  return Math.floor(clock / DAY_LENGTH) + 1;
}

export function clockLabel(clock: number): string {
  // Map the day fraction onto a 9am-11pm trading window.
  const t = timeOfDay(clock);
  const minutes = 9 * 60 + t * 14 * 60;
  const h24 = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  const suffix = h24 >= 12 ? 'pm' : 'am';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}
