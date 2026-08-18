/**
 * Everything the player can place on the floor. The `role` field is what the
 * simulation reads: tables and chairs form seating groups, stoves are cooking
 * slots, counters are pickup points, and decor only contributes ambience.
 */

export type FurnitureRole =
  | 'table'
  | 'chair'
  | 'stove'
  | 'counter'
  | 'sink'
  | 'bin'
  | 'decor'
  | 'rug'
  | 'wallDecor';

export type FurnitureShape =
  | 'tableSquare'
  | 'tableRound'
  | 'tableMarble'
  | 'tableBooth'
  | 'stool'
  | 'chairWood'
  | 'chairPadded'
  | 'chairThrone'
  | 'stoveCamp'
  | 'stoveGas'
  | 'stovePro'
  | 'stoveTandoor'
  | 'counterWood'
  | 'counterSteel'
  | 'sinkBasic'
  | 'dishwasher'
  | 'binSmall'
  | 'plant'
  | 'palm'
  | 'lamp'
  | 'aquarium'
  | 'fountain'
  | 'jukebox'
  | 'statue'
  | 'rugSmall'
  | 'rugFancy'
  | 'painting'
  | 'clock'
  | 'neonSign';

export interface FurnitureDef {
  id: string;
  name: string;
  role: FurnitureRole;
  shape: FurnitureShape;
  price: number;
  unlockLevel: number;
  /**
   * Fame stars needed on top of the level, for pieces that only arrive after the
   * restaurant level has capped out. Absent on everything else.
   */
  unlockStars?: number;
  /** Footprint in tiles. */
  w: number;
  h: number;
  /** Ambience points; feeds the restaurant's Style rating. */
  ambience: number;
  /** Seats provided (chairs). */
  seats?: number;
  /** Chairs this table can serve. */
  tableCapacity?: number;
  /** Multiplier on cooking speed (stoves) or cleaning speed (sink). */
  speed?: number;
  /** Finished dishes a counter can hold. */
  slots?: number;
  /** Comfort raises how much customers tip at this seat. */
  comfort?: number;
  description: string;
  palette: { base: string; shade: string; top: string; accent: string };
}

const P = (base: string, shade: string, top: string, accent: string) => ({ base, shade, top, accent });

