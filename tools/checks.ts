/**
 * Headless sanity checks for the parts of the game that are easy to get subtly
 * wrong: the isometric projection, wall picking, pathfinding, mastery curves and
 * the end-to-end service loop.
 *
 * Run with `npm run check`. Deliberately dependency-free — it bundles the real
 * source with esbuild and asserts against it, rather than reimplementing logic.
 */

import { Camera } from '../src/engine/camera';
import { NEIGHBOURS, TILE_H, TILE_W, TILE_Z, tileToWorld, worldToTile } from '../src/engine/iso';
import { nearestActor } from '../src/game/pick';
import {
  cumulativeServings,
  dishLevelFromServings,
  dishPrice,
  DISHES_BY_ID,
  MAX_DISH_LEVEL,
} from '../src/game/data/dishes';
import { FURNITURE_BY_ID } from '../src/game/data/furniture';
import { INGREDIENTS, INGREDIENT_LIST } from '../src/game/data/ingredients';
import { REGULARS, REGULARS_BY_ID } from '../src/game/data/regulars';
import { Grid } from '../src/game/grid';
import { findPath } from '../src/game/path';
import { appearanceFrom } from '../src/game/people';
import { DAY_LENGTH, levelForXp, xpForLevel } from '../src/game/progression';
import { buildDayRecap, suggestNextAction } from '../src/game/recap';
import { favouriteFor, nextVisitDelay, refreshFavourite } from '../src/game/regulars';
import { catchUpWhileAway, Simulation } from '../src/game/sim';
import {
  BACKUP_KEY,
  createNewGame,
  Game,
  importSaveText,
  installSave,
  SAVE_KEY,
  SAVE_VERSION,
  slotInfo,
} from '../src/game/state';
import type { Order, SaveData, Staff } from '../src/game/types';
import { buildingBox } from '../src/render/renderer';
import {
  coachAction,
  coachBaseline,
  coachProgress,
  COACH_STEPS,
  COACH_TARGET_SEATS,
  type CoachBaseline,
  type CoachContext,
} from '../src/ui/tutorial';

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = ''): void {
  checks++;
  if (condition) return;
  failures++;
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function group(name: string, run: () => void): void {
  console.log(`\n${name}`);
  run();
}

// ---------------------------------------------------------------- projection

group('Isometric projection', () => {
  for (const [tx, ty] of [[0, 0], [3, 7], [-2, 5], [15.5, 0.25]] as Array<[number, number]>) {
    const w = tileToWorld(tx, ty);
    const back = worldToTile(w.x, w.y);
    check(
      `round-trips (${tx}, ${ty})`,
      Math.abs(back.tx - tx) < 1e-9 && Math.abs(back.ty - ty) < 1e-9,
      `got (${back.tx}, ${back.ty})`,
    );
  }

  // Height must not disturb the horizontal position of a tile.
  const flat = tileToWorld(4, 4, 0);
  const raised = tileToWorld(4, 4, 2);
  check('height only moves vertically', flat.x === raised.x && raised.y === flat.y - 2 * TILE_Z);
});

// -------------------------------------------------------------- wall picking

group('Wall picking', () => {
  const game = new Game(createNewGame());
  const grid = new Grid(game);
  grid.sync();

  /** Project a point `k` tiles up a wall segment and invert it like a click. */
  const pickOnWall = (
    wall: 'ne' | 'nw',
    index: number,
    along: number,
    heightTiles: number,
  ): [number, number] | null => {
    const base =
      wall === 'ne' ? tileToWorld(index + along, 0) : tileToWorld(0, index + along);
    const screenY = base.y - heightTiles * TILE_Z;
    const t = worldToTile(base.x, screenY);
    return grid.resolveWallTarget(t.tx, t.ty);
  };

  for (const index of [0, 1, 3, 7]) {
    if (index === grid.doorX) continue;
    for (const height of [0.3, 1.0, 1.8, 2.2]) {
      for (const along of [0.1, 0.5, 0.9]) {
        const ne = pickOnWall('ne', index, along, height);
        check(
          `north-east wall ${index} at height ${height}`,
          !!ne && ne[0] === index && ne[1] === -1,
          `got ${JSON.stringify(ne)}`,
        );
        const nw = pickOnWall('nw', index, along, height);
        check(
          `north-west wall ${index} at height ${height}`,
          !!nw && nw[0] === -1 && nw[1] === index,
          `got ${JSON.stringify(nw)}`,
        );
      }
    }
  }

  check('doorway gap is not a wall slot', pickOnWall('ne', grid.doorX, 0.5, 1.2) === null);
  check('floor clicks are not wall clicks', grid.resolveWallTarget(3.5, 3.5) === null);
});

// -------------------------------------------------------------- grid & paths

group('Grid and pathfinding', () => {
  const game = new Game(createNewGame());
  const grid = new Grid(game);
  grid.sync();
  const size = game.data.gridSize;

  const path = findPath(grid, game.data.doorX, -2, [[size - 1, size - 1]]);
  check('door reaches the far corner', path !== null && path.length > 0);

  const chairs = game.placedWithRole('chair');
  check('starter chairs exist', chairs.length === 4, `found ${chairs.length}`);
  check('starter chairs are usable seats', chairs.every((c) => grid.isUsableSeat(c)));

  const stove = game.placedWithRole('stove')[0]!;
  check('the stove is reachable', grid.accessTiles(stove).length > 0);

  // Rugs are a separate layer, so furniture must be placeable on top of them.
  const rug = FURNITURE_BY_ID.rug_small!;
  const stool = FURNITURE_BY_ID.chair_stool!;
  let free: [number, number] | null = null;
  for (let y = 0; y < size && !free; y++) {
    for (let x = 0; x < size && !free; x++) {
      if (!grid.solidAt(x, y) && !grid.flatAt(x, y)) free = [x, y];
    }
  }
  check('the starter floor has room to spare', free !== null);
  free = free ?? [size - 1, size - 1];
  check('an empty tile accepts a rug', grid.canPlace(rug, free[0], free[1], 0));
  game.data.placed.push({ uid: game.nextUid(), defId: rug.id, tx: free[0], ty: free[1], rot: 0 });
  game.touch();
  grid.sync();
  check('furniture stacks on a rug', grid.canPlace(stool, free[0], free[1], 0));
  check('a second rug does not stack', !grid.canPlace(rug, free[0], free[1], 0));
  check('a rug does not block walking', grid.isWalkable(free[0], free[1]));

  // Walling the door off must be refused.
  const table = FURNITURE_BY_ID.table_square!;
  const doorX = game.data.doorX;
  for (const [tx, ty] of [[doorX - 1, 0], [doorX + 1, 0]] as Array<[number, number]>) {
    game.data.placed.push({ uid: game.nextUid(), defId: table.id, tx, ty, rot: 0 });
  }
  game.touch();
  grid.sync();
  check(
    'sealing the entrance is rejected',
    !grid.canPlace(table, doorX, 0, 0),
    'placement that traps the doorway was allowed',
  );
});

// ---------------------------------------------------------- starter loadout

group('Starter loadout', () => {
  const game = new Game(createNewGame());
  const grid = new Grid(game);
  grid.sync();

  check('default name is Diner Town', game.data.restaurantName === 'Diner Town');

  const counters = game.placedWithRole('counter');
  check('starter has a pickup counter', counters.length === 1, `found ${counters.length}`);
  check('starter counter is wooden', counters[0]?.defId === 'counter_wood');

  const stove = game.placedWithRole('stove')[0];
  const counter = counters[0];
  const nextToStove =
    !!stove &&
    !!counter &&
    Math.abs(stove.tx - counter.tx) + Math.abs(stove.ty - counter.ty) === 1;
  check('counter sits next to the stove', nextToStove, `stove ${stove?.tx},${stove?.ty} counter ${counter?.tx},${counter?.ty}`);

  check('starter has a waiter', game.staffByRole('waiter').length === 1);
  check('starter has a chef', game.staffByRole('chef').length === 1);
  check('starter has a cleaner', game.staffByRole('cleaner').length === 1, `roles ${game.data.staff.map((s) => s.role).join(',')}`);
  check('level 1 staff capacity fits the trio', game.staffCapacity >= 3, `cap ${game.staffCapacity}`);
  check('wooden counter is unlocked at level 1', FURNITURE_BY_ID.counter_wood?.unlockLevel === 1);

  const size = game.data.gridSize;
  const path = findPath(grid, game.data.doorX, -2, [[size - 1, size - 1]]);
  check('door still reaches the far corner with the new kit', path !== null && path.length > 0);
  check(
    'door tile is empty and walkable',
    !grid.solidAt(game.data.doorX, 0) && grid.isWalkable(game.data.doorX, 0),
  );

  // Flood-fill still refuses a full seal even with the extra counter.
  const table = FURNITURE_BY_ID.table_square!;
  const doorX = game.data.doorX;
  for (const [tx, ty] of [[doorX - 1, 0], [doorX + 1, 0]] as Array<[number, number]>) {
    if (!grid.solidAt(tx, ty)) {
      game.data.placed.push({ uid: game.nextUid(), defId: table.id, tx, ty, rot: 0 });
    }
  }
  game.touch();
  grid.sync();
  check(
    'sealing the entrance is still rejected',
    !grid.canPlace(table, doorX, 0, 0),
    'placement that traps the doorway was allowed',
  );
});

group('Starter cleaner wipes without buying', () => {
  const game = new Game(createNewGame());
  game.data.open = false;
  const sim = new Simulation(game);
  const table = game.placedWithRole('table')[0]!;
  table.dirty = true;
  const coins = game.data.coins;
  const staffCount = game.data.staff.length;
  const placedCount = game.data.placed.length;

  const step = 1 / 20;
  for (let i = 0; i < 20 * 20; i++) sim.update(step);

  check('starter cleaner wiped the dirty table', !table.dirty);
  check('no furniture was bought', game.data.placed.length === placedCount);
  check('no staff were hired', game.data.staff.length === staffCount);
  check('the till was not spent', game.data.coins === coins, `${coins} -> ${game.data.coins}`);
});

// ---------------------------------------------------------- shop honesty

group('Shop copy matches the sim', () => {
  const booth = FURNITURE_BY_ID.table_booth!;
  check('booth is a table, not a chair', booth.role === 'table' && !booth.seats);
  check('booth still needs chairs', (booth.tableCapacity ?? 0) > 0);
  check('booth copy mentions chairs', /chairs/i.test(booth.description));
  check('booth copy does not claim built-in seating', !/built in/i.test(booth.description));

  const bin = FURNITURE_BY_ID.bin_small!;
  check('bin is ambience only', bin.ambience === -1 && !bin.speed);
  check('bin copy does not claim it cleans', !/grubby|keeps the floor/i.test(bin.description));
  check('bin copy names the style hit', /−1 Style|-1 Style/i.test(bin.description));

  const jukebox = FURNITURE_BY_ID.jukebox!;
  check('jukebox is decor', jukebox.role === 'decor' && jukebox.ambience === 16);
  check('jukebox copy names +16 Style', /\+16 Style/.test(jukebox.description));
  check('jukebox copy does not claim patience', !/patient for longer|keep.*patient/i.test(jukebox.description));

  const aquarium = FURNITURE_BY_ID.aquarium!;
  check('aquarium is decor', aquarium.role === 'decor' && aquarium.ambience === 24);
  check('aquarium copy names +24 Style', /\+24 Style/.test(aquarium.description));
  check('aquarium copy does not claim longer waits', !/happily wait|wait while/i.test(aquarium.description));
});

// ---------------------------------------------------------- coach order

/** Index of the step whose copy matches, so the checks read like the thread. */
function coachStep(pattern: RegExp): number {
  return COACH_STEPS.findIndex((s) => pattern.test(s.html));
}

const WELCOME_STEP = coachStep(/clean seat/i);
const COUNTER_STEP = coachStep(/pickup counter/i);
const CLEANER_STEP = coachStep(/wipes dirty tables/i);
const SEATS_STEP = coachStep(/More seats/i);
const STYLE_STEP = coachStep(/Style/);
const OUTRO_STEP = COACH_STEPS.length - 1;

/** Where the coach is up to, the way the app holds it between frames. */
interface CoachRun {
  step: number;
  since: CoachBaseline;
  sheets: string[];
  placed: string[];
}

const coachAt = (game: Game, step = 0): CoachRun => ({
  step,
  since: coachBaseline(game),
  sheets: [],
  placed: [],
});

/**
 * Replay the coach the way the UI drives it: tap the CTA on whichever step is
 * showing, record what that tap marked or opened, and let the thread move on
 * only when the step's own condition is satisfied — re-baselining each new tip
 * exactly as the app does. Never ticks the simulation, so anything it reaches
 * was reached by tapping alone.
 */
function tapThroughCoach(game: Game, grid: Grid, seen: Set<string>, from: CoachRun): CoachRun {
  const sheets: string[] = [];
  const placed: string[] = [];
  let index = from.step;
  let since = from.since;

  for (let taps = 0; taps <= COACH_STEPS.length * 2; taps++) {
    grid.sync();
    const settled = coachProgress(index, { game, grid, seen, since });
    if (settled !== index) {
      index = settled;
      since = coachBaseline(game);
    }
    if (index >= COACH_STEPS.length) break;

    const ctx: CoachContext = { game, grid, seen, since };
    const action = coachAction(COACH_STEPS[index]!, ctx);
    if (action.mark) seen.add(action.mark);
    if (action.sheet) {
      sheets.push(
        action.sheet.tab ? `${action.sheet.panel}:${action.sheet.tab}` : action.sheet.panel,
      );
      // Opening a sheet is exactly what the app records as having seen it.
      seen.add(`panel:${action.sheet.panel}`);
    }
    if (action.place) placed.push(action.place);

    // Tapping settled nothing the step was waiting for, so this is as far as a
    // player who only presses buttons can get.
    const after = coachProgress(index, ctx);
    if (after === index) break;
    index = after;
    since = coachBaseline(game);
  }
  return { step: index, since, sheets, placed };
}

/** Every milestone the coach can read, as though the player had tapped it all. */
function everyMilestone(): Set<string> {
  const seen = new Set<string>(['intro', 'noticed-counter', 'noticed-cleaner', 'tap-to-help', 'outro']);
  for (const id of ['shop', 'menu', 'market', 'staff', 'manage']) seen.add(`panel:${id}`);
  return seen;
}

group('Tutorial order', () => {
  const html = COACH_STEPS.map((s) => s.html);
  check('welcome leads with a clean seat', WELCOME_STEP === 0);
  check('counter is step 2', COUNTER_STEP === 1);
  check('cleaner is step 3', CLEANER_STEP === 2);
  check('extra seats come after the cleaner', SEATS_STEP === 3);
  check('the welcome teaches the seating tap', /tap a waiting guest/i.test(html[0] ?? ''));
  check('tapping the floor is taught', COACH_STEPS.some((s) => s.mark === 'tap-to-help'));
  check('counter step focuses the counter', typeof COACH_STEPS[1]?.focus === 'function');
  check('cleaner step focuses the cleaner', typeof COACH_STEPS[2]?.focus === 'function');
  check('the style step is the last thing before the sign-off', STYLE_STEP === OUTRO_STEP - 1);
  check('no copy names another game', !/restaurant city|playfish|\bEA\b/i.test(html.join(' ')));

  // Show me has to fix the room, not just describe it.
  const game = new Game(createNewGame());
  const grid = new Grid(game);
  grid.sync();
  const ctx: CoachContext = { game, grid, seen: new Set<string>(), since: coachBaseline(game) };

  const withCounter = coachAction(COACH_STEPS[COUNTER_STEP]!, ctx);
  check('with a counter, Show me points at it', !!withCounter.focus && withCounter.place === null);

  for (const counter of game.placedWithRole('counter')) {
    game.data.placed = game.data.placed.filter((p) => p.uid !== counter.uid);
  }
  game.touch();
  grid.sync();
  const noCounter = coachAction(COACH_STEPS[COUNTER_STEP]!, ctx);
  check('with none, Show me starts placing one', noCounter.place === 'counter_wood', `${noCounter.place}`);

  const withCleaner = coachAction(COACH_STEPS[CLEANER_STEP]!, ctx);
  check('with a cleaner, Show me pans to the room', withCleaner.sheet === null && !!withCleaner.focus);

  game.data.staff = game.data.staff.filter((s) => s.role !== 'cleaner');
  game.touch();
  const noCleaner = coachAction(COACH_STEPS[CLEANER_STEP]!, ctx);
  check(
    'with none, Show me opens hiring rather than panning',
    noCleaner.sheet?.panel === 'staff' && noCleaner.sheet?.tab === 'hire',
    JSON.stringify(noCleaner.sheet),
  );
});

group('Show me cannot tap the coach through the first hour', () => {
  const game = new Game(createNewGame());
  const grid = new Grid(game);
  grid.sync();

  check('nobody has been served', game.data.stats.customersServed === 0);
  check('nothing has been wiped', game.data.stats.tablesCleaned === 0);

  // A player who taps every button and opens every panel, and nothing else.
  const seen = everyMilestone();
  const ctx: CoachContext = { game, grid, seen, since: coachBaseline(game) };
  check('the welcome will not sign itself off', coachProgress(0, ctx) === WELCOME_STEP);
  check(
    'no milestone finishes the coach from anywhere in the thread',
    COACH_STEPS.every((_s, i) => coachProgress(i, ctx) < COACH_STEPS.length),
  );
  check(
    'the sign-off itself needs a cover',
    coachProgress(OUTRO_STEP, ctx) === OUTRO_STEP,
    'the outro completed with nothing served',
  );

  // And the same through the real tapping path, from a clean slate.
  const tapped = tapThroughCoach(game, grid, new Set<string>(), coachAt(game));
  check('tapping Show me stops on the welcome', tapped.step === WELCOME_STEP, `stopped on ${tapped.step}`);
  check('the coach is nowhere near finished', tapped.step < COACH_STEPS.length);

  // Starting further along, each early step still waits for its own outcome.
  const fromCounter = tapThroughCoach(game, grid, new Set<string>(), coachAt(game, COUNTER_STEP));
  check('the counter tip hands over to the cleaner tip', fromCounter.step === CLEANER_STEP);
  check('the cleaner tip waits for a wipe', fromCounter.step !== SEATS_STEP);

  // A shift that ran before the tip went up is not the tip's shift. Without
  // this, the room quietly satisfies each tip before it can be read.
  const veteran = new Game(createNewGame());
  veteran.data.stats.customersServed = 40;
  veteran.data.stats.tablesCleaned = 30;
  const veteranGrid = new Grid(veteran);
  veteranGrid.sync();
  const reopened = tapThroughCoach(veteran, veteranGrid, everyMilestone(), coachAt(veteran));
  check(
    'a past shift does not count towards the tip showing now',
    reopened.step === WELCOME_STEP,
    `stopped on ${reopened.step}`,
  );
});

group('Serving and wiping is what moves the coach on', () => {
  const game = new Game(createNewGame());
  const sim = new Simulation(game);
  const grid = sim.grid;
  grid.sync();
  const seen = new Set<string>();

  check('the starter kit has four usable seats', grid.usableSeats().length === 4,
    `${grid.usableSeats().length}`);

  // The welcome is what is on screen from the moment the diner opens.
  let coach = coachAt(game);
  coach = tapThroughCoach(game, grid, seen, coach);
  check('a fresh diner stops on the welcome', coach.step === WELCOME_STEP, `stopped on ${coach.step}`);

  const served = runUntil(sim, () => game.data.stats.customersServed > coach.since.customersServed, 240);
  check('a guest was served', served, `served ${game.data.stats.customersServed}`);
  if (!served) return;

  coach = tapThroughCoach(game, grid, seen, coach);
  check(
    'a real cover carries the welcome and the counter tip through to the cleaner',
    coach.step === CLEANER_STEP,
    `stopped on ${coach.step}`,
  );
  check('the counter was acknowledged on the way', seen.has('noticed-counter'));

  const wiped = runUntil(sim, () => game.data.stats.tablesCleaned > coach.since.tablesCleaned, 240);
  check('a table went from dirty back to clean', wiped, `wiped ${game.data.stats.tablesCleaned}`);
  if (!wiped) return;

  coach = tapThroughCoach(game, grid, seen, coach);
  check(
    'a real wipe carries the coach to the seating step',
    coach.step === SEATS_STEP,
    `stopped on ${coach.step}`,
  );

  // Stools nowhere near a table are not seats, and must not count as any.
  const before = grid.usableSeats().length;
  const orphans = addOrphanStools(game, grid, 2);
  check('two orphan stools were placed', orphans === 2);
  check('the raw chair count went up', game.chairCount === 4 + orphans, `${game.chairCount}`);
  check('no new usable seats appeared', grid.usableSeats().length === before);
  coach = tapThroughCoach(game, grid, seen, coach);
  check('orphan stools do not satisfy the seating step', coach.step === SEATS_STEP);

  // A table with a chair on each side is a different matter.
  const built = addSeatingGroup(game, grid);
  check('the room still has space for a seating group', built);
  if (!built) return;
  check(
    'the new group is usable seating',
    grid.usableSeats().length >= COACH_TARGET_SEATS,
    `${grid.usableSeats().length} usable seats`,
  );

  coach = tapThroughCoach(game, grid, seen, coach);
  check(
    'real seating carries the coach to the style step',
    coach.step === STYLE_STEP,
    `stopped on ${coach.step}`,
  );
  check('the market was introduced along the way', seen.has('panel:market'));
  check('so was the menu', seen.has('panel:menu'));
  check('but reading them was not what finished the coach', coach.step < COACH_STEPS.length);

  // Dress the room until Style is real, and the sign-off is finally earned.
  const painting = FURNITURE_BY_ID.painting!;
  for (let x = 0; x < grid.size && game.ambience < 22; x++) {
    if (!grid.canPlace(painting, x, -1, 0)) continue;
    game.data.placed.push({ uid: game.nextUid(), defId: painting.id, tx: x, ty: -1, rot: 0 });
    game.touch();
    grid.sync();
  }
  check('the room has some style now', game.ambience >= 22, `${game.ambience}`);
  coach = tapThroughCoach(game, grid, seen, coach);
  check('the coach can be finished', coach.step === COACH_STEPS.length, `stopped on ${coach.step}`);
  check('the sign-off was acknowledged', seen.has('outro'));
});

/**
 * Add a table with a chair on each side, accepting only a spot the shop itself
 * would allow — so the room the coach is then judged on is one a player could
 * actually have built.
 */
function addSeatingGroup(game: Game, grid: Grid): boolean {
  const put = (defId: string, tx: number, ty: number): number | null => {
    const def = FURNITURE_BY_ID[defId]!;
    if (!grid.canPlace(def, tx, ty, 0)) return null;
    const uid = game.nextUid();
    game.data.placed.push({ uid, defId, tx, ty, rot: 0 });
    game.touch();
    grid.sync();
    return uid;
  };

  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x + 2 < grid.size; x++) {
      const added = [put('table_square', x + 1, y), put('chair_stool', x, y), put('chair_stool', x + 2, y)];
      if (added.every((uid) => uid !== null)) return true;
      game.data.placed = game.data.placed.filter((p) => !added.includes(p.uid));
      game.touch();
      grid.sync();
    }
  }
  return false;
}

