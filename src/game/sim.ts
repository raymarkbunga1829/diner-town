import { clamp } from '../engine/iso';
import { audio } from '../engine/audio';
import { DISHES_BY_ID, dishCookTime, dishPrice } from './data/dishes';
import type { FurnitureDef } from './data/furniture';
import { INGREDIENT_LIST } from './data/ingredients';
import { Grid } from './grid';
import { advanceAlongPath, findPath } from './path';
import { appearanceFrom, randomName, workSpeed } from './people';
import { RESTOCK_INTERVAL, type Game } from './state';
import type { Customer, Order, Placed, Staff } from './types';

/** Seconds a waiter spends writing down an order. */
const ORDER_SECONDS = 1.6;
/** Seconds to hand a plate over. */
const SERVE_SECONDS = 1.0;
/** Baseline seconds to wipe down a table. */
const CLEAN_SECONDS = 4.5;

/** Energy consumed by each completed task. */
const ENERGY_COST = { order: 1.1, serve: 1.1, cook: 1.7, clean: 1.5 };

export class Simulation {
  readonly grid: Grid;
  private spawnTimer = 0;
  private lastDay = 1;

  constructor(private readonly game: Game) {
    this.grid = new Grid(game);
    this.lastDay = game.dayNumber;
  }

  update(realDt: number): void {
    const dt = realDt * this.game.data.settings.speed;
    this.grid.sync();

    this.game.data.clock += dt;
    this.handleDayRollover();
    this.handleRestock();

    this.updateSpawning(dt);
    for (const c of [...this.game.customers]) this.updateCustomer(c, dt);
    for (const s of this.game.data.staff) this.updateStaff(s, dt);
    this.updateFloaters(realDt);
  }

  // ------------------------------------------------------------- world tick

  private handleDayRollover(): void {
    const day = this.game.dayNumber;
    if (day === this.lastDay) return;
    this.lastDay = day;
    this.game.data.stats.daysOpen = day;

    const payroll = this.game.data.staff.reduce((sum, s) => sum + s.wage, 0);
    if (payroll > 0) {
      const paid = Math.min(payroll, this.game.data.coins);
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
      this.game.touch();
    }
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
    const seats = this.usableSeats();
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
    const c: Customer = {
      id,
      name: randomName(this.game.rng),
      look: appearanceFrom(`guest-${id}-${Math.floor(this.game.data.clock)}`),
      state: 'entering',
      tx: this.game.data.doorX,
      ty: -2.4,
      path: [[this.game.data.doorX, 0]],
      patience: 1,
      // Pleasant surroundings make people notably more forgiving.
      patienceDrainPerSec: 1 / (34 + style * 34),
      chairUid: null,
      tableUid: null,
      dishId: null,
      orderId: null,
      timer: 0,
      satisfaction: 0.7,
      angry: false,
      queueSlot: this.game.customers.filter((x) => x.state === 'queueing').length,
      spawnedAt: this.game.data.clock,
    };
    this.game.customers.push(c);
  }

  private usableSeats(): Placed[] {
    return this.game
      .placedWithRole('chair')
      .filter((chair) => this.grid.isUsableSeat(chair));
  }

