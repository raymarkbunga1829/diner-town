import type { Grid } from '../game/grid';
import type { Game } from '../game/state';
import type { PanelId } from './api';

export interface CoachFocus {
  tx: number;
  ty: number;
}

/**
 * Everything a step is allowed to look at. The grid is included because a seat
 * only counts when a chair, a table and a walkway line up, which is a spatial
 * question rather than a count of what has been bought.
 */
export interface CoachContext {
  game: Game;
  grid: Grid;
  /** Tips the player has acknowledged this session, e.g. `panel:market`. */
  seen: Set<string>;
}

/** Sheet a "Show me" can open instead of panning. */
export interface CoachSheet {
  panel: PanelId;
  tab?: string;
}

export interface CoachStep {
  /** Message shown in the coach bubble. `<b>` is highlighted. */
  html: string;
  /** When true the step is complete and the coach moves on. */
  done: (ctx: CoachContext) => boolean;
  /** Label of the button that shows the player where to look. */
  cta?: string;
  /** Milestone written when the player taps the CTA. */
  mark?: string;
  /** Tile "Show me" should pan to — the thing that unblocks the loop. */
  focus?: (ctx: CoachContext) => CoachFocus | null;
  /** Sheet "Show me" should open, when reading a panel is the next move. */
  opens?: (ctx: CoachContext) => CoachSheet | null;
  /** Furniture "Show me" should start placing, when the room is missing it. */
  placeIfMissing?: (ctx: CoachContext) => string | null;
}

/** What tapping the CTA on a step does, so the UI and the checks agree. */
export interface CoachAction {
  mark: string | null;
  sheet: CoachSheet | null;
  place: string | null;
  focus: CoachFocus | null;
}

/**
 * Usable seats the extra-seats step asks for. The starter kit has four, so this
 * is one more table with a chair on each side — a real seating group, which a
 * pair of stools dropped in the middle of the floor cannot fake.
 */
export const COACH_TARGET_SEATS = 6;

function firstRole(game: Game, role: 'table' | 'chair' | 'counter' | 'stove'): CoachFocus | null {
  const p = game.placedWithRole(role)[0];
  return p ? { tx: p.tx, ty: p.ty } : null;
}

function firstDirtyTable(game: Game): CoachFocus | null {
  const p = game.placedWithRole('table').find((t) => t.dirty);
  return p ? { tx: p.tx, ty: p.ty } : null;
}

function firstCleaner(game: Game): CoachFocus | null {
  const s = game.staffByRole('cleaner')[0];
  return s ? { tx: s.tx, ty: s.ty } : null;
}

/** A guest has eaten and paid, on this save. */
function servedACover(game: Game): boolean {
  return game.data.stats.customersServed > 0;
}

/**
 * A light onboarding thread. Each step watches what has actually happened in the
 * room rather than whether the player looked at a panel, so the coach can only
 * be finished by running the service loop — but it never blocks the sim, so the
 * player is free to poke at everything else while a tip is up.
 *
 * First-hour order: first cover → counter → wiping → extra seats.
 */