/**
 * Drop up to `want` stools on tiles the shop would allow but no table touches —
 * the fake seat a player builds by accident. Returns how many landed.
 */
function addOrphanStools(game: Game, grid: Grid, want: number): number {
  let placed = 0;
  for (let y = 0; y < grid.size && placed < want; y++) {
    for (let x = 0; x < grid.size && placed < want; x++) {
      if (!grid.canPlace(FURNITURE_BY_ID.chair_stool!, x, y, 0)) continue;
      const beside = NEIGHBOURS.some(([dx, dy]) => {
        const p = grid.solidAt(x + dx, y + dy);
        return !!p && game.defOf(p)?.role === 'table';
      });
      if (beside) continue;
      game.data.placed.push({ uid: game.nextUid(), defId: 'chair_stool', tx: x, ty: y, rot: 0 });
      game.touch();
      grid.sync();
      placed++;
    }
  }
  return placed;
}

// ------------------------------------------------------------- arrival rate

group('Arrivals follow the seats a guest can actually use', () => {
  const dinerWith = (change: (game: Game, grid: Grid) => void): Game => {
    const game = new Game(createNewGame());
    const grid = new Grid(game);
    grid.sync();
    change(game, grid);
    return game;
  };

  const plain = dinerWith(() => {});
  const base = plain.spawnInterval;
  check('the starter diner has four usable seats', plain.usableSeatCount === 4, `${plain.usableSeatCount}`);

  const stools = dinerWith((game, grid) => {
    check('three orphan stools were placed', addOrphanStools(game, grid, 3) === 3);
  });
  check('the stools count as chairs', stools.chairCount === 7, `${stools.chairCount}`);
  check('the stools are not seats', stools.usableSeatCount === 4, `${stools.usableSeatCount}`);
  // Fake seats may cost the player Style, which only ever slows arrivals down, so
  // "no faster than the plain diner" is the whole of the promise here.
  check(
    'orphan stools do not pull guests in any faster',
    stools.spawnInterval >= base,
    `${stools.spawnInterval.toFixed(2)}s against ${base.toFixed(2)}s`,
  );

  const roomier = dinerWith((game, grid) => {
    check('a real seating group fits in the starter room', addSeatingGroup(game, grid));
  });
  check('the group is usable seating', roomier.usableSeatCount === 6, `${roomier.usableSeatCount}`);
  check(
    'a real table with chairs does pull guests in faster',
    roomier.spawnInterval < base,
    `${roomier.spawnInterval.toFixed(2)}s against ${base.toFixed(2)}s`,
  );

  // Dirt takes seats out of service, so the arrival rate has to follow it down
  // rather than holding on to the seats the room had this morning.
  const messy = dinerWith((game, grid) => {
    addSeatingGroup(game, grid);
    for (const t of game.placedWithRole('table')) t.dirty = true;
    game.touch();
  });
  check('no seat is open while every table is dirty', messy.openSeatCount === 0);
  check(
    'a dirty room stops pulling a crowd in',
    messy.spawnInterval > roomier.spawnInterval,
    `${messy.spawnInterval.toFixed(2)}s against ${roomier.spawnInterval.toFixed(2)}s`,
  );

  // The rate is only half of it: the door itself has to ask the same question.
  const stoolsOnly = dinerWith((game) => {
    game.data.placed = game.data.placed.filter((p) => game.defOf(p)?.role !== 'table');
    game.touch();
  });
  check('a diner with no tables has no seats', stoolsOnly.usableSeatCount === 0);
  const sim = new Simulation(stoolsOnly);
  const arrived = runUntil(sim, () => stoolsOnly.customers.length > 0, 120);
  check('nobody turns up for a room of loose stools', !arrived);
});

