import { Fx } from '../engine/fx';
import { Rng } from '../engine/rng';
import { clamp } from '../engine/iso';
import { DISHES_BY_ID, dishLevelFromServings, MAX_DISH_LEVEL } from './data/dishes';
import { FURNITURE_BY_ID, type FurnitureDef } from './data/furniture';
import { INGREDIENTS, INGREDIENT_LIST, type IngredientId } from './data/ingredients';
import { appearanceFrom, makeApplicant } from './people';
import { createRegulars, migrateRegulars } from './regulars';
import {
  DAY_LENGTH,
  levelForXp,
  MIN_GRID,
  menuCapacity,
  staffCapacity,
} from './progression';
import type {
  Applicant,
  Customer,
  FloatingText,
  Order,
  Placed,
  SaveData,
  Staff,
} from './types';

export const SAVE_KEY = 'diner-town/save/v1';
/** 2 added the regulars roster; `migrate` fills it in for anything older. */
export const SAVE_VERSION = 2;

/** Market restocks on this cadence (in-game seconds). */
export const RESTOCK_INTERVAL = 90;

export function createNewGame(restaurantName = 'Diner Town'): SaveData {
  const now = Date.now();
  const r = new Rng(now);

  const placed: Placed[] = [];
  let uid = 1;
  const put = (defId: string, tx: number, ty: number, rot: 0 | 1 | 2 | 3 = 0) => {
    placed.push({ uid: uid++, defId, tx, ty, rot });
  };

  // A small starter diner: one burner, a pickup counter, two two-seat tables.
  put('stove_camp', 0, 1);
  put('counter_wood', 0, 2);
  put('table_square', 2, 3);
  put('chair_stool', 2, 4);
  put('chair_stool', 3, 3);
  put('table_square', 5, 2);
  put('chair_stool', 5, 3);
  put('chair_stool', 6, 2);
  put('plant', 0, 7);
  put('bin_small', 7, 0);

  const pantry: Partial<Record<IngredientId, number>> = {
    bread: 30, beef: 22, lettuce: 26, tomato: 20, potato: 26, butter: 16,
    milk: 12, egg: 14, cheese: 10, flour: 12,
  };

  const marketStock: Partial<Record<IngredientId, number>> = {};
  for (const ing of INGREDIENT_LIST) marketStock[ing.id] = ing.maxStock;

  const staff: Staff[] = [
    {
      id: 1, name: 'Rosa Lindt', role: 'waiter', look: appearanceFrom('starter-waiter'),
      skills: { waiter: 3, chef: 1, cleaner: 2 }, energy: 100, wage: 62,
      state: 'idle', tx: 3, ty: 0, path: [], timer: 0,
      targetCustomerId: null, targetOrderId: null, targetUid: null,
      carryDishId: null, hiredAt: now,
    },
    {
      id: 2, name: 'Gus Ferro', role: 'chef', look: appearanceFrom('starter-chef'),
      skills: { waiter: 1, chef: 3, cleaner: 1 }, energy: 100, wage: 68,
      state: 'idle', tx: 1, ty: 1, path: [], timer: 0,
      targetCustomerId: null, targetOrderId: null, targetUid: null,
      carryDishId: null, hiredAt: now,
    },
    {
      id: 3, name: 'Mina Kwan', role: 'cleaner', look: appearanceFrom('starter-cleaner'),
      skills: { waiter: 1, chef: 1, cleaner: 3 }, energy: 100, wage: 58,
      state: 'idle', tx: 2, ty: 1, path: [], timer: 0,
      targetCustomerId: null, targetOrderId: null, targetUid: null,
      carryDishId: null, hiredAt: now,
    },
  ];

  const applicants: Applicant[] = [4, 5, 6].map((id) => makeApplicant(id, 1, r));

  return {
    version: SAVE_VERSION,
    createdAt: now,
    savedAt: now,
    restaurantName,
    coins: 1200,
    xp: 0,
    level: 1,
    gridSize: MIN_GRID,
    doorX: Math.floor(MIN_GRID / 2),
    open: true,
    clock: 0,
    placed,
    staff,
    applicants,
    pantry,
    marketStock,
    nextRestockAt: RESTOCK_INTERVAL,
    menu: ['house_burger', 'crispy_fries', 'garden_salad'],
    dishXp: {},
    regulars: createRegulars(),
    serviceScore: 0.72,
    stats: {
      totalEarned: 0, totalSpent: 0, customersServed: 0,
      customersLost: 0, dishesCooked: 0, daysOpen: 1,
    },
    settings: { muted: false, showGrid: false, speed: 1 },
    tutorialStep: 0,
    seenIntro: false,
  };
}

