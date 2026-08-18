import { audio } from '../engine/audio';
import { clockLabel, levelProgress, MAX_LEVEL } from '../game/progression';
import type { Game } from '../game/state';
import type { DayRecap, RecapAction } from '../game/types';
import type { AppApi, ConfirmOptions, Panel, PanelId } from './api';
import { clear, el, fmt, fmtShort, plural } from './dom';
import { iconEl, iconSvg, starsHtml } from './icons';

interface DockItem {
  id: PanelId | 'build';
  label: string;
  icon: string;
}

const DOCK: readonly DockItem[] = [
  { id: 'build', label: 'Build', icon: 'build' },
  { id: 'shop', label: 'Shop', icon: 'shop' },
  { id: 'menu', label: 'Menu', icon: 'menu' },
  { id: 'market', label: 'Market', icon: 'market' },
  { id: 'staff', label: 'Staff', icon: 'staff' },
  { id: 'manage', label: 'Manage', icon: 'chart' },
];

/**
 * Owns every DOM surface: the status bar, the dock, the sliding sheet that
 * hosts panels, transient toasts, modals and the tutorial coach.
 */
export class UI {
  private readonly root: HTMLElement;
  private app!: AppApi;

  private topbar!: HTMLElement;
  private coinsEl!: HTMLElement;
  private levelEl!: HTMLElement;
  private ratingEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private dock!: HTMLElement;
  private toasts!: HTMLElement;

  private scrim!: HTMLElement;
  private sheet!: HTMLElement;
  private sheetTitle!: HTMLElement;
  private sheetSub!: HTMLElement;
  private sheetTabs!: HTMLElement;
  private sheetBody!: HTMLElement;

  private buildBar: HTMLElement | null = null;
  private coach: HTMLElement | null = null;

  private panels = new Map<PanelId, Panel>();
  private openPanel: PanelId | null = null;
  private cache = {
    coins: -1,
    level: -1,
    xp: -1,
    rating: -1,
    clock: '',
    open: true,
    marketBadge: false,
    staffBadge: false,
  };

  constructor(root: HTMLElement, private readonly game: Game) {
    this.root = root;
    this.build();
  }

  attach(app: AppApi): void {
    this.app = app;
  }

  registerPanel(id: PanelId, panel: Panel): void {
    this.panels.set(id, panel);
  }

  // ------------------------------------------------------------ scaffolding

  private build(): void {
    this.topbar = el('div', { class: 'topbar' });

    this.coinsEl = el('div', { class: 'pill coins' });
    this.levelEl = el('div', { class: 'pill level-pill' });
    this.ratingEl = el('div', { class: 'pill tappable' });
    this.clockEl = el('div', { class: 'pill' });

    const settingsBtn = el('button', {
      class: 'icon-btn',
      html: iconSvg('settings', 18),
      title: 'Manage restaurant',
      onclick: () => this.app.openSheet('manage'),
    });

    this.topbar.append(
      el('div', { class: 'pill brand-pill' }, [
        el('span', { class: 'mark', text: 'D' }),
        el('span', { text: 'Diner Town' }),
      ]),
      this.coinsEl,
      this.levelEl,
      this.ratingEl,
      this.clockEl,
      el('div', { class: 'spacer' }),
      settingsBtn,
    );

    this.dock = el('div', { class: 'dock' });
    for (const item of DOCK) {
      const btn = el(
        'button',
        {
          class: 'dock-btn',
          'data-id': item.id,
          onclick: () => {
            audio.unlock();
            audio.play('tap');
            if (item.id === 'build') this.app.enterBuild();
            else this.app.openSheet(item.id);
          },
        },
        [iconEl(item.icon, 19), el('span', { text: item.label })],
      );
      this.dock.append(btn);
    }

    this.toasts = el('div', { class: 'toasts' });

    this.scrim = el('div', {
      class: 'sheet-scrim',
      style: 'display:none',
      onclick: () => this.app.closeSheet(),
    });

    this.sheetTitle = el('h2');
    this.sheetSub = el('div', { class: 'sub' });
    this.sheetTabs = el('div', { class: 'tabs', style: 'display:none' });
    this.sheetBody = el('div', { class: 'sheet-body' });

    this.sheet = el('div', { class: 'sheet' }, [
      el('div', { class: 'sheet-grip' }),
      el('div', { class: 'sheet-head' }, [
        el('div', {}, [this.sheetTitle, this.sheetSub]),
        el('button', {
          class: 'sheet-close',
          html: iconSvg('close', 15),
          onclick: () => this.app.closeSheet(),
        }),
      ]),
      this.sheetTabs,
      this.sheetBody,
    ]);

    this.root.append(this.topbar, this.dock, this.scrim, this.sheet, this.toasts);
  }