// -------------------------------------------------------------- tap to help

group('Tapping a queueing guest seats them', () => {
  const game = new Game(createNewGame());
  const sim = new Simulation(game);

  // Hold every table dirty so the AI cannot seat anyone, which leaves a real
  // guest queueing for the player to act on.
  for (const t of game.placedWithRole('table')) t.dirty = true;
  game.touch();
  const queued = runUntil(sim, () => game.customers.some((c) => c.state === 'queueing'), 120);
  check('a guest is waiting at the door', queued);
  if (!queued) return;

  const guest = game.customers.find((c) => c.state === 'queueing')!;
  const blocked = sim.seatGuest(guest);
  check('a dirty room refuses the seat', !blocked.ok, blocked.message);
  check('the refusal names the fix', /dirty|wiped/i.test(blocked.message), blocked.message);
  check('the guest stayed in the queue', guest.state === 'queueing');

  for (const t of game.placedWithRole('table')) t.dirty = false;
  game.touch();
  const seated = sim.seatGuest(guest);
  check('a clean room accepts the seat', seated.ok, seated.message);
  check('the guest claimed a chair', guest.chairUid !== null);
  check('the guest claimed the table beside it', guest.tableUid !== null);
  check('the guest is walking over', guest.state === 'walkingToSeat');
  check(
    'the chair really is a chair',
    game.defOf(game.placedByUid(guest.chairUid!)!)?.role === 'chair',
  );
  check(
    'nobody else was given the same chair',
    game.customers.filter((c) => c.chairUid === guest.chairUid).length === 1,
  );
  check(
    'the commanded guest goes on to order',
    runUntil(sim, () => guest.state === 'awaitingWaiter' || guest.state === 'awaitingFood', 120),
    `guest ended up ${guest.state}`,
  );

  const again = sim.seatGuest(guest);
  check('seating a seated guest is a no-op', !again.ok && /already/i.test(again.message));
});

group('A tap lands on what it looks like it lands on', () => {
  const game = new Game(createNewGame());
  const grid = new Grid(game);
  const sim = new Simulation(game);

  // Actors are drawn at the centre of their tile, and a screen pick inverts to
  // fractional tile space, so the round trip has to survive both.
  const pickAt = (tx: number, ty: number): { tx: number; ty: number } => {
    const w = tileToWorld(tx + 0.5, ty + 0.5);
    return worldToTile(w.x, w.y);
  };

  const chef = game.data.staff.find((s) => s.role === 'chef')!;
  const onChef = pickAt(chef.tx, chef.ty);
  check(
    'a pick on a worker finds that worker',
    nearestActor(game.data.staff, onChef.tx, onChef.ty)?.id === chef.id,
  );
  check(
    'a pick three tiles away finds nobody',
    nearestActor(game.data.staff, onChef.tx + 3, onChef.ty + 3) === null,
  );
  check(
    'the nearer of two workers wins',
    nearestActor(game.data.staff, onChef.tx + 0.3, onChef.ty)?.id === chef.id,
  );

  // The queue is the case that made tile-rounding unusable: it shuffles along on
  // fractional positions outside the door and never lands on a tile centre.
  for (const t of game.placedWithRole('table')) t.dirty = true;
  game.touch();
  const queued = runUntil(sim, () =>
    game.customers.filter((c) => c.state === 'queueing').length >= 2, 150);
  check('a queue formed outside the door', queued);
  if (!queued) return;

  const queue = game.customers.filter((c) => c.state === 'queueing');
  check(
    'the queue really is off-grid',
    queue.some((c) => Math.abs(c.ty - Math.round(c.ty)) > 0.05),
    queue.map((c) => c.ty.toFixed(2)).join(', '),
  );
  for (const c of queue) {
    const pick = pickAt(c.tx, c.ty);
    check(
      `a pick on ${c.name} in the queue finds them`,
      nearestActor(game.customers, pick.tx, pick.ty)?.id === c.id,
    );
  }

  // And a pick inside a table's footprint has to resolve to the table itself.
  grid.sync();
  const table = game.placedWithRole('table')[0]!;
  const onTable = pickAt(table.tx, table.ty);
  check(
    'a pick on a table finds the table',
    grid.anyAt(Math.floor(onTable.tx), Math.floor(onTable.ty))?.uid === table.uid,
  );
  let bare: [number, number] | null = null;
  for (let y = 0; y < grid.size && !bare; y++) {
    for (let x = 0; x < grid.size && !bare; x++) {
      if (!grid.anyAt(x, y)) bare = [x, y];
    }
  }
  check('the room has a bare tile to test with', bare !== null);
  if (bare) {
    const onFloor = pickAt(bare[0], bare[1]);
    check(
      'a pick on bare floor finds nothing',
      grid.anyAt(Math.floor(onFloor.tx), Math.floor(onFloor.ty)) === undefined,
    );
  }
});

