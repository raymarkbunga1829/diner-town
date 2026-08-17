import { audio } from '../../engine/audio';
import { DISHES_BY_ID } from '../../game/data/dishes';
import {
  AISLE_LABELS,
  INGREDIENTS,
  INGREDIENT_LIST,
  type Ingredient,
} from '../../game/data/ingredients';
import { RESTOCK_INTERVAL } from '../../game/state';
import type { AppApi, Panel } from '../api';
import { el, fmt } from '../dom';
import { iconSvg } from '../icons';
import { chip, ingredientIcon, meter } from './common';

type Aisle = Ingredient['aisle'] | 'menu';

const AISLES: Array<{ id: Aisle; label: string }> = [
  { id: 'menu', label: 'For my menu' },
  { id: 'produce', label: AISLE_LABELS.produce },
  { id: 'butcher', label: AISLE_LABELS.butcher },
  { id: 'dairy', label: AISLE_LABELS.dairy },
  { id: 'bakery', label: AISLE_LABELS.bakery },
  { id: 'pantry', label: AISLE_LABELS.pantry },
];

/** Every ingredient required by something currently on the menu. */
function menuIngredients(app: AppApi): Ingredient[] {
  const needed = new Set<string>();
  for (const dishId of app.game.data.menu) {
    const dish = DISHES_BY_ID[dishId];
    if (!dish) continue;
    for (const id of Object.keys(dish.recipe)) needed.add(id);
  }
  return INGREDIENT_LIST.filter((i) => needed.has(i.id));
}

export function createMarketPanel(app: AppApi): Panel {
  let tab: Aisle = 'menu';

  return {
    title: 'Market',
    subtitle: () => {
      const remaining = Math.max(
        0,
        Math.ceil(app.game.data.nextRestockAt - app.game.data.clock),
      );
      return `Deliveries every ${RESTOCK_INTERVAL}s · next in ${remaining}s`;
    },
    tabs: AISLES.map((a) => ({ id: a.id, label: a.label })),
    activeTab: tab,
    onTab: (id) => {
      tab = id as Aisle;
    },
    render(body) {
      const list = tab === 'menu' ? menuIngredients(app) : INGREDIENT_LIST.filter((i) => i.aisle === tab);

      if (tab === 'menu') {
        body.append(restockCard(app));
      }

      const wrap = el('div', { class: 'list' });
      for (const ing of list) {
        wrap.append(ingredientRow(app, ing));
      }
      if (!list.length) {
        wrap.append(el('div', { class: 'empty', text: 'Add dishes to your menu first.' }));
      }
      body.append(wrap);
    },
  };
}

function restockCard(app: AppApi): HTMLElement {
  const PER_DISH = 12;
  const { cost, missing } = app.game.restockMenuCost(PER_DISH);
  const affordable = app.game.canAfford(cost);

  return el(
    'div',
    {
      class: 'card',
      style: 'margin-bottom:10px',
    },
    [
      el('div', { class: 'name', text: 'Top up the pantry' }),
      el('div', {
        class: 'desc',
        text: cost
          ? `Buys enough for about ${PER_DISH} servings of every dish on your menu.`
          : 'Your pantry is already well stocked for the current menu.',
      }),
      el('div', { class: 'row' }, [
        el('span', {
          class: `price${!affordable && cost > 0 ? ' cant' : ''}`,
          html: `${iconSvg('coin', 13)} ${fmt(cost)}`,
          style: 'display:inline-flex;align-items:center;gap:4px',
        }),
        el('button', {
          class: 'btn green',
          text: cost ? 'Buy all' : 'Stocked',
          disabled: !cost || !affordable,
          onclick: () => {
            let bought = 0;
            for (const [id, qty] of missing) bought += app.game.buyIngredient(id, qty);
            audio.play(bought ? 'coin' : 'error');
            app.toast(bought ? `Bought ${fmt(bought)} ingredients` : 'Could not buy anything', bought ? 'good' : 'bad');
            app.refresh();
          },
        }),
      ]),
    ],
  );
}

function ingredientRow(app: AppApi, ing: Ingredient): HTMLElement {
  const pantry = app.game.pantryCount(ing.id);
  const stock = app.game.marketCount(ing.id);
  const def = INGREDIENTS[ing.id];

  const buy = (qty: number): void => {
    const got = app.game.buyIngredient(ing.id, qty);
    if (!got) {
      audio.play('error');
      app.toast(stock === 0 ? `${ing.name} is sold out` : 'Not enough coins', 'bad');
    } else {
      audio.play('coin');
    }
    app.refresh();
  };

  const maxAffordable = Math.min(stock, Math.floor(app.game.coins / def.price));

  return el('div', { class: 'row-item' }, [
    ingredientIcon(ing, 40),
    el('div', { class: 'row-main' }, [
      el('div', { class: 'row-title' }, [
        el('span', { text: ing.name }),
        chip(`${fmt(pantry)} in pantry`, pantry > 8 ? 'good' : pantry > 0 ? 'warn' : ''),
      ]),
      el('div', {
        class: 'row-sub',
        text: `${fmt(def.price)} coins each · ${fmt(stock)} available today`,
      }),
      meter(stock / def.maxStock, stock > def.maxStock * 0.3 ? '#6fc07a' : '#e8b53c'),
    ]),
    el('div', { class: 'row-actions' }, [
      el('button', {
        class: 'btn',
        text: '+1',
        disabled: stock < 1 || app.game.coins < def.price,
        onclick: () => buy(1),
      }),
      el('button', {
        class: 'btn primary',
        text: '+10',
        disabled: maxAffordable < 1,
        onclick: () => buy(Math.min(10, maxAffordable)),
      }),
    ]),
  ]);
}
