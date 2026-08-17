/**
 * Ingredients are the raw stock consumed when a chef cooks a dish. They are
 * bought from the Market, which restocks on a timer, so keeping a broad menu
 * running requires actively managing the pantry.
 */

export type IngredientId =
  | 'bread'
  | 'flour'
  | 'rice'
  | 'noodles'
  | 'potato'
  | 'tomato'
  | 'lettuce'
  | 'onion'
  | 'mushroom'
  | 'cheese'
  | 'milk'
  | 'egg'
  | 'butter'
  | 'beef'
  | 'chicken'
  | 'pork'
  | 'fish'
  | 'shrimp'
  | 'sugar'
  | 'chocolate'
  | 'berries'
  | 'spice'
  | 'coffee'
  | 'seaweed';

export interface Ingredient {
  id: IngredientId;
  name: string;
  /** Coins per unit at the market. */
  price: number;
  /** Units added back to market stock each restock tick. */
  restock: number;
  /** Highest amount the market will ever hold. */
  maxStock: number;
  /** Emoji-free swatch colour used by the procedural icon renderer. */
  color: string;
  accent: string;
  /** Rough silhouette used to draw the icon. */
  icon: 'loaf' | 'sack' | 'grain' | 'round' | 'leaf' | 'slab' | 'drop' | 'bean' | 'sheet';
  aisle: 'bakery' | 'produce' | 'dairy' | 'butcher' | 'pantry';
}

export const INGREDIENTS: Record<IngredientId, Ingredient> = {
  bread: { id: 'bread', name: 'Bread', price: 4, restock: 40, maxStock: 220, color: '#d9a25f', accent: '#a9713a', icon: 'loaf', aisle: 'bakery' },
  flour: { id: 'flour', name: 'Flour', price: 3, restock: 40, maxStock: 220, color: '#f2e6cf', accent: '#cdbb9c', icon: 'sack', aisle: 'bakery' },
  rice: { id: 'rice', name: 'Rice', price: 3, restock: 40, maxStock: 220, color: '#f6f1e4', accent: '#cfc6ad', icon: 'grain', aisle: 'pantry' },
  noodles: { id: 'noodles', name: 'Noodles', price: 4, restock: 36, maxStock: 200, color: '#efce87', accent: '#c9a253', icon: 'grain', aisle: 'pantry' },
  potato: { id: 'potato', name: 'Potato', price: 3, restock: 40, maxStock: 220, color: '#c9a165', accent: '#8f6c3d', icon: 'round', aisle: 'produce' },
  tomato: { id: 'tomato', name: 'Tomato', price: 4, restock: 36, maxStock: 200, color: '#e0503a', accent: '#9c3325', icon: 'round', aisle: 'produce' },
  lettuce: { id: 'lettuce', name: 'Lettuce', price: 4, restock: 36, maxStock: 200, color: '#8fc46b', accent: '#5d8f44', icon: 'leaf', aisle: 'produce' },
  onion: { id: 'onion', name: 'Onion', price: 3, restock: 36, maxStock: 200, color: '#e6dcc4', accent: '#b09d7c', icon: 'round', aisle: 'produce' },
  mushroom: { id: 'mushroom', name: 'Mushroom', price: 6, restock: 26, maxStock: 150, color: '#d8c3a5', accent: '#8d7355', icon: 'round', aisle: 'produce' },
  cheese: { id: 'cheese', name: 'Cheese', price: 7, restock: 26, maxStock: 150, color: '#f4c95d', accent: '#c2942f', icon: 'slab', aisle: 'dairy' },
  milk: { id: 'milk', name: 'Milk', price: 4, restock: 32, maxStock: 180, color: '#f7f7f2', accent: '#c8cbd0', icon: 'drop', aisle: 'dairy' },
  egg: { id: 'egg', name: 'Egg', price: 4, restock: 34, maxStock: 190, color: '#f9ecd4', accent: '#d8bf95', icon: 'round', aisle: 'dairy' },
  butter: { id: 'butter', name: 'Butter', price: 6, restock: 26, maxStock: 150, color: '#f6e07a', accent: '#c9ae3d', icon: 'slab', aisle: 'dairy' },
  beef: { id: 'beef', name: 'Beef', price: 11, restock: 20, maxStock: 120, color: '#b8503f', accent: '#78291f', icon: 'slab', aisle: 'butcher' },
  chicken: { id: 'chicken', name: 'Chicken', price: 8, restock: 24, maxStock: 140, color: '#e8c290', accent: '#ac8452', icon: 'slab', aisle: 'butcher' },
  pork: { id: 'pork', name: 'Pork', price: 9, restock: 22, maxStock: 130, color: '#e59a91', accent: '#a95f57', icon: 'slab', aisle: 'butcher' },
  fish: { id: 'fish', name: 'Fish', price: 10, restock: 22, maxStock: 130, color: '#a9c6d8', accent: '#5f8298', icon: 'slab', aisle: 'butcher' },
  shrimp: { id: 'shrimp', name: 'Shrimp', price: 13, restock: 16, maxStock: 100, color: '#f09a72', accent: '#b45f3c', icon: 'bean', aisle: 'butcher' },
  sugar: { id: 'sugar', name: 'Sugar', price: 3, restock: 36, maxStock: 200, color: '#fbf6ee', accent: '#d2c8b6', icon: 'sack', aisle: 'pantry' },
  chocolate: { id: 'chocolate', name: 'Chocolate', price: 9, restock: 20, maxStock: 120, color: '#6b4326', accent: '#3d2413', icon: 'slab', aisle: 'pantry' },
  berries: { id: 'berries', name: 'Berries', price: 8, restock: 22, maxStock: 130, color: '#a4436f', accent: '#6a2445', icon: 'bean', aisle: 'produce' },
  spice: { id: 'spice', name: 'Spice', price: 7, restock: 24, maxStock: 140, color: '#c9762f', accent: '#8c4c15', icon: 'sack', aisle: 'pantry' },
  coffee: { id: 'coffee', name: 'Coffee', price: 6, restock: 26, maxStock: 150, color: '#54341f', accent: '#2e1b0e', icon: 'bean', aisle: 'pantry' },
  seaweed: { id: 'seaweed', name: 'Seaweed', price: 7, restock: 22, maxStock: 130, color: '#3f6b4a', accent: '#22412c', icon: 'sheet', aisle: 'pantry' },
};

export const INGREDIENT_LIST: readonly Ingredient[] = Object.values(INGREDIENTS);

export const AISLE_LABELS: Record<Ingredient['aisle'], string> = {
  bakery: 'Bakery',
  produce: 'Produce',
  dairy: 'Dairy & Eggs',
  butcher: 'Butcher',
  pantry: 'Pantry',
};