group('A tap on the pixels a guest is drawn at seats that guest', () => {
  // The whole path, from a screen coordinate through the camera to a guest
  // walking to a chair. Everything but the canvas is real: the camera is the one
  // the game runs, framed on a portrait phone, which is the layout where the
  // queue sits highest on screen.
  const game = new Game(createNewGame());
  const sim = new Simulation(game);
  const camera = new Camera();
  camera.setViewport(390, 844);
  const box = buildingBox(game.data.gridSize);
  camera.snapTo(box.x + box.w / 2, box.y + box.h / 2, 1);

  for (const t of game.placedWithRole('table')) t.dirty = true;
  game.touch();
  const queued = runUntil(sim, () => game.customers.some((c) => c.state === 'queueing'), 150);
  check('a guest is queueing outside the door', queued);
  if (!queued) return;

  const guest = game.customers.find((c) => c.state === 'queueing')!;
  const body = tileToWorld(guest.tx + 0.5, guest.ty + 0.5);
  const onGuest = camera.worldToScreen(body.x, body.y);
  check(
    'the guest is on screen at all',
    onGuest.x > 0 && onGuest.x < 390 && onGuest.y > 0 && onGuest.y < 844,
    `${onGuest.x.toFixed(0)}, ${onGuest.y.toFixed(0)}`,
  );

  const pick = camera.screenToTile(onGuest.x, onGuest.y);
  check(
    'the pixel under them picks them out',
    nearestActor(game.customers, pick.tx, pick.ty)?.id === guest.id,
  );

  for (const t of game.placedWithRole('table')) t.dirty = false;
  game.touch();
  const result = sim.seatGuest(nearestActor(game.customers, pick.tx, pick.ty)!);
  check('the tap seats them', result.ok, result.message);
  check('they took a chair', guest.chairUid !== null && guest.state === 'walkingToSeat');

  // Their thought bubble floats well above them, and picking ignores height, so
  // a tap on the bubble lands up-screen. Walking back down the depth diagonal is
  // what makes the bubble itself tappable.
  const bubble = camera.worldToScreen(body.x, body.y - 2.16 * TILE_Z);
  const offBubble = camera.screenToTile(bubble.x, bubble.y);
  check(
    'a tap on the bubble misses the guest at face value',
    nearestActor(game.customers, offBubble.tx, offBubble.ty) === null,
  );
  let recovered = false;
  for (let back = 1; back <= 5.8 && !recovered; back += 0.25) {
    recovered = nearestActor(game.customers, offBubble.tx + back, offBubble.ty + back)?.id === guest.id;
  }
  check('walking back down the diagonal finds them', recovered);

  // Same story for the badge over a dirty table.
  const table = game.placedWithRole('table')[0]!;
  table.dirty = true;
  game.touch();
  const grid = new Grid(game);
  grid.sync();
  const tableWorld = tileToWorld(table.tx + 0.5, table.ty + 0.5);
  const badge = camera.worldToScreen(tableWorld.x, tableWorld.y - 1.42 * TILE_Z);
  const offBadge = camera.screenToTile(badge.x, badge.y);
  check(
    'a tap on the badge misses the table at face value',
    grid.anyAt(Math.floor(offBadge.tx), Math.floor(offBadge.ty))?.uid !== table.uid,
  );
  let foundTable = false;
  for (let back = 1; back <= 5.8 && !foundTable; back += 0.25) {
    foundTable =
      grid.anyAt(Math.floor(offBadge.tx + back), Math.floor(offBadge.ty + back))?.uid === table.uid;
  }
  check('walking back down the diagonal finds the table', foundTable);
});

group('Tapping a dirty table sends somebody to wipe it', () => {
  const game = new Game(createNewGame());
  game.data.open = false;
  const sim = new Simulation(game);
  const table = game.placedWithRole('table')[0]!;

  const clean = sim.cleanTable(table);
  check('a clean table needs nothing', !clean.ok && /already clean/i.test(clean.message));

  // No tick in between, so the wipe is the player's doing and not the AI's.
  table.dirty = true;
  game.touch();
  const sent = sim.cleanTable(table);
  check('the command was accepted', sent.ok, sent.message);
  check('the cleaner was preferred', sent.message.startsWith('Mina'), sent.message);

  const worker = game.data.staff.find((s) => s.state === 'cleaning' && s.targetUid === table.uid);
  check('somebody is on their way', !!worker);
  check('the named worker is the one going', !!worker && sent.message.startsWith(worker.name));

  const busy = sim.cleanTable(table);
  check('a second tap does not double up', !busy.ok && /already on it/i.test(busy.message));
  check(
    'only one worker is assigned',
    game.data.staff.filter((s) => s.state === 'cleaning' && s.targetUid === table.uid).length === 1,
  );
  check(
    'the table actually gets wiped',
    runUntil(sim, () => !table.dirty, 60),
    'table stayed dirty',
  );

  // A guest still eating is not somebody you can wipe around.
  table.dirty = true;
  game.customers.push({
    id: 9001, name: 'Test Guest', look: appearanceFrom('check-guest'), state: 'eating',
    tx: table.tx, ty: table.ty, path: [], patience: 1, patienceDrainPerSec: 0,
    chairUid: null, tableUid: table.uid, dishId: null, orderId: null, timer: 99,
    satisfaction: 1, angry: false, queueSlot: 0, spawnedAt: 0, regularId: null,
  });
  const occupied = sim.cleanTable(table);
  check('an occupied table is left alone', !occupied.ok && /sitting/i.test(occupied.message));
});

group('Tapping a waiting plate runs it out', () => {
  const game = new Game(createNewGame());
  const sim = new Simulation(game);
  const plated = runUntil(sim, () =>
    game.orders.some((o) => o.state === 'ready' && o.holdingUid !== null),
  );
  check('a plate is waiting somewhere', plated);
  if (!plated) return;

  const order = game.orders.find((o) => o.state === 'ready' && o.holdingUid !== null)!;
  const holder = game.placedByUid(order.holdingUid!)!;

  // Stand the whole team down first, so the command is what moves the plate.
  for (const s of game.data.staff) sim.releaseStaffJob(s);
  const sent = sim.runPlateOut(holder);
  check('the command was accepted', sent.ok, sent.message);
  const runner = game.data.staff.find((s) => s.targetOrderId === order.id);
  check('a runner picked the order up', !!runner);
  check('the runner is heading for the plate', runner?.state === 'toKitchen');
  check('the command named the dish', /burger|fries|salad|soup|omelette|coffee/i.test(sent.message), sent.message);

  const again = sim.runPlateOut(holder);
  check('a second tap does not double up', !again.ok && /already fetching/i.test(again.message));

  const guest = game.customers.find((c) => c.id === order.customerId)!;
  check(
    'the plate reaches the guest',
    runUntil(sim, () => guest.state !== 'awaitingFood', 120),
    `guest ended up ${guest.state}`,
  );
  check('the guest was not lost', !guest.angry);
  check('no ghost plates were left behind', noGhostPlates(game));
});

group('Commands refuse politely when nobody is free', () => {
  const game = new Game(createNewGame());
  game.data.open = false;
  const sim = new Simulation(game);
  const table = game.placedWithRole('table')[0]!;
  table.dirty = true;
  game.touch();

  for (const s of game.data.staff) {
    s.energy = 0;
    s.state = 'exhausted';
  }
  const flat = sim.cleanTable(table);
  check('an exhausted team cannot be commanded', !flat.ok, flat.message);
  check('the refusal points at feeding them', /energy|feed/i.test(flat.message), flat.message);
  check('the table is still dirty', table.dirty);

  game.data.staff = [];
  const empty = sim.cleanTable(table);
  check('an empty payroll points at hiring', /hire/i.test(empty.message), empty.message);
});

// -------------------------------------------------------------------- dishes

group('Dish mastery', () => {
  check('level 1 needs no servings', dishLevelFromServings(0) === 1);
  let previous = -1;
  for (let level = 1; level <= MAX_DISH_LEVEL; level++) {
    const needed = cumulativeServings(level);
    check(`level ${level} threshold increases`, needed > previous, `${needed} <= ${previous}`);
    check(`level ${level} is reached at its threshold`, dishLevelFromServings(needed) >= level);
    previous = needed;
  }
  check('mastery caps out', dishLevelFromServings(10_000_000) === MAX_DISH_LEVEL);

  const burger = DISHES_BY_ID.house_burger!;
  check(
    'mastery raises the price',
    dishPrice(burger, MAX_DISH_LEVEL) > dishPrice(burger, 1) * 1.9,
  );
});

// ---------------------------------------------------------- save/load recovery

group("Reloading clears last shift's plates", () => {
  // The real save path goes through localStorage, so stand up just enough of it
  // to exercise Game.save/Game.load rather than reaching past them.
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string): string | null => store.get(k) ?? null,
      setItem: (k: string, v: string): void => void store.set(k, v),
      removeItem: (k: string): void => void store.delete(k),
    },
  });

  const before = new Game(createNewGame());
  const stove = before.placedWithRole('stove')[0]!;
  const counter = before.placedWithRole('counter')[0]!;
  const table = before.placedWithRole('table')[0]!;

  // With a single stove, one stranded plate id is enough to stall the kitchen
  // for good, which is what makes this worth guarding.
  check('starter kitchen has exactly one stove', before.placedWithRole('stove').length === 1);
  const slots = before.defOf(counter)?.slots ?? 1;

  // Stand in for a save written mid-service: plate ids referring to orders that
  // will not exist after the reload, because orders are never serialised.
  stove.plates = [901];
  counter.plates = Array.from({ length: slots }, (_, i) => 902 + i);
  table.dirty = true;
  before.save();

  const raw = localStorage.getItem(SAVE_KEY);
  check('the save really does carry plate ids', !!raw && /"plates":\[\d/.test(raw));

  const after = Game.load();
  check('the save reloads', after !== null);
  if (!after) return;

  // Orders live only for the session, so every id in the save is dangling.
  check('no orders survive the reload', after.orders.length === 0, `${after.orders.length} orders`);

  const loadedStove = after.placedWithRole('stove')[0]!;
  const loadedCounter = after.placedWithRole('counter')[0]!;
  check(
    'the stove comes back with no plates on it',
    (loadedStove.plates?.length ?? 0) === 0,
    `${loadedStove.plates?.length ?? 0} left`,
  );
  check(
    'the counter comes back with no plates on it',
    (loadedCounter.plates?.length ?? 0) === 0,
    `${loadedCounter.plates?.length ?? 0} left`,
  );
  check(
    'no plate ids are left anywhere',
    after.data.placed.every((p) => (p.plates?.length ?? 0) === 0),
  );

  // Dirt is real world state, not a session id, so it must survive.
  check('a dirty table is still dirty', after.placedWithRole('table')[0]?.dirty === true);

  // The point of all this: the kitchen has to be able to work again.
  const sim = new Simulation(after);
  const step = 1 / 20;
  for (let i = 0; i < 20 * 240; i++) sim.update(step);
  check(
    'the reloaded kitchen cooks again',
    after.data.stats.dishesCooked > 0,
    `cooked ${after.data.stats.dishesCooked}`,
  );
  check(
    'the reloaded diner serves again',
    after.data.stats.customersServed > 0,
    `served ${after.data.stats.customersServed}`,
  );
});

// ------------------------------------------------------------ save transfer

/** Stand up just enough `localStorage` to exercise the real save paths. */
function stubStorage(): Map<string, string> {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string): string | null => store.get(k) ?? null,
      setItem: (k: string, v: string): void => void store.set(k, v),
      removeItem: (k: string): void => void store.delete(k),
    },
  });
  return store;
}

