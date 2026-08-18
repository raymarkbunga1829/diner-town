import type { IngredientId } from './ingredients';
import { INGREDIENTS } from './ingredients';

/**
 * Dishes level up through use: every serving earns the recipe experience, and
 * each mastery level raises the price a customer will pay and shaves a little
 * off the cook time. That is the long-term progression treadmill of the game,
 * so a small menu cooked often beats a huge menu cooked rarely.
 */

export const MAX_DISH_LEVEL = 10;

export type DishCategory = 'starter' | 'main' | 'dessert' | 'drink';

/** How the plated dish is drawn on a table. */
export type PlateStyle =
  | 'burger'
  | 'bowl'
  | 'plate'
  | 'salad'
  | 'skewer'
  | 'slice'
  | 'cake'
  | 'cup'
  | 'sushi'
  | 'fries';

export interface Dish {
  id: string;
  name: string;
  category: DishCategory;
  /** Units of each ingredient consumed per serving. */
  recipe: Partial<Record<IngredientId, number>>;
  /** Price at mastery level 1, before bonuses. */
  basePrice: number;
  /** Seconds to cook on a baseline stove with a level-1 chef. */
  cookTime: number;
  /** Restaurant level at which the recipe becomes available. */
  unlockLevel: number;
  /** Drives how appealing the dish is to customers (0..1). */
  appeal: number;
  plate: PlateStyle;
  color: string;
  accent: string;
}

export const DISHES: readonly Dish[] = [
  // ---- Early game ----
  { id: 'house_burger', name: 'House Burger', category: 'main', recipe: { bread: 1, beef: 1, lettuce: 1 }, basePrice: 34, cookTime: 9, unlockLevel: 1, appeal: 0.55, plate: 'burger', color: '#c8712f', accent: '#8a4a1c' },
  { id: 'garden_salad', name: 'Garden Salad', category: 'starter', recipe: { lettuce: 2, tomato: 1 }, basePrice: 20, cookTime: 6, unlockLevel: 1, appeal: 0.4, plate: 'salad', color: '#8fc46b', accent: '#5d8f44' },
  { id: 'crispy_fries', name: 'Crispy Fries', category: 'starter', recipe: { potato: 2, butter: 1 }, basePrice: 22, cookTime: 7, unlockLevel: 1, appeal: 0.5, plate: 'fries', color: '#efc35c', accent: '#bd8f2b' },
  { id: 'tomato_soup', name: 'Tomato Soup', category: 'starter', recipe: { tomato: 2, milk: 1 }, basePrice: 24, cookTime: 8, unlockLevel: 2, appeal: 0.45, plate: 'bowl', color: '#d9503a', accent: '#95301f' },
  { id: 'cheese_omelette', name: 'Cheese Omelette', category: 'main', recipe: { egg: 2, cheese: 1, butter: 1 }, basePrice: 32, cookTime: 9, unlockLevel: 2, appeal: 0.5, plate: 'plate', color: '#f4d06a', accent: '#c39c2e' },
  { id: 'iced_coffee', name: 'Iced Coffee', category: 'drink', recipe: { coffee: 1, milk: 1, sugar: 1 }, basePrice: 18, cookTime: 5, unlockLevel: 2, appeal: 0.45, plate: 'cup', color: '#6b4526', accent: '#3a2413' },

  // ---- Level 3-6 ----
  { id: 'margherita', name: 'Margherita Pizza', category: 'main', recipe: { flour: 2, tomato: 1, cheese: 2 }, basePrice: 46, cookTime: 12, unlockLevel: 3, appeal: 0.66, plate: 'slice', color: '#e0a044', accent: '#a86f1f' },
  { id: 'fish_and_chips', name: 'Fish & Chips', category: 'main', recipe: { fish: 1, potato: 2, flour: 1 }, basePrice: 48, cookTime: 12, unlockLevel: 3, appeal: 0.62, plate: 'plate', color: '#e6c17f', accent: '#a9803c' },
  { id: 'mushroom_pasta', name: 'Mushroom Pasta', category: 'main', recipe: { noodles: 2, mushroom: 2, butter: 1 }, basePrice: 44, cookTime: 11, unlockLevel: 4, appeal: 0.6, plate: 'bowl', color: '#e4d3a8', accent: '#a99667' },
  { id: 'berry_pancakes', name: 'Berry Pancakes', category: 'dessert', recipe: { flour: 2, egg: 1, berries: 1, butter: 1 }, basePrice: 38, cookTime: 10, unlockLevel: 4, appeal: 0.58, plate: 'cake', color: '#e9bf7f', accent: '#b1863f' },
  { id: 'chicken_skewers', name: 'Chicken Skewers', category: 'main', recipe: { chicken: 2, spice: 1, onion: 1 }, basePrice: 50, cookTime: 13, unlockLevel: 5, appeal: 0.64, plate: 'skewer', color: '#c98a45', accent: '#8d5a20' },
  { id: 'egg_fried_rice', name: 'Egg Fried Rice', category: 'main', recipe: { rice: 2, egg: 2, onion: 1 }, basePrice: 42, cookTime: 10, unlockLevel: 5, appeal: 0.58, plate: 'bowl', color: '#f0dfa8', accent: '#bda765' },
  { id: 'choc_cake', name: 'Chocolate Cake', category: 'dessert', recipe: { flour: 2, chocolate: 2, sugar: 1, egg: 1 }, basePrice: 52, cookTime: 14, unlockLevel: 6, appeal: 0.7, plate: 'cake', color: '#6b4326', accent: '#3d2413' },
  { id: 'ramen_bowl', name: 'Ramen Bowl', category: 'main', recipe: { noodles: 2, pork: 1, egg: 1, seaweed: 1 }, basePrice: 58, cookTime: 15, unlockLevel: 6, appeal: 0.72, plate: 'bowl', color: '#d9a05a', accent: '#9a6a2c' },

  // ---- Level 7-12 ----
  { id: 'shrimp_tempura', name: 'Shrimp Tempura', category: 'starter', recipe: { shrimp: 2, flour: 1, egg: 1 }, basePrice: 56, cookTime: 13, unlockLevel: 7, appeal: 0.7, plate: 'plate', color: '#f0b183', accent: '#b8703f' },
  { id: 'salmon_sushi', name: 'Salmon Sushi', category: 'main', recipe: { rice: 2, fish: 2, seaweed: 1 }, basePrice: 64, cookTime: 14, unlockLevel: 8, appeal: 0.76, plate: 'sushi', color: '#f2f0e6', accent: '#e0785a' },
  { id: 'beef_curry', name: 'Beef Curry', category: 'main', recipe: { beef: 2, rice: 2, spice: 2, onion: 1 }, basePrice: 72, cookTime: 17, unlockLevel: 9, appeal: 0.78, plate: 'bowl', color: '#c07a24', accent: '#8a5008' },
  { id: 'truffle_risotto', name: 'Truffle Risotto', category: 'main', recipe: { rice: 2, mushroom: 3, cheese: 1, butter: 1 }, basePrice: 84, cookTime: 18, unlockLevel: 10, appeal: 0.82, plate: 'plate', color: '#e8dcb6', accent: '#ab9a63' },
  { id: 'prime_steak', name: 'Prime Rib Steak', category: 'main', recipe: { beef: 3, butter: 1, mushroom: 1, spice: 1 }, basePrice: 98, cookTime: 20, unlockLevel: 12, appeal: 0.86, plate: 'plate', color: '#8e4130', accent: '#5a2418' },
  { id: 'lobster_bisque', name: 'Seafood Bisque', category: 'starter', recipe: { shrimp: 2, milk: 2, butter: 1, spice: 1 }, basePrice: 88, cookTime: 18, unlockLevel: 14, appeal: 0.84, plate: 'bowl', color: '#e6875a', accent: '#a5502a' },
  { id: 'grand_dessert', name: 'Grand Dessert Tower', category: 'dessert', recipe: { chocolate: 2, berries: 2, sugar: 2, milk: 1, flour: 1 }, basePrice: 110, cookTime: 22, unlockLevel: 16, appeal: 0.9, plate: 'cake', color: '#b4577f', accent: '#6f2c4b' },
];

