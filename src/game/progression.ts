import { DISHES } from './data/dishes';
import { FURNITURE } from './data/furniture';

/** Restaurant level caps out here; content unlocks stop after this. */
export const MAX_LEVEL = 20;

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

/** Dishes that may be on the menu at once. */
export function menuCapacity(level: number): number {
  return Math.min(12, 4 + Math.floor(level / 2));
}

/**
 * Employees that may be on the payroll at once. Three from the start so a new
 * player can run a waiter, a chef and a cleaner, which is the minimum viable
 * kitchen the tutorial asks them to build.
 */
export function staffCapacity(level: number): number {
  return Math.min(12, 3 + Math.floor(level / 2));
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

/** Everything newly available at `level`, for the level-up celebration. */
export function unlocksAtLevel(level: number): { dishes: string[]; furniture: string[] } {
  return {
    dishes: DISHES.filter((d) => d.unlockLevel === level).map((d) => d.name),
    furniture: FURNITURE.filter((f) => f.unlockLevel === level).map((f) => f.name),
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
