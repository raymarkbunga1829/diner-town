import './ui/styles.css';

import { audio } from './engine/audio';
import { Camera } from './engine/camera';
import { PointerInput } from './engine/input';
import { clamp, TILE_H, TILE_W, tileToWorld, type Point } from './engine/iso';
import { FURNITURE_BY_ID, isWallMounted, resaleValue } from './game/data/furniture';
import { footprint } from './game/grid';
import { unlocksAtLevel } from './game/progression';
import { Simulation } from './game/sim';
import { createNewGame, Game } from './game/state';
import type { Placed } from './game/types';
import { Renderer, type BuildPreview } from './render/renderer';
import type { AppApi, ConfirmOptions, PanelId } from './ui/api';
import { el, fmt } from './ui/dom';
import { iconSvg } from './ui/icons';
import { createManagePanel } from './ui/panels/manage';
import { createMarketPanel } from './ui/panels/market';
import { createMenuPanel } from './ui/panels/menu';
import { createShopPanel } from './ui/panels/shop';
import { createStaffPanel } from './ui/panels/staff';
import { COACH_STEPS } from './ui/tutorial';
import { UI } from './ui/ui';

const AUTOSAVE_SECONDS = 12;

class App implements AppApi {
  readonly game: Game;
  readonly sim: Simulation;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera = new Camera();
  private readonly renderer: Renderer;
  private readonly input: PointerInput;
  private readonly ui: UI;

  private mode: 'play' | 'build' = 'play';
  private placingDefId: string | null = null;
  private placingRot: 0 | 1 | 2 | 3 = 0;
  private selectedUid: number | null = null;

  /** Last pointer position in fractional tile space, before any snapping. */
  private hoverFrac: { tx: number; ty: number } | null = null;
  private lastFrame = performance.now();
  private clock = 0;
  private saveTimer = 0;
  private dpr = 1;

  /** Milestones the tutorial watches for, e.g. `panel:market`. */
  private readonly seen = new Set<string>();

  constructor(game: Game, uiRoot: HTMLElement, canvas: HTMLCanvasElement) {
    this.game = game;
    this.sim = new Simulation(game);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.renderer = new Renderer(this.ctx, game, this.sim.grid, this.camera);

    this.ui = new UI(uiRoot, game);
    this.ui.attach(this);
    this.ui.registerPanel('shop', createShopPanel(this));
    this.ui.registerPanel('menu', createMenuPanel(this));
    this.ui.registerPanel('market', createMarketPanel(this));
    this.ui.registerPanel('staff', createStaffPanel(this));
    this.ui.registerPanel('manage', createManagePanel(this));

    this.input = new PointerInput(canvas, this.camera, {
      onTap: (p) => this.onTap(p),
      onHoverMove: (p) => this.onHover(p),
    });

    audio.setMuted(game.data.settings.muted);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    window.addEventListener('pagehide', () => this.save());

    this.centreCamera(true);
    this.showCoach();
  }

