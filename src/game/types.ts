import type { IngredientId } from './data/ingredients';

export type StaffRole = 'waiter' | 'chef' | 'cleaner';

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: 'short' | 'bun' | 'long' | 'cap' | 'bald' | 'curly';
  shirt: string;
  pants: string;
  /** 0..1, scales overall body height slightly. */
  build: number;
}

/** A placed piece of furniture. `tx`/`ty` is the top (smallest) tile of its footprint. */
export interface Placed {
  uid: number;
  defId: string;
  tx: number;
  ty: number;
  /** Rotation in 90-degree steps; affects rendering and footprint orientation. */
  rot: 0 | 1 | 2 | 3;
  /** Tables accumulate dirt after a customer leaves and must be cleaned. */
  dirty?: boolean;
  /** Plates resting on a counter or stove awaiting collection. */
  plates?: number[];
}

export type CustomerState =
  | 'entering'
  | 'queueing'
  | 'walkingToSeat'
  | 'deciding'
  | 'awaitingWaiter'
  | 'ordering'
  | 'awaitingFood'
  | 'eating'
  | 'leaving';

export interface Customer {
  id: number;
  name: string;
  look: Appearance;
  state: CustomerState;
  /** Current fractional tile position. */
  tx: number;
  ty: number;
  path: Array<[number, number]>;
  /** 0..1; empties as the customer waits and drives mood and tips. */
  patience: number;
  patienceDrainPerSec: number;
  /** Chair uid the customer owns, if seated or heading to a seat. */
  chairUid: number | null;
  tableUid: number | null;
  dishId: string | null;
  orderId: number | null;
  timer: number;
  /** Recorded when the customer finishes, for the service rating. */
  satisfaction: number;
  angry: boolean;
  /** Set while the customer is queueing, so queue slots stay stable. */
  queueSlot: number;
  spawnedAt: number;
  /** Roster id when this guest is a regular, rather than a one-off walk-in. */
  regularId: string | null;
}

/**
 * A named guest who keeps coming back. Unlike walk-ins this outlives the
 * session, so the player can build a relationship with them.
 */
export interface RegularState {
  /** Matches a `RegularDef.id` from the roster. */
  id: string;
  /** Dish they ask for, resolved against the player's menu. */
  favouriteDishId: string | null;
  /** In-game clock time at which they are next due through the door. */
  nextVisitAt: number;
  visits: number;
  /** Visits where they got their favourite while still in a good mood. */
  delighted: number;
  /** Visits they walked out of. */
  walkouts: number;
}

export type OrderState = 'queued' | 'cooking' | 'ready' | 'collected';

export interface Order {
  id: number;
  customerId: number;
  dishId: string;
  state: OrderState;
  /** Stove currently cooking this order. */
  stoveUid: number | null;
  /** Where the finished plate is waiting (counter or stove uid). */
  holdingUid: number | null;
  /** 0..1 cooking progress. */
  progress: number;
  cookSeconds: number;
  placedAt: number;
}

export type StaffState =
  | 'idle'
  | 'walking'
  | 'takingOrder'
  | 'toKitchen'
  | 'cooking'
  | 'carrying'
  | 'serving'
  | 'cleaning'
  | 'exhausted';

export interface Staff {
  id: number;
  name: string;
  role: StaffRole;
  look: Appearance;
  /** Skill per discipline, 1..10. Only the one matching `role` is used at work. */
  skills: Record<StaffRole, number>;
  /** 0..100. Work drains it; at zero the member stops until fed or rested. */
  energy: number;
  /** Coins per in-game day. */
  wage: number;
  state: StaffState;
  tx: number;
  ty: number;
  path: Array<[number, number]>;
  timer: number;
  /** What the member is currently working on. */
  targetCustomerId: number | null;
  targetOrderId: number | null;
  targetUid: number | null;
  /** Dish being carried, for rendering the tray. */
  carryDishId: string | null;
  hiredAt: number;
}

export interface Applicant {
  id: number;
  name: string;
  look: Appearance;
  skills: Record<StaffRole, number>;
  wage: number;
  fee: number;
}

export interface FloatingText {
  id: number;
  text: string;
  tx: number;
  ty: number;
  life: number;
  maxLife: number;
  color: string;
  kind: 'coin' | 'xp' | 'bad' | 'info';
}

export interface Stats {
  totalEarned: number;
  totalSpent: number;
  customersServed: number;
  customersLost: number;
  dishesCooked: number;
  /** Wipes finished, i.e. tables that went from dirty back to clean. */
  tablesCleaned: number;
  daysOpen: number;
}

/**
 * What has happened so far today. Persisted, so closing the tab at lunchtime
 * does not wipe the morning out of the evening's recap.
 */
export interface DayLedger {
  /** Day these figures belong to, so a stale ledger can be spotted. */
  day: number;
  covers: number;
  walkouts: number;
  /** Coins taken for food, before tips. */
  dishEarnings: number;
  /** Coins handed over on top by delighted regulars. */
  tips: number;
  regularsDelighted: number;
  regularsLost: number;
  /** Fame earned today, which is only ever non-zero at the level cap. */
  fame: number;
}

/** The single thing the recap suggests doing next. */
export interface RecapAction {
  label: string;
  /** Where the player is sent when they take it up. */
  target: 'shop' | 'menu' | 'market' | 'staff' | 'build' | null;
}

/** A finished day, ready to be shown as a card. */
export interface DayRecap extends DayLedger {
  /** Wages owed for the day that just ended, and what could be covered. */
  wages: number;
  wagesPaid: number;
  /** Set when nothing on the menu can be cooked with what is in the pantry. */
  pantryWarning: string | null;
  action: RecapAction;
}

export interface Settings {
  muted: boolean;
  showGrid: boolean;
  speed: 1 | 2 | 3;
}

export interface SaveData {
  version: number;
  createdAt: number;
  savedAt: number;
  restaurantName: string;
  coins: number;
  xp: number;
  level: number;
  /**
   * Lifetime fame, which is the experience earned once the restaurant level has
   * capped out. Stars are derived from it rather than stored, so the two can
   * never drift apart in a save.
   */
  fame: number;
  gridSize: number;
  doorX: number;
  open: boolean;
  /** Elapsed in-game seconds since the restaurant first opened. */
  clock: number;
  placed: Placed[];
  staff: Staff[];
  applicants: Applicant[];
  pantry: Partial<Record<IngredientId, number>>;
  marketStock: Partial<Record<IngredientId, number>>;
  nextRestockAt: number;
  menu: string[];
  dishXp: Record<string, number>;
  regulars: RegularState[];
  serviceScore: number;
  stats: Stats;
  today: DayLedger;
  /** The last day's recap, so Manage can show it after the card is dismissed. */
  lastRecap: DayRecap | null;
  settings: Settings;
  tutorialStep: number;
  seenIntro: boolean;
}
