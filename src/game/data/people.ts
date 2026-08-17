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
  '#d8613c', '#3f7fa8', '#6f9a4f', '#b1495f', '#8a6bb1', '#c9973c', '#3f8f83',
  '#5a6b8c', '#a0523f', '#4f6b4a', '#b5566f', '#7e8fa8',
];

export const PANTS_COLORS: readonly string[] = [
  '#3a4150', '#4a3b30', '#2f3a44', '#54484f', '#3d4a3a', '#5b4a3a',
];

/** Uniform colours by staff role, so roles are readable at a glance. */
export const UNIFORM: Record<'waiter' | 'chef' | 'cleaner', { shirt: string; trim: string }> = {
  waiter: { shirt: '#f4efe4', trim: '#2f3540' },
  chef: { shirt: '#fbfaf6', trim: '#c94f3a' },
  cleaner: { shirt: '#8fb7d8', trim: '#37556b' },
};

export type HairStyle = 'short' | 'bun' | 'long' | 'cap' | 'bald' | 'curly';

export const HAIR_STYLES: readonly HairStyle[] = ['short', 'bun', 'long', 'cap', 'bald', 'curly'];