  // ------------------------------------------------------------- lifecycle

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.setViewport(w, h);
  }

  /** Frame the whole dining room, optionally snapping instantly. */
  private centreCamera(snap = false): void {
    const size = this.game.data.gridSize;
    const centre = tileToWorld(size / 2, size / 2);
    // Margin covers the walls standing above the floor plus a little breathing
    // room; the fit is then pushed in slightly because letting the room bleed a
    // touch past the edges looks better than stranding it in empty space, and the
    // player can always pan.
    const worldW = size * TILE_W + 120;
    const worldH = size * TILE_H + 220;
    const fit = Math.min(this.camera.viewW / worldW, this.camera.viewH / worldH);
    // A tall phone screen is limited by width, which leaves the room stranded in
    // empty sky. Push in further there and let it bleed past the sides a little,
    // since panning is cheap and legible diners matter more.
    const portrait = this.camera.viewH > this.camera.viewW * 1.3;
    const zoom = clamp(fit * (portrait ? 1.62 : 1.32), 0.62, 2);
    // The walls rise above the floor, so nudge the framing down to keep them in
    // shot. On a phone the dock eats the bottom of the screen instead, so there
    // the room wants lifting rather than dropping.
    const yBias = portrait ? -60 : 30;
    if (snap) this.camera.snapTo(centre.x, centre.y - yBias, zoom);
    else this.camera.glideTo(centre.x, centre.y - yBias);
  }

  start(): void {
    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.clock += dt;
      this.tick(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private tick(dt: number): void {
    this.sim.update(dt);
    this.camera.update(dt);
    this.input.update();

    const size = this.game.data.gridSize;
    const min = tileToWorld(0, size);
    const max = tileToWorld(size, 0);
    this.camera.clampToBounds(
      min.x,
      tileToWorld(0, 0).y - 120,
      max.x,
      tileToWorld(size, size).y,
    );

    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);
    this.renderer.render({
      time: this.clock,
      hoverTile:
        this.mode === 'build' && this.hoverFrac
          ? { tx: Math.floor(this.hoverFrac.tx), ty: Math.floor(this.hoverFrac.ty) }
          : null,
      preview: this.buildPreview(),
      buildMode: this.mode === 'build',
      selectedUid: this.selectedUid,
    });
    this.ctx.restore();

    this.ui.updateStatus();
    this.checkLevelUp();
    this.checkCoach();
    this.checkPantryCrisis();

    this.saveTimer += dt;
    if (this.saveTimer >= AUTOSAVE_SECONDS) {
      this.saveTimer = 0;
      this.save();
    }
  }

  private checkLevelUp(): void {
    const level = this.game.pendingLevelUp;
    if (level === null) return;
    this.game.pendingLevelUp = null;
    audio.play('levelup');

    const unlocks = unlocksAtLevel(level);
    const lines: Array<{ label: string; value: string }> = [];
    if (unlocks.dishes.length) lines.push({ label: 'New recipes', value: unlocks.dishes.join(', ') });
    if (unlocks.furniture.length) {
      lines.push({ label: 'New in the shop', value: unlocks.furniture.join(', ') });
    }
    lines.push({ label: 'Menu slots', value: String(this.game.menuCapacity) });
    lines.push({ label: 'Staff positions', value: String(this.game.staffCapacity) });

    this.ui.showInfoModal(
      `Level ${level}!`,
      lines,
      'Word is spreading about your cooking.',
      'Back to work',
    );
    this.save();
  }

  // ------------------------------------------------------------------ tutorial

  private showCoach(): void {
    const index = this.game.data.tutorialStep;
    if (index >= COACH_STEPS.length) {
      this.ui.hideCoach();
      return;
    }
    const step = COACH_STEPS[index]!;
    this.ui.showCoach(step.html, step.cta ?? null, () => {
      const mark = step.mark ?? (index === 0 ? 'intro' : 'outro');
      this.seen.add(mark);
      const at = step.focus?.(this.game);
      if (at) this.focusTile(at.tx, at.ty);
      if (step.placeIfMissing && this.game.placedWithRole('counter').length === 0) {
        this.startPlacing(step.placeIfMissing);
        return;
      }
      this.advanceCoach();
    });
  }

  private advanceCoach(): void {
    this.game.data.tutorialStep++;
    this.game.touch();
    this.save();
    this.showCoach();
  }

  private coachCheck = 0;

  private checkCoach(): void {
    this.coachCheck += 1;
    if (this.coachCheck % 30 !== 0) return;
    const index = this.game.data.tutorialStep;
    if (index >= COACH_STEPS.length) return;
    if (COACH_STEPS[index]!.done(this.game, this.seen)) this.advanceCoach();
  }

  private pantryCrisisToasted = false;

  /** One toast the first time no menu dish can be cooked. Does not spam. */
  private checkPantryCrisis(): void {
    if (this.game.data.menu.length === 0) return;
    if (this.game.menuCanCook()) {
      this.pantryCrisisToasted = false;
      return;
    }
    if (this.pantryCrisisToasted) return;
    this.pantryCrisisToasted = true;
    this.toast('The pantry is empty — nothing on the menu can be cooked', 'bad');
  }

  // --------------------------------------------------------------- input

  private onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    switch (e.key.toLowerCase()) {
      case 'escape':
        if (this.placingDefId || this.selectedUid !== null) this.clearBuildSelection();
        else if (this.mode === 'build') this.exitBuild();
        else this.closeSheet();
        break;
      case 'b':
        this.mode === 'build' ? this.exitBuild() : this.enterBuild();
        break;
      case 'r':
        this.rotateCurrent();
        break;
      case 'g':
        this.game.data.settings.showGrid = !this.game.data.settings.showGrid;
        break;
      case '1':
      case '2':
      case '3':
        this.game.data.settings.speed = Number(e.key) as 1 | 2 | 3;
        this.toast(`Speed ${e.key}x`, 'info');
        break;
      case 'f':
        this.centreCamera();
        break;
    }
  }

  private onHover(p: Point | null): void {
    if (!p) {
      this.hoverFrac = null;
      return;
    }
    const t = this.camera.screenToTile(p.x, p.y);
    this.hoverFrac = { tx: t.tx, ty: t.ty };
  }

  private onTap(p: Point): void {
    audio.unlock();
    const t = this.camera.screenToTile(p.x, p.y);
    this.hoverFrac = { tx: t.tx, ty: t.ty };

    if (this.mode === 'build') this.onBuildTap();
    else this.onPlayTap(Math.floor(t.tx), Math.floor(t.ty));
  }

  /**
   * Turn a fractional pick into the tile an item would occupy. Wall decor snaps
   * onto the back wall the pointer is over rather than the floor cell behind it.
   */
  private tileFor(fx: number, fy: number, defId: string | null): { tx: number; ty: number } {
    if (defId) {
      const def = FURNITURE_BY_ID[defId];
      if (def && isWallMounted(def.role)) {
        const wall = this.sim.grid.resolveWallTarget(fx, fy);
        if (wall) return { tx: wall[0], ty: wall[1] };
      }
    }
    return { tx: Math.floor(fx), ty: Math.floor(fy) };
  }

  /** Whatever the pointer is over: floor furniture first, then wall decor. */
  private pickAt(fx: number, fy: number): Placed | undefined {
    const direct = this.sim.grid.anyAt(Math.floor(fx), Math.floor(fy));
    if (direct) return direct;
    const wall = this.sim.grid.resolveWallTarget(fx, fy);
    return wall ? this.sim.grid.wallAt(wall[0], wall[1]) : undefined;
  }

  private onPlayTap(tx: number, ty: number): void {
    const staff = this.game.data.staff.find(
      (s) => Math.round(s.tx) === tx && Math.round(s.ty) === ty,
    );
    if (staff) {
      const status =
        staff.state === 'exhausted'
          ? 'is out of energy — feed them from the Staff panel'
          : `is ${describeStaffState(staff.state)} (${Math.round(staff.energy)}% energy)`;
      this.toast(`${staff.name} ${status}`, staff.state === 'exhausted' ? 'bad' : 'info');
      audio.play('tap');
      return;
    }

    const customer = this.game.customers.find(
      (c) => Math.round(c.tx) === tx && Math.round(c.ty) === ty,
    );
    if (customer) {
      const patience = Math.round(customer.patience * 100);
      this.toast(`${customer.name} · ${patience}% patience left`, patience < 35 ? 'bad' : 'info');
      audio.play('tap');
      return;
    }

    const placed = this.sim.grid.anyAt(tx, ty);
    if (placed) {
      const def = this.game.defOf(placed);
      if (def) {
        this.toast(placed.dirty ? `${def.name} — needs cleaning` : def.name, placed.dirty ? 'bad' : 'info');
        audio.play('tap');
      }
    }
  }

  private onBuildTap(): void {
    if (!this.hoverFrac) return;
    const { tx: fx, ty: fy } = this.hoverFrac;

    if (this.placingDefId) {
      const target = this.tileFor(fx, fy, this.placingDefId);
      this.tryPlace(this.placingDefId, target.tx, target.ty);
      return;
    }

    const existing = this.pickAt(fx, fy);
    if (this.selectedUid !== null) {
      const selected = this.game.placedByUid(this.selectedUid);
      if (selected && (!existing || existing.uid !== selected.uid)) {
        const target = this.tileFor(fx, fy, selected.defId);
        this.tryMove(selected, target.tx, target.ty);
        return;
      }
    }
    this.selectedUid = existing ? existing.uid : null;
    audio.play('tap');
    this.updateBuildBar();
  }

  // --------------------------------------------------------------- building

  private buildPreview(): BuildPreview | null {
    if (this.mode !== 'build' || !this.hoverFrac) return null;
    const { tx: fx, ty: fy } = this.hoverFrac;

    if (this.placingDefId) {
      const def = FURNITURE_BY_ID[this.placingDefId];
      if (!def) return null;
      const { tx, ty } = this.tileFor(fx, fy, def.id);
      return {
        defId: def.id,
        tx,
        ty,
        rot: this.placingRot,
        valid: this.sim.grid.canPlace(def, tx, ty, this.placingRot) && this.game.canAfford(def.price),
      };
    }

    if (this.selectedUid !== null) {
      const selected = this.game.placedByUid(this.selectedUid);
      if (!selected) return null;
      const def = this.game.defOf(selected);
      if (!def) return null;
      const { tx, ty } = this.tileFor(fx, fy, def.id);
      if (selected.tx === tx && selected.ty === ty) return null;
      return {
        defId: def.id,
        tx,
        ty,
        rot: selected.rot,
        valid: this.sim.grid.canPlace(def, tx, ty, selected.rot, selected.uid),
      };
    }
    return null;
  }

  /** Human-readable reason a placement is refused, or null when it is fine. */
  private placementProblem(defId: string, tx: number, ty: number, ignoreUid?: number): string | null {
    const def = FURNITURE_BY_ID[defId];
    if (!def) return 'Unknown item';
    const grid = this.sim.grid;

    if (isWallMounted(def.role)) {
      if (!grid.isWallTile(tx, ty)) return 'Hang this on one of the back walls';
      if (grid.wallAt(tx, ty) && grid.wallAt(tx, ty)!.uid !== ignoreUid) {
        return 'That wall space is taken';
      }
      return null;
    }

    for (const [x, y] of footprint(def, tx, ty, this.placingRot)) {
      if (!grid.isInterior(x, y)) return 'Place it inside the dining room';
    }
    if (def.role === 'rug') {
      const flat = grid.flatAt(tx, ty);
      if (flat && flat.uid !== ignoreUid) return 'There is already a rug here';
      return null;
    }
    const solid = grid.solidAt(tx, ty);
    if (solid && solid.uid !== ignoreUid) {
      return `${this.game.defOf(solid)?.name ?? 'Something'} is already there`;
    }
    if (!grid.canPlace(def, tx, ty, this.placingRot, ignoreUid)) {
      return 'That would block the walkway';
    }
    return null;
  }

  private tryPlace(defId: string, tx: number, ty: number): void {
    const def = FURNITURE_BY_ID[defId];
    if (!def) return;

    const problem = this.placementProblem(defId, tx, ty);
    if (problem) {
      audio.play('error');
      this.toast(problem, 'bad');
      return;
    }
    if (!this.game.canAfford(def.price)) {
      audio.play('error');
      this.toast(`You need ${fmt(def.price - this.game.coins)} more coins`, 'bad');
      return;
    }

    this.game.spend(def.price);
    const placed: Placed = {
      uid: this.game.nextUid(),
      defId: def.id,
      tx,
      ty,
      rot: this.placingRot,
    };
    this.game.data.placed.push(placed);
    this.game.touch();
    audio.play('place');
    this.game.addFloater(`-${fmt(def.price)}`, tx, ty, 'bad');
    this.save();
    this.updateBuildBar();
    this.ui.renderSheet();

    if (!this.game.canAfford(def.price)) {
      this.placingDefId = null;
      this.toast('Out of coins for more of those', 'info');
      this.updateBuildBar();
    }
  }

  private tryMove(placed: Placed, tx: number, ty: number): void {
    const def = this.game.defOf(placed);
    if (!def) return;
    const previousRot = this.placingRot;
    this.placingRot = placed.rot;
    const problem = this.placementProblem(def.id, tx, ty, placed.uid);
    this.placingRot = previousRot;

    if (problem) {
      audio.play('error');
      this.toast(problem, 'bad');
      return;
    }
    placed.tx = tx;
    placed.ty = ty;
    this.game.touch();
    audio.play('place');
    this.save();
  }

  private rotateCurrent(): void {
    if (this.placingDefId) {
      this.placingRot = ((this.placingRot + 1) % 4) as 0 | 1 | 2 | 3;
      audio.play('tap');
      this.updateBuildBar();
      return;
    }
    if (this.selectedUid === null) return;
    const placed = this.game.placedByUid(this.selectedUid);
    if (!placed) return;
    const def = this.game.defOf(placed);
    if (!def) return;
    const next = ((placed.rot + 1) % 4) as 0 | 1 | 2 | 3;
    if (!this.sim.grid.canPlace(def, placed.tx, placed.ty, next, placed.uid)) {
      audio.play('error');
      this.toast('Not enough room to turn that', 'bad');
      return;
    }
    placed.rot = next;
    this.game.touch();
    audio.play('tap');
    this.save();
  }

  private async sellSelected(): Promise<void> {
    if (this.selectedUid === null) return;
    const placed = this.game.placedByUid(this.selectedUid);
    if (!placed) return;
    const def = this.game.defOf(placed);
    if (!def) return;
    const refund = resaleValue(def);

    const ok = await this.confirm({
      title: `Sell the ${def.name}?`,
      message: `You paid ${fmt(def.price)} and will get ${fmt(refund)} coins back.`,
      confirmLabel: `Sell for ${fmt(refund)}`,
    });
    if (!ok) return;

    // Takes the piece out of the room and detaches anyone still using it, so a
    // dish being cooked or carried goes back to the kitchen instead of stalling.
    this.sim.removeFixture(placed);
    this.game.earn(refund, { tx: placed.tx, ty: placed.ty });
    this.selectedUid = null;
    audio.play('sell');
    this.save();
    this.updateBuildBar();
  }

  private clearBuildSelection(): void {
    this.placingDefId = null;
    this.selectedUid = null;
    this.placingRot = 0;
    this.updateBuildBar();
  }

  private updateBuildBar(): void {
    if (this.mode !== 'build') return;
    this.ui.updateBuildBar(() => this.buildBarContents());
  }

  private buildBarContents(): Node[] {
    const button = (
      label: string,
      icon: string,
      cls: string,
      onclick: () => void,
      disabled = false,
    ): HTMLElement =>
      el('button', {
        class: `btn ${cls}`,
        html: `${iconSvg(icon, 14)} ${label}`,
        style: 'display:inline-flex;align-items:center;gap:5px',
        disabled,
        onclick,
      });

    if (this.placingDefId) {
      const def = FURNITURE_BY_ID[this.placingDefId]!;
      return [
        el('span', { class: 'label', text: `Placing ${def.name}` }),
        button('Turn', 'rotate', 'ghost', () => this.rotateCurrent()),
        button('Done', 'check', 'primary', () => this.clearBuildSelection()),
      ];
    }

    if (this.selectedUid !== null) {
      const placed = this.game.placedByUid(this.selectedUid);
      const def = placed ? this.game.defOf(placed) : undefined;
      if (def) {
        return [
          el('span', { class: 'label', text: def.name }),
          button('Turn', 'rotate', 'ghost', () => this.rotateCurrent()),
          button(`Sell ${fmt(resaleValue(def))}`, 'trash', 'danger', () => void this.sellSelected()),
          button('Done', 'check', 'primary', () => this.clearBuildSelection()),
        ];
      }
    }

    const open = this.game.data.open;
    return [
      el('span', { class: 'label', text: 'Tap an item to move or sell it' }),
      button('Shop', 'shop', 'primary', () => this.openSheet('shop')),
      button(
        open ? 'Open' : 'Closed',
        open ? 'play' : 'pause',
        open ? 'green' : 'danger',
        () => this.toggleOpen(),
      ),
      button('Exit', 'check', 'ghost', () => this.exitBuild()),
    ];
  }

  private toggleOpen(): void {
    const open = !this.game.data.open;
    this.game.data.open = open;
    this.game.touch();
    this.save();
    audio.play('tap');
    this.toast(
      open ? 'Open again — guests are on their way' : 'Closed for remodelling',
      'info',
    );
    this.updateBuildBar();
    this.refresh();
  }

  // ------------------------------------------------------------- AppApi

  toast(message: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    this.ui.toast(message, kind);
  }

  refresh(): void {
    this.ui.renderSheet();
    this.ui.updateStatus();
  }

  openSheet(id: PanelId, tab?: string): void {
    this.seen.add(`panel:${id}`);
    this.ui.showSheet(id, tab);
  }

  closeSheet(): void {
    this.ui.hideSheet();
  }

  startPlacing(defId: string): void {
    this.placingDefId = defId;
    this.placingRot = 0;
    this.selectedUid = null;
    this.enterBuild();
    this.closeSheet();
    const def = FURNITURE_BY_ID[defId];
    this.toast(`Tap a tile to place the ${def?.name ?? 'item'}`, 'info');
    this.updateBuildBar();
  }

  private hintedRemodel = false;

  enterBuild(): void {
    if (this.mode === 'build') {
      this.updateBuildBar();
      return;
    }
    this.mode = 'build';
    this.ui.showBuildBar(() => this.buildBarContents());
    if (!this.hintedRemodel && this.game.data.open) {
      this.hintedRemodel = true;
      this.toast('Tip: tap Open to close up while you remodel', 'info');
    }
  }

  exitBuild(): void {
    this.mode = 'play';
    this.placingDefId = null;
    this.selectedUid = null;
    this.ui.hideBuildBar();
    this.save();
  }

  confirm(options: ConfirmOptions): Promise<boolean> {
    return this.ui.confirm(options);
  }

  promptText(title: string, message: string, value: string): Promise<string | null> {
    return this.ui.promptText(title, message, value);
  }

  focusTile(tx: number, ty: number): void {
    const w = tileToWorld(tx + 0.5, ty + 0.5);
    this.camera.glideTo(w.x, w.y);
  }

  save(): void {
    this.game.save();
  }

  /** Award and announce anything the restaurant made while the tab was closed. */
  reportOfflineEarnings(elapsedSeconds: number): void {
    const result = this.sim.estimateOfflineEarnings(elapsedSeconds);
    if (result.coins <= 0) return;
    this.game.earn(result.coins);
    this.game.addXp(result.xp);
    this.game.pendingLevelUp = null;

    const hours = Math.floor(result.seconds / 3600);
    const minutes = Math.round((result.seconds % 3600) / 60);
    const away = hours ? `${hours}h ${minutes}m` : `${minutes}m`;
    this.ui.showInfoModal(
      'While you were away',
      [
        { label: 'Time closed', value: away },
        { label: 'Coins taken', value: fmt(result.coins) },
        { label: 'Experience', value: fmt(result.xp) },
      ],
      'Your team kept the place running without you.',
      'Collect',
    );
    this.save();
  }
}

