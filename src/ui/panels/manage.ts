import { audio } from '../../engine/audio';
import { canExpand, expansionCost, expansionLevel, MAX_GRID } from '../../game/progression';
import { Game } from '../../game/state';
import type { AppApi, Panel } from '../api';
import { el, fmt } from '../dom';
import { iconSvg } from '../icons';
import { chip, meter } from './common';

type Tab = 'overview' | 'ratings' | 'settings';

export function createManagePanel(app: AppApi): Panel {
  let tab: Tab = 'overview';

  return {
    title: 'Manage',
    subtitle: () => app.game.data.restaurantName,
    tabs: [
      { id: 'overview', label: 'Overview' },
      { id: 'ratings', label: 'Reputation' },
      { id: 'settings', label: 'Settings' },
    ],
    activeTab: tab,
    onTab: (id) => {
      tab = id as Tab;
    },
    render(body) {
      if (tab === 'overview') renderOverview(app, body);
      else if (tab === 'ratings') renderRatings(app, body);
      else renderSettings(app, body);
    },
  };
}

function kv(label: string, value: string): HTMLElement {
  return el('div', { class: 'kv' }, [
    el('span', { text: label }),
    el('span', { text: value }),
  ]);
}

function renderOverview(app: AppApi, body: HTMLElement): void {
  const d = app.game.data;
  const s = d.stats;

  body.append(
    el('div', { class: 'card', style: 'margin-bottom:10px' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'name', text: d.open ? 'Open for business' : 'Closed to customers' }),
        el('button', {
          class: `btn ${d.open ? 'danger' : 'green'}`,
          text: d.open ? 'Close up' : 'Open up',
          onclick: () => {
            d.open = !d.open;
            app.game.touch();
            app.save();
            audio.play('tap');
            app.toast(d.open ? 'Doors open, service is on' : 'Closed — no new customers', 'info');
            app.refresh();
          },
        }),
      ]),
      el('div', {
        class: 'desc',
        text: 'Close the restaurant while you rearrange the floor so guests do not walk out unhappy.',
      }),
    ]),
  );

  const size = d.gridSize;
  const canGrow = canExpand(size);
  const cost = expansionCost(size);
  const needLevel = expansionLevel(size);
  const eligible = canGrow && d.level >= needLevel;

  body.append(
    el('div', { class: 'card', style: 'margin-bottom:10px' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'name', text: `Dining room · ${size} x ${size}` }),
        canGrow
          ? el('button', {
              class: 'btn primary',
              html: `${iconSvg('expand', 13)} ${fmt(cost)}`,
              disabled: !eligible || !app.game.canAfford(cost),
              onclick: async () => {
                const ok = await app.confirm({
                  title: 'Extend the dining room?',
                  message: `Grow the floor to ${size + 2} x ${size + 2} for ${fmt(cost)} coins.`,
                  confirmLabel: 'Build it',
                });
                if (!ok || !app.game.spend(cost)) return;
                d.gridSize = size + 2;
                d.doorX = Math.floor(d.gridSize / 2);
                app.game.touch();
                app.save();
                audio.play('levelup');
                app.toast(`Dining room extended to ${d.gridSize} x ${d.gridSize}`, 'good');
                app.refresh();
              },
            })
          : chip(`Maximum size (${MAX_GRID} x ${MAX_GRID})`, 'good'),
      ]),
      el('div', {
        class: 'desc',
        text: canGrow
          ? eligible
            ? 'More floor space means more tables, and more tables means more covers.'
            : `Reach level ${needLevel} to unlock the next extension.`
          : 'You have built out the whole plot.',
      }),
    ]),
  );

  body.append(
    el('div', { class: 'section-title', text: 'Lifetime figures' }),
    el('div', { class: 'card' }, [
      kv('Coins earned', fmt(s.totalEarned)),
      kv('Coins spent', fmt(s.totalSpent)),
      kv('Customers served', fmt(s.customersServed)),
      kv('Customers lost', fmt(s.customersLost)),
      kv('Dishes cooked', fmt(s.dishesCooked)),
      kv('Days trading', fmt(s.daysOpen)),
      kv(
        'Service success',
        s.customersServed + s.customersLost > 0
          ? `${Math.round((s.customersServed / (s.customersServed + s.customersLost)) * 100)}%`
          : '—',
      ),
    ]),
  );
}

