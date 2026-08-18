import { audio } from '../../engine/audio';
import { DISHES_BY_ID } from '../../game/data/dishes';
import { REGULARS_BY_ID } from '../../game/data/regulars';
import {
  canExpand,
  DAY_LENGTH,
  dayNumber,
  expansionCost,
  expansionLevel,
  fameForStar,
  fameProgress,
  fameTitle,
  MAX_GRID,
  MAX_LEVEL,
  STAR_REWARDS,
  unlocksAtStar,
} from '../../game/progression';
import { favouriteFor, regularLook, regularUnlocked } from '../../game/regulars';
import {
  BACKUP_KEY,
  Game,
  importSaveText,
  installSave,
  slotInfo,
  writeSlot,
  type SaveSlotInfo,
} from '../../game/state';
import type { AppApi, Panel } from '../api';
import { el, fmt, plural } from '../dom';
import { iconSvg } from '../icons';
import { chip, meter, personIcon } from './common';

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
                // The doorway moves with the wall, so refund anything now hanging in it.
                const displaced = d.placed.filter((p) => p.ty === -1 && p.tx === d.doorX);
                for (const p of displaced) {
                  const pieceDef = app.game.defOf(p);
                  if (pieceDef) app.game.earn(Math.floor(pieceDef.price * 0.55));
                  app.sim.removeFixture(p);
                }
                if (displaced.length) {
                  app.toast('Wall decor in the new doorway was sold back to you', 'info');
                }
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

  const recap = d.lastRecap;
  if (recap) {
    body.append(
      el('div', { class: 'section-title', text: `Day ${recap.day}` }),
      el('div', { class: 'card' }, [
        kv('Covers served', fmt(recap.covers)),
        kv('Walked out', fmt(recap.walkouts)),
        kv('Dish takings', fmt(recap.dishEarnings + recap.tips)),
        kv(
          'Wages paid',
          recap.wagesPaid < recap.wages
            ? `${fmt(recap.wagesPaid)} of ${fmt(recap.wages)}`
            : fmt(recap.wages),
        ),
        el('div', { class: 'desc', text: `Next: ${recap.action.label}` }),
      ]),
    );
  }

  renderFame(app, body);
  renderRegulars(app, body);

  body.append(
    el('div', { class: 'section-title', text: 'Lifetime figures' }),
    el('div', { class: 'card' }, [
      kv('Coins earned', fmt(s.totalEarned)),
      kv('Coins spent', fmt(s.totalSpent)),
      kv('Customers served', fmt(s.customersServed)),
      kv('Customers lost', fmt(s.customersLost)),
      kv('Dishes cooked', fmt(s.dishesCooked)),
      kv('Tables wiped', fmt(s.tablesCleaned)),
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

/**
 * The endgame track. Once the restaurant level caps out, experience becomes
 * fame, and the first five stars each hand over something real. Hidden entirely
 * before then, so a diner on day three is never shown a goal it cannot chase.
 */
function renderFame(app: AppApi, body: HTMLElement): void {
  const g = app.game;
  if (!g.atLevelCap && g.data.fame <= 0) return;

  const fame = fameProgress(g.data.fame);
  const title = fameTitle(fame.star);

  body.append(
    el('div', { class: 'section-title', text: 'Fame' }),
    el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'name', text: title ?? 'Word is getting around' }),
        chip(plural(fame.star, 'star'), fame.star > 0 ? 'good' : 'info'),
      ]),
      meter(fame.into / fame.span, '#e8b53c'),
      el('div', {
        class: 'desc',
        style: 'margin-top:6px',
        text: `${fmt(Math.floor(fame.into))} of ${fmt(fame.span)} fame towards star ${fame.star + 1}. Every scrap of experience your kitchen earns past level ${MAX_LEVEL} counts, so the bar keeps moving for as long as you keep serving.`,
      }),
    ]),
  );

  const list = el('div', { class: 'list' });
  for (const reward of STAR_REWARDS) {
    const earned = fame.star >= reward.star;
    const unlocks = unlocksAtStar(reward.star);
    const brings = [
      ...unlocks.dishes.map((name) => `${name} on the recipe list`),
      ...unlocks.furniture.map((name) => `${name} in the shop`),
      ...unlocks.regulars.map((name) => `${name} starts dropping in`),
      ...(reward.menuSlots ? [plural(reward.menuSlots, 'extra menu slot')] : []),
      ...(reward.staffSlots ? [plural(reward.staffSlots, 'extra staff position')] : []),
    ];
    list.append(
      el('div', { class: 'row-item', style: 'align-items:flex-start' }, [
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title' }, [
            el('span', { text: `Star ${reward.star} · ${reward.title}` }),
            earned ? chip('Earned', 'good') : chip(`${fmt(fameForStar(reward.star))} fame`, 'warn'),
          ]),
          el('div', { class: 'row-sub', text: reward.note }),
          brings.length ? el('div', { class: 'row-sub', style: 'margin-top:4px', text: brings.join(' · ') }) : null,
        ].filter(Boolean) as Node[]),
      ]),
    );
  }
  body.append(list);
}