export const COACH_STEPS: readonly CoachStep[] = [
  {
    html:
      'Welcome to your diner. Guests arrive through the door, look for a <b>clean seat next to a table</b>, then order from your menu. Tap a waiting guest to seat them — this tip stays up until somebody has eaten and paid.',
    done: (ctx) => servedACover(ctx.game),
    cta: 'Show me',
    mark: 'intro',
    focus: (ctx) => firstRole(ctx.game, 'chair') ?? firstRole(ctx.game, 'table'),
  },
  {
    html:
      'Finished plates park on the <b>pickup counter</b> so the stove is free for the next order. You start with one beside the burner — place another if you sold it.',
    done: (ctx) => ctx.game.placedWithRole('counter').length > 0 && ctx.seen.has('noticed-counter'),
    cta: 'Show me',
    mark: 'noticed-counter',
    focus: (ctx) => firstRole(ctx.game, 'counter') ?? firstRole(ctx.game, 'stove'),
    placeIfMissing: (ctx) =>
      ctx.game.placedWithRole('counter').length === 0 ? 'counter_wood' : null,
  },
  {
    html:
      'Guests leave a mess. Your <b>cleaner</b> wipes dirty tables so they can be reseated, and tapping a dirty table sends them over now. No cleaner on the payroll? Hire one from Staff. This tip clears once a table has been wiped.',
    done: (ctx) =>
      ctx.game.staffByRole('cleaner').length > 0 && ctx.game.data.stats.tablesCleaned > 0,
    cta: 'Show me',
    mark: 'noticed-cleaner',
    // Nothing to pan to when there is nobody to do the wiping, so send the
    // player to the noticeboard instead of the middle of the room.
    opens: (ctx) =>
      ctx.game.staffByRole('cleaner').length === 0 ? { panel: 'staff', tab: 'hire' } : null,
    focus: (ctx) => firstDirtyTable(ctx.game) ?? firstCleaner(ctx.game) ?? firstRole(ctx.game, 'table'),
  },
  {
    html:
      `More seats means more covers. Tap <b>Build</b> and add a table with a chair on each side — a chair only counts when it touches a table and someone can walk up to it. Get to ${COACH_TARGET_SEATS} usable seats.`,
    done: (ctx) => ctx.grid.usableSeats().length >= COACH_TARGET_SEATS,
    cta: 'Show me',
    opens: () => ({ panel: 'shop', tab: 'Tables' }),
  },
  {
    html:
      'You can work the floor yourself. <b>Tap a dirty table</b> to send your nearest free hand, tap a waiting plate to run it out, and tap a tired worker to feed them.',
    done: (ctx) => ctx.seen.has('tap-to-help'),
    cta: 'Got it',
    mark: 'tap-to-help',
  },
  {
    html:
      'Cooking uses ingredients. Open the <b>Market</b> and top up your pantry so the kitchen never runs dry.',
    done: (ctx) => ctx.seen.has('panel:market'),
    cta: 'Open Market',
    opens: () => ({ panel: 'market' }),
  },
  {
    html:
      'Your <b>Menu</b> decides what guests can order. Cook the same dish often and it levels up, selling for more each time.',
    done: (ctx) => ctx.seen.has('panel:menu'),
    cta: 'Open Menu',
    opens: () => ({ panel: 'menu' }),
  },
  {
    html:
      'Your star rating drives how fast customers arrive. Decor raises <b>Style</b> — try a plant or a lamp to get it moving.',
    done: (ctx) => ctx.game.ambience >= 22,
    cta: 'Show me',
    opens: () => ({ panel: 'shop', tab: 'Decor' }),
  },
  {
    html:
      'You have got the hang of it. Keep an eye on <b>Reputation</b> under Manage to see exactly what is holding you back.',
    // Re-checked here as well as on the first step, so a save that somehow
    // arrived at the outro without a cover still cannot sign the coach off.
    done: (ctx) => ctx.seen.has('outro') && servedACover(ctx.game),
    cta: 'Thanks',
    mark: 'outro',
  },
];

/**
 * The step the coach should be showing, given what the room looks like now.
 * Steps are skipped only when their own condition is met, so tapping a button
 * never moves the thread on by itself.
 */
export function coachProgress(step: number, ctx: CoachContext): number {
  let index = Math.max(0, step);
  while (index < COACH_STEPS.length && COACH_STEPS[index]!.done(ctx)) index++;
  return index;
}

/** Resolve a step's CTA against the current room. */
export function coachAction(step: CoachStep, ctx: CoachContext): CoachAction {
  const sheet = step.opens?.(ctx) ?? null;
  const place = sheet ? null : step.placeIfMissing?.(ctx) ?? null;
  return {
    mark: step.mark ?? null,
    sheet,
    place,
    focus: sheet || place ? null : step.focus?.(ctx) ?? null,
  };
}
