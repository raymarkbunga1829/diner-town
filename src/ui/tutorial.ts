import type { Game } from '../game/state';

export interface CoachStep {
  /** Message shown in the coach bubble. `<b>` is highlighted. */
  html: string;
  /** When true the step is complete and the coach moves on. */
  done: (game: Game, seen: Set<string>) => boolean;
  /** Optional dismiss button for purely informational steps. */
  cta?: string;
}

/**
 * A light onboarding thread. Each step watches the real game state rather than
 * forcing the player down a scripted path, so it never blocks experimentation.
 */
export const COACH_STEPS: readonly CoachStep[] = [
  {
    html:
      'Welcome to your diner. Guests arrive through the door, look for a <b>clean seat next to a table</b>, then order from your menu.',
    done: (_game, seen) => seen.has('intro'),
    cta: 'Show me',
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
      'More seats means more covers. Tap <b>Build</b>, pick a table and some chairs, and remember a chair only works when it touches a table.',
    done: (game) => game.seatCount >= 5,
  },
  {
    html:
      'Guests leave a mess. Hire a <b>Cleaner</b> from the Staff panel so tables get wiped and can be reseated.',
    done: (game) => game.staffByRole('cleaner').length > 0,
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
  },
];
