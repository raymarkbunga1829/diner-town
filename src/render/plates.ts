/**
 * The menu sheet, as sprites.
 *
 * Fourteen dishes are drawn on the approved sheet — burger, salad, fries, soup,
 * omelette, iced coffee, pizza, fish and chips, pancakes, chocolate cake, ramen,
 * sushi, steak and the dessert tower — and each of them has a sprite here.
 * Recipes the sheet does not draw fall back through their plate style onto the
 * nearest one and are tinted from the dish's own two colours, so a menu of
 * thirty recipes reads as coming off the same sheet without inventing a look for
 * each of them.
 *
 * The mapping is render-side only: it is keyed by the recipe ids the save
 * already stores and adds nothing to {@link Dish}, so no save migrates.
 */

import type { Dish, PlateStyle } from '../game/data/dishes';
import { blob, inkOf, LINE, panel, shapeOf, SHEET, sheen } from './art';
import { mix, shade, withAlpha } from './shapes';

/** What the food sits on. */
export type PlateKind = 'round' | 'bowl' | 'board' | 'bare';

export type DishArtId =
  | 'burger'
  | 'salad'
  | 'fries'
  | 'soup'
  | 'omelette'
  | 'icedCoffee'
  | 'pizza'
  | 'fishChips'
  | 'pancakes'
  | 'chocCake'
  | 'ramen'
  | 'sushi'
  | 'steak'
  | 'dessertTower'
  | 'skewer'
  | 'plated';

export interface DishArt {
  plate: PlateKind;
  /** Paints the food, centred on the plate's own origin. */
  draw: (ctx: CanvasRenderingContext2D, colour: string, accent: string) => void;
}

// ------------------------------------------------------------------ helpers

const line = (fill: string, width = 1): { line: number; outline: string } => ({
  line: width,
  outline: inkOf(fill, 0.45),
});

/** A heap of something: the mound most plated food is built on. */
function mound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.moveTo(x - rx, y);
  ctx.quadraticCurveTo(x - rx * 0.9, y - ry * 2, x, y - ry * 2);
  ctx.quadraticCurveTo(x + rx * 0.9, y - ry * 2, x + rx, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = inkOf(fill, 0.45);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** A few green leaves, the garnish on most of the sheet's mains. */
function greens(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(x + i * 3.4, y - i * 0.8);
    ctx.rotate(-0.5 + i * 0.35);
    blob(ctx, 0, 0, 3.4, 1.5, i % 2 ? SHEET.leaf : shade(SHEET.leaf, 1.15), line(SHEET.leaf, 0.9));
    ctx.restore();
  }
}

/** A batch of chips, fanned so the outline is spiky rather than a block. */
function chips(ctx: CanvasRenderingContext2D, x: number, y: number, count: number): void {
  for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.translate(x + (i - (count - 1) / 2) * 2.6, y);
    ctx.rotate((i - (count - 1) / 2) * 0.16);
    panel(ctx, -1.4, -11, 2.8, 12, 1.2, i % 2 === 0 ? SHEET.butter : shade(SHEET.butter, 1.1), {
      line: 0.9,
      outline: inkOf(SHEET.butter, 0.4),
    });
    ctx.restore();
  }
}

/** Steam, so hot food looks hot. Two soft strokes are plenty at this size. */
function steam(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (const dx of [-3, 3]) {
    ctx.beginPath();
    ctx.moveTo(x + dx, y);
    ctx.quadraticCurveTo(x + dx + 2.4, y - 4, x + dx, y - 8);
    ctx.stroke();
  }
}

// -------------------------------------------------------------- the sheet