/**
 * Owns the whole simulation. Persistent fields live on `data`; live actors are
 * rebuilt from scratch each session, which is why closing the tab simply sends
 * the current diners home rather than corrupting anything.
 */
export class Game {
  data: SaveData;
  customers: Customer[] = [];
  orders: Order[] = [];
  floaters: FloatingText[] = [];
  /** Purely decorative particles and flashes. Never saved. */
  readonly fx = new Fx();

  /** Incrementing ids, seeded past anything already in the save. */
  private uidSeq = 1;
  private idSeq = 1;
  readonly rng = new Rng();

  /** Set when the level changes so the UI can show a celebration. */
  pendingLevelUp: number | null = null;
  /** Bumped whenever persistent state changes, so panels can re-render lazily. */
  revision = 0;

  constructor(data: SaveData) {
    this.data = data;
    this.uidSeq = data.placed.reduce((m, p) => Math.max(m, p.uid), 0) + 1;
    this.idSeq =
      Math.max(
        data.staff.reduce((m, s) => Math.max(m, s.id), 0),
        data.applicants.reduce((m, a) => Math.max(m, a.id), 0),
      ) + 1;
  }

  nextUid(): number {
    return this.uidSeq++;
  }

  nextId(): number {
    return this.idSeq++;
  }

  touch(): void {
    this.revision++;
  }

  // ---------------------------------------------------------------- economy

  get coins(): number {
    return this.data.coins;
  }

  canAfford(amount: number): boolean {
    return this.data.coins >= amount;
  }

  spend(amount: number, at?: { tx: number; ty: number }): boolean {
    if (this.data.coins < amount) return false;
    this.data.coins -= amount;
    this.data.stats.totalSpent += amount;
    if (at && amount > 0) this.addFloater(`-${amount}`, at.tx, at.ty, 'bad');
    this.touch();
    return true;
  }

  earn(amount: number, at?: { tx: number; ty: number }): void {
    this.data.coins += amount;
    this.data.stats.totalEarned += amount;
    if (at) this.addFloater(`+${amount}`, at.tx, at.ty, 'coin');
    this.touch();
  }

  addXp(amount: number, at?: { tx: number; ty: number }): void {
    const before = this.data.level;
    this.data.xp += amount;
    this.data.level = levelForXp(this.data.xp);
    if (at) this.addFloater(`+${amount} xp`, at.tx, at.ty, 'xp');
    if (this.data.level > before) this.pendingLevelUp = this.data.level;
    this.touch();
  }

  addFloater(
    text: string,
    tx: number,
    ty: number,
    kind: FloatingText['kind'] = 'info',
  ): void {
    const colors: Record<FloatingText['kind'], string> = {
      coin: '#f7c85a',
      xp: '#8fd0ff',
      bad: '#ff8d76',
      info: '#ffffff',
    };
    this.floaters.push({
      id: this.nextId(), text, tx, ty,
      life: 1.6, maxLife: 1.6, color: colors[kind], kind,
    });
  }

  // ----------------------------------------------------------------- pantry

  pantryCount(id: IngredientId): number {
    return this.data.pantry[id] ?? 0;
  }

  marketCount(id: IngredientId): number {
    return this.data.marketStock[id] ?? 0;
  }

  /** True when every ingredient for `dishId` is in stock. */
  canCook(dishId: string): boolean {
    const dish = DISHES_BY_ID[dishId];
    if (!dish) return false;
    for (const [id, qty] of Object.entries(dish.recipe)) {
      if (this.pantryCount(id as IngredientId) < (qty ?? 0)) return false;
    }
    return true;
  }

  /** True when at least one menu dish has every ingredient in stock. */
  menuCanCook(): boolean {
    return this.data.menu.some((id) => this.canCook(id));
  }