group('A diner survives export and import', () => {
  stubStorage();

  // A diner with a history worth losing: a shift served, a regular with a
  // record, and the room as the shift left it.
  const before = new Game(createNewGame());
  before.data.restaurantName = 'The Corner Spoon';
  const sim = new Simulation(before);
  const step = 1 / 20;
  for (let i = 0; i < 20 * 240; i++) sim.update(step);
  const tracked = before.data.regulars[0]!;
  tracked.visits = 5;
  tracked.delighted = 2;
  tracked.favouriteDishId = 'crispy_fries';
  check('the diner has something to lose', before.data.stats.customersServed > 0);
  check('the save is written', before.save());

  const text = before.exportText();
  const expected = {
    coins: before.data.coins,
    xp: before.data.xp,
    level: before.data.level,
    clock: before.data.clock,
    served: before.data.stats.customersServed,
    room: before.data.placed.map((p) => `${p.uid}:${p.defId}:${p.tx},${p.ty}:${p.rot}`).join('|'),
    menu: before.data.menu.join(','),
  };
  check('the export is text a player can keep', text.includes('"coins"') && text.includes('Corner Spoon'));

  // The eviction the export exists for.
  Game.wipe();
  check('the live save can be lost', Game.load() === null);

  // Whitespace a note or a text field adds around a paste must not matter.
  const read = importSaveText(`\n  ${text}\n`);
  check('the exported text imports', read.ok, read.ok ? '' : read.message);
  if (!read.ok) return;

  // A copy kept for days must not come back owing a shift for the time it spent
  // sitting in that note.
  read.game.data.savedAt = Date.now() - 3 * 24 * 3600 * 1000;
  check('the import is stored', installSave(read.game.data));

  const after = Game.load();
  check('the imported diner loads', after !== null);
  if (!after) return;
  check('with the same coins', after.data.coins === expected.coins, `${after.data.coins} vs ${expected.coins}`);
  check('the same experience and level', after.data.xp === expected.xp && after.data.level === expected.level);
  check('the same time on the clock', after.data.clock === expected.clock);
  check('the same name', after.data.restaurantName === 'The Corner Spoon');
  check(
    'the same room, piece for piece',
    after.data.placed.map((p) => `${p.uid}:${p.defId}:${p.tx},${p.ty}:${p.rot}`).join('|') === expected.room,
  );
  check('the same menu', after.data.menu.join(',') === expected.menu);
  check('the same lifetime figures', after.data.stats.customersServed === expected.served);

  const same = after.data.regulars.find((r) => r.id === tracked.id);
  check('the whole roster came back', after.data.regulars.length === REGULARS.length);
  check(
    'the regular kept their record',
    same?.visits === 5 && same?.delighted === 2 && same?.favouriteDishId === 'crispy_fries',
  );

  check(
    'a restored diner does not owe a missed shift',
    Math.abs(Date.now() - after.data.savedAt) < 60_000,
    `${(Date.now() - after.data.savedAt) / 1000}s old`,
  );

  // Import is the load path, so it has to migrate as well as parse: an old copy
  // must come back with everything added since it was written.
  const legacy = createNewGame();
  legacy.version = 1;
  legacy.placed[0]!.plates = [901];
  delete (legacy as Partial<SaveData>).regulars;
  const old = importSaveText(JSON.stringify(legacy));
  check('an older exported save still imports', old.ok);
  check('it is given the whole roster', old.ok && old.game.data.regulars.length === REGULARS.length);
  check(
    "and last shift's plates are dropped",
    old.ok && old.game.data.placed.every((p) => (p.plates?.length ?? 0) === 0),
  );
  check('and it is stamped at the current version', old.ok && old.game.data.version === SAVE_VERSION);

  // And it must be playable, not merely parsed.
  if (old.ok) {
    const resumed = new Simulation(old.game);
    for (let i = 0; i < 20 * 240; i++) resumed.update(step);
    check('an imported diner serves again', old.game.data.stats.customersServed > 0);
  }
});

group('Bad text cannot replace a good diner', () => {
  const store = stubStorage();

  const game = new Game(createNewGame());
  game.data.coins = 4242;
  check('there is a good save to protect', game.save());
  const good = store.get(SAVE_KEY)!;
  const valid = game.exportText();

  const rubbish: Array<[string, string]> = [
    ['nothing at all', '   '],
    ['prose', 'my diner was doing really well, please give it back'],
    ['half a save', valid.slice(0, Math.floor(valid.length / 2))],
    ['an empty object', '{}'],
    ['a list', '[]'],
    ['a null', 'null'],
    ['a number', '12'],
    ['a save with words for coins', JSON.stringify({ ...JSON.parse(valid), coins: 'lots' })],
    ['a save with no coins at all', JSON.stringify({ ...JSON.parse(valid), coins: undefined })],
    ['a save whose room is a word', JSON.stringify({ ...JSON.parse(valid), placed: 'none' })],
    ['a save whose room holds nothing', JSON.stringify({ ...JSON.parse(valid), placed: [null] })],
    ['a save whose team is a number', JSON.stringify({ ...JSON.parse(valid), staff: 3 })],
    ['a save whose applicants are a word', JSON.stringify({ ...JSON.parse(valid), applicants: 'nobody' })],
    ['a wall of text', 'x'.repeat(5_000_000)],
  ];

  for (const [label, payload] of rubbish) {
    const read = importSaveText(payload);
    check(`${label} is refused`, !read.ok);
    check(`${label} says why in words`, read.ok || read.message.length > 12, read.ok ? '' : read.message);
    check(`${label} leaves the stored save alone`, store.get(SAVE_KEY) === good);
  }

  const survivor = Game.load();
  check('the good diner still loads after all that', survivor?.data.coins === 4242);
  check('and its room is intact', (survivor?.data.placed.length ?? 0) > 0);
});

group('The backup slot is a second diner', () => {
  const store = stubStorage();

  const game = new Game(createNewGame());
  game.data.coins = 7777;
  game.data.restaurantName = 'Backup Diner';
  check('the live save is written', game.save());
  check('the backup is written', game.saveTo(BACKUP_KEY));
  check('they are two separate slots', store.size === 2, `${store.size} keys`);

  const info = slotInfo(BACKUP_KEY);
  check('the slot can be described without loading it', info?.coins === 7777);
  check('with the name on it', info?.restaurantName === 'Backup Diner');
  check('and the day it holds', info?.day === game.dayNumber);
  check('an empty slot describes nothing', slotInfo('diner-town/save/nothing-here') === null);

  // Starting over clears the live key; the backup is the point of the exercise.
  Game.wipe();
  check('starting over clears the live save', Game.load() === null);
  const kept = Game.loadSlot(BACKUP_KEY);
  check('the backup is still there', kept?.data.coins === 7777);
  check('and it is playable', !!kept && kept.usableSeatCount > 0);

  // Restoring is a swap: the diner being replaced goes into the slot it came from.
  if (kept) {
    const outgoing = new Game(createNewGame());
    outgoing.data.coins = 111;
    check('the restored diner takes the live slot', installSave(kept.data));
    check('the replaced diner takes the backup slot', outgoing.saveTo(BACKUP_KEY));
    check('the live slot holds the restore', Game.load()?.data.coins === 7777);
    check('the backup slot holds what it replaced', Game.loadSlot(BACKUP_KEY)?.data.coins === 111);
  }
});

// ----------------------------------------------------------------- regulars

group('The regulars roster', () => {
  const game = new Game(createNewGame());
  const roster = game.data.regulars;

  check('the roster is a handful', REGULARS.length >= 6 && REGULARS.length <= 10, `${REGULARS.length}`);
  check('a new game starts with all of them', roster.length === REGULARS.length);
  check('ids are unique', new Set(REGULARS.map((r) => r.id)).size === REGULARS.length);
  check('names are unique', new Set(REGULARS.map((r) => r.name)).size === REGULARS.length);
  check(
    'every taste is a real dish',
    REGULARS.every((r) => r.tastes.length > 0 && r.tastes.every((id) => !!DISHES_BY_ID[id])),
  );
  check('everyone comes back at some cadence', REGULARS.every((r) => r.cadenceDays >= 1));
  check('nobody starts overdue', roster.every((r) => r.nextVisitAt > 0));
  check(
    'the first one is due inside the opening day',
    Math.min(...roster.map((r) => r.nextVisitAt)) < DAY_LENGTH,
  );

  // The favourite has to come from the player's menu, not from a fixed order.
  for (const def of REGULARS) {
    const favourite = favouriteFor(def, game.data.menu);
    check(
      `${def.name} wants something on the menu`,
      !!favourite && game.data.menu.includes(favourite),
      `got ${favourite}`,
    );
  }
  const burgerFan = REGULARS.find((r) => r.tastes[0] === 'house_burger')!;
  check('a listed taste wins when it is on the menu', favouriteFor(burgerFan, ['garden_salad', 'house_burger']) === 'house_burger');
  check('a menu without their taste still gives them one', !!favouriteFor(burgerFan, ['choc_cake']));
  check('an empty menu leaves them without one', favouriteFor(burgerFan, []) === null);

  const state = roster[0]!;
  state.favouriteDishId = 'house_burger';
  refreshFavourite(state, ['garden_salad']);
  check('dropping their dish re-points them at the menu', state.favouriteDishId !== 'house_burger');

  const def = REGULARS_BY_ID[roster[0]!.id]!;
  check(
    'a delighted regular comes back sooner than a fed one',
    nextVisitDelay(def, 'delighted') < nextVisitDelay(def, 'fed'),
  );
  check(
    'a snubbed regular stays away longer',
    nextVisitDelay(def, 'snubbed') > nextVisitDelay(def, 'fed'),
  );
});

group('Regulars survive a reload', () => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string): string | null => store.get(k) ?? null,
      setItem: (k: string, v: string): void => void store.set(k, v),
      removeItem: (k: string): void => void store.delete(k),
    },
  });

  const before = new Game(createNewGame());
  const tracked = before.data.regulars[0]!;
  tracked.visits = 4;
  tracked.delighted = 3;
  tracked.walkouts = 1;
  tracked.favouriteDishId = 'crispy_fries';
  tracked.nextVisitAt = 1234.5;
  before.save();

  const after = Game.load();
  check('the save reloads', after !== null);
  if (!after) return;

  const same = after.data.regulars.find((r) => r.id === tracked.id);
  check('the regular came back', !!same);
  check('their history came back', same?.visits === 4 && same?.delighted === 3 && same?.walkouts === 1);
  check('their favourite came back', same?.favouriteDishId === 'crispy_fries');
  check('their next visit came back', same?.nextVisitAt === 1234.5);
  check('the rest of the roster is intact', after.data.regulars.length === REGULARS.length);

  // A save written before regulars existed must not break, and must not be
  // handed a roster that is already halfway through its visits.
  const legacy = createNewGame();
  delete (legacy as Partial<SaveData>).regulars;
  store.set(SAVE_KEY, JSON.stringify(legacy));
  const migrated = Game.load();
  check('an older save still loads', migrated !== null);
  check('it is given the whole roster', migrated?.data.regulars.length === REGULARS.length);
  check('with a clean history', migrated?.data.regulars.every((r) => r.visits === 0) === true);

  // Junk in the save must not survive into the game either.
  store.set(
    SAVE_KEY,
    JSON.stringify({
      ...createNewGame(),
      regulars: [{ id: 'nobody-by-that-name', visits: 9 }, { id: REGULARS[0]!.id, visits: 2, favouriteDishId: 'not_a_dish' }],
    }),
  );
  const cleaned = Game.load();
  check('unknown regulars are dropped', cleaned?.data.regulars.every((r) => !!REGULARS_BY_ID[r.id]) === true);
  check('a stale favourite is forgotten', cleaned?.data.regulars.every((r) => r.favouriteDishId === null || !!DISHES_BY_ID[r.favouriteDishId]) === true);
  check(
    'a known regular keeps their count',
    cleaned?.data.regulars.find((r) => r.id === REGULARS[0]!.id)?.visits === 2,
  );
});