export const DISH_SPRITES: Record<DishArtId, DishArt> = {
  // Sesame bun, lettuce frill, tomato, cheese, patty: the tallest, roundest
  // silhouette on the menu, so it is never mistaken for anything else.
  burger: {
    plate: 'round',
    draw: (ctx, colour, accent) => {
      const bun = shade(colour, 1.16);
      ctx.beginPath();
      ctx.moveTo(-8.6, -8.5);
      ctx.quadraticCurveTo(-8.6, -17.5, 0, -17.5);
      ctx.quadraticCurveTo(8.6, -17.5, 8.6, -8.5);
      ctx.closePath();
      ctx.fillStyle = bun;
      ctx.fill();
      ctx.strokeStyle = inkOf(bun, 0.45);
      ctx.lineWidth = LINE;
      ctx.stroke();
      ctx.fillStyle = withAlpha('#fff4d8', 0.9);
      for (const [sx, sy] of [[-4, -13], [0.4, -14.8], [4.4, -12.2]] as const) {
        ctx.beginPath();
        ctx.ellipse(sx, sy, 1.5, 0.9, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Lettuce wider than the bun, so the filling reads as spilling out.
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) ctx.arc(-9.4 + i * 3.7, -7.6, 2.2, Math.PI, 0);
      ctx.lineTo(9.8, -5.4);
      ctx.lineTo(-9.8, -5.4);
      ctx.closePath();
      ctx.fillStyle = SHEET.leaf;
      ctx.fill();
      ctx.strokeStyle = inkOf(SHEET.leaf, 0.4);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      panel(ctx, -8.8, -6.2, 17.6, 2.6, 1.3, SHEET.butter, line(SHEET.butter));
      panel(ctx, -8.4, -4.4, 16.8, 3.8, 1.7, accent, line(accent));
      panel(ctx, -7.8, -1.2, 15.6, 3.6, 1.8, colour, line(colour));
    },
  },
  // A loose pile of leaves with tomato and cucumber in it: wide, ragged, green.
  salad: {
    plate: 'bowl',
    draw: (ctx, colour) => {
      blob(ctx, 0, -2.4, 9.8, 4.6, shade(colour, 0.84), { line: 0 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.4;
        ctx.save();
        ctx.translate(Math.cos(a) * 6, -4.4 + Math.sin(a) * 2.6);
        ctx.rotate(a * 0.5);
        blob(ctx, 0, 0, 4.4, 3, i % 2 === 0 ? colour : shade(colour, 1.18), line(colour, 0.9));
        ctx.restore();
      }
      for (const [tx, ty] of [[-4.6, -6], [3.6, -7]] as const) {
        blob(ctx, tx, ty, 2.6, 2.6, '#e0523c', line('#e0523c', 0.9));
        blob(ctx, tx, ty, 1.2, 1.2, '#f4907a', { line: 0 });
      }
      blob(ctx, 1, -3.2, 2.8, 1.8, '#cfe8a8', line('#cfe8a8', 0.8));
    },
  },
  // Fries standing out of a checked carton.
  fries: {
    plate: 'bare',
    draw: (ctx) => {
      chips(ctx, 0, -6, 7);
      shapeOf(
        ctx,
        [
          [-7.8, -7.6],
          [7.8, -7.6],
          [5.8, 2.6],
          [-5.8, 2.6],
        ],
        SHEET.cream,
        line(SHEET.cream, LINE),
      );
      // Red check across the carton, clipped to it.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-7.6, -7.4);
      ctx.lineTo(7.6, -7.4);
      ctx.lineTo(5.6, 2.4);
      ctx.lineTo(-5.6, 2.4);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = SHEET.tomato;
      for (let i = -3; i <= 3; i++) {
        for (let j = 0; j < 3; j++) {
          if ((i + j) % 2) continue;
          ctx.fillRect(i * 3.2, -7 + j * 3.4, 3.2, 3.4);
        }
      }
      ctx.restore();
    },
  },
  soup: {
    plate: 'bowl',
    draw: (ctx, colour, accent) => {
      blob(ctx, 0, -1.6, 9.2, 4.4, colour, { line: 0 });
      blob(ctx, -1, -2.6, 6.4, 2.6, shade(colour, 1.12), { line: 0 });
      // Croutons and a swirl of cream.
      for (const [dx, dy] of [[-3.4, -3], [1.6, -2], [4, -3.4]] as const) {
        panel(ctx, dx, dy, 3, 2.2, 0.8, SHEET.oakLight, { line: 0.8 });
      }
      ctx.strokeStyle = withAlpha('#fff8ea', 0.85);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, -2.2, 4.4, 0.4, 3.2);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(-5.4, -1.4, 1.4, 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      steam(ctx, 0, -7);
    },
  },
  omelette: {
    plate: 'round',
    draw: (ctx, colour, accent) => {
      // A folded half-moon, seam towards the camera, herbs across it.
      ctx.beginPath();
      ctx.moveTo(-9.4, -1.4);
      ctx.quadraticCurveTo(-8, -10, 0.6, -9.4);
      ctx.quadraticCurveTo(9.6, -8.8, 9, -1.4);
      ctx.closePath();
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.strokeStyle = inkOf(colour, 0.45);
      ctx.lineWidth = LINE;
      ctx.stroke();
      ctx.strokeStyle = withAlpha(accent, 0.7);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-6, -3.4);
      ctx.quadraticCurveTo(0, -6.4, 6.4, -3);
      ctx.stroke();
      sheen(ctx, -3.4, -6.6, 3.4, 1.8, 0.3);
      greens(ctx, -8, -1.2);
    },
  },
  icedCoffee: {
    plate: 'bare',
    draw: (ctx, colour, accent) => {
      // Tall glass, iced coffee, a straw leaning out of it.
      ctx.strokeStyle = SHEET.tomato;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(1.6, -11);
      ctx.lineTo(6.6, -18);
      ctx.stroke();
      panel(ctx, -6, -13, 12, 15, 2.4, withAlpha(colour, 0.92), line(colour, LINE));
      panel(ctx, -4.4, -12, 8.8, 4.2, 1.6, shade(colour, 1.35), { line: 0 });
      for (const [dx, dy] of [[-2.4, -9.4], [1.4, -6.6], [-1, -4]] as const) {
        panel(ctx, dx, dy, 3.4, 3, 1, withAlpha('#ffffff', 0.5), { line: 0 });
      }
      panel(ctx, -5, -14.6, 10, 2.6, 1.2, accent, { line: 0.9 });
      sheen(ctx, -4, -6, 1.2, 4.4, 0.35);
    },
  },
  pizza: {
    plate: 'round',
    draw: (ctx, colour, accent) => {
      // A slice pointing away from the camera, crust nearest.
      shapeOf(
        ctx,
        [
          [-9.6, 1.4],
          [0, -9.6],
          [9.6, 1.4],
        ],
        shade(colour, 1.1),
        line(colour, LINE),
      );
      shapeOf(
        ctx,
        [
          [-9.6, 1.4],
          [-6.4, -2.4],
          [6.4, -2.4],
          [9.6, 1.4],
        ],
        SHEET.oakLight,
        line(SHEET.oakLight),
      );
      for (const [dx, dy] of [[-3.8, -1.4], [0.6, -4.4], [4, -1.2]] as const) {
        blob(ctx, dx, dy, 2, 1.4, accent, line(accent, 0.8));
      }
      blob(ctx, -1.4, -2.6, 2, 1.1, SHEET.leaf, line(SHEET.leaf, 0.8));
    },
  },
  fishChips: {
    plate: 'round',
    draw: (ctx, colour, accent) => {
      chips(ctx, -4.6, -3.2, 4);
      // Battered fillet laid across the chips, with a wedge of lemon.
      ctx.save();
      ctx.rotate(-0.18);
      panel(ctx, -3, -8.4, 15, 6.4, 3.2, colour, line(colour, LINE));
      ctx.fillStyle = withAlpha(accent, 0.55);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(-0.4 + i * 3.6, -5.6, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      shapeOf(
        ctx,
        [
          [7, -1],
          [11.6, -3.4],
          [11.6, 0.4],
        ],
        SHEET.butter,
        line(SHEET.butter, 0.9),
      );
      greens(ctx, -10, -0.6);
    },
  },
  pancakes: {
    plate: 'round',
    draw: (ctx, colour, accent) => {
      for (let i = 0; i < 3; i++) {
        blob(ctx, 0, -2.2 - i * 3.4, 8.6 - i * 0.4, 2.6, shade(colour, 1 + i * 0.05), line(colour));
      }
      // Syrup over the stack, cream and berries on top.
      ctx.beginPath();
      ctx.moveTo(-7, -12);
      ctx.quadraticCurveTo(-4, -8, -6.4, -4.6);
      ctx.lineTo(6.6, -4.6);
      ctx.quadraticCurveTo(4.4, -8.4, 7, -12);
      ctx.closePath();
      ctx.fillStyle = withAlpha(accent, 0.7);
      ctx.fill();
      blob(ctx, 0, -13.4, 4, 2.6, '#fffaf0', line('#fffaf0'));
      for (const [dx, dy] of [[-3.6, -14.6], [1.4, -16], [4, -13.8]] as const) {
        blob(ctx, dx, dy, 1.8, 1.6, berryTone(dx), line('#7e3a63', 0.8));
      }
    },
  },
  chocCake: {
    plate: 'round',
    draw: (ctx, colour, accent) => {
      // A wedge of layer cake, seen from the cut side.
      panel(ctx, -7.4, -12.4, 14.8, 12.4, 1.6, colour, line(colour, LINE));
      ctx.fillStyle = withAlpha('#f6e8d2', 0.9);
      ctx.fillRect(-7.4, -9, 14.8, 1.8);
      ctx.fillRect(-7.4, -5, 14.8, 1.8);
      panel(ctx, -7.8, -14.4, 15.6, 3, 1.4, accent, line(accent));
      blob(ctx, 3.4, -15.4, 2.4, 2, accent, line(accent, 0.9));
      blob(ctx, 3.4, -17, 1.6, 1.6, '#e0523c', line('#e0523c', 0.8));
    },
  },
  ramen: {
    plate: 'bowl',
    draw: (ctx, colour, accent) => {
      blob(ctx, 0, -1.6, 9.2, 4.4, shade(colour, 0.92), { line: 0 });
      // Noodles, then the toppings arranged round the rim.
      ctx.strokeStyle = SHEET.butter;
      ctx.lineWidth = 1.1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 2.6 - 1, -2.8);
        ctx.quadraticCurveTo(i * 2.6 + 1.4, -1, i * 2.6 - 0.6, 0.4);
        ctx.stroke();
      }
      // Soft egg, halved.
      blob(ctx, -4.4, -3.4, 3, 2.4, '#fdf6e6', line('#fdf6e6', 0.9));
      blob(ctx, -4.4, -3.4, 1.5, 1.2, SHEET.butter, { line: 0 });
      // Nori sheet standing in the broth, and a slice of pork.
      shapeOf(
        ctx,
        [
          [1.6, -3],
          [6.4, -4.6],
          [7, -0.6],
          [2.2, 0.4],
        ],
        '#2f3a3c',
        line('#2f3a3c', 0.9),
      );
      blob(ctx, 0.4, -4.6, 3, 1.8, accent, line(accent, 0.9));
      ctx.fillStyle = SHEET.leaf;
      for (const [dx, dy] of [[-1.4, -1.4], [3.4, -1], [-6, -0.6]] as const) {
        ctx.beginPath();
        ctx.arc(dx, dy, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      steam(ctx, 0, -7.4);
    },
  },
  sushi: {
    plate: 'board',
    draw: (ctx, colour, accent) => {
      for (let i = 0; i < 3; i++) {
        const x = -7.6 + i * 5.8;
        panel(ctx, x, -6, 5.2, 6, 2.2, colour, line(colour));
        panel(ctx, x - 0.5, -8.2, 6.2, 3.2, 1.6, accent, line(accent));
      }
      // Ginger and a dab of wasabi on the near corner of the board.
      blob(ctx, 9.4, -1.6, 2.4, 1.4, '#f2c9c2', line('#f2c9c2', 0.8));
      blob(ctx, 6.6, -1.2, 1.8, 1.4, SHEET.mintDeep, line(SHEET.mintDeep, 0.8));
    },
  },
  steak: {
    plate: 'round',
    draw: (ctx, colour, accent) => {
      panel(ctx, -9.4, -9.4, 17, 8.4, 4, colour, line(colour, LINE));
      // Griddle marks, a pat of butter melting on top, sides beside it.
      ctx.strokeStyle = withAlpha(inkOf(colour, 0.6), 0.8);
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-7 + i * 5, -8.6);
        ctx.lineTo(-4.4 + i * 5, -2);
        ctx.stroke();
      }
      panel(ctx, -2.6, -11, 5.2, 2.6, 1.2, SHEET.butter, line(SHEET.butter, 0.9));
      blob(ctx, 8, -3.4, 3, 2.4, shade(accent, 1.2), line(accent, 0.9));
      greens(ctx, -10.4, -1);
    },
  },
  dessertTower: {
    plate: 'round',
    draw: (ctx, colour, accent) => {
      for (let i = 0; i < 3; i++) {
        panel(ctx, -6.4 + i * 0.7, -5 - i * 4.4, 12.8 - i * 1.4, 4.4, 1.6, colour, line(colour));
        blob(ctx, 0, -5.4 - i * 4.4, 5.4 - i * 0.6, 1.6, '#fffaf0', { line: 0.9 });
      }
      blob(ctx, 0, -18.6, 2.4, 2.2, accent, line(accent, 0.9));
      blob(ctx, -3.4, -17.4, 1.8, 1.6, '#e0523c', line('#e0523c', 0.8));
      ctx.strokeStyle = SHEET.leafDeep;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -20.4);
      ctx.lineTo(1.4, -22);
      ctx.stroke();
    },
  },
  skewer: {
    plate: 'round',
    draw: (ctx, colour, accent) => {
      ctx.strokeStyle = SHEET.oakLight;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-10, -8.4);
      ctx.lineTo(9, -1);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(-5.4 + i * 5.2, -7 + i * 2.2);
        ctx.rotate(0.4);
        blob(ctx, 0, 0, 3.4, 2.7, i % 2 === 0 ? colour : accent, line(colour));
        ctx.restore();
      }
      greens(ctx, -10, -0.6);
    },
  },
  // Everything the sheet does not draw: a plated main in the same hand.
  plated: {
    plate: 'round',
    draw: (ctx, colour, accent) => {
      mound(ctx, -1, -1.4, 8, 3.4, colour);
      blob(ctx, 3.4, -5.4, 3.4, 2.4, shade(accent, 1.1), line(accent, 0.9));
      blob(ctx, -4.6, -5, 2.6, 1.9, shade(colour, 1.18), line(colour, 0.9));
      greens(ctx, -9.4, -0.8);
    },
  },
};