  // ------------------------------------------------------------ status bar

  /** Cheap enough to call every frame; only writes when a value actually moves. */
  updateStatus(): void {
    const d = this.game.data;
    if (this.cache.coins !== d.coins) {
      this.cache.coins = d.coins;
      this.coinsEl.innerHTML = `${iconSvg('coin', 16, '#e89a12')}<span>${fmtShort(d.coins)}</span>`;
    }

    const prog = levelProgress(d.xp);
    if (this.cache.level !== prog.level || this.cache.xp !== d.xp) {
      this.cache.level = prog.level;
      this.cache.xp = d.xp;
      clear(this.levelEl);
      const pct = prog.level >= MAX_LEVEL ? 100 : (prog.into / prog.span) * 100;
      const levelBar = el('i', { style: `width:${pct.toFixed(1)}%` });
      this.levelEl.append(
        el('div', { class: 'level-row' }, [
          el('span', { text: `Level ${prog.level}` }),
          el('span', {
            class: 'dim',
            text: prog.level >= MAX_LEVEL ? 'MAX' : `${Math.floor(prog.into)}/${prog.span}`,
          }),
        ]),
        el('div', { class: 'bar' }, [levelBar]),
      );
    }

    const rating = Math.round(this.game.rating * 20) / 20;
    if (this.cache.rating !== rating) {
      this.cache.rating = rating;
      this.ratingEl.innerHTML = `${starsHtml(rating)}<span class="dim">${rating.toFixed(1)}</span>`;
      this.ratingEl.onclick = () => this.app.openSheet('manage', 'ratings');
    }

    const label = `Day ${this.game.dayNumber} · ${clockLabel(d.clock)}`;
    if (this.cache.clock !== label || this.cache.open !== d.open) {
      this.cache.clock = label;
      this.cache.open = d.open;
      this.clockEl.innerHTML = `${iconSvg('clock', 15)}<span>${label}</span>`;
      if (!d.open) this.clockEl.innerHTML += `<span class="chip warn">Closed</span>`;
    }

    for (const btn of Array.from(this.dock.children) as HTMLElement[]) {
      btn.classList.toggle('active', btn.dataset.id === this.openPanel);
    }

    const marketCrisis = this.game.data.menu.length > 0 && !this.game.menuCanCook();
    const staffCrisis = this.game.data.staff.some((s) => s.state === 'exhausted');
    if (marketCrisis !== this.cache.marketBadge) {
      this.cache.marketBadge = marketCrisis;
      this.setDockBadge('market', marketCrisis);
    }
    if (staffCrisis !== this.cache.staffBadge) {
      this.cache.staffBadge = staffCrisis;
      this.setDockBadge('staff', staffCrisis);
    }
  }

  private setDockBadge(id: string, on: boolean): void {
    const btn = this.dock.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
    if (!btn) return;
    let badge = btn.querySelector('.badge');
    if (on && !badge) {
      btn.append(el('span', { class: 'badge', text: '!' }));
    } else if (!on && badge) {
      badge.remove();
    }
  }

  // ---------------------------------------------------------------- sheets

  showSheet(id: PanelId, tab?: string): void {
    const panel = this.panels.get(id);
    if (!panel) return;
    if (tab && panel.tabs?.some((t) => t.id === tab)) {
      panel.activeTab = tab;
      panel.onTab?.(tab);
    }
    this.openPanel = id;
    this.scrim.style.display = 'block';
    requestAnimationFrame(() => {
      this.scrim.classList.add('show');
      this.sheet.classList.add('show');
    });
    this.renderSheet();
  }

  hideSheet(): void {
    if (!this.openPanel) return;
    this.openPanel = null;
    this.sheet.classList.remove('show');
    this.scrim.classList.remove('show');
    window.setTimeout(() => {
      if (!this.openPanel) this.scrim.style.display = 'none';
    }, 260);
  }

  get currentPanel(): PanelId | null {
    return this.openPanel;
  }