group('A regular walks in, is served and books again', () => {
  const game = new Game(createNewGame());
  const sim = new Simulation(game);
  const target = game.data.regulars[0]!;
  const def = REGULARS_BY_ID[target.id]!;

  // Everyone else stays away, so the next face through the door is the one we
  // are watching.
  for (const r of game.data.regulars) r.nextVisitAt = Number.MAX_SAFE_INTEGER;
  target.nextVisitAt = 0;

  const arrived = runUntil(sim, () => game.customers.some((c) => c.regularId === target.id), 120);
  check('the regular showed up', arrived);
  if (!arrived) return;

  const guest = game.customers.find((c) => c.regularId === target.id)!;
  check('they are recognisable by name', guest.name === def.name);
  check('they have their own look', guest.look.shirt === def.look.shirt);
  check('their favourite was resolved from the menu', !!target.favouriteDishId &&
    game.data.menu.includes(target.favouriteDishId));
  check('they are not due again while still inside', target.nextVisitAt > 0);
  check(
    'the arrival is announced',
    game.floaters.some((f) => f.text.includes(def.name.split(' ')[0]!)),
  );

  const bookedOnArrival = target.nextVisitAt;
  const served = runUntil(sim, () => target.visits > 0, 240);
  check('the visit finished', served, `visits ${target.visits}`);
  check('they asked for their favourite', guest.dishId === target.favouriteDishId,
    `ordered ${guest.dishId}, wanted ${target.favouriteDishId}`);
  check('a well-served regular is delighted', target.delighted === 1 && target.walkouts === 0);
  check('being delighted brings them back sooner', target.nextVisitAt < bookedOnArrival);
  check('they are booked in for another visit', target.nextVisitAt > game.data.clock);

  // And the second visit really does happen.
  target.nextVisitAt = game.data.clock;
  check(
    'they come back',
    runUntil(sim, () => game.customers.some((c) => c.regularId === target.id), 180),
    'never returned',
  );
});

group('Walking a regular out stings', () => {
  const game = new Game(createNewGame());
  const sim = new Simulation(game);
  const target = game.data.regulars[0]!;
  for (const r of game.data.regulars) r.nextVisitAt = Number.MAX_SAFE_INTEGER;
  target.nextVisitAt = 0;

  const arrived = runUntil(sim, () => game.customers.some((c) => c.regularId === target.id), 120);
  check('the regular showed up', arrived);
  if (!arrived) return;

  const guest = game.customers.find((c) => c.regularId === target.id)!;
  const service = game.data.serviceScore;
  guest.patience = 0.0001;
  runUntil(sim, () => target.walkouts > 0, 60);

  check('the walkout was recorded against them', target.walkouts === 1, `${target.walkouts}`);
  check('it did not count as a delight', target.delighted === 0);
  check('the visit still counted', target.visits === 1);
  check('service took the hit', game.data.serviceScore < service);
  check(
    'they stay away longer than usual',
    target.nextVisitAt - game.data.clock > nextVisitDelay(REGULARS_BY_ID[target.id]!, 'fed'),
  );
});

// ---------------------------------------------------------------- day recap

group('Crossing midnight produces a recap', () => {
  const game = new Game(createNewGame());
  const sim = new Simulation(game);
  const payroll = game.data.staff.reduce((sum, s) => sum + s.wage, 0);

  check('the day starts with an empty ledger', game.data.today.covers === 0 && game.data.today.day === 1);
  check('there is nothing to report yet', game.pendingDayRecap === null);

  const rolled = runUntil(sim, () => game.pendingDayRecap !== null, DAY_LENGTH + 60);
  check('a day rolled over', rolled);
  if (!rolled) return;

  const recap = game.pendingDayRecap!;
  check('it is the day that just ended', recap.day === 1, `day ${recap.day}`);
  check('it is now day two', game.dayNumber === 2);
  check('covers are real', recap.covers > 0, `${recap.covers}`);
  check(
    'covers match the shift that was served',
    recap.covers === game.data.stats.customersServed,
    `${recap.covers} vs ${game.data.stats.customersServed}`,
  );
  check(
    'walkouts match the shift',
    recap.walkouts === game.data.stats.customersLost,
    `${recap.walkouts} vs ${game.data.stats.customersLost}`,
  );
  check('dish earnings are real coins', recap.dishEarnings > 0, `${recap.dishEarnings}`);
  check(
    'earnings never exceed what the till took',
    recap.dishEarnings + recap.tips <= game.data.stats.totalEarned,
  );
  check('wages are the whole payroll', recap.wages === payroll, `${recap.wages} vs ${payroll}`);
  check('a solvent diner pays them in full', recap.wagesPaid === recap.wages);
  check('every figure is finite', [recap.covers, recap.walkouts, recap.dishEarnings, recap.tips, recap.wages, recap.wagesPaid].every(Number.isFinite));
  check(
    'the pantry warning agrees with the pantry',
    (recap.pantryWarning !== null) === !game.menuCanCook(),
    `warning ${recap.pantryWarning}, can cook ${game.menuCanCook()}`,
  );
  check('there is one thing to do next', recap.action.label.length > 0);
  check(
    'the suggestion points somewhere real',
    recap.action.target === null ||
      ['shop', 'menu', 'market', 'staff', 'build'].includes(recap.action.target),
    `${recap.action.target}`,
  );
  check('the recap is kept for Manage', game.data.lastRecap?.day === 1);
  check('the new day starts clean', game.data.today.day === 2 && game.data.today.covers === 0);

  // Manage shows it after the card is dismissed, so it has to survive a reload.
  game.save();
  const reloaded = Game.load();
  check('the recap comes back with the save', reloaded?.data.lastRecap?.day === 1);
  check(
    'with its figures intact',
    reloaded?.data.lastRecap?.covers === recap.covers &&
      reloaded?.data.lastRecap?.wages === recap.wages,
  );
  check('and its suggestion', reloaded?.data.lastRecap?.action.label === recap.action.label);

  // A second day has to report only that day, not the whole run so far.
  const firstCovers = recap.covers;
  const again = runUntil(sim, () => game.data.lastRecap?.day === 2, DAY_LENGTH + 60);
  check('a second recap arrives', again);
  const second = game.data.lastRecap;
  check('it covers day two', second?.day === 2, `day ${second?.day}`);
  check(
    'it counts only day two',
    !!second && second.covers < game.data.stats.customersServed,
    `${second?.covers} of ${game.data.stats.customersServed} lifetime`,
  );
  check(
    'lifetime totals still add up',
    game.data.stats.customersServed >= firstCovers + (second?.covers ?? 0),
  );
});

group('The recap suggests the thing that is actually wrong', () => {
  const empty = new Game(createNewGame());
  empty.data.menu = [];
  check('an empty menu is the first problem', suggestNextAction(empty, empty.data.today).target === 'menu');

  const bare = new Game(createNewGame());
  bare.data.pantry = {};
  const restock = suggestNextAction(bare, bare.data.today);
  check('an empty pantry sends you to the market', restock.target === 'market', restock.label);
  check('it names what to buy', /beef|bread|lettuce|potato|butter/i.test(restock.label), restock.label);

  const shut = new Game(createNewGame());
  shut.data.open = false;
  check('a closed diner is told to open', /open/i.test(suggestNextAction(shut, shut.data.today).label));

  const chefless = new Game(createNewGame());
  chefless.data.staff = chefless.data.staff.filter((s) => s.role !== 'chef');
  const hireChef = suggestNextAction(chefless, chefless.data.today);
  check('no chef means hire a chef', hireChef.target === 'staff' && /chef/i.test(hireChef.label), hireChef.label);

  const tired = new Game(createNewGame());
  tired.data.staff[0]!.state = 'exhausted';
  const feed = suggestNextAction(tired, tired.data.today);
  check('an exhausted team is fed first', feed.target === 'staff' && /feed/i.test(feed.label), feed.label);

  const bleeding = new Game(createNewGame());
  const busy = { ...bleeding.data.today, covers: 6, walkouts: 5 };
  const hire = suggestNextAction(bleeding, busy);
  check('walkouts point at a second waiter', /waiter/i.test(hire.label), hire.label);

  const broke = new Game(createNewGame());
  const short = suggestNextAction(broke, broke.data.today, { wages: 200, wagesPaid: 40 });
  check('missed payroll is called out', short.target === 'staff', short.label);

  const dry = new Game(createNewGame());
  dry.data.pantry = {};
  const warned = buildDayRecap(dry, dry.data.today, 100, 100);
  check('a dry pantry warns on the card', !!warned.pantryWarning, `${warned.pantryWarning}`);
  check('the warning says the kitchen cannot cook', /cannot cook/i.test(warned.pantryWarning ?? ''));
});

group('A ledger written on another day is not credited to today', () => {
  const game = new Game(createNewGame());
  game.data.today = { ...game.data.today, day: 1, covers: 12, dishEarnings: 400 };
  game.data.clock = DAY_LENGTH * 4 + 10;

  const sim = new Simulation(game);
  check('the stale ledger was reset', game.data.today.covers === 0, `${game.data.today.covers}`);
  check('it belongs to the current day', game.data.today.day === game.dayNumber);

  // And a ledger for the day we are actually on survives being reopened.
  const kept = new Game(createNewGame());
  kept.data.today = { ...kept.data.today, day: 1, covers: 7 };
  new Simulation(kept);
  check('a current ledger is left alone', kept.data.today.covers === 7);
  check('nothing was reported on load', sim !== null && game.pendingDayRecap === null);
});

group('A frame that arrives out of order costs nothing', () => {
  const game = new Game(createNewGame());
  const sim = new Simulation(game);
  const coins = game.data.coins;
  check('a new diner opens on day one', game.dayNumber === 1 && game.data.clock === 0);

  // The first animation frame can carry a timestamp from before the loop began,
  // which used to run the clock back into the day before the diner opened and
  // bill two days of wages against it.
  sim.update(-0.2);
  check('the clock did not go backwards', game.data.clock >= 0, `${game.data.clock}`);
  check('the diner is still on day one', game.dayNumber === 1, `day ${game.dayNumber}`);
  check('no payroll was drawn', game.data.coins === coins && game.data.stats.totalSpent === 0,
    `${coins} -> ${game.data.coins}`);
  check(
    'no day was reported as over',
    game.pendingDayRecap === null && game.data.lastRecap === null,
    `recap ${game.data.lastRecap?.day}`,
  );

  sim.update(1);
  check('an ordinary frame still moves the clock on', game.data.clock > 0, `${game.data.clock}`);
});

