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
];

export const REGULARS_BY_ID: Record<string, RegularDef> = Object.fromEntries(
  REGULARS.map((r) => [r.id, r]),
);