/** A berry colour that alternates across a stack without needing a counter. */
function berryTone(x: number): string {
  return x < 0 ? '#7e3a63' : '#c0405f';
}

/** Where a plate style lands when the sheet does not draw that dish by name. */
export const PLATE_ART: Record<PlateStyle, DishArtId> = {
  burger: 'burger',
  salad: 'salad',
  fries: 'fries',
  bowl: 'soup',
  plate: 'plated',
  slice: 'pizza',
  cake: 'chocCake',
  cup: 'icedCoffee',
  sushi: 'sushi',
  skewer: 'skewer',
};

/** The fourteen dishes the sheet draws by name. */
export const DISH_ART: Record<string, DishArtId> = {
  house_burger: 'burger',
  garden_salad: 'salad',
  crispy_fries: 'fries',
  tomato_soup: 'soup',
  cheese_omelette: 'omelette',
  iced_coffee: 'icedCoffee',
  margherita: 'pizza',
  fish_and_chips: 'fishChips',
  berry_pancakes: 'pancakes',
  choc_cake: 'chocCake',
  ramen_bowl: 'ramen',
  salmon_sushi: 'sushi',
  prime_steak: 'steak',
  grand_dessert: 'dessertTower',
};

/** The sprite a dish is served as. */
export function artFor(dish: Dish): DishArtId {
  return DISH_ART[dish.id] ?? PLATE_ART[dish.plate];
}