  renderSheet(): void {
    if (!this.openPanel) return;
    const panel = this.panels.get(this.openPanel);
    if (!panel) return;

    this.sheetTitle.textContent = panel.title;
    const sub = panel.subtitle?.() ?? '';
    this.sheetSub.textContent = sub;
    this.sheetSub.style.display = sub ? 'block' : 'none';

    if (panel.tabs?.length) {
      this.sheetTabs.style.display = 'flex';
      clear(this.sheetTabs);
      for (const tab of panel.tabs) {
        this.sheetTabs.append(
          el('button', {
            class: `tab${panel.activeTab === tab.id ? ' active' : ''}`,
            text: tab.label,
            onclick: () => {
              panel.activeTab = tab.id;
              panel.onTab?.(tab.id);
              audio.play('tap');
              this.renderSheet();
            },
          }),
        );
      }
    } else {
      this.sheetTabs.style.display = 'none';
    }

    const scroll = this.sheetBody.scrollTop;
    clear(this.sheetBody);
    panel.render(this.sheetBody);
    this.sheetBody.scrollTop = scroll;
  }

  // ------------------------------------------------------------- build bar

  showBuildBar(contents: () => Node[]): void {
    this.hideBuildBar();
    this.buildBar = el('div', { class: 'buildbar' }, contents());
    this.dock.style.display = 'none';
    this.root.append(this.buildBar);
  }

  updateBuildBar(contents: () => Node[]): void {
    if (!this.buildBar) return;
    clear(this.buildBar);
    for (const node of contents()) this.buildBar.append(node);
  }

  hideBuildBar(): void {
    this.buildBar?.remove();
    this.buildBar = null;
    this.dock.style.display = '';
  }

  // ---------------------------------------------------------------- toasts

  toast(message: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const node = el('div', { class: `toast ${kind}`, text: message });
    this.toasts.append(node);
    window.setTimeout(() => {
      node.style.transition = 'opacity .3s ease, transform .3s ease';
      node.style.opacity = '0';
      node.style.transform = 'translateY(-8px)';
      window.setTimeout(() => node.remove(), 320);
    }, 2100);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
  }

  // ---------------------------------------------------------------- modals

  private openModals = 0;

  /** True while any card or dialog is up, so queued cards can wait their turn. */
  get hasModal(): boolean {
    return this.openModals > 0;
  }