/**
 * Who keeps coming back, what they hope to be served and when they are next
 * due. The favourite is the actionable part: it is drawn from the current menu,
 * so dropping a dish quietly changes what a regular will ask for.
 */
function renderRegulars(app: AppApi, body: HTMLElement): void {
  const g = app.game;
  // Faces the diner has not earned yet stay off the list entirely, so a level
  // or a star introduces somebody rather than ticking off a name in a table.
  const roster = g.data.regulars
    .filter((r) => {
      const def = REGULARS_BY_ID[r.id];
      return !!def && regularUnlocked(def, g.data.level, g.stars);
    })
    .sort((a, b) => a.nextVisitAt - b.nextVisitAt);
  if (!roster.length) return;

  const list = el('div', { class: 'list' });
  for (const state of roster) {
    const def = REGULARS_BY_ID[state.id]!;
    const favourite = state.favouriteDishId ?? favouriteFor(def, g.data.menu);
    const dish = favourite ? DISHES_BY_ID[favourite] : undefined;
    const onMenu = !!favourite && g.data.menu.includes(favourite);
    const due = state.nextVisitAt - g.data.clock;
    const days = due / DAY_LENGTH;

    list.append(
      el('div', { class: 'row-item', style: 'align-items:flex-start' }, [
        personIcon(regularLook(def), 46),
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title' }, [
            el('span', { text: def.name }),
            due <= 0
              ? chip('Due now', 'good')
              : chip(days < 1 ? 'Due today' : `In ${Math.round(days)} days`, 'info'),
          ]),
          el('div', {
            class: 'row-sub',
            text: dish
              ? `Hopes for ${dish.name}${onMenu ? '' : ' — not on your menu'}`
              : 'Put something on the menu and they will find a favourite',
          }),
          el('div', {
            class: 'row-sub',
            text: `${plural(state.visits, 'visit')} · ${state.delighted} delighted · ${state.walkouts} walked out`,
          }),
          el('div', { class: 'row-sub', style: 'margin-top:4px', text: def.note }),
        ]),
      ]),
    );
  }

  body.append(el('div', { class: 'section-title', text: 'Regulars' }), list);
}

function renderRatings(app: AppApi, body: HTMLElement): void {
  const g = app.game;
  const rows: Array<{ label: string; value: number; weight: string; tip: string }> = [
    {
      label: 'Style',
      value: g.styleScore,
      weight: '30%',
      tip: `Ambience ${fmt(g.ambience)} of ${fmt(g.ambienceTarget)} for a dining room this size. Chairs and tables never cost you Style; the first few pieces of decor move it the most, and a bigger floor asks for more of them.`,
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

  const chairs = g.chairCount;
  const usable = g.usableSeatCount;
  const offline = usable - g.openSeatCount;

  body.append(
    el('div', { class: 'card', style: 'margin-bottom:10px' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'name', text: `${g.rating.toFixed(1)} out of 5 stars` }),
        chip(`A guest arrives every ~${g.spawnInterval.toFixed(1)}s`, 'info'),
      ]),
      el('div', { class: 'row', style: 'justify-content:flex-start;flex-wrap:wrap' }, [
        usable < chairs
          ? chip(`${usable} of ${chairs} chairs can be sat in`, 'warn')
          : chip(plural(usable, 'usable seat'), 'good'),
        ...(offline > 0 ? [chip(`${offline} behind dirty tables`, 'warn')] : []),
      ]),
      el('div', {
        class: 'desc',
        text: 'Your star rating and the seats you can actually fill decide how quickly customers show up. A chair only counts when it touches a table someone can walk up to, and a dirty table takes its seats out of service.',
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

  renderSaveTools(app, body);

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
            message:
              'Your coins, staff, recipes and layout are all cleared. A copy goes to the backup slot, but copy your save out first if you want to keep this diner for good.',
            confirmLabel: 'Delete everything',
            danger: true,
          });
          if (!ok) return;
          app.game.saveTo(BACKUP_KEY);
          Game.wipe();
          reloadInto(app);
        },
      }),
    ]),
  );
}

/**
 * Everything that gets a diner off this one browser. The save lives in a single
 * `localStorage` key, and a key is one eviction, one cleared site data or one
 * mistap away from gone, so the player is given a copy they own and a second
 * slot to fall back on.
 */
