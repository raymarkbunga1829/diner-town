import type { Dish } from '../../game/data/dishes';
import type { FurnitureDef } from '../../game/data/furniture';
import type { Ingredient } from '../../game/data/ingredients';
import { UNIFORM } from '../../game/data/people';
import type { Appearance, StaffRole } from '../../game/types';
import {
  drawFurniturePreview,
  drawIngredientIcon,
  drawPerson,
  drawPlatedDish,
} from '../../render/sprites';
import { el, makeCanvas } from '../dom';

/** Previews are static snapshots; this keeps flames and water in a nice pose. */
const PREVIEW_TIME = 0.42;

export function furniturePreview(def: FurnitureDef, w = 150, h = 74): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  drawFurniturePreview(ctx, def, 0, 0, w, h, PREVIEW_TIME);
  return canvas;
}

export function dishIcon(dish: Dish, size = 46): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.save();
  ctx.translate(size / 2, size * 0.66);
  ctx.scale(size / 42, size / 42);
  drawPlatedDish(ctx, dish, 0, 0, 1.25);
  ctx.restore();
  return canvas;
}

export function ingredientIcon(ing: Ingredient, size = 40): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  drawIngredientIcon(ctx, ing, 3, 3, size - 6);
  return canvas;
}

export function personIcon(
  look: Appearance,
  size = 52,
  role?: StaffRole,
): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.save();
  ctx.translate(size / 2, size * 0.97);
  // Room for a chef's hat: the tallest thing a figure can be wearing decides how
  // big the figure itself can be drawn in a fixed-size card.
  const s = size / 64;
  ctx.scale(s, s);
  drawPerson(ctx, look, 0, 0, {
    facing: 'se',
    time: 0.3,
    walking: false,
    sitting: false,
    uniform: role ? UNIFORM[role] : undefined,
    role,
  });
  ctx.restore();
  return canvas;
}

export function meter(value: number, color: string): HTMLElement {
  return el('div', { class: 'meter' }, [
    el('i', {
      style: `width:${Math.max(0, Math.min(1, value)) * 100}%;background:${color}`,
    }),
  ]);
}

export function chip(text: string, kind: '' | 'good' | 'warn' | 'info' = ''): HTMLElement {
  return el('span', { class: `chip ${kind}`.trim(), text });
}

export function emptyState(message: string): HTMLElement {
  return el('div', { class: 'empty', text: message });
}

export function sectionTitle(text: string): HTMLElement {
  return el('div', { class: 'section-title', text });
}

/** Colour ramp for skill and energy meters. */
export function healthColor(value: number): string {
  if (value > 0.6) return '#6fc07a';
  if (value > 0.3) return '#e8b53c';
  return '#e4705f';
}
