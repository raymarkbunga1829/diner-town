import { audio } from '../../engine/audio';
import {
  FURNITURE,
  ROLE_LABELS,
  SHOP_TABS,
  type FurnitureDef,
  type ShopTab,
} from '../../game/data/furniture';
import type { AppApi, Panel } from '../api';
import { el, fmt } from '../dom';
import { iconSvg } from '../icons';
import { chip, emptyState, furniturePreview } from './common';

/** Extra stat chips that explain what a piece actually does in the sim. */
function statChips(def: FurnitureDef): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (def.seats) out.push(chip(`Seats ${def.seats}`, 'info'));
  if (def.tableCapacity) out.push(chip(`Up to ${def.tableCapacity} chairs`, 'info'));
  if (def.speed && def.role === 'stove') out.push(chip(`${def.speed.toFixed(2)}x cook`, 'good'));
  if (def.speed && def.role === 'sink') out.push(chip(`${def.speed.toFixed(2)}x clean`, 'good'));
  if (def.slots) out.push(chip(`${def.slots} plate slots`, 'good'));
  if (def.comfort && def.comfort > 1) {
    out.push(chip(`+${Math.round((def.comfort - 1) * 100)}% tips`, 'good'));
  }
  if (def.ambience > 0) out.push(chip(`+${def.ambience} style`, 'good'));
  if (def.ambience < 0) out.push(chip(`${def.ambience} style`, 'warn'));
  return out;
}

export function createShopPanel(app: AppApi): Panel {
  let tab: ShopTab = 'Tables';

  return {
    title: 'Furniture Shop',
    subtitle: () => 'Buy it here, then tap a tile to place it.',
    tabs: SHOP_TABS.map((t) => ({ id: t, label: t })),
    activeTab: tab,
    onTab: (id) => {
      tab = id as ShopTab;
    },
    render(body) {
      const level = app.game.data.level;
      const items = FURNITURE.filter((f) => ROLE_LABELS[f.role] === tab);
      if (!items.length) {
        body.append(emptyState('Nothing here yet.'));
        return;
      }

      const grid = el('div', { class: 'grid' });
      for (const def of items) {
        const locked = def.unlockLevel > level;
        const affordable = app.game.canAfford(def.price);

        const card = el('div', { class: `card${locked ? ' locked' : ''}` }, [
          furniturePreview(def),
          el('div', { class: 'name', text: def.name }),
          el('div', { class: 'desc', text: def.description }),
          el(
            'div',
            { style: 'display:flex;flex-wrap:wrap;gap:4px' },
            statChips(def),
          ),
          el('div', { class: 'row' }, [
            el('span', {
              class: `price${!affordable && !locked ? ' cant' : ''}`,
              html: `${iconSvg('coin', 13, 'currentColor')} ${fmt(def.price)}`,
              style: 'display:inline-flex;align-items:center;gap:4px',
            }),
            locked
              ? chip(`Level ${def.unlockLevel}`, 'warn')
              : el('button', {
                  class: 'btn primary',
                  text: 'Place',
                  disabled: !affordable,
                  onclick: () => {
                    audio.play('tap');
                    app.startPlacing(def.id);
                  },
                }),
          ]),
        ]);
        grid.append(card);
      }
      body.append(grid);
    },
  };
}
