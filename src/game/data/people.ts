/**
 * Name pools and colour palettes used to generate staff applicants and walk-in
 * customers. Appearance is derived from a seed so a given person always looks
 * the same across sessions.
 */

export const FIRST_NAMES: readonly string[] = [
  'Ana', 'Ben', 'Cleo', 'Dev', 'Elsa', 'Finn', 'Gia', 'Hugo', 'Iris', 'Jonas',
  'Kira', 'Leo', 'Mina', 'Nils', 'Ola', 'Pia', 'Quinn', 'Rosa', 'Sami', 'Tara',
  'Umi', 'Vic', 'Wren', 'Xiu', 'Yara', 'Zane', 'Bo', 'Cass', 'Dot', 'Emre',
  'Fay', 'Gus', 'Hana', 'Ivo', 'Juno', 'Kai', 'Lars', 'Moss', 'Noor', 'Otis',
];

export const LAST_NAMES: readonly string[] = [
  'Aldon', 'Baker', 'Cortez', 'Duval', 'Eriksen', 'Ferro', 'Gale', 'Hollis',
  'Imani', 'Jarvis', 'Kwan', 'Lindt', 'Moreno', 'Nakai', 'Oyelu', 'Pike',
  'Quill', 'Rossi', 'Salcedo', 'Tanaka', 'Ubina', 'Vance', 'Weiss', 'Yusuf',
];

export const SKIN_TONES: readonly string[] = [
  '#f2d3b6', '#e8be99', '#d8a179', '#bf8557', '#9c6640', '#7a4a2b', '#5d3620',
];

export const HAIR_COLORS: readonly string[] = [
  '#2b2118', '#4a3220', '#6d4526', '#8f6134', '#c39a5c', '#d8d3cb', '#8d3f3f',
  '#3c4a63', '#57345c',
];

export const SHIRT_COLORS: readonly string[] = [
  '#e85a3c', '#3d9ad6', '#5fbf55', '#e85a86', '#7b6ad6', '#f2b429', '#2fbaa8',
  '#5aa0d8', '#d96a3a', '#68b86a', '#ef6b8a', '#6aa3c8',
];

export const PANTS_COLORS: readonly string[] = [
  '#3a4a62', '#5a4034', '#2f4656', '#5a4554', '#3d5240', '#5c4636',
];

/** Uniform colours by staff role, so roles are readable at a glance. */
export const UNIFORM: Record<'waiter' | 'chef' | 'cleaner', { shirt: string; trim: string }> = {
  waiter: { shirt: '#fff6e4', trim: '#c73a2e' },
  chef: { shirt: '#fffdf8', trim: '#c73a2e' },
  cleaner: { shirt: '#7ed0c4', trim: '#2a6f68' },
};

export type HairStyle = 'short' | 'bun' | 'long' | 'cap' | 'bald' | 'curly';

export const HAIR_STYLES: readonly HairStyle[] = ['short', 'bun', 'long', 'cap', 'bald', 'curly'];
