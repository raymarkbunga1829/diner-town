import { clamp } from '../engine/iso';
import { audio, type SfxName } from '../engine/audio';
import { DISHES_BY_ID, dishCookTime, dishPrice } from './data/dishes';
import type { FurnitureDef } from './data/furniture';
import { INGREDIENTS, INGREDIENT_LIST } from './data/ingredients';
import { REGULARS_BY_ID } from './data/regulars';
import { Grid } from './grid';
import { advanceAlongPath, findPath } from './path';
import { appearanceFrom, randomName, workSpeed } from './people';
import { DAY_LENGTH } from './progression';
import { buildDayRecap, emptyLedger } from './recap';
import {
  nextVisitDelay,
  refreshFavourite,
  regularLook,
  shortName,
} from './regulars';
import { RESTOCK_INTERVAL, type Game } from './state';
import type { Customer, Order, Placed, RegularState, Staff, StaffRole } from './types';

/** A position in tile space, used to pick the nearest surface to work from. */
interface Point {
  tx: number;
  ty: number;
}

/** Seconds a waiter spends writing down an order. */
const ORDER_SECONDS = 1.6;
/** Seconds to hand a plate over. */
const SERVE_SECONDS = 1.0;
/** Baseline seconds to wipe down a table. */
const CLEAN_SECONDS = 4.5;

/** Energy consumed by each completed task. */
const ENERGY_COST = { order: 1.1, serve: 1.1, cook: 1.7, clean: 1.5 };

/**
 * Outcome of a player command from the floor. `ok` means the world changed;
 * anything else is an explanation the UI can show instead, because "nothing
 * happened" is the one response a tap must never give.
 */
export interface CommandResult {
  ok: boolean;
  message: string;
  kind: 'good' | 'bad' | 'info';
  /** Tile the command acted on, for a ping or a camera nudge. */
  at?: Point;
}

const refused = (message: string, at?: Point): CommandResult => ({
  ok: false,
  message,
  kind: 'bad',
  at,
});

const noted = (message: string, at?: Point): CommandResult => ({
  ok: false,
  message,
  kind: 'info',
  at,
});

const done = (message: string, at?: Point): CommandResult => ({
  ok: true,
  message,
  kind: 'good',
  at,
});

export class Simulation {
  readonly grid: Grid;
  private spawnTimer = 0;
  private lastDay = 1;
  /** Set while fast-forwarding a missed shift, so a whole day is not replayed as noise. */
  private quiet = false;

  constructor(private readonly game: Game) {
    this.grid = new Grid(game);
    this.lastDay = game.dayNumber;
    // A save can be reopened on a later day than its ledger was written for.
    if (game.data.today.day !== this.lastDay) {
      game.data.today = emptyLedger(this.lastDay);
    }
  }

  /** One sound, unless the player muted it or nobody is watching. */
  private sound(name: SfxName): void {
    if (this.quiet || this.game.data.settings.muted) return;
    audio.play(name);
  }

  update(realDt: number): void {
    // A browser can hand the first animation frame a timestamp from before the
    // loop asked for one, and a step backwards from the top of a day runs the
    // clock into the previous one — which closes that day, bills its payroll and
    // puts up a card for it, then does it again on the way back. Time here only
    // ever moves forwards.
    const forward = Math.max(0, realDt);
    this.step(forward * this.game.data.settings.speed, forward);
  }

  /**
   * Advance the world by `dt` in-game seconds. `realDt` drives only the parts
   * that should run on wall-clock time however fast the world is going, which is
   * why fast-forward does not turn the celebrations into a blur.
   */
  private step(dt: number, realDt: number): void {
    this.grid.sync();

    this.game.data.clock += dt;
    this.handleDayRollover();
    this.handleRestock();
    this.reclaimStalledOrders();

    this.updateSpawning(dt);
    for (const c of [...this.game.customers]) this.updateCustomer(c, dt);
    for (const s of this.game.data.staff) this.updateStaff(s, dt);
    this.updateFloaters(realDt);
    this.game.fx.update(realDt);
  }

  // ------------------------------------------------------------- world tick

  private handleDayRollover(): void {
    const day = this.game.dayNumber;
    if (day === this.lastDay) return;
    const closing = this.lastDay;
    this.lastDay = day;
    this.game.data.stats.daysOpen = day;

    const payroll = this.game.data.staff.reduce((sum, s) => sum + s.wage, 0);
    const paid = Math.min(payroll, this.game.data.coins);
    if (payroll > 0) {
      this.game.data.coins -= paid;
      this.game.data.stats.totalSpent += paid;
      this.game.addFloater(
        paid < payroll ? `Payroll short!` : `-${paid} wages`,
        this.game.data.doorX,
        0,
        paid < payroll ? 'bad' : 'info',
      );
      if (paid < payroll) {
        // Underpaid staff show up tired the next day.
        for (const s of this.game.data.staff) s.energy = Math.min(s.energy, 45);
      }
    }

    // Built after payroll, so the card reports the till the player will wake up
    // to rather than the one they went to bed with.
    const ledger = { ...this.game.data.today, day: closing };
    this.game.data.lastRecap = buildDayRecap(this.game, ledger, payroll, paid);
    this.game.pendingDayRecap = this.game.data.lastRecap;
    this.game.data.today = emptyLedger(day);
    this.game.touch();
  }

  private handleRestock(): void {
    if (this.game.data.clock < this.game.data.nextRestockAt) return;
    this.game.data.nextRestockAt = this.game.data.clock + RESTOCK_INTERVAL;
    for (const ing of INGREDIENT_LIST) {
      const current = this.game.marketCount(ing.id);
      this.game.data.marketStock[ing.id] = Math.min(ing.maxStock, current + ing.restock);
    }
    this.game.touch();
  }

  private updateFloaters(dt: number): void {
    for (const f of this.game.floaters) f.life -= dt;
    this.game.floaters = this.game.floaters.filter((f) => f.life > 0);
  }

  // --------------------------------------------------------------- spawning

  private updateSpawning(dt: number): void {
    if (!this.game.data.open) return;
    const seats = this.grid.usableSeats();
    if (seats.length === 0) return;

    // Passers-by will not join an endless line.
    const queueing = this.game.customers.filter(
      (c) => c.state === 'queueing' || c.state === 'entering',
    ).length;
    if (queueing >= Math.max(3, Math.ceil(seats.length * 0.75))) return;

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = this.game.spawnInterval * this.game.rng.range(0.75, 1.3);
    this.spawnCustomer();
  }

