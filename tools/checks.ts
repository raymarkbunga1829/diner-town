/**
 * Headless sanity checks for the parts of the game that are easy to get subtly
 * wrong: the isometric projection, wall picking, pathfinding, mastery curves and
 * the end-to-end service loop.
 *
 * Run with `npm run check`. Deliberately dependency-free — it bundles the real
 * source with esbuild and asserts against it, rather than reimplementing logic.
 */

import { TILE_H, TILE_W, TILE_Z, tileToWorld, worldToTile } from '../src/engine/iso';
import {
  cumulativeServings,
  dishLevelFromServings,
  dishPrice,
  DISHES_BY_ID,
  MAX_DISH_LEVEL,
} from '../src/game/data/dishes';
import { FURNITURE_BY_ID } from '../src/game/data/furniture';
import { Grid } from '../src/game/grid';
import { findPath } from '../src/game/path';
import { Simulation } from '../src/game/sim';
import { createNewGame, Game, SAVE_KEY } from '../src/game/state';
import type { Order, Staff } from '../src/game/types';
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
  check('Show me can place a missing counter', COACH_STEPS[1]?.placeIfMissing === 'counter_wood');
  check('counter step focuses the counter', typeof COACH_STEPS[1]?.focus === 'function');
  check('cleaner step focuses the cleaner', typeof COACH_STEPS[2]?.focus === 'function');
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