function describeStaffState(state: string): string {
  switch (state) {
    case 'cooking':
      return 'cooking an order';
    case 'takingOrder':
      return 'taking an order';
    case 'toKitchen':
    case 'carrying':
    case 'serving':
      return 'running a plate out';
    case 'cleaning':
      return 'cleaning a table';
    case 'walking':
      return 'on the move';
    default:
      return 'waiting for something to do';
  }
}

// ------------------------------------------------------------------ bootstrap

function boot(): void {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;
  const bootScreen = document.getElementById('boot');

  const saved = Game.load();
  const game = saved ?? new Game(createNewGame());
  const elapsed = saved ? (Date.now() - saved.data.savedAt) / 1000 : 0;

  const app = new App(game, uiRoot, canvas);
  app.start();

  bootScreen?.classList.add('hidden');
  window.setTimeout(() => bootScreen?.remove(), 500);

  if (saved && elapsed > 120) {
    window.setTimeout(() => app.reportOfflineEarnings(elapsed), 450);
  }
  if (!saved) {
    game.data.seenIntro = true;
    game.save();
  }

  registerServiceWorker();

  if (import.meta.env.DEV) {
    // Handle for poking at the running game from the dev console.
    (window as unknown as { diner: { app: App; game: Game } }).diner = { app, game };
  }
}

/** Cache the build so the game keeps working with no connection. */
function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline support is a bonus; a failed registration must not break play.
    });
  });
}

boot();