function renderSaveTools(app: AppApi, body: HTMLElement): void {
  const backup = slotInfo(BACKUP_KEY);

  body.append(
    el('div', { class: 'section-title', text: 'Your save' }),
    el('div', { class: 'card' }, [
      el('div', {
        class: 'desc',
        text: 'Your diner is stored in this browser only. Keep a copy of the text and you can bring it back here, or carry it to another browser or phone.',
      }),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn primary',
          text: 'Copy save',
          onclick: () => {
            app.save();
            app.showTextExport({
              title: 'Your diner as text',
              message:
                'Keep this somewhere safe — a note to yourself, a file, an email. Paste it back in to carry on from exactly here.',
              text: app.game.exportText(),
              filename: saveFilename(app.game),
            });
          },
        }),
        el('button', {
          class: 'btn',
          text: 'Load a save',
          onclick: () => void loadSave(app),
        }),
      ]),
    ]),
  );

  body.append(
    el('div', { class: 'card', style: 'margin-top:8px' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'name', text: 'Backup diner' }),
        backup
          ? chip(`Day ${backup.day} · ${fmt(backup.coins)} coins`, 'info')
          : chip('Nothing saved yet'),
      ]),
      el('div', {
        class: 'desc',
        text: backup
          ? `${backup.restaurantName}, kept ${ageLabel(backup.savedAt)}. Restoring swaps it with the diner you are playing now, so neither one is lost.`
          : 'A second copy in this browser, so starting over or a stray tap is not the end of the diner. It is the same browser, so keep the text copy too.',
      }),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn',
          text: backup ? 'Replace backup' : 'Back up now',
          onclick: () => void backUp(app, backup),
        }),
        el('button', {
          class: 'btn',
          text: 'Restore backup',
          disabled: !backup,
          onclick: () => void restoreBackup(app),
        }),
      ]),
    ]),
  );
}

/** `corner-spoon-day-6.json`, so a folder of copies is still readable later. */
function saveFilename(game: Game): string {
  const slug = game.data.restaurantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'diner-town'}-day-${game.dayNumber}.json`;
}

function ageLabel(savedAt: number): string {
  const minutes = Math.round((Date.now() - savedAt) / 60000);
  if (!savedAt || minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${plural(hours, 'hour')} ago`;
  return `${plural(Math.round(hours / 24), 'day')} ago`;
}

/**
 * Paste or pick a save, then say what it is before it replaces anything. The
 * text is only checked here — nothing is written until the player has seen whose
 * diner they are about to load — and a payload that will not open leaves the
 * running game exactly as it was.
 */
async function loadSave(app: AppApi): Promise<void> {
  const text = await app.promptImportText({
    title: 'Load a saved diner',
    message:
      'Paste the text you copied, or pick the file you downloaded. Nothing is replaced until you have seen what is in it.',
    confirmLabel: 'Read it',
  });
  if (text === null) return;

  const read = importSaveText(text);
  if (!read.ok) {
    app.toast(read.message, 'bad');
    return;
  }

  const incoming = read.game.data;
  const ok = await app.confirm({
    title: 'Load this diner?',
    message: `${incoming.restaurantName} — level ${incoming.level}, ${fmt(incoming.coins)} coins on day ${dayNumber(incoming.clock)}. It replaces the diner you are playing now, which is copied to the backup slot first.`,
    confirmLabel: 'Load it',
    danger: true,
  });
  if (!ok) return;

  // The live diner is taken as text before anything moves and only written to
  // the backup slot once the import is safely in place, so a refused write
  // leaves both slots as they were.
  const outgoing = JSON.stringify(app.game.serialise());
  if (!installSave(incoming)) {
    app.toast('This browser would not store the save, so nothing was changed', 'bad');
    return;
  }
  writeSlot(BACKUP_KEY, outgoing);
  reloadInto(app);
}

async function backUp(app: AppApi, existing: SaveSlotInfo | null): Promise<void> {
  if (existing) {
    const ok = await app.confirm({
      title: 'Replace the backup?',
      message: `The backup from day ${existing.day} is overwritten with the diner you are playing now.`,
      confirmLabel: 'Replace it',
    });
    if (!ok) return;
  }
  if (!app.game.saveTo(BACKUP_KEY)) {
    app.toast('This browser would not store the backup — copy your save instead', 'bad');
    return;
  }
  audio.play('tap');
  app.toast('Backed up in this browser', 'good');
  app.refresh();
}

async function restoreBackup(app: AppApi): Promise<void> {
  // Read the backup before anything is written, so a slot that turns out to be
  // unreadable cannot cost the player the diner they are playing.
  const restored = Game.loadSlot(BACKUP_KEY);
  if (!restored) {
    app.toast('The backup could not be read, so nothing was changed', 'bad');
    return;
  }

  const ok = await app.confirm({
    title: 'Restore the backup?',
    message: `${restored.data.restaurantName} — level ${restored.data.level}, ${fmt(restored.data.coins)} coins on day ${restored.dayNumber}. The diner you are playing now takes its place in the backup slot.`,
    confirmLabel: 'Restore it',
    danger: true,
  });
  if (!ok) return;

  const outgoing = JSON.stringify(app.game.serialise());
  if (!installSave(restored.data)) {
    app.toast('This browser would not store the save, so nothing was changed', 'bad');
    return;
  }
  writeSlot(BACKUP_KEY, outgoing);
  reloadInto(app);
}

/**
 * Hand the browser over to whatever is now in the live slot. Sealing the diner
 * being replaced is what makes the swap stick: leaving the page autosaves, and
 * that write would land straight back on top of the one just installed.
 */
function reloadInto(app: AppApi): void {
  app.game.seal();
  window.location.reload();
}