  consumeIngredients(dishId: string): boolean {
    if (!this.canCook(dishId)) return false;
    const dish = DISHES_BY_ID[dishId]!;
    for (const [id, qty] of Object.entries(dish.recipe)) {
      const key = id as IngredientId;
      this.data.pantry[key] = this.pantryCount(key) - (qty ?? 0);
    }
    this.touch();
    return true;
  }

  buyIngredient(id: IngredientId, qty: number): number {
    const available = Math.min(qty, this.marketCount(id));
    const unit = INGREDIENTS[id].price;
    const affordable = Math.min(available, Math.floor(this.data.coins / unit));
    if (affordable <= 0) return 0;
    this.spend(affordable * unit);
    this.data.marketStock[id] = this.marketCount(id) - affordable;
    this.data.pantry[id] = this.pantryCount(id) + affordable;
    this.touch();
    return affordable;
  }

  /** Total coins to top every menu dish up to `perDish` servings' worth. */
  restockMenuCost(perDish: number): { cost: number; missing: Array<[IngredientId, number]> } {
    const need = new Map<IngredientId, number>();
    for (const dishId of this.data.menu) {
      const dish = DISHES_BY_ID[dishId];
      if (!dish) continue;
      for (const [id, qty] of Object.entries(dish.recipe)) {
        const key = id as IngredientId;
        need.set(key, (need.get(key) ?? 0) + (qty ?? 0) * perDish);
      }
    }
    let cost = 0;
    const missing: Array<[IngredientId, number]> = [];
    for (const [id, wanted] of need) {
      const short = Math.max(0, wanted - this.pantryCount(id));
      const buyable = Math.min(short, this.marketCount(id));
      if (buyable > 0) {
        cost += buyable * INGREDIENTS[id].price;
        missing.push([id, buyable]);
      }
    }
    return { cost, missing };
  }

  // ------------------------------------------------------------------- menu

  get menuCapacity(): number {
    return menuCapacity(this.data.level);
  }

  isOnMenu(dishId: string): boolean {
    return this.data.menu.includes(dishId);
  }

  toggleMenu(dishId: string): 'added' | 'removed' | 'full' {
    const at = this.data.menu.indexOf(dishId);
    if (at >= 0) {
      this.data.menu.splice(at, 1);
      this.touch();
      return 'removed';
    }
    if (this.data.menu.length >= this.menuCapacity) return 'full';
    this.data.menu.push(dishId);
    this.touch();
    return 'added';
  }

  dishServings(dishId: string): number {
    return this.data.dishXp[dishId] ?? 0;
  }

  dishLevel(dishId: string): number {
    return dishLevelFromServings(this.dishServings(dishId));
  }

  recordServing(dishId: string): boolean {
    const before = this.dishLevel(dishId);
    this.data.dishXp[dishId] = this.dishServings(dishId) + 1;
    this.touch();
    return this.dishLevel(dishId) > before && before < MAX_DISH_LEVEL;
  }

  // ------------------------------------------------------------------ staff

  get staffCapacity(): number {
    return staffCapacity(this.data.level);
  }

  staffByRole(role: Staff['role']): Staff[] {
    return this.data.staff.filter((s) => s.role === role);
  }

  // --------------------------------------------------------------- fixtures

  defOf(p: Placed): FurnitureDef {
    return FURNITURE_BY_ID[p.defId]!;
  }

  placedByUid(uid: number): Placed | undefined {
    return this.data.placed.find((p) => p.uid === uid);
  }

  placedWithRole(role: FurnitureDef['role']): Placed[] {
    return this.data.placed.filter((p) => this.defOf(p)?.role === role);
  }

  // ---------------------------------------------------------------- ratings

  get ambience(): number {
    return this.data.placed.reduce((sum, p) => sum + (this.defOf(p)?.ambience ?? 0), 0);
  }

  get seatCount(): number {
    return this.placedWithRole('chair').length;
  }

  /** Ambience needed for a full style score, scaled to restaurant size. */
  get ambienceTarget(): number {
    return 24 + this.seatCount * 9;
  }

  get styleScore(): number {
    return clamp(this.ambience / Math.max(1, this.ambienceTarget), 0, 1);
  }