// -------------------------------------------------------------- the plates

/**
 * The plate under a meal. It carries the same warm dark line the people and the
 * furniture do, so a dish on a table is not the one crisp-edged thing in a room
 * of lined shapes.
 */
function drawPlateBase(ctx: CanvasRenderingContext2D, kind: PlateKind): void {
  if (kind === 'bare') return;
  ctx.fillStyle = 'rgba(74, 44, 26, 0.22)';
  ctx.beginPath();
  ctx.ellipse(1, 1.8, 13.5, 5.4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (kind === 'board') {
    panel(ctx, -14, -3.6, 28, 8, 2, SHEET.cream, line(SHEET.cream, LINE));
    ctx.fillStyle = withAlpha(SHEET.creamShade, 0.5);
    ctx.fillRect(-12, 1.4, 24, 1.4);
    return;
  }
  if (kind === 'bowl') {
    blob(ctx, 0, 0, 12.6, 6.2, '#fdfaf2', line('#fdfaf2', LINE));
    blob(ctx, 0, 0.4, 9.6, 4.4, mix('#fdfaf2', SHEET.creamShade, 0.45), { line: 0 });
    return;
  }
  blob(ctx, 0, 0, 14, 6.4, '#fdfaf2', line('#fdfaf2', LINE));
  blob(ctx, 0, 0.3, 10.2, 4.4, mix('#fdfaf2', SHEET.creamShade, 0.3), { line: 0 });
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(0, -0.6, 12.6, 5.4, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
}

export interface PlatedDishOptions {
  /** Waiting to be collected: adds a warm pool of light behind the plate. */
  ready?: boolean;
}

/** A plated dish, sized to sit on a table or a tray. */
export function drawPlatedDish(
  ctx: CanvasRenderingContext2D,
  dish: Dish,
  cx: number,
  cy: number,
  scale = 1,
  opts: PlatedDishOptions = {},
): void {
  const art = DISH_SPRITES[artFor(dish)];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  if (opts.ready) {
    const g = ctx.createRadialGradient(0, -3, 0, 0, -3, 26);
    g.addColorStop(0, 'rgba(255, 220, 140, 0.6)');
    g.addColorStop(1, 'rgba(255, 220, 140, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -3, 26, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawPlateBase(ctx, art.plate);
  art.draw(ctx, dish.color, dish.accent);
  ctx.restore();
}

/** A round tray with a plate on it, for a waiter carrying a dish out. */
export function drawTray(ctx: CanvasRenderingContext2D, dish: Dish): void {
  blob(ctx, 0, 0, 11.5, 5.2, SHEET.oak, { line: LINE, outline: inkOf(SHEET.oak, 0.5) });
  blob(ctx, 0, -1, 8.6, 3.6, SHEET.oakLight, { line: 0 });
  drawPlatedDish(ctx, dish, 0, -3, 0.62);
}