function renderRatings(app: AppApi, body: HTMLElement): void {
  const g = app.game;
  const rows: Array<{ label: string; value: number; weight: string; tip: string }> = [
    {
      label: 'Style',
      value: g.styleScore,
      weight: '30%',
      tip: `Ambience ${fmt(g.ambience)} of ${fmt(g.ambienceTarget)} needed for this many seats. Buy decor to raise it.`,
    },
    {
      label: 'Service',
      value: g.serviceScore,
      weight: '25%',
      tip: 'Rises when guests are served quickly and falls when they walk out. Hire more waiters and chefs.',
    },
    {
      label: 'Cleanliness',
      value: g.cleanlinessScore,
      weight: '20%',
      tip: 'Dirty tables cannot be reseated. A dedicated cleaner keeps this at full marks.',
    },
    {
      label: 'Menu',
      value: g.menuScore,
      weight: '25%',
      tip: 'Improves with more appealing dishes and higher mastery levels.',
    },
  ];

  body.append(
    el('div', { class: 'card', style: 'margin-bottom:10px' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'name', text: `${g.rating.toFixed(1)} out of 5 stars` }),
        chip(`A guest arrives every ~${g.spawnInterval.toFixed(1)}s`, 'info'),
      ]),
      el('div', {
        class: 'desc',
        text: 'Your star rating decides how quickly customers show up. Every point below feeds into it.',
      }),
    ]),
  );

  const list = el('div', { class: 'list' });
  for (const row of rows) {
    list.append(
      el('div', { class: 'row-item', style: 'align-items:flex-start' }, [
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title' }, [
            el('span', { text: row.label }),
            chip(`${Math.round(row.value * 100)}%`, row.value > 0.6 ? 'good' : row.value > 0.3 ? 'info' : 'warn'),
            chip(`weight ${row.weight}`),
          ]),
          meter(row.value, row.value > 0.6 ? '#6fc07a' : row.value > 0.3 ? '#e8b53c' : '#e4705f'),
          el('div', { class: 'row-sub', style: 'margin-top:5px', text: row.tip }),
        ]),
      ]),
    );
  }
  body.append(list);
}

function renderSettings(app: AppApi, body: HTMLElement): void {
  const s = app.game.data.settings;

  const toggleRow = (
    label: string,
    description: string,
    value: boolean,
    onToggle: (next: boolean) => void,
  ): HTMLElement =>
    el('div', { class: 'row-item' }, [
      el('div', { class: 'row-main' }, [
        el('div', { class: 'row-title', text: label }),
        el('div', { class: 'row-sub', text: description }),
      ]),
      el('button', {
        class: `btn ${value ? 'green' : 'ghost'}`,
        text: value ? 'On' : 'Off',
        onclick: () => {
          onToggle(!value);
          app.save();
          app.refresh();
        },
      }),
    ]);

  const speeds: Array<1 | 2 | 3> = [1, 2, 3];

  body.append(
    el('div', { class: 'list' }, [
      el('div', { class: 'row-item' }, [
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title', text: 'Restaurant name' }),
          el('div', { class: 'row-sub', text: app.game.data.restaurantName }),
        ]),
        el('button', {
          class: 'btn',
          text: 'Rename',
          onclick: async () => {
            const name = await app.promptText(
              'Rename your restaurant',
              'This is the name shown on your sign.',
              app.game.data.restaurantName,
            );
            if (!name) return;
            app.game.data.restaurantName = name;
            app.game.touch();
            app.save();
            app.refresh();
          },
        }),
      ]),
      el('div', { class: 'row-item' }, [
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title', text: 'Game speed' }),
          el('div', { class: 'row-sub', text: 'Run the day faster once you know what you are doing.' }),
        ]),
        el(
          'div',
          { class: 'stepper' },
          speeds.map((v) =>
            el('button', {
              class: s.speed === v ? 'btn primary' : 'btn ghost',
              style: 'padding:5px 10px',
              text: `${v}x`,
              onclick: () => {
                s.speed = v;
                app.save();
                app.refresh();
              },
            }),
          ),
        ),
      ]),
      toggleRow('Sound effects', 'Little chimes for coins, cooking and level ups.', !s.muted, (next) => {
        s.muted = !next;
        audio.setMuted(s.muted);
      }),
      toggleRow('Show floor grid', 'Handy when you are planning a layout.', s.showGrid, (next) => {
        s.showGrid = next;
      }),
    ]),
  );

  body.append(
    el('div', { class: 'section-title', text: 'Danger zone' }),
    el('div', { class: 'card' }, [
      el('div', { class: 'desc', text: 'Wipe your save and start a brand new restaurant from scratch.' }),
      el('button', {
        class: 'btn danger block',
        style: 'margin-top:8px',
        text: 'Start over',
        onclick: async () => {
          const ok = await app.confirm({
            title: 'Delete this restaurant?',
            message: 'Your coins, staff, recipes and layout will all be lost. This cannot be undone.',
            confirmLabel: 'Delete everything',
            danger: true,
          });
          if (!ok) return;
          Game.wipe();
          window.location.reload();
        },
      }),
    ]),
  );
}
