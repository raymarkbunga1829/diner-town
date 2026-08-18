/**
 * Bookkeeping for the named guests who come back.
 *
 * A regular is only interesting if the player can affect the visit, so their
 * favourite is resolved against the menu they can actually cook rather than
 * fixed in the roster: keep a dish on the menu and the guest who loves it has a
 * reason to be delighted, drop it and they settle for whatever is there.
 */

import { hashString } from '../engine/rng';
import { DISHES_BY_ID } from './data/dishes';
import { REGULARS, REGULARS_BY_ID, type RegularDef } from './data/regulars';
import { appearanceFrom } from './people';
import { DAY_LENGTH } from './progression';
import type { Appearance, RegularState } from './types';

/** How a visit ended, which decides how soon they come back. */
export type VisitMood = 'delighted' | 'fed' | 'snubbed';

export function regularLook(def: RegularDef): Appearance {
  return { ...appearanceFrom(`regular-${def.id}`), ...def.look };
}

/** Given name only, for floaters where the full name would not fit. */
export function shortName(name: string): string {
  return name.split(' ')[0] ?? name;
}

/**
 * The dish this regular will ask for: the first of their tastes the kitchen
 * offers, or failing that a stable pick from the menu so they still have
 * something they are known for. Null only when the menu is empty.
 */
export function favouriteFor(def: RegularDef, menu: readonly string[]): string | null {
  const cookable = menu.filter((id) => DISHES_BY_ID[id]);
  if (!cookable.length) return null;
  const loved = def.tastes.find((id) => cookable.includes(id));
  if (loved) return loved;
  return cookable[hashString(def.id) % cookable.length] ?? null;
}

/** Re-point a regular at the menu when their favourite is no longer on it. */
export function refreshFavourite(state: RegularState, menu: readonly string[]): void {
  const def = REGULARS_BY_ID[state.id];
  if (!def) return;
  const current = state.favouriteDishId;
  if (current && menu.includes(current)) return;
  state.favouriteDishId = favouriteFor(def, menu);
}

/** In-game seconds until a regular is next due, given how the visit went. */
export function nextVisitDelay(def: RegularDef, mood: VisitMood): number {
  const eagerness = mood === 'delighted' ? 0.78 : mood === 'snubbed' ? 2.1 : 1.1;
  return def.cadenceDays * DAY_LENGTH * eagerness;
}

function blankState(def: RegularDef, index: number): RegularState {
  return {
    id: def.id,
    favouriteDishId: null,
    // Staggered through the first couple of days, so the roster introduces
    // itself over the opening hour instead of all at once.
    nextVisitAt: 45 + index * 55,
    visits: 0,
    delighted: 0,
    walkouts: 0,
  };
}

export function createRegulars(): RegularState[] {
  return REGULARS.map(blankState);
}

/**
 * Reconcile whatever is in a save with the roster this build ships. Saves from
 * before regulars existed simply arrive with nothing, and a regular added in a
 * later build is appended rather than skipped.
 */
export function migrateRegulars(raw: unknown): RegularState[] {
  const saved = new Map<string, Partial<RegularState>>();
  if (Array.isArray(raw)) {
    for (const entry of raw as Array<Partial<RegularState>>) {
      if (entry && typeof entry.id === 'string' && REGULARS_BY_ID[entry.id]) {
        saved.set(entry.id, entry);
      }
    }
  }

  return REGULARS.map((def, index) => {
    const fresh = blankState(def, index);
    const old = saved.get(def.id);
    if (!old) return fresh;
    const favourite = old.favouriteDishId;
    return {
      id: def.id,
      favouriteDishId: typeof favourite === 'string' && DISHES_BY_ID[favourite] ? favourite : null,
      nextVisitAt: Number.isFinite(old.nextVisitAt) ? Number(old.nextVisitAt) : fresh.nextVisitAt,
      visits: Math.max(0, Math.floor(Number(old.visits) || 0)),
      delighted: Math.max(0, Math.floor(Number(old.delighted) || 0)),
      walkouts: Math.max(0, Math.floor(Number(old.walkouts) || 0)),
    };
  });
}
