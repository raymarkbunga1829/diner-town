import type { Game } from '../game/state';

export interface CoachFocus {
  tx: number;
  ty: number;
}

export interface CoachStep {
  /** Message shown in the coach bubble. `<b>` is highlighted. */
  html: string;
  /** When true the step is complete and the coach moves on. */
  done: (game: Game, seen: Set<string>) => boolean;
  /** Optional dismiss button for purely informational steps. */
  cta?: string;
  /** Milestone written when the player taps the CTA. */
  mark?: string;
  /** Tile "Show me" should pan to — the thing that unblocks the loop. */
  focus?: (game: Game) => CoachFocus | null;
  /** If the player is missing this furniture, Show me starts placing it. */
  placeIfMissing?: string;
}

function firstRole(game: Game, role: 'table' | 'chair' | 'counter' | 'stove'): CoachFocus | null {
  const p = game.placedWithRole(role)[0];
  return p ? { tx: p.tx, ty: p.ty } : null;
}

function firstCleaner(game: Game): CoachFocus | null {
  const s = game.staffByRole('cleaner')[0];
  return s ? { tx: s.tx, ty: s.ty } : null;
}

/**
 * A light onboarding thread. Each step watches the real game state rather than
 * forcing the player down a scripted path, so it never blocks experimentation.
 * First-hour order: seat loop → counter → cleaner → extra seats.
 */
export const COACH_STEPS: readonly CoachStep[] = [
  {
    html:
      'Welcome to your diner. Guests arrive through the door, look for a <b>clean seat next to a table</b>, then order from your menu.',
    done: (_game, seen) => seen.has('intro'),
    cta: 'Show me',
    mark: 'intro',
    focus: (game) => firstRole(game, 'chair') ?? firstRole(game, 'table'),
  },
  {
    html:
      'Finished plates park on the <b>pickup counter</b> so the stove stays free. You start with one by the burner — place one if you sold it.',
    done: (game, seen) => game.placedWithRole('counter').length > 0 && seen.has('noticed-counter'),
    cta: 'Show me',
    mark: 'noticed-counter',
    focus: (game) => firstRole(game, 'counter') ?? firstRole(game, 'stove'),
    placeIfMissing: 'counter_wood',
  },
  {
    html:
      'Guests leave a mess. Your <b>cleaner</b> wipes dirty tables so they can be reseated. Hire one from Staff if you do not have one yet.',
    done: (game, seen) =>
      game.staffByRole('cleaner').length > 0 && seen.has('noticed-cleaner'),
    cta: 'Show me',
    mark: 'noticed-cleaner',
    focus: (game) => firstCleaner(game) ?? firstRole(game, 'table'),
  },
  {
    html:
      'More seats means more covers. Tap <b>Build</b>, pick a table and some chairs, and remember a chair only works when it touches a table.',
    done: (game) => game.seatCount >= 5,
  },
  {
    html:
      'Cooking uses ingredients. Open the <b>Market</b> and top up your pantry so the kitchen never runs dry.',
    done: (_game, seen) => seen.has('panel:market'),
  },
  {
    html:
      'Your <b>Menu</b> decides what guests can order. Cook the same dish often and it levels up, selling for more each time.',
    done: (_game, seen) => seen.has('panel:menu'),
  },
  {
    html:
      'Your star rating drives how fast customers arrive. Decor raises <b>Style</b> — try a plant or a lamp to get it moving.',
    done: (game) => game.ambience >= 22,
  },
  {
    html:
      'You have got the hang of it. Keep an eye on <b>Reputation</b> under Manage to see exactly what is holding you back.',
    done: (_game, seen) => seen.has('outro'),
    cta: 'Thanks',
    mark: 'outro',
  },
];