// --------------------------------------------------------- the shift away

/** A diner with the pantry topped up, so stock is not what limits a shift. */
function stockedDiner(): Game {
  const game = new Game(createNewGame());
  for (const ing of INGREDIENT_LIST) game.data.pantry[ing.id] = 400;
  return game;
}

function pantryWorth(game: Game): number {
  let total = 0;
  for (const ing of INGREDIENT_LIST) total += game.pantryCount(ing.id) * INGREDIENTS[ing.id].price;
  return total;
}

/** Everything a shift moves, so an unwatched one can be held against a played one. */
function shiftValue(game: Game, from: { coins: number; stock: number }): {
  coins: number;
  value: number;
} {
  const coins = game.data.coins - from.coins;
  return { coins, value: coins - (from.stock - pantryWorth(game)) };
}

const AWAY_WINDOW = 8 * 3600;

group('A shift away costs what a shift costs', () => {
  const game = stockedDiner();
  // Left late in the day, so the shift away has to carry the day over.
  game.data.clock = DAY_LENGTH - 120;
  const sim = new Simulation(game);
  const payroll = game.data.staff.reduce((sum, s) => sum + s.wage, 0);
  const before = { coins: game.data.coins, stock: pantryWorth(game), clock: game.data.clock };

  const report = sim.catchUpWhileAway(AWAY_WINDOW);
  check('a night away is worth reporting', report !== null);
  if (!report) return;

  check('guests were served', report.covers > 0, `${report.covers} covers`);
  check('the till took money', report.takings > 0, `${report.takings}`);

  // The two costs the old estimate never charged.
  check('the kitchen cooked out of the pantry', report.ingredients > 0, `${report.ingredients}`);
  check(
    'the stock really left the pantry',
    before.stock - pantryWorth(game) === report.ingredients,
    `${before.stock - pantryWorth(game)} against ${report.ingredients}`,
  );
  check('a day ended, so wages were drawn', report.wages === payroll, `${report.wages} of ${payroll}`);
  check(
    'the wages came out of the till',
    game.data.stats.totalSpent >= report.wages,
    `${game.data.stats.totalSpent}`,
  );
  check(
    'what is banked is takings less wages',
    report.coins === report.takings - report.wages && report.coins === game.data.coins - before.coins,
    `${report.coins} vs ${report.takings} - ${report.wages}`,
  );
  check('the shift was not a gift', report.coins < report.takings);

  // The clock has to move, or no day can ever end while the player is away.
  check('the clock moved on', game.data.clock > before.clock, `${before.clock} -> ${game.data.clock}`);
  check(
    'it moved by the shift that was worked',
    Math.abs(game.data.clock - before.clock - report.tradedSeconds) < 0.01,
    `${game.data.clock - before.clock} against ${report.tradedSeconds}`,
  );
  check('a day rolled over', report.daysRolled === 1 && game.dayNumber === 2, `day ${game.dayNumber}`);
  check('its card is waiting', game.pendingDayRecap !== null);
  check(
    'the card is the day that ended',
    game.pendingDayRecap?.day === 1 && game.pendingDayRecap?.wages === payroll,
  );
  // The team worked past midnight, so only the covers before it belong to the card.
  const carded = game.data.lastRecap?.covers ?? 0;
  check(
    'the card counts the part of the shift that fell on that day',
    carded > 0 && carded < report.covers,
    `${carded} of ${report.covers}`,
  );
  check(
    'the rest is on the new day, not lost',
    game.data.today.day === 2 && game.data.today.covers === report.covers - carded,
    `${game.data.today.covers} on day ${game.data.today.day}`,
  );

  // Nothing decorative survives a shift nobody watched.
  check('no coins are still floating over the room', game.floaters.length === 0);
  check('no particles were left mid-air', game.fx.particles.length === 0);
});

group('Shutting the tab cannot beat playing', () => {
  const played = stockedDiner();
  const sim = new Simulation(played);
  const from = { coins: played.data.coins, stock: pantryWorth(played) };
  const minutes = 20;
  const step = 1 / 20;
  for (let i = 0; i < (minutes * 60) / step; i++) sim.update(step);
  const live = shiftValue(played, from);
  check('twenty minutes played is worth having', live.coins > 0 && live.value > 0,
    `coins ${live.coins}, value ${live.value}`);

  /** What the longest possible absence pays, from the same diner. */
  const awayFor = (seconds: number): { coins: number; value: number; traded: number } => {
    const game = stockedDiner();
    const start = { coins: game.data.coins, stock: pantryWorth(game) };
    const report = new Simulation(game).catchUpWhileAway(seconds);
    return { ...shiftValue(game, start), traded: report?.tradedSeconds ?? 0 };
  };

  const twenty = awayFor(20 * 60);
  check('a twenty-minute absence changes nothing at all', twenty.traded === 0 && twenty.coins === 0);

  const two = awayFor(2 * 3600);
  const four = awayFor(4 * 3600);
  const full = awayFor(AWAY_WINDOW);
  const forever = awayFor(30 * 3600);

  check('a longer absence is credited with more of a shift', two.traded < four.traded &&
    four.traded < full.traded, `${two.traded}, ${four.traded}, ${full.traded}`);
  check(
    'no absence buys more than one in-game day',
    full.traded <= DAY_LENGTH + 0.01 && forever.traded <= DAY_LENGTH + 0.01,
    `${full.traded} and ${forever.traded} against ${DAY_LENGTH}`,
  );

  // The whole point: the most an absence can pay has to lose to a short sitting.
  for (const [label, away] of [['two hours', two], ['four hours', four], ['a full night', full]] as const) {
    check(
      `${label} away pays less than twenty minutes played`,
      away.coins < live.coins,
      `${away.coins} against ${live.coins}`,
    );
    check(
      `${label} away is worth less than twenty minutes played, stock included`,
      away.value < live.value,
      `${away.value} against ${live.value}`,
    );
  }
  console.log(
    `  (20 min played: ${live.coins} coins, ${live.value} net of stock · ` +
      `8 hours away: ${full.coins} coins, ${full.value} net of stock)`,
  );
});

group('A level earned while away still gets its card', () => {
  const game = stockedDiner();
  // One cover short of the next level, so the shift away is what crosses it.
  game.data.xp = xpForLevel(2) - 5;
  game.data.level = levelForXp(game.data.xp);
  check('the diner starts below the level', game.data.level === 1, `level ${game.data.level}`);

  const report = new Simulation(game).catchUpWhileAway(AWAY_WINDOW);
  check('the shift away happened', report !== null && report.xp > 0, `${report?.xp} xp`);
  check('it earned the level', game.data.level > 1, `level ${game.data.level}`);
  check(
    'the celebration is still pending',
    game.pendingLevelUp === game.data.level,
    `${game.pendingLevelUp} against level ${game.data.level}`,
  );
});

group('A diner that could not have opened earns nothing', () => {
  const broken: Array<[string, (game: Game) => void]> = [
    ['a shut door', (game) => void (game.data.open = false)],
    ['no seats', (game) => {
      game.data.placed = game.data.placed.filter((p) => game.defOf(p)?.role !== 'chair');
    }],
    ['no stove', (game) => {
      game.data.placed = game.data.placed.filter((p) => game.defOf(p)?.role !== 'stove');
    }],
    ['no chef', (game) => {
      game.data.staff = game.data.staff.filter((s) => s.role !== 'chef');
    }],
    ['no waiter', (game) => {
      game.data.staff = game.data.staff.filter((s) => s.role !== 'waiter');
    }],
    ['an empty pantry', (game) => void (game.data.pantry = {})],
    ['nothing on the menu', (game) => void (game.data.menu = [])],
  ];

  for (const [label, breakIt] of broken) {
    const game = stockedDiner();
    breakIt(game);
    game.touch();
    const before = { coins: game.data.coins, clock: game.data.clock, stock: pantryWorth(game) };
    const report = new Simulation(game).catchUpWhileAway(AWAY_WINDOW);
    check(`${label} pays nothing`, report === null, JSON.stringify(report));
    check(`${label} costs nothing`, game.data.coins === before.coins, `${game.data.coins}`);
    check(`${label} leaves the pantry alone`, pantryWorth(game) === before.stock);
    check(`${label} leaves the clock alone`, game.data.clock === before.clock);
  }
});

group('An older save is caught up on the way in', () => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string): string | null => store.get(k) ?? null,
      setItem: (k: string, v: string): void => void store.set(k, v),
      removeItem: (k: string): void => void store.delete(k),
    },
  });

  // A save written a night ago, with the pantry a player would have left behind.
  const before = stockedDiner();
  before.save();
  const stale = JSON.parse(store.get(SAVE_KEY)!) as SaveData;
  stale.savedAt = Date.now() - AWAY_WINDOW * 1000;
  store.set(SAVE_KEY, JSON.stringify(stale));

  const loaded = Game.load();
  check('the save reloads', loaded !== null);
  if (!loaded) return;

  const elapsed = (Date.now() - loaded.data.savedAt) / 1000;
  check('the game can tell how long it was shut', elapsed > AWAY_WINDOW - 60, `${elapsed}s`);
  const coins = loaded.data.coins;
  const stock = pantryWorth(loaded);
  const report = catchUpWhileAway(loaded, elapsed);
  check('the missed shift is worked on load', report !== null && report.covers > 0);
  check('with the new figures: stock was used', pantryWorth(loaded) < stock);
  check('and the till only holds what was left over', loaded.data.coins - coins === report?.coins);

  // Saving straight after is what stops the same night being paid for twice.
  loaded.save();
  const again = catchUpWhileAway(loaded, (Date.now() - loaded.data.savedAt) / 1000);
  check('re-opening a moment later pays nothing more', again === null, JSON.stringify(again));
});

// ------------------------------------------------------------ job interrupts

/**
 * Drive a fresh diner until `ready` is true, so a check can act on a real
 * in-flight order rather than a hand-built one.
 */
function runUntil(
  sim: Simulation,
  ready: () => boolean,
  seconds = 400,
): boolean {
  const step = 1 / 20;
  if (ready()) return true;
  for (let i = 0; i < seconds * 20; i++) {
    sim.update(step);
    if (ready()) return true;
  }
  return false;
}

/** A game already in service, plus the order currently on a stove and its chef. */
function diningWithOrderOnAStove(): {
  game: Game;
  sim: Simulation;
  order: Order;
  chef: Staff;
} | null {
  const game = new Game(createNewGame());
  const sim = new Simulation(game);
  const found = runUntil(sim, () =>
    game.orders.some(
      (o) =>
        o.state === 'cooking' &&
        o.progress > 0 &&
        game.data.staff.some((s) => s.targetOrderId === o.id),
    ),
  );
  if (!found) return null;
  const order = game.orders.find((o) => o.state === 'cooking' && o.progress > 0)!;
  const chef = game.data.staff.find((s) => s.targetOrderId === order.id)!;
  return { game, sim, order, chef };
}

