/**
 * The handful of guests who come back. Everything else about a walk-in is
 * generated and forgotten the moment they leave, which is what makes a named
 * face worth recognising.
 *
 * A regular's `tastes` are the dishes they hope for, best first. Which one they
 * actually ask for depends on the player's menu, so a regular is a reason to
 * keep a dish on it rather than a fixed order the player cannot influence.
 *
 * Looks are generated from the id by the same procedural sprite system as every
 * other face, then nudged by `look` so the same person is recognisable across
 * visits without needing any art.
 */

import type { Appearance } from '../types';

export interface RegularDef {
  /** Stable key written to the save; never reuse one. */
  id: string;
  name: string;
  /** Hand-picked touches over the generated look. */
  look: Partial<Appearance>;
  /** Dishes they hope to find on the menu, favourite first. */
  tastes: readonly string[];
  /** In-game days between visits. */
  cadenceDays: number;
  /** One line of who they are, shown in Manage. */
  note: string;
  /**
   * Restaurant level before they start dropping in. Absent means from the very
   * first day, which is where the whole original roster sits — the late faces
   * arrive with the food they came for rather than crowding the first hour.
   */
  unlockLevel?: number;
  /** Fame stars needed as well, for the face that only fame brings in. */
  unlockStars?: number;
}

export const REGULARS: readonly RegularDef[] = [
  {
    id: 'pearl',
    name: 'Pearl Ottway',
    look: { hair: '#d8d3cb', hairStyle: 'bun', shirt: '#e85a86', pants: '#5a4554' },
    tastes: ['house_burger', 'cheese_omelette', 'fish_and_chips'],
    cadenceDays: 1,
    note: 'Runs the flower stall two doors down. In most days before the lunch rush.',
  },
  {
    id: 'dobbs',
    name: 'Dobbs Marlow',
    look: { hair: '#4a3220', hairStyle: 'cap', shirt: '#3d9ad6', pants: '#3a4a62' },
    tastes: ['crispy_fries', 'house_burger', 'egg_fried_rice'],
    cadenceDays: 1,
    note: 'Drives the early delivery round and eats standing up if he has to.',
  },
  {
    id: 'winnie',
    name: 'Winnie Salcedo',
    look: { hair: '#8f6134', hairStyle: 'long', shirt: '#5fbf55', pants: '#3d5240' },
    tastes: ['garden_salad', 'tomato_soup', 'mushroom_pasta'],
    cadenceDays: 2,
    note: 'Marks homework in the corner and orders something green.',
  },
  {
    id: 'ozzie',
    name: 'Ozzie Pike',
    look: { hair: '#2b2118', hairStyle: 'short', shirt: '#f2b429', pants: '#2f4656' },
    tastes: ['tomato_soup', 'ramen_bowl', 'iced_coffee'],
    cadenceDays: 2,
    note: 'Swears by soup in any weather. Tells you so every time.',
  },
  {
    id: 'hettie',
    name: 'Hettie Vance',
    look: { hair: '#8d3f3f', hairStyle: 'curly', shirt: '#7b6ad6', pants: '#5a4034' },
    tastes: ['berry_pancakes', 'choc_cake', 'garden_salad'],
    cadenceDays: 2,
    note: 'Comes for pudding and pretends it is a main course.',
  },
  {
    id: 'rune',
    name: 'Rune Aldon',
    look: { hair: '#c39a5c', hairStyle: 'short', shirt: '#2fbaa8', pants: '#3a4a62' },
    tastes: ['margherita', 'prime_steak', 'house_burger'],
    cadenceDays: 3,
    note: 'Saves up for the biggest thing on the menu and takes his time over it.',
  },
  {
    id: 'maribel',
    name: 'Maribel Quill',
    look: { hair: '#57345c', hairStyle: 'bun', shirt: '#ef6b8a', pants: '#5c4636' },
    tastes: ['iced_coffee', 'berry_pancakes', 'cheese_omelette'],
    cadenceDays: 3,
    note: 'Writes at the far table for hours on one cold coffee.',
  },
  {
    id: 'tobias',
    name: 'Tobias Nakai',
    look: { hair: '#3c4a63', hairStyle: 'short', shirt: '#5aa0d8', pants: '#2f4656' },
    tastes: ['fish_and_chips', 'salmon_sushi', 'crispy_fries'],
    cadenceDays: 3,
    note: 'Off the harbour boats. Judges any kitchen by how it treats fish.',
  },

  // ---- The late roster ----
  // Every one of these hopes for something off the top of the menu, but keeps a
  // dish from further down their list, so they can still be fed on a night the
  // pantry or the menu is not up to it.
  {
    id: 'sabine',
    name: 'Sabine Corrigan',
    look: { hair: '#2f2a26', hairStyle: 'long', shirt: '#2f7f6b', pants: '#3a3f4a' },
    tastes: ['harbour_pie', 'harvest_hotpot', 'fish_and_chips'],
    cadenceDays: 3,
    note: 'Ran the chip shop on the corner for thirty years. Came to see how you do it.',
    unlockLevel: 17,
  },
  {
    id: 'ivo',
    name: 'Ivo Petrakis',
    look: { hair: '#6b6259', hairStyle: 'bald', shirt: '#c05a3a', pants: '#33455c' },
    tastes: ['mocha_torte', 'feast_board', 'choc_cake'],
    cadenceDays: 4,
    note: 'Closes the bakery early on the nights he thinks pudding is worth the walk.',
    unlockLevel: 19,
  },
  {
    id: 'nadia',
    name: 'Nadia Oyelaran',
    look: { hair: '#1f1b18', hairStyle: 'curly', shirt: '#e0b23c', pants: '#4a2f52' },
    tastes: ['kitchen_table', 'feast_board', 'house_burger'],
    cadenceDays: 3,
    note: 'Writes up the places people queue for. Turned up once your name got out.',
    unlockLevel: 20,
    unlockStars: 4,
  },
  {
    id: 'orla',
    name: 'Orla Fenwick',
    look: { hair: '#b8523a', hairStyle: 'long', shirt: '#3f6fb5', pants: '#2f3a4a' },
    tastes: ['ocean_board', 'salmon_sushi', 'fish_and_chips'],
    cadenceDays: 3,
    note: 'Drives the coast road on her day off to find out whether you can beat the sea.',
    unlockLevel: 20,
    unlockStars: 8,
  },
  {
    id: 'gus',
    name: 'Gus Amankwah',
    look: { hair: '#241d19', hairStyle: 'short', shirt: '#7a4f8c', pants: '#3a3f4a' },
    tastes: ['nightcap_affogato', 'mocha_torte', 'iced_coffee'],
    cadenceDays: 4,
    note: 'Locks up the picture house across the road and walks in for the last order of the night.',
    unlockLevel: 20,
    unlockStars: 9,
  },
];

export const REGULARS_BY_ID: Record<string, RegularDef> = Object.fromEntries(
  REGULARS.map((r) => [r.id, r]),
);
