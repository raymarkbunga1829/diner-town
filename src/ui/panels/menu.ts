import { audio } from '../../engine/audio';
import {
  DISHES,
  dishCookTime,
  dishIngredientCost,
  dishMasteryProgress,
  dishPrice,
  MAX_DISH_LEVEL,
  recipeText,
  type Dish,
} from '../../game/data/dishes';
import { INGREDIENTS, type IngredientId } from '../../game/data/ingredients';
import { unlockLabel } from '../../game/progression';
import type { AppApi, Panel } from '../api';
import { el, fmt, plural } from '../dom';
import { iconSvg } from '../icons';
import { chip, dishIcon, emptyState, meter } from './common';

type Tab = 'menu' | 'all' | 'locked';

/** How many more servings the pantry can support for a dish right now. */
function servingsInStock(app: AppApi, dish: Dish): number {
  let min = Infinity;
  for (const [id, qty] of Object.entries(dish.recipe)) {
    const have = app.game.pantryCount(id as IngredientId);
    min = Math.min(min, Math.floor(have / (qty ?? 1)));
  }
  return Number.isFinite(min) ? min : 0;
}

function missingIngredients(app: AppApi, dish: Dish): string[] {
  const out: string[] = [];
  for (const [id, qty] of Object.entries(dish.recipe)) {
    if (app.game.pantryCount(id as IngredientId) < (qty ?? 0)) {
      out.push(INGREDIENTS[id as IngredientId].name);
    }
  }
  return out;
}

export function createMenuPanel(app: AppApi): Panel {
  let tab: Tab = 'menu';

  return {
    title: 'Recipes & Menu',
    subtitle: () =>
      `${app.game.data.menu.length} of ${app.game.menuCapacity} menu slots used · cook a dish often to master it`,
    tabs: [
      { id: 'menu', label: 'On the menu' },
      { id: 'all', label: 'Available' },
      { id: 'locked', label: 'Coming soon' },
    ],
    activeTab: tab,
    onTab: (id) => {
      tab = id as Tab;
    },
    render(body) {
      let dishes: Dish[];
      if (tab === 'menu') {
        dishes = app.game.data.menu
          .map((id) => DISHES.find((d) => d.id === id))
          .filter((d): d is Dish => Boolean(d));
      } else if (tab === 'all') {
        dishes = DISHES.filter((d) => app.game.unlocked(d) && !app.game.isOnMenu(d.id));
      } else {
        dishes = DISHES.filter((d) => !app.game.unlocked(d));
      }

      if (!dishes.length) {
        body.append(
          emptyState(
            tab === 'menu'
              ? 'Your menu is empty. Add a dish so customers have something to order.'
              : tab === 'all'
                ? 'Everything you have unlocked is already on the menu.'
                : 'You have unlocked every recipe. Impressive.',
          ),
        );
        return;
      }

      const list = el('div', { class: 'list' });
      for (const dish of dishes) list.append(dishRow(app, dish, tab));
      body.append(list);
    },
  };
}

function dishRow(app: AppApi, dish: Dish, tab: Tab): HTMLElement {
  const locked = tab === 'locked';
  const mastery = dishMasteryProgress(app.game.dishServings(dish.id));
  const price = dishPrice(dish, mastery.level);
  const cost = dishIngredientCost(dish);
  const margin = price - cost;
  const stock = servingsInStock(app, dish);
  const missing = missingIngredients(app, dish);
  const onMenu = app.game.isOnMenu(dish.id);

  const title = el('div', { class: 'row-title' }, [
    el('span', { text: dish.name }),
    locked
      ? chip(unlockLabel(dish), 'warn')
      : chip(`Lv ${mastery.level}${mastery.level >= MAX_DISH_LEVEL ? ' MAX' : ''}`, 'info'),
    stock > 0 && !locked ? chip(`${plural(stock, 'serving')} ready`, stock > 4 ? 'good' : 'warn') : null,
    missing.length && !locked ? chip(`Need ${missing.join(', ')}`, 'warn') : null,
  ].filter(Boolean) as Node[]);

  const detail = el('div', { class: 'row-sub' }, [
    el('span', {
      html: `Sells for <b style="color:var(--coin)">${fmt(price)}</b> · ingredients ${fmt(cost)} · margin ${fmt(margin)} · ${dishCookTime(dish, mastery.level).toFixed(1)}s to cook`,
    }),
    el('div', { style: 'margin-top:3px;opacity:.85', text: recipeText(dish) }),
  ]);

  const masteryBar = locked
    ? null
    : el('div', {}, [
        meter(mastery.level >= MAX_DISH_LEVEL ? 1 : mastery.into / mastery.span, '#b18ad8'),
        el('div', {
          class: 'row-sub',
          style: 'margin-top:3px',
          text:
            mastery.level >= MAX_DISH_LEVEL
              ? 'Fully mastered'
              : `${Math.floor(mastery.into)}/${mastery.span} servings to level ${mastery.level + 1} (+12% price)`,
        }),
      ]);

  const action = locked
    ? chip(`Unlocks at ${unlockLabel(dish).toLowerCase()}`, 'warn')
    : el('button', {
        class: `btn ${onMenu ? 'danger' : 'primary'}`,
        html: onMenu ? 'Remove' : `${iconSvg('plus', 14)} Add`,
        onclick: () => {
          const result = app.game.toggleMenu(dish.id);
          if (result === 'full') {
            audio.play('error');
            app.toast(
              `Menu is full (${app.game.menuCapacity} slots). ${
                app.game.atLevelCap ? 'Fame stars buy more.' : 'Level up for more.'
              }`,
              'bad',
            );
          } else {
            audio.play(result === 'added' ? 'bell' : 'tap');
            app.toast(
              result === 'added' ? `${dish.name} added to the menu` : `${dish.name} removed`,
              'good',
            );
            app.save();
          }
          app.refresh();
        },
      });

  return el('div', { class: 'row-item' }, [
    dishIcon(dish, 46),
    el('div', { class: 'row-main' }, [title, detail, masteryBar].filter(Boolean) as Node[]),
    el('div', { class: 'row-actions' }, [action]),
  ]);
}