  private spawnCustomer(): void {
    const id = this.game.nextId();
    const style = this.game.styleScore;
    const regular = this.dueRegular();
    const def = regular ? REGULARS_BY_ID[regular.id] : undefined;
    const doorX = this.game.data.doorX;

    const c: Customer = {
      id,
      name: def ? def.name : randomName(this.game.rng),
      look: def ? regularLook(def) : appearanceFrom(`guest-${id}-${Math.floor(this.game.data.clock)}`),
      state: 'entering',
      tx: doorX,
      ty: -2.4,
      path: [[doorX, 0]],
      patience: 1,
      // Pleasant surroundings make people notably more forgiving, and somebody
      // who chose to come back is more forgiving still.
      patienceDrainPerSec: 1 / ((34 + style * 34) * (def ? 1.2 : 1)),
      chairUid: null,
      tableUid: null,
      dishId: null,
      orderId: null,
      timer: 0,
      satisfaction: 0.7,
      angry: false,
      queueSlot: this.game.customers.filter((x) => x.state === 'queueing').length,
      spawnedAt: this.game.data.clock,
      regularId: regular?.id ?? null,
    };
    this.game.customers.push(c);

    if (regular && def) {
      refreshFavourite(regular, this.game.data.menu);
      // Booked forward on arrival as well as on the way out, so a guest who is
      // still inside can never be spawned a second time.
      regular.nextVisitAt = this.game.data.clock + nextVisitDelay(def, 'fed');
      this.game.addFloater(`${shortName(def.name)} is back!`, doorX, -1, 'info');
      this.game.touch();
    }
  }

  /** The regular who is furthest overdue and not already in the room. */
  private dueRegular(): RegularState | null {
    const clock = this.game.data.clock;
    const inside = new Set(
      this.game.customers.map((c) => c.regularId).filter((id): id is string => id !== null),
    );
    let best: RegularState | null = null;
    for (const r of this.game.data.regulars) {
      if (r.nextVisitAt > clock || inside.has(r.id) || !REGULARS_BY_ID[r.id]) continue;
      if (!best || r.nextVisitAt < best.nextVisitAt) best = r;
    }
    return best;
  }

  private regularOf(c: Customer): RegularState | undefined {
    if (c.regularId === null) return undefined;
    return this.game.data.regulars.find((r) => r.id === c.regularId);
  }

  /** Usable seats nobody has claimed, whether or not their table is clean. */
  private unclaimedSeats(): Placed[] {
    const taken = new Set(
      this.game.customers.map((c) => c.chairUid).filter((u): u is number => u !== null),
    );
    return this.grid.usableSeats().filter((chair) => !taken.has(chair.uid));
  }

  private freeSeat(): Placed | null {
    const open = new Set(this.grid.openSeats().map((chair) => chair.uid));
    return this.unclaimedSeats().find((chair) => open.has(chair.uid)) ?? null;
  }

  // -------------------------------------------------------------- customers

  private updateCustomer(c: Customer, dt: number): void {
    switch (c.state) {
      case 'entering': {
        if (advanceAlongPath(c, dt)) {
          c.state = 'queueing';
        }
        break;
      }

      case 'queueing': {
        this.drainPatience(c, dt, 1);
        if (c.patience <= 0) {
          this.giveUp(c, 'Too long a wait');
          break;
        }
        const chair = this.freeSeat();
        if (chair) {
          const access = this.grid.accessTiles(chair);
          const path = findPath(this.grid, Math.round(c.tx), Math.round(c.ty), access);
          if (path) {
            c.chairUid = chair.uid;
            c.tableUid = this.grid.tableForChair(chair)?.uid ?? null;
            c.path = path;
            c.state = 'walkingToSeat';
            break;
          }
        }
        this.shuffleInQueue(c, dt);
        break;
      }

      case 'walkingToSeat': {
        const chair = c.chairUid !== null ? this.game.placedByUid(c.chairUid) : undefined;
        if (!chair) {
          c.chairUid = null;
          c.state = 'queueing';
          break;
        }
        if (advanceAlongPath(c, dt)) {
          // Step up onto the chair itself.
          c.tx = chair.tx;
          c.ty = chair.ty;
          c.state = 'deciding';
          c.timer = this.game.rng.range(1.0, 2.2);
        }
        break;
      }

      case 'deciding': {
        c.timer -= dt;
        if (c.timer > 0) break;
        const dish = this.dishFor(c);
        if (!dish) {
          this.giveUp(c, 'Nothing on the menu!');
          break;
        }
        c.dishId = dish;
        c.state = 'awaitingWaiter';
        break;
      }

      case 'awaitingWaiter': {
        this.drainPatience(c, dt, 0.85);
        if (c.patience <= 0) this.giveUp(c, 'Nobody took my order');
        break;
      }

      case 'ordering':
        // Held by the waiter's timer; nothing to do here.
        break;

      case 'awaitingFood': {
        this.drainPatience(c, dt, 0.5);
        if (c.patience <= 0) this.giveUp(c, 'Food never came');
        break;
      }

      case 'eating': {
        c.timer -= dt;
        if (c.timer <= 0) this.finishMeal(c);
        break;
      }

      case 'leaving': {
        if (advanceAlongPath(c, dt)) {
          c.ty -= dt * 1.8;
          if (c.ty < -3) this.remove(c);
        }
        break;
      }
    }
  }

  private drainPatience(c: Customer, dt: number, scale: number): void {
    c.patience = clamp(c.patience - c.patienceDrainPerSec * scale * dt, 0, 1);
  }

  /** Keep queueing customers loosely lined up outside the door. */
  private shuffleInQueue(c: Customer, dt: number): void {
    const queue = this.game.customers.filter((x) => x.state === 'queueing');
    const index = queue.indexOf(c);
    if (index < 0) return;
    const targetX = this.game.data.doorX + (index % 2 === 0 ? 0 : 0.55);
    const targetY = -0.2 - Math.floor(index / 2) * 0.75;
    c.tx += (targetX - c.tx) * Math.min(1, dt * 3);
    c.ty += (targetY - c.ty) * Math.min(1, dt * 3);
  }

  /**
   * What this guest orders. A regular asks for their favourite whenever the
   * kitchen can produce it, which is what makes keeping that dish stocked and on
   * the menu worth doing.
   */
  private dishFor(c: Customer): string | null {
    const favourite = this.regularOf(c)?.favouriteDishId;
    if (favourite && this.game.data.menu.includes(favourite) && this.game.canCook(favourite)) {
      return favourite;
    }
    return this.chooseDish();
  }