  private freeSeat(): Placed | null {
    const taken = new Set(
      this.game.customers.map((c) => c.chairUid).filter((u): u is number => u !== null),
    );
    for (const chair of this.usableSeats()) {
      if (taken.has(chair.uid)) continue;
      const table = this.grid.tableForChair(chair);
      if (!table || table.dirty) continue;
      return chair;
    }
    return null;
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
        const dish = this.chooseDish();
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
    this.game.recordSatisfaction(0.05);
    this.game.addFloater(reason, c.tx, c.ty, 'bad');
    if (!this.game.data.settings.muted) audio.play('unhappy');
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
    if (dish) {
      const level = this.game.dishLevel(dish.id);
      const chair = c.chairUid !== null ? this.game.placedByUid(c.chairUid) : undefined;
      const comfort = chair ? (this.game.defOf(chair)?.comfort ?? 1) : 1;
      const mood = 0.7 + 0.55 * c.patience;
      const style = 1 + this.game.styleScore * 0.3;
      const paid = Math.max(1, Math.round(dishPrice(dish, level) * comfort * mood * style));

      this.game.earn(paid, { tx: c.tx, ty: c.ty });
      this.game.addXp(Math.round(dish.basePrice * 0.45) + 4, { tx: c.tx, ty: c.ty - 0.4 });
      this.game.data.stats.customersServed++;
      if (!this.game.data.settings.muted) audio.play('coin');
    }

    c.satisfaction = 0.25 + 0.75 * c.patience;
    this.game.recordSatisfaction(c.satisfaction);

    if (c.tableUid !== null) {
      const table = this.game.placedByUid(c.tableUid);
      if (table) {
        table.dirty = true;
        this.game.touch();
      }
    }
    this.sendHome(c);
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
    if (order) {
      this.releaseOrderHold(order);
      this.game.orders = this.game.orders.filter((o) => o.id !== order.id);
      for (const s of this.game.data.staff) {
        if (s.targetOrderId === order.id) this.resetStaff(s);
      }
    }
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
      this.abandonJob(s);
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

  private abandonJob(s: Staff): void {
    if (s.targetOrderId !== null) {
      const order = this.game.orders.find((o) => o.id === s.targetOrderId);
      if (order && order.state === 'cooking') {
        order.state = 'queued';
        order.stoveUid = null;
        order.progress = 0;
      }
    }
    this.resetStaff(s);
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

  private distanceTo(s: Staff, tiles: Array<[number, number]>): number {
    let best = Infinity;
    for (const [x, y] of tiles) {
      const d = Math.abs(s.tx - x) + Math.abs(s.ty - y);
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
    if (!dishId || !this.game.canCook(dishId)) dishId = this.chooseDish();
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
    if (before < 0.5 && order.progress >= 0.5 && !this.game.data.settings.muted) {
      audio.play('sizzle');
    }
    if (order.progress < 1) return;

    order.state = 'ready';
    this.game.data.stats.dishesCooked++;
    const levelled = this.game.recordServing(order.dishId);
    if (levelled) {
      const dish = DISHES_BY_ID[order.dishId]!;
      this.game.addFloater(`${dish.name} Lv${this.game.dishLevel(order.dishId)}!`, s.tx, s.ty - 0.5, 'xp');
      if (!this.game.data.settings.muted) audio.play('bell');
    }

    // Park the plate on a counter if one is free, otherwise it blocks the stove.
    const counter = this.freeCounter(s);
    const holder = counter ?? stove;
    holder.plates = holder.plates ?? [];
    holder.plates.push(order.id);
    order.holdingUid = holder.uid;
    order.stoveUid = null;

    s.energy = Math.max(0, s.energy - ENERGY_COST.cook);
    this.game.touch();
    this.resetStaff(s);
  }

  private freeCounter(s: Staff): Placed | undefined {
    return this.game
      .placedWithRole('counter')
      .filter((c) => {
        const slots = this.game.defOf(c)?.slots ?? 1;
        return (c.plates?.length ?? 0) < slots && this.grid.accessTiles(c).length > 0;
      })
      .sort((a, b) => this.distanceTo(s, this.grid.accessTiles(a)) -
        this.distanceTo(s, this.grid.accessTiles(b)))[0];
  }

  private tryDeliverFood(s: Staff): boolean {
    const claimed = new Set(
      this.game.data.staff
        .map((x) => (x.state === 'toKitchen' || x.state === 'carrying' || x.state === 'serving'
          ? x.targetOrderId : null))
        .filter((x): x is number => x !== null),
    );
    const ready = this.game.orders
      .filter((o) => o.state === 'ready' && o.holdingUid !== null && !claimed.has(o.id))
      .sort((a, b) => a.placedAt - b.placedAt);
    for (const order of ready) {
      const holder = this.game.placedByUid(order.holdingUid!);
      if (!holder) continue;
      const path = findPath(this.grid, Math.round(s.tx), Math.round(s.ty), this.grid.accessTiles(holder));
      if (!path) continue;
      s.state = 'toKitchen';
      s.path = path;
      s.targetOrderId = order.id;
      s.targetUid = holder.uid;
      return true;
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

  private tryClean(s: Staff): boolean {
    const claimed = new Set(
      this.game.data.staff
        .map((x) => (x.state === 'cleaning' ? x.targetUid : null))
        .filter((x): x is number => x !== null),
    );
    const dirty = this.game
      .placedWithRole('table')
      .filter((t) => t.dirty && !claimed.has(t.uid))
      .filter((t) => !this.game.customers.some((c) => c.tableUid === t.uid && c.state !== 'leaving'))
      .sort((a, b) => this.distanceTo(s, this.grid.accessTiles(a)) -
        this.distanceTo(s, this.grid.accessTiles(b)));
    const table = dirty[0];
    if (!table) return false;

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
    s.energy = Math.max(0, s.energy - ENERGY_COST.clean);
    this.game.touch();
    this.resetStaff(s);
  }

  // ------------------------------------------------------- offline catch-up

  /**
   * Approximate what the restaurant earned while the tab was closed. Deliberately
   * conservative: capped at 8 hours and paid at a fraction of live throughput, so
   * idling is a nice bonus rather than the best way to play.
   */
  estimateOfflineEarnings(elapsedSeconds: number): {
    seconds: number;
    coins: number;
    xp: number;
  } {
    const seconds = Math.max(0, Math.min(elapsedSeconds, 8 * 3600));
    if (seconds < 120 || !this.game.data.open) return { seconds, coins: 0, xp: 0 };

    this.grid.sync();
    const seats = this.usableSeats().length;
    const stoves = this.game.placedWithRole('stove').length;
    const waiters = this.game.staffByRole('waiter').length;
    const chefs = this.game.staffByRole('chef').length;
    if (!seats || !stoves || !waiters || !chefs) return { seconds, coins: 0, xp: 0 };

    const cookable = this.game.data.menu.filter((id) => this.game.canCook(id));
    if (!cookable.length) return { seconds, coins: 0, xp: 0 };

    const avgPrice =
      cookable.reduce((sum, id) => {
        const dish = DISHES_BY_ID[id]!;
        return sum + dishPrice(dish, this.game.dishLevel(id));
      }, 0) / cookable.length;

    // One cover roughly every 45s per seat, throttled by kitchen and floor staff.
    const seatThroughput = seats / 45;
    const kitchenThroughput = (stoves * chefs) / 26;
    const floorThroughput = waiters / 12;
    const covers = Math.min(seatThroughput, kitchenThroughput, floorThroughput) * seconds * 0.4;

    const coins = Math.floor(covers * avgPrice * 0.75);
    const xp = Math.floor(covers * 7);
    return { seconds, coins, xp };
  }
}
