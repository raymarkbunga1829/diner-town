/**
 * Headless sanity checks for the parts of the game that are easy to get subtly
 * wrong: the isometric projection, wall picking, pathfinding, mastery curves and
 * the end-to-end service loop.
 *
 * Run with `npm run check`. Deliberately dependency-free — it bundles the real
 * source with esbuild and asserts against it, rather than reimplementing logic.
 */

import { TILE_H, TILE_W, TILE_Z, tileToWorld, worldToTile } from '../src/engine/iso';
import { nearestActor } from '../src/game/pick';
import {
  cumulativeServings,
  dishLevelFromServings,
  dishPrice,
  DISHES_BY_ID,
  MAX_DISH_LEVEL,
} from '../src/game/data/dishes';
import { FURNITURE_BY_ID } from '../src/game/data/furniture';
import { REGULARS, REGULARS_BY_ID } from '../src/game/data/regulars';
import { Grid } from '../src/game/grid';
import { findPath } from '../src/game/path';
import { appearanceFrom } from '../src/game/people';
import { DAY_LENGTH } from '../src/game/progression';
import { buildDayRecap, suggestNextAction } from '../src/game/recap';
import { favouriteFor, nextVisitDelay, refreshFavourite } from '../src/game/regulars';
import { Simulation } from '../src/game/sim';
import { createNewGame, Game, SAVE_KEY } from '../src/game/state';
import type { Order, SaveData, Staff } from '../src/game/types';
import { COACH_STEPS } from '../src/ui/tutorial';

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

group('Tutorial order', () => {
  const html = COACH_STEPS.map((s) => s.html);
  check('welcome leads with a clean seat', /clean seat/i.test(html[0] ?? ''));
  check('counter is step 2', /pickup counter/i.test(html[1] ?? ''));
  check('cleaner is step 3', /cleaner/i.test(html[2] ?? ''));
  check('extra seats come after the cleaner', /More seats/i.test(html[3] ?? ''));
  check('the welcome teaches the seating tap', /tap a waiting guest/i.test(html[0] ?? ''));
  check('tapping the floor is taught', COACH_STEPS.some((s) => s.mark === 'tap-to-help'));
  check('Show me can place a missing counter', COACH_STEPS[1]?.placeIfMissing === 'counter_wood');
  check('counter step focuses the counter', typeof COACH_STEPS[1]?.focus === 'function');
  check('cleaner step focuses the cleaner', typeof COACH_STEPS[2]?.focus === 'function');
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