/**
 * True when no stove is held by an order nobody is working on. A stove claimed
 * by an abandoned order can never be claimed again, which is what turns one
 * interrupted dish into a kitchen that is shut for the session.
 */
function stovesAreFree(game: Game): boolean {
  return game.placedWithRole('stove').every((st) => {
    if ((st.plates?.length ?? 0) > 0) return false;
    const claim = game.orders.find((o) => o.stoveUid === st.uid);
    if (!claim) return true;
    return game.data.staff.some((s) => s.targetOrderId === claim.id && s.state === 'cooking');
  });
}

/** No plate anywhere refers to an order that no longer exists. */
function noGhostPlates(game: Game): boolean {
  return game.data.placed.every((p) =>
    (p.plates ?? []).every((id) => game.orders.some((o) => o.id === id)),
  );
}

group('Changing a role frees the dish in the pan', () => {
  const world = diningWithOrderOnAStove();
  check('a dish reached a stove', world !== null);
  if (!world) return;
  const { game, sim, order, chef } = world;
  const stoveUid = order.stoveUid;
  check('the order really was on a stove', stoveUid !== null);

  sim.setStaffRole(chef, 'cleaner');

  check('the chef changed role', chef.role === 'cleaner');
  check('the chef dropped the job', chef.targetOrderId === null && chef.state === 'idle');
  check('the dish is back in the queue', order.state === 'queued', `state ${order.state}`);
  check('the dish let go of the stove', order.stoveUid === null);
  check('the stove is free again', stovesAreFree(game));
  check('the guest still has their order', order.progress === 0 && game.orders.includes(order));

  // Someone has to be able to pick it up again, or the guest is still stuck.
  const cooked = game.data.stats.dishesCooked;
  sim.setStaffRole(chef, 'chef');
  check(
    'another chef can cook it',
    runUntil(sim, () => game.data.stats.dishesCooked > cooked, 200),
    `cooked ${game.data.stats.dishesCooked}, was ${cooked}`,
  );
});

group('Firing a chef frees the dish in the pan', () => {
  const world = diningWithOrderOnAStove();
  check('a dish reached a stove', world !== null);
  if (!world) return;
  const { game, sim, order, chef } = world;

  sim.dismissStaff(chef);

  check('the chef is off the payroll', !game.data.staff.some((s) => s.id === chef.id));
  check('the dish is back in the queue', order.state === 'queued', `state ${order.state}`);
  check('the dish let go of the stove', order.stoveUid === null);
  check('the stove is free again', stovesAreFree(game));
  check('nobody is still assigned to it', !game.data.staff.some((s) => s.targetOrderId === order.id));

  const cooked = game.data.stats.dishesCooked;
  const standIn = game.data.staff[0]!;
  sim.setStaffRole(standIn, 'chef');
  check(
    'a replacement can cook it',
    runUntil(sim, () => game.data.stats.dishesCooked > cooked, 200),
    `cooked ${game.data.stats.dishesCooked}, was ${cooked}`,
  );
});

group('Running out of energy mid-delivery puts the plate down', () => {
  const game = new Game(createNewGame());
  const sim = new Simulation(game);
  const carrying = runUntil(sim, () =>
    game.data.staff.some(
      (s) =>
        (s.state === 'carrying' || s.state === 'serving') &&
        game.orders.some((o) => o.id === s.targetOrderId && o.state === 'collected'),
    ),
  );
  check('a plate was picked up', carrying);
  if (!carrying) return;

  const runner = game.data.staff.find(
    (s) => s.state === 'carrying' || s.state === 'serving',
  )!;
  const order = game.orders.find((o) => o.id === runner.targetOrderId)!;
  const guest = game.customers.find((c) => c.id === order.customerId)!;
  check('the plate is in their hands', order.state === 'collected' && order.holdingUid === null);

  runner.energy = 0;
  sim.update(1 / 20);

  check('they stopped to rest', runner.state === 'exhausted');
  check('their hands are empty', runner.carryDishId === null && runner.targetOrderId === null);
  check('the plate is not still in limbo', order.state !== 'collected', `state ${order.state}`);
  check(
    'the plate is waiting on a counter',
    order.state === 'ready' && order.holdingUid !== null,
    `state ${order.state}, holder ${order.holdingUid}`,
  );
  const holder = order.holdingUid !== null ? game.placedByUid(order.holdingUid) : undefined;
  check('the counter it is on exists', !!holder && !!holder.plates?.includes(order.id));
  check('the guest still has an order', guest.orderId === order.id && guest.state === 'awaitingFood');

  check(
    'somebody else finishes the delivery',
    runUntil(sim, () => guest.state !== 'awaitingFood', 120),
    `guest ended up ${guest.state}`,
  );
  check('the guest was not lost', !guest.angry, `guest ended up ${guest.state}`);
  check('no ghost plates were left behind', noGhostPlates(game));
});

group('A dropped plate with nowhere to go is recooked', () => {
  const game = new Game(createNewGame());
  const sim = new Simulation(game);
  const carrying = runUntil(sim, () =>
    game.data.staff.some(
      (s) =>
        (s.state === 'carrying' || s.state === 'serving') &&
        game.orders.some((o) => o.id === s.targetOrderId && o.state === 'collected'),
    ),
  );
  check('a plate was picked up', carrying);
  if (!carrying) return;

  const runner = game.data.staff.find(
    (s) => s.state === 'carrying' || s.state === 'serving',
  )!;
  const order = game.orders.find((o) => o.id === runner.targetOrderId)!;

  // Sell every counter out from under them, so there is no surface to use.
  for (const counter of game.placedWithRole('counter')) sim.removeFixture(counter);
  runner.energy = 0;
  sim.update(1 / 20);

  check('no counters are left', game.placedWithRole('counter').length === 0);
  check('the dish went back to the kitchen', order.state === 'queued', `state ${order.state}`);
  check('the plate is not held anywhere', order.holdingUid === null);
  check('no ghost plates were left behind', noGhostPlates(game));
});

group('Selling a stove mid-cook does not strand the order', () => {
  const world = diningWithOrderOnAStove();
  check('a dish reached a stove', world !== null);
  if (!world) return;
  const { game, sim, order } = world;
  const stove = game.placedByUid(order.stoveUid!)!;
  const soldUid = stove.uid;
  const { tx, ty } = stove;

  sim.removeFixture(stove);

  check('the stove is gone', game.placedByUid(soldUid) === undefined);
  check('the dish is back in the queue', order.state === 'queued', `state ${order.state}`);
  check(
    'nothing points at the sold stove',
    game.orders.every((o) => o.stoveUid !== soldUid && o.holdingUid !== soldUid),
  );
  check(
    'no staff point at the sold stove',
    game.data.staff.every((s) => s.targetUid !== soldUid),
  );
  check('no ghost plates were left behind', noGhostPlates(game));

  // Replace the burner; the waiting order must be cookable on it.
  const cooked = game.data.stats.dishesCooked;
  game.data.placed.push({ uid: game.nextUid(), defId: 'stove_camp', tx, ty, rot: 0 });
  game.touch();
  check(
    'the new stove picks the order up',
    runUntil(sim, () => game.data.stats.dishesCooked > cooked, 200),
    `cooked ${game.data.stats.dishesCooked}, was ${cooked}`,
  );
});

group('Selling the counter under a finished plate', () => {
  const game = new Game(createNewGame());
  const sim = new Simulation(game);
  const plated = runUntil(sim, () =>
    game.orders.some((o) => {
      if (o.state !== 'ready' || o.holdingUid === null) return false;
      const holder = game.placedByUid(o.holdingUid);
      return !!holder && game.defOf(holder)?.role === 'counter';
    }),
  );
  check('a plate was left on the counter', plated);
  if (!plated) return;

  const order = game.orders.find((o) => o.state === 'ready' && o.holdingUid !== null)!;
  const counter = game.placedByUid(order.holdingUid!)!;
  const soldUid = counter.uid;
  const guest = game.customers.find((c) => c.id === order.customerId)!;

  sim.removeFixture(counter);

  check('the counter is gone', game.placedByUid(soldUid) === undefined);
  check('the plate is not on the missing counter', order.holdingUid !== soldUid);
  const holder = order.holdingUid !== null ? game.placedByUid(order.holdingUid) : undefined;
  check(
    'the order is claimable again',
    order.state === 'queued' || (order.state === 'ready' && !!holder),
    `state ${order.state}, holder ${order.holdingUid}`,
  );
  check('no ghost plates were left behind', noGhostPlates(game));
  check(
    'the guest is still served',
    runUntil(sim, () => guest.state !== 'awaitingFood', 160),
    `guest ended up ${guest.state}`,
  );
  check('the guest was not lost', !guest.angry, `guest ended up ${guest.state}`);
});

// ---------------------------------------------------------- end-to-end service

group('Service loop', () => {
  const game = new Game(createNewGame());
  const sim = new Simulation(game);
  const startingCoins = game.data.coins;

  // Four in-game minutes at a fixed step.
  const step = 1 / 20;
  for (let i = 0; i < 20 * 240; i++) sim.update(step);

  const stats = game.data.stats;
  check('customers were served', stats.customersServed > 0, `served ${stats.customersServed}`);
  check('dishes were cooked', stats.dishesCooked > 0, `cooked ${stats.dishesCooked}`);
  check('the till went up', game.data.coins > startingCoins, `${startingCoins} -> ${game.data.coins}`);
  check('ingredients were consumed', game.pantryCount('beef') < 22);
  check('experience accrued', game.data.xp > 0);

  const finite = (v: number): boolean => Number.isFinite(v);
  check(
    'no actor drifted to NaN',
    game.customers.every((c) => finite(c.tx) && finite(c.ty)) &&
      game.data.staff.every((s) => finite(s.tx) && finite(s.ty)),
  );
  check(
    'staff stayed on the board',
    game.data.staff.every((s) => s.tx > -4 && s.ty > -4 && s.tx < 20 && s.ty < 20),
  );
  check('no orphaned orders', game.orders.every((o) =>
    game.customers.some((c) => c.id === o.customerId)));
  check('every plate belongs to a live order', noGhostPlates(game));
  check('no order holds a fixture that is gone', game.orders.every((o) =>
    (o.stoveUid === null || !!game.placedByUid(o.stoveUid)) &&
    (o.holdingUid === null || !!game.placedByUid(o.holdingUid))));
  check('tile constants are consistent', TILE_W === TILE_H * 2 && TILE_Z > 0);

  console.log(
    `  (served ${stats.customersServed}, lost ${stats.customersLost}, cooked ${stats.dishesCooked}, ` +
      `coins ${startingCoins} -> ${game.data.coins}, rating ${game.rating.toFixed(2)})`,
  );
});

console.log(
  `\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
