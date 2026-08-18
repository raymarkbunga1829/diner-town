/**
 * The end-of-day readout.
 *
 * Wages used to be paid out as a floater over the door, which is the easiest
 * thing in the game to miss and also the only number that can quietly bankrupt
 * a player. Rolling over into a new day now produces a card with the day's real
 * figures and, more importantly, the one thing worth doing before the next one.
 */

import { DISHES_BY_ID } from './data/dishes';
import { INGREDIENTS, type IngredientId } from './data/ingredients';
import type { Game } from './state';
import type { DayLedger, DayRecap, RecapAction } from './types';

export function emptyLedger(day: number): DayLedger {
  return {
    day,
    covers: 0,
    walkouts: 0,
    dishEarnings: 0,
    tips: 0,
    regularsDelighted: 0,
    regularsLost: 0,
    fame: 0,
  };
}

/** Fill in a ledger that is missing or belongs to a day that has already gone. */
export function normaliseLedger(raw: unknown, day: number): DayLedger {
  const fresh = emptyLedger(day);
  if (!raw || typeof raw !== 'object') return fresh;
  const old = raw as Partial<DayLedger>;
  if (old.day !== day) return fresh;
  const count = (v: unknown): number => Math.max(0, Math.floor(Number(v) || 0));
  return {
    day,
    covers: count(old.covers),
    walkouts: count(old.walkouts),
    dishEarnings: count(old.dishEarnings),
    tips: count(old.tips),
    regularsDelighted: count(old.regularsDelighted),
    regularsLost: count(old.regularsLost),
    fame: count(old.fame),
  };
}

/**
 * The ingredient the menu is shortest of, so a pantry warning can name
 * something the player can actually go and buy.
 */
export function scarcestIngredient(game: Game): IngredientId | null {
  let worst: IngredientId | null = null;
  let worstShort = 0;
  for (const dishId of game.data.menu) {
    const dish = DISHES_BY_ID[dishId];
    if (!dish) continue;
    for (const [id, qty] of Object.entries(dish.recipe)) {
      const key = id as IngredientId;
      const short = (qty ?? 0) - game.pantryCount(key);
      if (short > worstShort) {
        worstShort = short;
        worst = key;
      }
    }
  }
  return worst;
}

/**
 * One thing to do next, in the order a struggling diner actually needs it: you
 * cannot serve without stock, cannot seat without clean tables, and cannot take
 * orders with a team that has stopped. Only the top match is ever shown, because
 * a list of six suggestions is the same as none.
 */
export function suggestNextAction(
  game: Game,
  ledger: DayLedger,
  payroll: { wages: number; wagesPaid: number } = { wages: 0, wagesPaid: 0 },
): RecapAction {
  const d = game.data;
  const waiters = game.staffByRole('waiter').length;
  const chefs = game.staffByRole('chef').length;
  const cleaners = game.staffByRole('cleaner').length;
  const dirty = game.placedWithRole('table').filter((t) => t.dirty).length;

  if (d.menu.length === 0) {
    return { label: 'Put a dish on your menu', target: 'menu' };
  }
  if (!game.menuCanCook()) {
    const short = scarcestIngredient(game);
    return {
      label: short ? `Top up ${INGREDIENTS[short].name.toLowerCase()} at the market` : 'Restock the pantry',
      target: 'market',
    };
  }
  if (!d.open) {
    return { label: 'Open the doors again', target: null };
  }
  if (!chefs) return { label: 'Hire a chef — nothing can be cooked', target: 'staff' };
  if (!waiters) return { label: 'Hire a waiter — nobody is taking orders', target: 'staff' };
  if (d.staff.some((s) => s.state === 'exhausted')) {
    return { label: 'Feed the team before tomorrow', target: 'staff' };
  }
  if (payroll.wages > 0 && payroll.wagesPaid < payroll.wages) {
    return { label: 'Earn more before payroll — or let someone go', target: 'staff' };
  }
  if (game.usableSeatCount < 4) {
    return { label: 'Place another table and chair', target: 'shop' };
  }
  if (ledger.walkouts >= 3 && ledger.walkouts > ledger.covers * 0.3) {
    if (waiters < 2) return { label: 'Hire a second waiter', target: 'staff' };
    if (dirty > 1 && cleaners < 1) return { label: 'Hire a cleaner', target: 'staff' };
    if (game.placedWithRole('stove').length < 2) {
      return { label: 'Add a second stove', target: 'shop' };
    }
    return { label: 'Place another table', target: 'shop' };
  }
  if (dirty > 1 && cleaners < 1) {
    return { label: 'Hire a cleaner for the dirty tables', target: 'staff' };
  }
  if (game.styleScore < 0.6) {
    return { label: 'Buy some decor to raise Style', target: 'shop' };
  }
  if (ledger.covers > 0 && game.usableSeatCount < 8) {
    return { label: 'Place another table', target: 'shop' };
  }
  return { label: 'Keep the menu tight so mastery climbs', target: 'menu' };
}

/**
 * Turn the day just gone into a card's worth of figures. `wages` is what was
 * owed and `wagesPaid` what the till could actually cover, because the gap is
 * the part that costs the player a tired team tomorrow.
 */
export function buildDayRecap(
  game: Game,
  ledger: DayLedger,
  wages: number,
  wagesPaid: number,
): DayRecap {
  const pantryDry = game.data.menu.length > 0 && !game.menuCanCook();
  const short = pantryDry ? scarcestIngredient(game) : null;
  return {
    ...ledger,
    wages,
    wagesPaid,
    pantryWarning: pantryDry
      ? short
        ? `Out of ${INGREDIENTS[short].name.toLowerCase()} — the kitchen cannot cook your menu`
        : 'The pantry is empty — the kitchen cannot cook your menu'
      : null,
    action: suggestNextAction(game, ledger, { wages, wagesPaid }),
  };
}