export const FURNITURE: readonly FurnitureDef[] = [
  // ---------- Tables ----------
  {
    id: 'table_square', name: 'Square Table', role: 'table', shape: 'tableSquare',
    price: 120, unlockLevel: 1, w: 1, h: 1, ambience: 1, tableCapacity: 4,
    description: 'A sturdy diner table. Seats up to 4 with chairs around it.',
    palette: P('#c4893e', '#8d5d24', '#e8b86a', '#fff4dc'),
  },
  {
    id: 'table_round', name: 'Round Table', role: 'table', shape: 'tableRound',
    price: 260, unlockLevel: 3, w: 1, h: 1, ambience: 3, tableCapacity: 4,
    description: 'Bistro-style round top. A little more charming than square.',
    palette: P('#8f5f43', '#63402c', '#e9d7b6', '#c0392b'),
  },
  {
    id: 'table_marble', name: 'Marble Table', role: 'table', shape: 'tableMarble',
    price: 720, unlockLevel: 7, w: 1, h: 1, ambience: 8, tableCapacity: 4,
    description: 'Polished marble. Diners notice, and they pay a little more.',
    palette: P('#b9b7ae', '#8b8a83', '#eceae2', '#6f7d86'),
  },
  {
    id: 'table_booth', name: 'Booth Table', role: 'table', shape: 'tableBooth',
    price: 1450, unlockLevel: 11, w: 1, h: 1, ambience: 14, tableCapacity: 4,
    description: 'A padded table for four chairs (+14 Style). Still needs chairs around it; tips come from those chairs.',
    palette: P('#7d3b45', '#54242c', '#d8b98c', '#efe0c4'),
  },

  // ---------- Chairs ----------
  {
    id: 'chair_stool', name: 'Wooden Stool', role: 'chair', shape: 'stool',
    price: 45, unlockLevel: 1, w: 1, h: 1, ambience: 0, seats: 1, comfort: 1,
    description: 'Cheap and cheerful. Gets a customer off their feet.',
    palette: P('#c4893e', '#8d5d24', '#e8b86a', '#fff4dc'),
  },
  {
    id: 'chair_wood', name: 'Dining Chair', role: 'chair', shape: 'chairWood',
    price: 110, unlockLevel: 2, w: 1, h: 1, ambience: 1, seats: 1, comfort: 1.08,
    description: 'A proper chair with a back. Slightly better tips.',
    palette: P('#b87838', '#7d4e1e', '#d4a05a', '#fff0d0'),
  },
  {
    id: 'chair_padded', name: 'Padded Chair', role: 'chair', shape: 'chairPadded',
    price: 340, unlockLevel: 6, w: 1, h: 1, ambience: 3, seats: 1, comfort: 1.2,
    description: 'Cushioned seat. Customers linger happily and tip more.',
    palette: P('#5d6f8d', '#3e4c63', '#8fa2c0', '#f0e5cf'),
  },
  {
    id: 'chair_throne', name: 'Velvet Armchair', role: 'chair', shape: 'chairThrone',
    price: 980, unlockLevel: 12, w: 1, h: 1, ambience: 9, seats: 1, comfort: 1.4,
    description: 'Absurdly comfortable. Guests feel important and pay like it.',
    palette: P('#6a2f4d', '#451c31', '#a4547a', '#f2d27c'),
  },
  {
    id: 'chair_wing', name: 'Wingback Chair', role: 'chair', shape: 'chairThrone',
    price: 2200, unlockLevel: 18, w: 1, h: 1, ambience: 12, seats: 1, comfort: 1.55,
    description: 'The best seat in the house. Guests settle in and tip like it.',
    palette: P('#2f4a44', '#1c302c', '#5c8a7c', '#e2c27a'),
  },

  // ---------- Stoves ----------
  {
    id: 'stove_camp', name: 'Camp Stove', role: 'stove', shape: 'stoveCamp',
    price: 150, unlockLevel: 1, w: 1, h: 1, ambience: 0, speed: 1,
    description: 'One burner, no frills. Every kitchen starts here.',
    palette: P('#7a7f86', '#54585e', '#9aa1a9', '#e05a3a'),
  },
  {
    id: 'stove_gas', name: 'Gas Range', role: 'stove', shape: 'stoveGas',
    price: 620, unlockLevel: 4, w: 1, h: 1, ambience: 1, speed: 1.35,
    description: 'Cooks 35% faster than a camp stove.',
    palette: P('#6d747d', '#484e56', '#98a0a9', '#f2a13c'),
  },
  {
    id: 'stove_pro', name: 'Pro Kitchen Range', role: 'stove', shape: 'stovePro',
    price: 1850, unlockLevel: 8, w: 1, h: 1, ambience: 3, speed: 1.8,
    description: 'Commercial-grade. Nearly doubles cooking speed.',
    palette: P('#8e959c', '#5f666d', '#c3cad0', '#e04b2e'),
  },
  {
    id: 'stove_tandoor', name: 'Stone Tandoor', role: 'stove', shape: 'stoveTandoor',
    price: 3600, unlockLevel: 13, w: 1, h: 1, ambience: 8, speed: 2.3,
    description: 'Roaring hot and rather beautiful. The fastest cooker there is.',
    palette: P('#9c6b4b', '#6b452c', '#c79366', '#ff8a3c'),
  },

  // ---------- Counters / support ----------
  {
    id: 'counter_wood', name: 'Pickup Counter', role: 'counter', shape: 'counterWood',
    price: 220, unlockLevel: 1, w: 1, h: 1, ambience: 1, slots: 2,
    description: 'Chefs park finished plates here so they can start the next order.',
    palette: P('#a9713a', '#7d5127', '#c98f52', '#f6ecd8'),
  },
  {
    id: 'counter_steel', name: 'Steel Pass', role: 'counter', shape: 'counterSteel',
    price: 780, unlockLevel: 7, w: 1, h: 1, ambience: 2, slots: 4,
    description: 'Holds four plates, so a busy kitchen never stalls.',
    palette: P('#8b9299', '#5c6268', '#c0c7cd', '#eef2f4'),
  },
  {
    id: 'counter_marble', name: 'Marble Pass', role: 'counter', shape: 'counterSteel',
    price: 2600, unlockLevel: 17, w: 1, h: 1, ambience: 6, slots: 6,
    description: 'Six plates can wait here at once, so a late kitchen never queues on itself.',
    palette: P('#b6b3a8', '#87847c', '#e8e5db', '#c2a15a'),
  },
  {
    id: 'sink_basic', name: 'Wash Basin', role: 'sink', shape: 'sinkBasic',
    price: 260, unlockLevel: 3, w: 1, h: 1, ambience: 0, speed: 1.25,
    description: 'Gives cleaners somewhere to rinse up, speeding table turnover.',
    palette: P('#8d949b', '#5e646a', '#bcc3c9', '#6fb0d8'),
  },
  {
    id: 'dishwasher', name: 'Dishwasher', role: 'sink', shape: 'dishwasher',
    price: 1100, unlockLevel: 9, w: 1, h: 1, ambience: 1, speed: 1.7,
    description: 'Cleaners work much faster with real equipment.',
    palette: P('#7f868d', '#565c62', '#b0b7bd', '#8fd0e8'),
  },
  {
    id: 'bin_small', name: 'Trash Bin', role: 'bin', shape: 'binSmall',
    price: 80, unlockLevel: 1, w: 1, h: 1, ambience: -1,
    description: 'Takes −1 Style. Does not clean tables or the floor.',
    palette: P('#5f6a5f', '#3f473f', '#7f8c7f', '#2f352f'),
  },

  // ---------- Decor ----------
  {
    id: 'plant', name: 'Potted Plant', role: 'decor', shape: 'plant',
    price: 90, unlockLevel: 1, w: 1, h: 1, ambience: 4,
    description: 'Cheap greenery. Softens the room.',
    palette: P('#a4552f', '#743a1f', '#8fc46b', '#5d8f44'),
  },
  {
    id: 'palm', name: 'Indoor Palm', role: 'decor', shape: 'palm',
    price: 380, unlockLevel: 4, w: 1, h: 1, ambience: 10,
    description: 'Tall and leafy. Real ambience for the money.',
    palette: P('#8e5330', '#5f3720', '#4f9a52', '#79c471'),
  },
  {
    id: 'lamp', name: 'Floor Lamp', role: 'decor', shape: 'lamp',
    price: 210, unlockLevel: 3, w: 1, h: 1, ambience: 7,
    description: 'Warm pooled light. Makes evenings feel cosy.',
    palette: P('#4d5157', '#33363a', '#f6e2ae', '#ffd98a'),
  },
  {
    id: 'jukebox', name: 'Jukebox', role: 'decor', shape: 'jukebox',
    price: 900, unlockLevel: 6, w: 1, h: 1, ambience: 16,
    description: 'A flashy +16 Style piece. Does not change how fast guests lose patience.',
    palette: P('#8c2f3c', '#5c1c25', '#f2c14e', '#ffe9a8'),
  },
  {
    id: 'aquarium', name: 'Aquarium', role: 'decor', shape: 'aquarium',
    price: 1600, unlockLevel: 9, w: 1, h: 1, ambience: 24,
    description: 'A +24 Style showpiece. Guests do not wait longer — it lifts the room rating.',
    palette: P('#3b4a5a', '#25303c', '#57b6d8', '#f0a24a'),
  },
  {
    id: 'fountain', name: 'Marble Fountain', role: 'decor', shape: 'fountain',
    price: 3200, unlockLevel: 12, w: 1, h: 1, ambience: 40,
    description: 'A centrepiece. Nothing says "fine dining" louder.',
    palette: P('#c2c0b6', '#918f86', '#eeece3', '#7fc4e0'),
  },
  {
    id: 'statue', name: 'Gold Statue', role: 'decor', shape: 'statue',
    price: 6400, unlockLevel: 15, w: 1, h: 1, ambience: 60,
    description: 'Tasteful? Debatable. Effective? Absolutely.',
    palette: P('#b08a2e', '#7d611c', '#f2d27c', '#fff3c4'),
  },
  {
    id: 'atrium_tree', name: 'Atrium Tree', role: 'decor', shape: 'palm',
    price: 11000, unlockLevel: 20, w: 1, h: 1, ambience: 90,
    description: 'A +90 Style centrepiece grown through the roof light. The room finally looks finished.',
    palette: P('#6b4a2c', '#452e1a', '#3f8a4c', '#8fd07a'),
  },
  {
    id: 'founders_bronze', name: 'Bronze Founder', role: 'decor', shape: 'statue',
    price: 16000, unlockLevel: 20, unlockStars: 5, w: 1, h: 1, ambience: 110,
    description: 'A +110 Style cast of whoever started all this. Earned with fame, not coins alone.',
    palette: P('#7d5a2c', '#4f371a', '#c99a52', '#f0d59a'),
  },

  // ---------- Floor & wall ----------
  {
    id: 'rug_small', name: 'Woven Rug', role: 'rug', shape: 'rugSmall',
    price: 130, unlockLevel: 2, w: 1, h: 1, ambience: 5,
    description: 'Lies flat on the floor; furniture can sit on top of it.',
    palette: P('#a8493c', '#7a3229', '#e0b177', '#f2ddbb'),
  },
  {
    id: 'rug_fancy', name: 'Persian Rug', role: 'rug', shape: 'rugFancy',
    price: 620, unlockLevel: 8, w: 1, h: 1, ambience: 14,
    description: 'Intricate and rich. Walkable, stackable, gorgeous.',
    palette: P('#5a2d4a', '#3a1a30', '#d8a24a', '#e9d6a8'),
  },
  {
    id: 'rug_gallery', name: 'Gallery Rug', role: 'rug', shape: 'rugFancy',
    price: 2600, unlockLevel: 19, w: 1, h: 1, ambience: 26,
    description: 'Wall-to-wall pattern for the middle of the room. Walkable, stackable, enormous.',
    palette: P('#2f3f5c', '#1b2537', '#c9a24a', '#e6dcc0'),
  },
  {
    id: 'painting', name: 'Framed Painting', role: 'wallDecor', shape: 'painting',
    price: 240, unlockLevel: 3, w: 1, h: 1, ambience: 8,
    description: 'Hangs on a wall tile. Adds character at no floor cost.',
    palette: P('#7a5a2e', '#523c1d', '#6f9ac4', '#dfe8ef'),
  },
  {
    id: 'clock', name: 'Wall Clock', role: 'wallDecor', shape: 'clock',
    price: 180, unlockLevel: 2, w: 1, h: 1, ambience: 5,
    description: 'Classic diner clock for an empty wall.',
    palette: P('#c73a2e', '#9d261c', '#fff8ea', '#f2b429'),
  },
  {
    id: 'neon_sign', name: 'Neon Sign', role: 'wallDecor', shape: 'neonSign',
    price: 1250, unlockLevel: 10, w: 1, h: 1, ambience: 26,
    description: 'Glowing and loud. Visible from the street, basically.',
    palette: P('#2a2430', '#191520', '#ff5ea8', '#65e8ff'),
  },
  {
    id: 'regulars_wall', name: 'Wall of Regulars', role: 'wallDecor', shape: 'painting',
    price: 5200, unlockLevel: 20, unlockStars: 3, w: 1, h: 1, ambience: 46,
    description: 'A +46 Style row of framed faces who never stopped coming back.',
    palette: P('#4a3520', '#2d2013', '#d8b072', '#f4ead2'),
  },
];