  get cleanlinessScore(): number {
    const tables = this.placedWithRole('table');
    if (!tables.length) return 1;
    const dirty = tables.filter((t) => t.dirty).length;
    return clamp(1 - dirty / tables.length, 0, 1);
  }

  /** Average appeal of the menu, lifted by how well mastered those dishes are. */
  get menuScore(): number {
    if (!this.data.menu.length) return 0;
    let total = 0;
    for (const id of this.data.menu) {
      const dish = DISHES_BY_ID[id];
      if (!dish) continue;
      const mastery = (this.dishLevel(id) - 1) / (MAX_DISH_LEVEL - 1);
      total += dish.appeal * (0.68 + 0.32 * mastery);
    }
    const variety = clamp(this.data.menu.length / 5, 0, 1);
    return clamp((total / this.data.menu.length) * (0.7 + 0.3 * variety), 0, 1);
  }

  get serviceScore(): number {
    return clamp(this.data.serviceScore, 0, 1);
  }

  /** Overall star rating, 0..5. Drives how fast customers arrive. */
  get rating(): number {
    const score =
      0.3 * this.styleScore +
      0.25 * this.serviceScore +
      0.2 * this.cleanlinessScore +
      0.25 * this.menuScore;
    return clamp(score * 5, 0, 5);
  }

  /** Seconds between arrivals given the current rating and seating. */
  get spawnInterval(): number {
    const demand = 0.35 + (this.rating / 5) * 2.25;
    const seatFactor = Math.max(1, this.seatCount / 4);
    return clamp(11 / demand / seatFactor, 1.6, 24);
  }

  /** Blend a finished customer's satisfaction into the rolling service score. */
  recordSatisfaction(value: number): void {
    this.data.serviceScore = this.data.serviceScore * 0.94 + clamp(value, 0, 1) * 0.06;
    this.touch();
  }

  // ------------------------------------------------------------------- save

  serialise(): SaveData {
    this.data.savedAt = Date.now();
    this.data.version = SAVE_VERSION;
    return this.data;
  }

  save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialise()));
    } catch {
      // Storage can be full or blocked (private browsing); the game still runs.
    }
  }

  static load(): Game | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as SaveData;
      if (typeof parsed?.coins !== 'number' || !Array.isArray(parsed.placed)) return null;
      return new Game(migrate(parsed));
    } catch {
      return null;
    }
  }

  static wipe(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }

  get dayNumber(): number {
    return Math.floor(this.data.clock / DAY_LENGTH) + 1;
  }
}

/** Fill in fields added after a save was written. */
function migrate(data: SaveData): SaveData {
  const fresh = createNewGame(data.restaurantName || 'Diner Town');
  const merged: SaveData = { ...fresh, ...data };
  merged.settings = { ...fresh.settings, ...(data.settings ?? {}) };
  merged.stats = { ...fresh.stats, ...(data.stats ?? {}) };
  merged.pantry = { ...(data.pantry ?? {}) };
  merged.marketStock = { ...fresh.marketStock, ...(data.marketStock ?? {}) };
  merged.dishXp = { ...(data.dishXp ?? {}) };
  merged.menu = Array.isArray(data.menu) ? data.menu.filter((id) => DISHES_BY_ID[id]) : fresh.menu;
  // Saves written before regulars existed have none; those written after may be
  // missing anyone added to the roster since.
  merged.regulars = migrateRegulars(data.regulars);
  // Plates hold order ids, but orders are session-only and are never written to
  // the save, so every id that comes back from disk points at nothing. Left in
  // place they are unreachable — only `releaseOrderHold` clears a plate and it
  // needs a live order — so they permanently mark a stove as busy and eat counter
  // slots, which stalls the kitchen. Drop them all and keep the rest of the
  // furniture's state, including whether a table is still dirty.
  merged.placed = (data.placed ?? [])
    .filter((p) => FURNITURE_BY_ID[p.defId])
    .map(({ plates: _cleared, ...rest }) => rest);
  merged.staff = (data.staff ?? []).map((s) => ({
    ...s,
    path: [],
    state: 'idle',
    timer: 0,
    targetCustomerId: null,
    targetOrderId: null,
    targetUid: null,
    carryDishId: null,
  }));
  merged.version = SAVE_VERSION;
  return merged;
}

export type { Customer, Order, Staff, Placed };