export const DISHES_BY_ID: Record<string, Dish> = Object.fromEntries(
  DISHES.map((d) => [d.id, d]),
);

/** Servings needed to reach each mastery level (index 0 = level 1 -> 2). */
export const MASTERY_THRESHOLDS: readonly number[] = [
  8, 20, 40, 70, 115, 180, 270, 400, 580,
];

export function servingsForLevel(level: number): number {
  if (level <= 1) return 0;
  return MASTERY_THRESHOLDS[Math.min(level - 2, MASTERY_THRESHOLDS.length - 1)]!;
}

/** Total servings needed to go from level 1 to `level`. */
export function cumulativeServings(level: number): number {
  let total = 0;
  for (let l = 2; l <= level; l++) total += servingsForLevel(l);
  return total;
}

/** Mastery raises price by 12% per level over level 1. */
export function dishPrice(dish: Dish, level: number): number {
  return Math.round(dish.basePrice * (1 + 0.12 * (level - 1)));
}

/** Mastery shaves up to ~27% off cook time by level 10. */
export function dishCookTime(dish: Dish, level: number): number {
  return dish.cookTime * (1 - 0.03 * (level - 1));
}

/** Raw ingredient cost of one serving, used to show margin in the menu UI. */
export function dishIngredientCost(dish: Dish): number {
  let total = 0;
  for (const [id, qty] of Object.entries(dish.recipe)) {
    total += INGREDIENTS[id as IngredientId].price * (qty ?? 0);
  }
  return total;
}

/** Mastery level implied by a lifetime serving count. */
export function dishLevelFromServings(servings: number): number {
  let level = 1;
  while (level < MAX_DISH_LEVEL && servings >= cumulativeServings(level + 1)) level++;
  return level;
}

/** Servings into the current mastery level, and the span of that level. */
export function dishMasteryProgress(servings: number): {
  level: number;
  into: number;
  span: number;
} {
  const level = dishLevelFromServings(servings);
  if (level >= MAX_DISH_LEVEL) return { level, into: 1, span: 1 };
  const base = cumulativeServings(level);
  return { level, into: servings - base, span: servingsForLevel(level + 1) };
}

export function recipeText(dish: Dish): string {
  return Object.entries(dish.recipe)
    .map(([id, qty]) => `${qty}x ${INGREDIENTS[id as IngredientId].name}`)
    .join(', ');
}