  /** Pick a dish from the menu, favouring appealing ones we can actually cook. */
  private chooseDish(): string | null {
    const options = this.game.data.menu.filter((id) => DISHES_BY_ID[id] && this.game.canCook(id));
    if (!options.length) return null;
    let total = 0;
    const weights = options.map((id) => {
      const dish = DISHES_BY_ID[id]!;
      const w = 0.25 + dish.appeal + this.game.dishLevel(id) * 0.05;
      total += w;
      return w;
    });
    let roll = this.game.rng.next() * total;
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) return options[i]!;
    }
    return options[options.length - 1]!;
  }

  private giveUp(c: Customer, reason: string): void {
    c.angry = true;
    c.satisfaction = 0.05;
    this.game.data.stats.customersLost++;
    this.game.data.today.walkouts++;
    this.game.recordSatisfaction(0.05);
    this.game.addFloater(reason, c.tx, c.ty, 'bad');
    this.game.fx.puff(c.tx, c.ty, '#c6a493');
    this.sound('unhappy');
    if (c.regularId !== null) this.snubRegular(c);
    this.cancelOrderFor(c);
    if (c.tableUid !== null) {
      const table = this.game.placedByUid(c.tableUid);
      // A guest who storms off still leaves a mess behind if they sat down.
      if (table && (c.state === 'awaitingWaiter' || c.state === 'awaitingFood')) {
        table.dirty = true;
        this.game.touch();
      }
    }
    this.sendHome(c);
  }

  private finishMeal(c: Customer): void {
    const dish = c.dishId ? DISHES_BY_ID[c.dishId] : undefined;
    let paid = 0;
    if (dish) {
      const level = this.game.dishLevel(dish.id);
      const chair = c.chairUid !== null ? this.game.placedByUid(c.chairUid) : undefined;
      const comfort = chair ? (this.game.defOf(chair)?.comfort ?? 1) : 1;
      const mood = 0.7 + 0.55 * c.patience;
      const style = 1 + this.game.styleScore * 0.3;
      paid = Math.max(1, Math.round(dishPrice(dish, level) * comfort * mood * style));

      this.game.earn(paid, { tx: c.tx, ty: c.ty });
      this.game.addXp(Math.round(dish.basePrice * 0.45) + 4, { tx: c.tx, ty: c.ty - 0.4 });
      this.game.data.stats.customersServed++;
      this.game.data.today.covers++;
      this.game.data.today.dishEarnings += paid;
      this.game.fx.coins(c.tx, c.ty, paid / 60);
      this.sound('coin');
    }

    c.satisfaction = 0.25 + 0.75 * c.patience;
    this.game.recordSatisfaction(c.satisfaction);
    if (c.regularId !== null) this.settleRegular(c, paid);

    if (c.tableUid !== null) {
      const table = this.game.placedByUid(c.tableUid);
      if (table) {
        table.dirty = true;
        this.game.touch();
      }
    }
    this.sendHome(c);
  }

  /*
   * A regular's visit has to be able to go well or badly, otherwise they are
   * just a walk-in with a name. Getting their favourite in front of them while
   * they are still in a good mood pays a tip and counts for more towards the
   * service score than one cover would; letting them walk out costs the same
   * score twice over and pushes their next visit well out.
   */

  private settleRegular(c: Customer, paid: number): void {
    const state = this.regularOf(c);
    const def = state ? REGULARS_BY_ID[state.id] : undefined;
    if (!state || !def) return;

    state.visits++;
    const delighted =
      state.favouriteDishId !== null &&
      c.dishId === state.favouriteDishId &&
      c.patience > 0.45;

    if (delighted) {
      state.delighted++;
      const tip = Math.max(5, Math.round(paid * 0.35));
      this.game.earn(tip, { tx: c.tx, ty: c.ty - 0.5 });
      this.game.addFloater(`${shortName(def.name)}'s favourite!`, c.tx, c.ty - 1, 'coin');
      this.game.addXp(8);
      this.game.recordSatisfaction(1);
      this.game.fx.coins(c.tx, c.ty, tip / 40);
      this.game.data.today.tips += tip;
      this.game.data.today.regularsDelighted++;
      this.sound('bell');
    }

    state.nextVisitAt =
      this.game.data.clock + nextVisitDelay(def, delighted ? 'delighted' : 'fed');
    this.game.touch();
  }

  private snubRegular(c: Customer): void {
    const state = this.regularOf(c);
    const def = state ? REGULARS_BY_ID[state.id] : undefined;
    if (!state || !def) return;

    state.visits++;
    state.walkouts++;
    this.game.data.today.regularsLost++;
    this.game.addFloater(`${shortName(def.name)} will remember that`, c.tx, c.ty - 1, 'bad');
    this.game.recordSatisfaction(0);
    state.nextVisitAt = this.game.data.clock + nextVisitDelay(def, 'snubbed');
    this.game.touch();
  }

  private sendHome(c: Customer): void {
    c.chairUid = null;
    c.state = 'leaving';
    const from = [Math.round(c.tx), Math.round(c.ty)] as const;
    const path = findPath(this.grid, from[0], from[1], [[this.game.data.doorX, -2]]);
    c.path = path ?? [];
  }

  private remove(c: Customer): void {
    this.game.customers = this.game.customers.filter((x) => x.id !== c.id);
  }

  private cancelOrderFor(c: Customer): void {
    if (c.orderId === null) return;
    const order = this.game.orders.find((o) => o.id === c.orderId);
    if (order) this.discardOrder(order);
    c.orderId = null;
  }

  /** Free whatever surface a finished plate was sitting on. */
  private releaseOrderHold(order: Order): void {
    if (order.holdingUid === null) return;
    const holder = this.game.placedByUid(order.holdingUid);
    if (holder?.plates) {
      const at = holder.plates.indexOf(order.id);
      if (at >= 0) holder.plates.splice(at, 1);
    }
    order.holdingUid = null;
  }

  // -------------------------------------------------------- player commands

  /*
   * The floor runs itself, so a command is only worth having if it beats
   * waiting: these let the player choose *which* guest gets the next seat,
   * *which* table is wiped first and *which* plate goes out now. Each one either
   * changes the world or explains why it cannot, and each one goes through the
   * same job helpers the AI uses, so a commanded job can be interrupted and
   * handed back exactly like one the AI picked up.
   */

  /** Staff who could take a new job right now, best-suited and nearest first. */
  private availableStaff(from: Point, prefer: StaffRole): Staff[] {
    const distance = (s: Staff): number => Math.abs(s.tx - from.tx) + Math.abs(s.ty - from.ty);
    return this.game.data.staff
      .filter((s) => s.energy > 0)
      // 'walking' with no target is the idle drift, which is free to interrupt.
      .filter((s) => s.state === 'idle' || (s.state === 'walking' && s.targetUid === null))
      .sort((a, b) => {
        const byRole = (a.role === prefer ? 0 : 1) - (b.role === prefer ? 0 : 1);
        return byRole !== 0 ? byRole : distance(a) - distance(b);
      });
  }

  /** Why nobody could be sent, phrased as the fix rather than the symptom. */
  private noStaffReason(prefer: StaffRole): string {
    if (!this.game.data.staff.length) return 'Hire someone from the Staff panel first';
    if (this.game.data.staff.every((s) => s.energy <= 0 || s.state === 'exhausted')) {
      return 'Your whole team is out of energy — feed them from the Staff panel';
    }
    const role = prefer === 'cleaner' ? 'cleaner' : 'waiter';
    return `Everyone is busy — hire another ${role}`;
  }

  /** Walk a specific guest to the nearest clean seat, or say what is blocking it. */
  seatGuest(c: Customer): CommandResult {
    this.grid.sync();
    const at: Point = { tx: c.tx, ty: c.ty };
    if (c.state !== 'queueing' && c.state !== 'entering') {
      return noted(`${c.name} already has a table`, at);
    }

    const unclaimed = this.unclaimedSeats();
    const clean = unclaimed
      .filter((chair) => !this.grid.tableForChair(chair)?.dirty)
      .sort((a, b) => this.distanceTo(c, this.grid.accessTiles(a)) -
        this.distanceTo(c, this.grid.accessTiles(b)));

    const chair = clean[0];
    if (!chair) {
      if (!this.grid.usableSeats().length) {
        return refused('No usable seats — a chair only works when it touches a table', at);
      }
      if (!unclaimed.length) return refused('Every seat is taken — place another table', at);
      // Ring the table that is in the way, so "it is dirty" points at something.
      const blocked = this.grid.tableForChair(unclaimed[0]!);
      if (blocked) this.game.fx.command(blocked.tx, blocked.ty);
      return refused(
        'The free seat is still dirty — tap the table to get it wiped',
        blocked ? { tx: blocked.tx, ty: blocked.ty } : at,
      );
    }

    const path = findPath(this.grid, Math.round(c.tx), Math.round(c.ty), this.grid.accessTiles(chair));
    if (!path) return refused('That seat cannot be reached from the door', at);

    c.chairUid = chair.uid;
    c.tableUid = this.grid.tableForChair(chair)?.uid ?? null;
    c.path = path;
    c.state = 'walkingToSeat';
    this.game.fx.command(chair.tx, chair.ty);
    return done(`${c.name} is on their way to a table`, { tx: chair.tx, ty: chair.ty });
  }

  /** Send the nearest free worker to wipe one particular table. */
  cleanTable(table: Placed): CommandResult {
    this.grid.sync();
    const at: Point = { tx: table.tx, ty: table.ty };
    if (this.game.defOf(table)?.role !== 'table') {
      return noted('Only tables need wiping', at);
    }
    if (!table.dirty) return noted('That table is already clean', at);
    if (this.occupied(table)) return noted('Someone is still sitting there', at);

    const already = this.game.data.staff.find(
      (s) => s.state === 'cleaning' && s.targetUid === table.uid,
    );
    if (already) return noted(`${already.name} is already on it`, at);

    for (const s of this.availableStaff(at, 'cleaner')) {
      if (!this.startCleaning(s, table)) continue;
      this.game.fx.command(table.tx, table.ty);
      this.game.touch();
      return done(`${s.name} is wiping that table`, at);
    }
    return refused(this.noStaffReason('cleaner'), at);
  }

  /**
   * Run the plate waiting on this counter or stove out now. Clearing a holder is
   * also how a blocked kitchen gets moving again, so it is worth a tap.
   */
  runPlateOut(holder: Placed): CommandResult {
    this.grid.sync();
    const at: Point = { tx: holder.tx, ty: holder.ty };
    const waiting = this.game.orders
      .filter((o) => o.state === 'ready' && o.holdingUid === holder.uid)
      .sort((a, b) => a.placedAt - b.placedAt);
    if (!waiting.length) return noted('No plate is waiting here', at);

    const claimed = this.claimedOrders();
    const next = waiting.find((o) => !claimed.has(o.id));
    if (!next) {
      const runner = this.game.data.staff.find((s) => waiting.some((o) => o.id === s.targetOrderId));
      return noted(`${runner?.name ?? 'Someone'} is already fetching it`, at);
    }

    const dish = DISHES_BY_ID[next.dishId];
    for (const s of this.availableStaff(at, 'waiter')) {
      if (!this.startDelivery(s, next)) continue;
      this.game.fx.command(holder.tx, holder.ty);
      this.game.touch();
      return done(`${s.name} is running the ${dish?.name ?? 'plate'} out`, at);
    }
    return refused(this.noStaffReason('waiter'), at);
  }

  // --------------------------------------------------------- releasing work

  /*
   * Every way a job can be interrupted — a role switch, a firing, a worker
   * running out of energy, or the fixture being sold out from under them —
   * funnels through the helpers below. An order left mid-flight is invisible to
   * the sim: only `queued` orders are picked up by a chef and only `ready` ones
   * by a waiter, so a `cooking` order nobody owns pins its stove for the rest of
   * the session and its guest waits until they walk out.
   */

  /**
   * Hand back whatever `s` was carrying or cooking, then stand them down. Safe
   * to call on an idle worker.
   */
  releaseStaffJob(s: Staff): void {
    if (s.targetOrderId !== null) {
      const order = this.game.orders.find((o) => o.id === s.targetOrderId);
      if (order) this.releaseOrder(order, s);
    }
    this.resetStaff(s);
    this.game.touch();
  }

  /** Switch someone's job without stranding the work they were part-way through. */
  setStaffRole(s: Staff, role: StaffRole): void {
    this.releaseStaffJob(s);
    s.role = role;
    this.game.touch();
  }

  /** Let someone go, handing their current job back to the rest of the team. */
  dismissStaff(s: Staff): void {
    this.releaseStaffJob(s);
    this.game.data.staff = this.game.data.staff.filter((x) => x.id !== s.id);
    this.game.touch();
  }

  /**
   * Take a piece of furniture out of the room, detaching everyone and everything
   * still pointing at it so no order, plate or worker is left waiting on a
   * fixture that no longer exists.
   */
  removeFixture(p: Placed): void {
    const uid = p.uid;
    const spot: Point = { tx: p.tx, ty: p.ty };
    this.game.data.placed = this.game.data.placed.filter((x) => x.uid !== uid);
    this.game.touch();
    this.grid.sync();

    for (const order of [...this.game.orders]) {
      if (order.stoveUid === uid) {
        order.stoveUid = null;
        if (order.state === 'cooking') this.returnOrderToKitchen(order);
      }
      if (order.holdingUid === uid) {
        // The plate went out with the fixture, so it needs a new home or a recook.
        order.holdingUid = null;
        this.rehomePlate(order, spot);
      }
    }

    for (const s of this.game.data.staff) {
      if (s.targetUid === uid) this.releaseStaffJob(s);
    }

    for (const c of this.game.customers) {
      if (c.chairUid !== uid && c.tableUid !== uid) continue;
      if (c.chairUid === uid) c.chairUid = null;
      if (c.tableUid === uid) c.tableUid = null;
      if (c.state === 'entering' || c.state === 'queueing' || c.state === 'leaving') continue;
      if (c.state === 'walkingToSeat') {
        // Still on their way over, so they can simply pick another seat.
        c.state = 'queueing';
        c.path = [];
        continue;
      }
      this.cancelOrderFor(c);
      this.sendHome(c);
    }
    this.game.touch();
  }

  /** Put an in-flight order back where somebody else can pick it up. */
  private releaseOrder(order: Order, from: Point): void {
    if (order.state === 'cooking') {
      this.returnOrderToKitchen(order);
      return;
    }
    if (order.state === 'collected') this.rehomePlate(order, from);
  }

  /**
   * Park a plate that is in nobody's hands on the nearest free counter. With
   * every counter full there is nowhere to put it down, so it is binned and the
   * dish goes back on the kitchen queue rather than vanishing on the guest.
   */
  private rehomePlate(order: Order, from: Point): void {
    const counter = this.freeCounter(from);
    if (!counter) {
      this.returnOrderToKitchen(order);
      return;
    }
    counter.plates = counter.plates ?? [];
    counter.plates.push(order.id);
    order.holdingUid = counter.uid;
    order.stoveUid = null;
    order.state = 'ready';
    this.game.touch();
  }

  /** Send an order back to the queue so any chef can cook it again. */
  private returnOrderToKitchen(order: Order): void {
    const customer = this.game.customers.find((c) => c.id === order.customerId);
    if (!customer || customer.state !== 'awaitingFood') {
      this.discardOrder(order);
      return;
    }
    this.releaseOrderHold(order);
    order.state = 'queued';
    order.stoveUid = null;
    order.progress = 0;
    this.game.touch();
  }

  /** Drop an order entirely, leaving nothing pointing at it. */
  private discardOrder(order: Order): void {
    this.releaseOrderHold(order);
    this.game.orders = this.game.orders.filter((o) => o.id !== order.id);
    const customer = this.game.customers.find((c) => c.id === order.customerId);
    if (customer?.orderId === order.id) customer.orderId = null;
    for (const s of this.game.data.staff) {
      if (s.targetOrderId === order.id) this.resetStaff(s);
    }
    this.game.touch();
  }

  /**
   * Catch anything that slipped through: an order whose worker is gone, or one
   * still pointing at furniture that has been sold. Cheap — there are only ever
   * a handful of live orders — and it means a stalled kitchen recovers on its
   * own instead of needing a reload.
   */
  private reclaimStalledOrders(): void {
    const door: Point = { tx: this.game.data.doorX, ty: 0 };
    for (const order of [...this.game.orders]) {
      if (order.stoveUid !== null && !this.game.placedByUid(order.stoveUid)) {
        order.stoveUid = null;
      }
      if (order.holdingUid !== null && !this.game.placedByUid(order.holdingUid)) {
        order.holdingUid = null;
      }
      const owner = this.game.data.staff.some((s) => s.targetOrderId === order.id);
      switch (order.state) {
        case 'cooking':
          if (!owner || order.stoveUid === null) this.returnOrderToKitchen(order);
          break;
        case 'collected':
          if (!owner) this.rehomePlate(order, door);
          break;
        case 'ready':
          if (order.holdingUid === null) this.rehomePlate(order, door);
          break;
      }
    }
  }

  // ------------------------------------------------------------------ staff

  private resetStaff(s: Staff): void {
    s.state = s.energy <= 0 ? 'exhausted' : 'idle';
    s.path = [];
    s.timer = 0;
    s.targetCustomerId = null;
    s.targetOrderId = null;
    s.targetUid = null;
    s.carryDishId = null;
  }

  private updateStaff(s: Staff, dt: number): void {
    if (s.state === 'exhausted') {
      s.energy = Math.min(100, s.energy + dt * 2.6);
      if (s.energy >= 35) s.state = 'idle';
      return;
    }

    if (s.state === 'idle') {
      s.energy = Math.min(100, s.energy + dt * 0.9);
    } else {
      s.energy = Math.max(0, s.energy - dt * 0.22);
    }
    if (s.energy <= 0) {
      this.releaseStaffJob(s);
      s.state = 'exhausted';
      return;
    }

    if (s.state === 'idle') {
      this.assignJob(s);
      if (s.state === 'idle') this.idleDrift(s, dt);
      return;
    }

    // Every non-idle state walks first, then performs its action on arrival.
    if (s.path.length) {
      advanceAlongPath(s, dt, 2.35 * (0.85 + workSpeed(s) * 0.15));
      return;
    }

    switch (s.state) {
      case 'takingOrder':
        this.tickTakeOrder(s, dt);
        break;
      case 'toKitchen':
        this.tickPickup(s);
        break;
      case 'carrying':
        this.tickCarry(s);
        break;
      case 'serving':
        this.tickServe(s, dt);
        break;
      case 'cooking':
        this.tickCook(s, dt);
        break;
      case 'cleaning':
        this.tickClean(s, dt);
        break;
      default:
        s.state = 'idle';
    }
  }

  /** Small idle wander so staff do not look frozen. */
  private idleDrift(s: Staff, dt: number): void {
    s.timer -= dt;
    if (s.timer > 0) return;
    s.timer = this.game.rng.range(2.5, 6);
    const home = this.homeTile(s);
    if (!home) return;
    if (Math.abs(s.tx - home[0]) < 0.1 && Math.abs(s.ty - home[1]) < 0.1) return;
    const path = findPath(this.grid, Math.round(s.tx), Math.round(s.ty), [home]);
    if (path?.length) {
      s.path = path;
      s.state = 'walking';
      // 'walking' with no job simply returns to idle once the path finishes.
      s.targetUid = null;
    }
  }

  /** Where a role loiters when there is nothing to do. */
  private homeTile(s: Staff): [number, number] | null {
    if (s.role === 'chef') {
      const stove = this.game.placedWithRole('stove')[0];
      if (stove) {
        const access = this.grid.accessTiles(stove);
        if (access.length) return access[0]!;
      }
    }
    const doorX = this.game.data.doorX;
    if (this.grid.isWalkable(doorX, 0)) return [doorX, 0];
    for (let y = 0; y < this.grid.size; y++) {
      for (let x = 0; x < this.grid.size; x++) {
        if (this.grid.isWalkable(x, y)) return [x, y];
      }
    }
    return null;
  }

  private assignJob(s: Staff): void {
    if (s.role === 'chef') {
      if (this.tryStartCooking(s)) return;
      // Chefs pitch in with plates when the kitchen is quiet.
      if (this.tryDeliverFood(s)) return;
      return;
    }
    if (s.role === 'cleaner') {
      if (this.tryClean(s)) return;
      if (this.tryDeliverFood(s)) return;
      return;
    }
    // Waiters: food first so nothing goes cold, then new orders, then tidying.
    if (this.tryDeliverFood(s)) return;
    if (this.tryTakeOrder(s)) return;
    this.tryClean(s);
  }

  private distanceTo(from: Point, tiles: Array<[number, number]>): number {
    let best = Infinity;
    for (const [x, y] of tiles) {
      const d = Math.abs(from.tx - x) + Math.abs(from.ty - y);
      if (d < best) best = d;
    }
    return best;
  }

  private tryTakeOrder(s: Staff): boolean {
    const claimed = new Set(
      this.game.data.staff
        .map((x) => (x.state === 'takingOrder' ? x.targetCustomerId : null))
        .filter((x): x is number => x !== null),
    );
    let best: Customer | null = null;
    let bestDist = Infinity;
    for (const c of this.game.customers) {
      if (c.state !== 'awaitingWaiter' || claimed.has(c.id)) continue;
      const d = Math.abs(s.tx - c.tx) + Math.abs(s.ty - c.ty);
      // Serve the least patient guest first when distances are comparable.
      const score = d - (1 - c.patience) * 6;
      if (score < bestDist) {
        bestDist = score;
        best = c;
      }
    }
    if (!best) return false;

    const access = this.approachTilesFor(best);
    const path = findPath(this.grid, Math.round(s.tx), Math.round(s.ty), access);
    if (!path) return false;
    s.state = 'takingOrder';
    s.path = path;
    s.targetCustomerId = best.id;
    s.timer = ORDER_SECONDS;
    return true;
  }

  /** Walkable tiles from which a staff member can reach a seated customer. */
  private approachTilesFor(c: Customer): Array<[number, number]> {
    const tiles: Array<[number, number]> = [];
    if (c.chairUid !== null) {
      const chair = this.game.placedByUid(c.chairUid);
      if (chair) tiles.push(...this.grid.accessTiles(chair));
    }
    if (!tiles.length && c.tableUid !== null) {
      const table = this.game.placedByUid(c.tableUid);
      if (table) tiles.push(...this.grid.accessTiles(table));
    }
    return tiles;
  }

  private tickTakeOrder(s: Staff, dt: number): void {
    const c = this.game.customers.find((x) => x.id === s.targetCustomerId);
    if (!c || (c.state !== 'awaitingWaiter' && c.state !== 'ordering')) {
      this.resetStaff(s);
      return;
    }
    c.state = 'ordering';
    s.timer -= dt * workSpeed(s);
    if (s.timer > 0) return;

    // Stock may have moved since the guest decided; fall back to anything cookable.
    let dishId = c.dishId;
    if (!dishId || !this.game.canCook(dishId)) dishId = this.dishFor(c);
    if (!dishId) {
      this.giveUp(c, 'Out of ingredients!');
      this.resetStaff(s);
      return;
    }

    this.game.consumeIngredients(dishId);
    const dish = DISHES_BY_ID[dishId]!;
    const order: Order = {
      id: this.game.nextId(),
      customerId: c.id,
      dishId,
      state: 'queued',
      stoveUid: null,
      holdingUid: null,
      progress: 0,
      cookSeconds: dishCookTime(dish, this.game.dishLevel(dishId)),
      placedAt: this.game.data.clock,
    };
    this.game.orders.push(order);
    c.dishId = dishId;
    c.orderId = order.id;
    c.state = 'awaitingFood';

    s.energy = Math.max(0, s.energy - ENERGY_COST.order);
    this.resetStaff(s);
  }

  private tryStartCooking(s: Staff): boolean {
    const order = this.game.orders.find((o) => o.state === 'queued');
    if (!order) return false;

    const busyStoves = new Set(
      this.game.orders
        .filter((o) => o.stoveUid !== null && o.state !== 'collected')
        .map((o) => o.stoveUid!),
    );
    const stoves = this.game
      .placedWithRole('stove')
      .filter((st) => !busyStoves.has(st.uid) && !(st.plates?.length))
      .filter((st) => this.grid.accessTiles(st).length > 0)
      .sort((a, b) => this.distanceTo(s, this.grid.accessTiles(a)) -
        this.distanceTo(s, this.grid.accessTiles(b)));
    const stove = stoves[0];
    if (!stove) return false;

    const path = findPath(this.grid, Math.round(s.tx), Math.round(s.ty), this.grid.accessTiles(stove));
    if (!path) return false;

    order.state = 'cooking';
    order.stoveUid = stove.uid;
    order.progress = 0;
    s.state = 'cooking';
    s.path = path;
    s.targetOrderId = order.id;
    s.targetUid = stove.uid;
    return true;
  }

  private tickCook(s: Staff, dt: number): void {
    const order = this.game.orders.find((o) => o.id === s.targetOrderId);
    const stove = s.targetUid !== null ? this.game.placedByUid(s.targetUid) : undefined;
    if (!order || !stove || order.state !== 'cooking') {
      this.resetStaff(s);
      return;
    }
    const def: FurnitureDef | undefined = this.game.defOf(stove);
    const rate = ((def?.speed ?? 1) * workSpeed(s)) / order.cookSeconds;
    const before = order.progress;
    order.progress = Math.min(1, order.progress + rate * dt);
    if (before < 0.5 && order.progress >= 0.5) this.sound('sizzle');
    if (order.progress < 1) return;

    order.state = 'ready';
    this.game.data.stats.dishesCooked++;
    const levelled = this.game.recordServing(order.dishId);
    if (levelled) {
      const dish = DISHES_BY_ID[order.dishId]!;
      this.game.addFloater(`${dish.name} Lv${this.game.dishLevel(order.dishId)}!`, s.tx, s.ty - 0.5, 'xp');
      this.sound('bell');
    }

    // Park the plate on a counter if one is free, otherwise it blocks the stove.
    const counter = this.freeCounter(s);
    const holder = counter ?? stove;
    holder.plates = holder.plates ?? [];
    holder.plates.push(order.id);
    order.holdingUid = holder.uid;
    order.stoveUid = null;
    this.game.fx.steam(holder.tx, holder.ty, 0.85);

    s.energy = Math.max(0, s.energy - ENERGY_COST.cook);
    this.game.touch();
    this.resetStaff(s);
  }

  private freeCounter(from: Point): Placed | undefined {
    return this.game
      .placedWithRole('counter')
      .filter((c) => {
        const slots = this.game.defOf(c)?.slots ?? 1;
        return (c.plates?.length ?? 0) < slots && this.grid.accessTiles(c).length > 0;
      })
      .sort((a, b) => this.distanceTo(from, this.grid.accessTiles(a)) -
        this.distanceTo(from, this.grid.accessTiles(b)))[0];
  }

  /** Orders somebody is already fetching, so two waiters never chase one plate. */
  private claimedOrders(): Set<number> {
    return new Set(
      this.game.data.staff
        .map((x) => (x.state === 'toKitchen' || x.state === 'carrying' || x.state === 'serving'
          ? x.targetOrderId : null))
        .filter((x): x is number => x !== null),
    );
  }

  /** Send `s` to collect a specific plated order. */
  private startDelivery(s: Staff, order: Order): boolean {
    if (order.holdingUid === null) return false;
    const holder = this.game.placedByUid(order.holdingUid);
    if (!holder) return false;
    const path = findPath(this.grid, Math.round(s.tx), Math.round(s.ty), this.grid.accessTiles(holder));
    if (!path) return false;
    s.state = 'toKitchen';
    s.path = path;
    s.targetOrderId = order.id;
    s.targetUid = holder.uid;
    return true;
  }

  private tryDeliverFood(s: Staff): boolean {
    const claimed = this.claimedOrders();
    const ready = this.game.orders
      .filter((o) => o.state === 'ready' && o.holdingUid !== null && !claimed.has(o.id))
      .sort((a, b) => a.placedAt - b.placedAt);
    for (const order of ready) {
      if (this.startDelivery(s, order)) return true;
    }
    return false;
  }

  private tickPickup(s: Staff): void {
    const order = this.game.orders.find((o) => o.id === s.targetOrderId);
    if (!order || order.state !== 'ready') {
      this.resetStaff(s);
      return;
    }
    const customer = this.game.customers.find((c) => c.id === order.customerId);
    if (!customer || customer.state !== 'awaitingFood') {
      // The guest gave up; bin the plate.
      this.releaseOrderHold(order);
      this.game.orders = this.game.orders.filter((o) => o.id !== order.id);
      this.resetStaff(s);
      return;
    }

    const access = this.approachTilesFor(customer);
    const path = findPath(this.grid, Math.round(s.tx), Math.round(s.ty), access);
    if (!path) {
      this.resetStaff(s);
      return;
    }
    this.releaseOrderHold(order);
    order.state = 'collected';
    s.carryDishId = order.dishId;
    s.state = 'carrying';
    s.path = path;
    s.targetCustomerId = customer.id;
    s.targetUid = null;
    s.timer = SERVE_SECONDS;
    this.game.touch();
  }

  private tickCarry(s: Staff): void {
    s.state = 'serving';
    s.timer = SERVE_SECONDS;
  }

  private tickServe(s: Staff, dt: number): void {
    const order = this.game.orders.find((o) => o.id === s.targetOrderId);
    const c = this.game.customers.find((x) => x.id === s.targetCustomerId);
    if (!order || !c || c.state !== 'awaitingFood') {
      if (order) this.game.orders = this.game.orders.filter((o) => o.id !== order.id);
      this.resetStaff(s);
      return;
    }
    s.timer -= dt * workSpeed(s);
    if (s.timer > 0) return;

    c.state = 'eating';
    c.timer = this.game.rng.range(9, 15);
    this.game.orders = this.game.orders.filter((o) => o.id !== order.id);
    c.orderId = null;
    s.energy = Math.max(0, s.energy - ENERGY_COST.serve);
    this.resetStaff(s);
  }

  /** Tables somebody is already on their way to wipe. */
  private claimedTables(): Set<number> {
    return new Set(
      this.game.data.staff
        .map((x) => (x.state === 'cleaning' ? x.targetUid : null))
        .filter((x): x is number => x !== null),
    );
  }

  /** Send `s` to wipe a specific table. */
  private startCleaning(s: Staff, table: Placed): boolean {
    const path = findPath(this.grid, Math.round(s.tx), Math.round(s.ty), this.grid.accessTiles(table));
    if (!path) return false;
    s.state = 'cleaning';
    s.path = path;
    s.targetUid = table.uid;
    // Cleaners get the full benefit of washing equipment; others improvise.
    const equipment = this.bestSinkSpeed();
    const roleFactor = s.role === 'cleaner' ? 1 : 0.65;
    s.timer = CLEAN_SECONDS / (equipment * roleFactor);
    return true;
  }

  private tryClean(s: Staff): boolean {
    const claimed = this.claimedTables();
    const dirty = this.game
      .placedWithRole('table')
      .filter((t) => t.dirty && !claimed.has(t.uid))
      .filter((t) => !this.occupied(t))
      .sort((a, b) => this.distanceTo(s, this.grid.accessTiles(a)) -
        this.distanceTo(s, this.grid.accessTiles(b)));
    const table = dirty[0];
    if (!table) return false;
    return this.startCleaning(s, table);
  }

  /** True while a guest is still using this table. */
  private occupied(table: Placed): boolean {
    return this.game.customers.some((c) => c.tableUid === table.uid && c.state !== 'leaving');
  }

  private bestSinkSpeed(): number {
    return this.game
      .placedWithRole('sink')
      .reduce((best, p) => Math.max(best, this.game.defOf(p)?.speed ?? 1), 1);
  }

  private tickClean(s: Staff, dt: number): void {
    const table = s.targetUid !== null ? this.game.placedByUid(s.targetUid) : undefined;
    if (!table || !table.dirty) {
      this.resetStaff(s);
      return;
    }
    s.timer -= dt * workSpeed(s);
    if (s.timer > 0) return;
    table.dirty = false;
    this.game.data.stats.tablesCleaned++;
    this.game.fx.clean(table.tx, table.ty);
    s.energy = Math.max(0, s.energy - ENERGY_COST.clean);
    this.game.touch();
    this.resetStaff(s);
  }

  // ---------------------------------------------------------- the shift away

  /*
   * What the diner did while the tab was shut.
   *
   * This used to be a formula: guess a cover count, multiply by an average price,
   * hand over the coins and the experience. Nothing was cooked, so no stock was
   * used; the clock never moved, so no day ended and no wages were ever drawn.
   * Time away was pure profit at no cost, which made shutting the tab a strategy.
   *
   * So there is no formula any more. The team works the shift for real, through
   * the same code a watched shift runs through: guests arrive, recipes come out
   * of the pantry, the day ends and payroll comes out of the till. What the
   * player is credited with is *time*, and only a little of it — a full night
   * away buys one in-game day, which is the most that can pass without skipping
   * a payroll or burying one day's card under the next.
   */

  /** Time away that buys the whole catch-up. Longer absences are paid the same. */
  private static readonly AWAY_WINDOW = 8 * 3600;

  /** Ceiling on the catch-up: one in-game day, so exactly one payroll can fall due. */
  private static readonly AWAY_CREDIT = DAY_LENGTH;

  /** Below this there is no shift worth running, and the room is left untouched. */
  private static readonly AWAY_MINIMUM = 30;

  /**
   * Work the shift the player missed, if there was one, and report what it came
   * to. Returns null when nothing happened, which includes a diner that could
   * not have opened at all: a shut door, no seats, no kitchen or an empty pantry
   * earns nothing rather than a gift.
   */
  catchUpWhileAway(elapsedSeconds: number): TimeAwayReport | null {
    if (!Number.isFinite(elapsedSeconds)) return null;
    const credit =
      Simulation.AWAY_CREDIT * clamp(elapsedSeconds / Simulation.AWAY_WINDOW, 0, 1);
    if (credit < Simulation.AWAY_MINIMUM || !this.couldHaveTraded()) return null;

    const d = this.game.data;
    const before = {
      coins: d.coins,
      earned: d.stats.totalEarned,
      spent: d.stats.totalSpent,
      covers: d.stats.customersServed,
      walkouts: d.stats.customersLost,
      xp: d.xp,
      stock: this.pantryWorth(),
      day: this.game.dayNumber,
    };

    // Coarser than a rendered frame but well inside what 3x speed already feeds
    // the sim, which keeps a whole day down to a few thousand steps.
    const step = 1 / 10;
    let traded = 0;
    let pantryRanDry = false;
    this.quiet = true;
    try {
      while (traded < credit) {
        const dt = Math.min(step, credit - traded);
        this.step(dt, dt);
        traded += dt;
        // Nobody can serve what the pantry has not got, so the team locks up
        // rather than working an empty kitchen into a queue of walkouts.
        if (!this.game.menuCanCook()) {
          pantryRanDry = true;
          break;
        }
      }
    } finally {
      this.quiet = false;
    }

    // The coins and suds belong to a shift nobody watched, so the room comes
    // back as it was left rather than mid-celebration.
    this.game.floaters = [];
    this.game.fx.clear();

    const report: TimeAwayReport = {
      awaySeconds: Math.max(0, elapsedSeconds),
      tradedSeconds: traded,
      covers: d.stats.customersServed - before.covers,
      walkouts: d.stats.customersLost - before.walkouts,
      takings: d.stats.totalEarned - before.earned,
      // Nothing but payroll spends from the till without the player asking.
      wages: d.stats.totalSpent - before.spent,
      ingredients: Math.max(0, before.stock - this.pantryWorth()),
      coins: d.coins - before.coins,
      xp: d.xp - before.xp,
      daysRolled: this.game.dayNumber - before.day,
      pantryRanDry,
    };
    this.game.touch();
    // A shift that neither served anybody nor cost anything is not worth a card.
    if (report.covers === 0 && report.wages === 0) return null;
    return report;
  }

  /** Whether the diner could have opened its doors and served at all. */
  private couldHaveTraded(): boolean {
    if (!this.game.data.open) return false;
    this.grid.sync();
    return (
      this.grid.usableSeats().length > 0 &&
      this.game.placedWithRole('stove').length > 0 &&
      this.game.staffByRole('waiter').length > 0 &&
      this.game.staffByRole('chef').length > 0 &&
      this.game.menuCanCook()
    );
  }

  /** What the pantry would cost to replace, which is what a cover really spends. */
  private pantryWorth(): number {
    let total = 0;
    for (const ing of INGREDIENT_LIST) {
      total += this.game.pantryCount(ing.id) * INGREDIENTS[ing.id].price;
    }
    return total;
  }
}

/** What one unwatched shift came to, for the card shown on the way back in. */
export interface TimeAwayReport {
  /** How long the player was gone, for the line that says so. */
  awaySeconds: number;
  /** In-game seconds the team actually worked. */
  tradedSeconds: number;
  covers: number;
  walkouts: number;
  /** Coins taken over the counter, tips included. */
  takings: number;
  /** Payroll drawn by any day that ended while the player was gone. */
  wages: number;
  /** Market value of the stock the kitchen cooked with. */
  ingredients: number;
  /** What the till is actually up, which is takings less wages. */
  coins: number;
  xp: number;
  daysRolled: number;
  /** Set when the kitchen ran out of stock and the team locked up early. */
  pantryRanDry: boolean;
}

/**
 * Run the shift missed since a save was written. Kept as a function because it
 * belongs to loading a game rather than to a session already under way.
 */
export function catchUpWhileAway(game: Game, elapsedSeconds: number): TimeAwayReport | null {
  return new Simulation(game).catchUpWhileAway(elapsedSeconds);
}