  private showModal(build: (close: () => void) => HTMLElement): void {
    const scrim = el('div', { class: 'modal-scrim' });
    this.openModals++;
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      this.openModals--;
      scrim.style.opacity = '0';
      window.setTimeout(() => scrim.remove(), 200);
    };
    scrim.append(build(close));
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) close();
    });
    this.root.append(scrim);
  }

  confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.showModal((close) => {
        const done = (value: boolean): void => {
          close();
          resolve(value);
        };
        return el('div', { class: 'modal' }, [
          el('h2', { text: opts.title }),
          el('p', { text: opts.message }),
          el('div', { class: 'actions' }, [
            el('button', {
              class: 'btn ghost',
              text: opts.cancelLabel ?? 'Cancel',
              onclick: () => done(false),
            }),
            el('button', {
              class: `btn ${opts.danger ? 'danger' : 'primary'}`,
              text: opts.confirmLabel ?? 'Confirm',
              onclick: () => done(true),
            }),
          ]),
        ]);
      });
    });
  }

  promptText(title: string, message: string, value: string): Promise<string | null> {
    return new Promise((resolve) => {
      this.showModal((close) => {
        const input = el('input', { class: 'field', value, maxlength: 28 });
        const done = (v: string | null): void => {
          close();
          resolve(v);
        };
        const node = el('div', { class: 'modal' }, [
          el('h2', { text: title }),
          el('p', { text: message }),
          input,
          el('div', { class: 'actions' }, [
            el('button', { class: 'btn ghost', text: 'Cancel', onclick: () => done(null) }),
            el('button', {
              class: 'btn primary',
              text: 'Save',
              onclick: () => done(input.value.trim() || null),
            }),
          ]),
        ]);
        input.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter') done(input.value.trim() || null);
        });
        requestAnimationFrame(() => input.focus());
        return node;
      });
    });
  }

  /** Rich modal used for level-ups and the card for a shift the player missed. */
  showInfoModal(
    title: string,
    lines: Array<{ label: string; value: string }>,
    body: string,
    actionLabel = 'Nice!',
  ): void {
    this.showModal((close) =>
      el('div', { class: 'modal' }, [
        el('h2', { text: title }),
        el('p', { text: body }),
        ...lines.map((l) =>
          el('div', { class: 'kv' }, [
            el('span', { text: l.label }),
            el('span', { text: l.value }),
          ]),
        ),
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn primary', text: actionLabel, onclick: close }),
        ]),
      ]),
    );
  }

  /**
   * The end-of-day card. Same shape as the level-up modal, plus a warning line
   * when the pantry is dry and a button that takes the player straight to the
   * one thing worth doing before tomorrow.
   */
  showDayRecap(recap: DayRecap, onAction: (action: RecapAction) => void): void {
    const takings = recap.dishEarnings + recap.tips;
    const rows: Array<{ label: string; value: string; warn?: boolean }> = [
      { label: 'Covers served', value: fmt(recap.covers) },
      { label: 'Walked out', value: fmt(recap.walkouts), warn: recap.walkouts > 0 },
      { label: 'Dish takings', value: fmt(recap.dishEarnings) },
    ];
    if (recap.tips > 0) {
      rows.push({ label: 'Regulars’ tips', value: `+${fmt(recap.tips)}` });
    }
    rows.push({
      label: 'Wages paid',
      value: recap.wagesPaid < recap.wages
        ? `${fmt(recap.wagesPaid)} of ${fmt(recap.wages)}`
        : `-${fmt(recap.wages)}`,
      warn: recap.wagesPaid < recap.wages,
    });
    rows.push({
      label: 'Kept',
      value: `${takings - recap.wagesPaid >= 0 ? '+' : ''}${fmt(takings - recap.wagesPaid)}`,
      warn: takings - recap.wagesPaid < 0,
    });

    this.showModal((close) =>
      el('div', { class: 'modal' }, [
        el('h2', { text: `Day ${recap.day} is done` }),
        el('p', {
          text: recap.covers > 0
            ? `${plural(recap.covers, 'cover')} served for ${fmt(takings)} coins.`
            : 'Nobody was served today.',
        }),
        ...rows.map((r) =>
          el('div', { class: 'kv' }, [
            el('span', { text: r.label }),
            el('span', {
              text: r.value,
              style: r.warn ? 'color:#b02820' : undefined,
            }),
          ]),
        ),
        recap.regularsDelighted > 0 || recap.regularsLost > 0
          ? el('div', { class: 'kv' }, [
              el('span', { text: 'Regulars' }),
              el('span', {
                text: `${recap.regularsDelighted} delighted · ${recap.regularsLost} walked out`,
                style: recap.regularsLost > 0 ? 'color:#b02820' : undefined,
              }),
            ])
          : null,
        recap.pantryWarning
          ? el('div', { class: 'card', style: 'margin-top:12px;border-color:var(--red)' }, [
              el('div', { class: 'name', text: 'Pantry warning' }),
              el('div', { class: 'desc', text: recap.pantryWarning }),
            ])
          : null,
        el('div', { class: 'card', style: 'margin-top:12px' }, [
          el('div', { class: 'name', text: 'Do this next' }),
          el('div', { class: 'desc', text: recap.action.label }),
        ]),
        el('div', { class: 'actions' }, [
          el('button', {
            class: 'btn ghost',
            text: 'Carry on',
            onclick: close,
          }),
          el('button', {
            class: 'btn primary',
            text: recap.action.target ? 'Take me there' : 'Do it',
            onclick: () => {
              close();
              onAction(recap.action);
            },
          }),
        ]),
      ]),
    );
  }

  // -------------------------------------------------------------- tutorial

  /**
   * The onboarding tip. `onDismiss` only puts the bubble away — the thread itself
   * moves on when the game says the step is done — so a player who would rather
   * work it out for themselves is never left with a note they cannot close.
   */
  showCoach(
    html: string,
    actionLabel: string | null,
    onAction?: () => void,
    onDismiss?: () => void,
  ): void {
    this.hideCoach();
    const btn = actionLabel
      ? el('button', {
          class: 'btn primary',
          text: actionLabel,
          onclick: () => onAction?.(),
        })
      : null;
    const dismiss = onDismiss
      ? el('button', {
          class: 'coach-x',
          html: iconSvg('close', 12),
          title: 'Hide this tip',
          onclick: () => onDismiss(),
        })
      : null;
    this.coach = el('div', { class: 'coach' }, [
      el('span', { class: 'chef', html: iconSvg('info', 24, '#c73a2e') }),
      el('div', { class: 'txt', html }),
      btn,
      dismiss,
    ]);
    this.root.append(this.coach);
  }

  hideCoach(): void {
    this.coach?.remove();
    this.coach = null;
  }
}