export const FURNITURE_BY_ID: Record<string, FurnitureDef> = Object.fromEntries(
  FURNITURE.map((f) => [f.id, f]),
);

/** Furniture is refunded at 55% of its purchase price. */
export const RESALE_RATE = 0.55;

export function resaleValue(def: FurnitureDef): number {
  return Math.floor(def.price * RESALE_RATE);
}

export const ROLE_LABELS: Record<FurnitureRole, string> = {
  table: 'Tables',
  chair: 'Chairs',
  stove: 'Kitchen',
  counter: 'Kitchen',
  sink: 'Kitchen',
  bin: 'Kitchen',
  decor: 'Decor',
  rug: 'Floor',
  wallDecor: 'Walls',
};

export type ShopTab = 'Tables' | 'Chairs' | 'Kitchen' | 'Decor' | 'Floor' | 'Walls';

export const SHOP_TABS: readonly ShopTab[] = ['Tables', 'Chairs', 'Kitchen', 'Decor', 'Floor', 'Walls'];

/** Roles that occupy a tile such that actors cannot walk through it. */
export function blocksWalking(role: FurnitureRole): boolean {
  return role !== 'rug' && role !== 'wallDecor';
}

/** Roles that sit on wall tiles rather than floor tiles. */
export function isWallMounted(role: FurnitureRole): boolean {
  return role === 'wallDecor';
}
