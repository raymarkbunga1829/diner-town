import './ui/styles.css';

import { audio } from './engine/audio';
import { Camera, MAX_ZOOM, MIN_ZOOM } from './engine/camera';
import { PointerInput } from './engine/input';
import { clamp, tileToWorld, type Point } from './engine/iso';
import { FURNITURE_BY_ID, isWallMounted, resaleValue } from './game/data/furniture';
import { footprint } from './game/grid';
import { nearestActor } from './game/pick';
import { STAR_REWARDS, unlocksAtLevel, unlocksAtStar, type Unlocks } from './game/progression';
import {
  catchUpWhileAway,
  Simulation,
  type CommandResult,
  type TimeAwayReport,
} from './game/sim';
import { createNewGame, Game } from './game/state';
import type { Customer, Placed } from './game/types';
import { buildingBox, Renderer, type BuildPreview } from './render/renderer';
import type {
  AppApi,
  ConfirmOptions,
  PanelId,
  TextExportOptions,
  TextImportOptions,
} from './ui/api';
import { nextCelebration, type CelebrationQueue } from './ui/cards';
import { el, fmt } from './ui/dom';
import { iconSvg } from './ui/icons';
import { createManagePanel } from './ui/panels/manage';
import { createMarketPanel } from './ui/panels/market';
import { createMenuPanel } from './ui/panels/menu';
import { createShopPanel } from './ui/panels/shop';
import { createStaffPanel } from './ui/panels/staff';
import {
  coachAction,
  coachBaseline,
  coachProgress,
  COACH_STEPS,
  type CoachBaseline,
  type CoachContext,
  type CoachStep,
} from './ui/tutorial';
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

  constructor(
    game: Game,
    uiRoot: HTMLElement,
    canvas: HTMLCanvasElement,
    away: TimeAwayReport | null = null,
  ) {
    this.game = game;
    this.sim = new Simulation(game);
    this.awayReport = away;
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
    // Taken here rather than at the field, so a reopened save asks the tip on
    // screen for a fresh cover instead of counting yesterday's shift.
    this.coachSince = coachBaseline(game);
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

  /**
   * Frame the dining room inside the band the HUD and the dock leave free, so
   * the room reads as the subject rather than as an island in the streetscape.
   *
   * Portrait screens are the awkward case: an isometric room is twice as wide as
   * it is deep, so fitting its width on a phone would strand it in a field. The
   * width is deliberately allowed to bleed off the sides instead — the extreme
   * corners are a pan away — and the height is what gets fitted.
   */
  private centreCamera(snap = false): void {
    const { viewW, viewH } = this.camera;
    const box = buildingBox(this.game.data.gridSize);
    const portrait = viewH > viewW * 1.3;
    // Roughly what the status pills and the dock cover at each layout.
    const insetTop = portrait ? 112 : 66;
    const insetBottom = portrait ? 104 : 96;

    const availW = Math.max(120, viewW - 16);
    const availH = Math.max(120, viewH - insetTop - insetBottom);
    const bleedW = portrait ? 1.72 : 1.06;
    const bleedH = portrait ? 1.0 : 1.16;
    const zoom = clamp(
      Math.min((availW * bleedW) / box.w, (availH * bleedH) / box.h),
      MIN_ZOOM,
      MAX_ZOOM,
    );

    // Pin the middle of the building to the middle of the free band.
    const bandCentre = insetTop + availH / 2;
    const x = box.x + box.w / 2;
    const y = box.y + box.h / 2 + (viewH / 2 - bandCentre) / zoom;
    if (snap) this.camera.snapTo(x, y, zoom);
    else this.camera.glideTo(x, y);
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
    this.recapHold = Math.max(0, this.recapHold - dt);
    this.checkTimeAway(dt);
    this.checkLevelUp();
    this.checkStarUp();
    this.checkDayRecap();
    this.checkCoach();
    this.checkPantryCrisis();

    this.saveTimer += dt;
    if (this.saveTimer >= AUTOSAVE_SECONDS) {
      this.saveTimer = 0;
      this.save();
    }
  }

  /** The shift worked while the tab was shut, and the wait for the boot screen. */
  private awayReport: TimeAwayReport | null = null;
  private awayHold = 0.45;

  /**
   * Show what the team did while the tab was shut. The shift itself was worked on
   * the way in — coins, stock, wages and the clock all moved through the same
   * code a watched shift moves them through — so this only reports it. Whatever
   * else it set off, a level or the day's card, queues up behind this one.
   */
  private checkTimeAway(dt: number): void {
    const report = this.awayReport;
    if (!report) return;
    this.awayHold -= dt;
    if (this.awayHold > 0) return;
    this.awayReport = null;

    const hours = Math.floor(report.awaySeconds / 3600);
    const minutes = Math.round((report.awaySeconds % 3600) / 60);
    const lines = [
      { label: 'Time away', value: hours ? `${hours}h ${minutes}m` : `${minutes}m` },
      { label: 'Covers served', value: fmt(report.covers) },
      { label: 'Taken', value: fmt(report.takings) },
      { label: 'Ingredients used', value: fmt(report.ingredients) },
    ];
    if (report.wages > 0) lines.push({ label: 'Wages paid', value: fmt(report.wages) });
    lines.push({
      label: 'In the till',
      value: `${report.coins < 0 ? '-' : '+'}${fmt(Math.abs(report.coins))}`,
    });
    if (report.xp > 0) lines.push({ label: 'Experience', value: fmt(report.xp) });
    if (report.fame > 0) lines.push({ label: 'Fame', value: fmt(report.fame) });

    // What the card is for is the difference between the takings and what they
    // cost, because that is the part the old bonus quietly left out.
    const body = [
      report.pantryRanDry
        ? 'Your team carried on without you until the pantry ran out, then locked up.'
        : 'Your team carried on without you, cooking out of the pantry, and then locked up.',
      report.daysRolled > 0 ? 'A day ended while you were gone, so payroll came out of the till.' : '',
      report.walkouts > 0
        ? `${report.walkouts} ${report.walkouts === 1 ? 'guest' : 'guests'} gave up waiting while the team was stretched.`
        : '',
      'A shift you work yourself is always worth more than one you miss.',
    ]
      .filter((line) => line.length > 0)
      .join(' ');

    this.ui.showInfoModal('While you were away', lines, body, 'Back to work');
    this.save();
  }

  /** What the cards are waiting on this frame. */
  private celebrations(): CelebrationQueue {
    return {
      awayPending: this.awayReport !== null,
      levelUp: this.game.pendingLevelUp !== null,
      starUp: this.game.pendingStarUp !== null,
      dayRecap: this.game.pendingDayRecap !== null,
      modalOpen: this.ui.hasModal,
      hold: this.recapHold,
    };
  }

  private checkLevelUp(): void {
    const level = this.game.pendingLevelUp;
    if (level === null) return;
    // A shift worked while the tab was shut can earn a level, so the celebration
    // waits for that shift's own card rather than landing on top of it.
    if (nextCelebration(this.celebrations()) !== 'level') return;
    this.game.pendingLevelUp = null;
    audio.play('levelup');
    // Confetti over the room and a warm flash, so the moment lands in the world
    // and not only in the card that covers it.
    const size = this.game.data.gridSize;
    this.game.fx.levelUp(size / 2, size / 2);

    const lines = unlockLines(unlocksAtLevel(level));
    lines.push({ label: 'Menu slots', value: String(this.game.menuCapacity) });
    lines.push({ label: 'Staff positions', value: String(this.game.staffCapacity) });

    // Long enough to cover the delay below, so a day rolling over in the same
    // frame does not slide its card under the celebration.
    this.recapHold = 1.4;

    // Let the confetti land before the card covers the room, otherwise the only
    // celebration the player ever sees is a scrim over the top of it.
    window.setTimeout(() => {
      this.ui.showInfoModal(
        `Level ${level}!`,
        lines,
        'Word is spreading about your cooking.',
        'Back to work',
      );
    }, 750);
    this.save();
  }

  /**
   * The same moment for the fame track. A star is the level-up of a diner that
   * has run out of levels, so it gets the same confetti and the same card, and
   * it names what the star just opened up rather than only counting itself.
   */
  private checkStarUp(): void {
    const star = this.game.pendingStarUp;
    if (star === null) return;
    // Crossing the cap can earn the last level and a star in one go, and the
    // level's card is claimed a beat before it appears. Waiting on that beat is
    // what stops the star card queueing on top of the unlock list.
    if (nextCelebration(this.celebrations()) !== 'star') return;
    this.game.pendingStarUp = null;
    audio.play('levelup');
    const size = this.game.data.gridSize;
    this.game.fx.levelUp(size / 2, size / 2);

    const lines = unlockLines(unlocksAtStar(star));
    const reward = STAR_REWARDS.find((r) => r.star === star);
    if (reward?.menuSlots) lines.push({ label: 'Menu slots', value: String(this.game.menuCapacity) });
    if (reward?.staffSlots) {
      lines.push({ label: 'Staff positions', value: String(this.game.staffCapacity) });
    }
    lines.push({ label: 'Fame stars', value: String(star) });

    this.recapHold = 1.4;
    window.setTimeout(() => {
      this.ui.showInfoModal(
        reward ? `${reward.title}!` : `Fame star ${star}!`,
        lines,
        reward?.note ?? 'People are coming across town for this place now.',
        'Back to work',
      );
    }, 750);
    this.save();
  }

  /** Seconds to sit on a queued recap, so a level-up card gets the room first. */
  private recapHold = 0;

  /**
   * The day's card. A level-up landing in the same frame wins, because that is
   * the better moment and the recap is still waiting once it is dismissed.
   */
  private checkDayRecap(): void {
    const recap = this.game.pendingDayRecap;
    if (!recap) return;
    // Something is already covering the room, or is about to: hold the recap
    // rather than stacking a second card on top of it.
    if (nextCelebration(this.celebrations()) !== 'recap') return;
    this.game.pendingDayRecap = null;
    audio.play('bell');
    this.ui.showDayRecap(recap, (action) => {
      if (action.target === 'build') this.enterBuild();
      else if (action.target) this.openSheet(action.target);
    });
    this.save();
  }

  // ------------------------------------------------------------------ tutorial

  /** What the coach is allowed to read. Synced, because seats are spatial. */
  private coachContext(): CoachContext {
    this.sim.grid.sync();
    return { game: this.game, grid: this.sim.grid, seen: this.seen, since: this.coachSince };
  }

  private showCoach(): void {
    const index = this.game.data.tutorialStep;
    if (index >= COACH_STEPS.length || this.coachHidden) {
      this.ui.hideCoach();
      return;
    }
    const step = COACH_STEPS[index]!;
    this.ui.showCoach(
      step.html,
      step.cta ?? null,
      () => this.onCoachCta(step),
      () => {
        // Dismissing puts the bubble away without signing the step off; the next
        // tip appears once the room has actually caught up with this one.
        this.coachHidden = true;
        this.ui.hideCoach();
      },
    );
  }

  /**
   * Show the player the thing the tip is about. Deliberately never advances the
   * thread on its own: a step is only finished by whatever it asks for actually
   * happening, so "Show me" cannot be tapped through the first hour.
   */
  private onCoachCta(step: CoachStep): void {
    const action = coachAction(step, this.coachContext());
    if (action.mark) this.seen.add(action.mark);
    if (action.sheet) this.openSheet(action.sheet.panel, action.sheet.tab);
    else if (action.place) this.startPlacing(action.place);
    else if (action.focus) this.focusTile(action.focus.tx, action.focus.ty);
    this.checkCoach(true);
  }

  private advanceCoach(to: number): void {
    this.game.data.tutorialStep = to;
    this.coachSince = coachBaseline(this.game);
    this.coachHidden = false;
    this.game.touch();
    this.save();
    this.showCoach();
  }

  private coachCheck = 0;
  /** Set when the player puts the current tip away by hand, until the next one. */
  private coachHidden = false;
  /** Where the counters stood when the tip on screen went up. */
  private coachSince: CoachBaseline = { customersServed: 0, tablesCleaned: 0 };

  private checkCoach(immediate = false): void {
    this.coachCheck += 1;
    if (!immediate && this.coachCheck % 30 !== 0) return;
    const index = this.game.data.tutorialStep;
    if (index >= COACH_STEPS.length) return;
    const next = coachProgress(index, this.coachContext());
    if (next !== index) this.advanceCoach(next);
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
    else this.onPlayTap(t.tx, t.ty);
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

  /**
   * A tap on the floor is a command, not an inspection. Guests, workers and
   * fixtures each have one obvious thing the player would want to happen, and
   * the sim answers with either a change or the reason there was none.
   *
   * Actors are picked by proximity rather than by tile, because a queueing guest
   * stands on a fractional position outside the door and rounding them to a tile
   * makes them feel unclickable.
   */
  private onPlayTap(fx: number, fy: number): void {
    if (this.tapAt(fx, fy, false)) return;

    /*
     * Nothing on the floor there. The markers a player actually aims at — the
     * badge over a dirty table, a guest's thought bubble, the z's over a worker
     * who has stopped — are drawn well above the tile they belong to, and
     * picking ignores height, so a tap on one lands on empty floor several steps
     * up-screen. One unit of height shifts the pick by exactly one step along
     * both tile axes, so walking back down that diagonal finds whatever the
     * marker was attached to: the badge sits 1.4 up, a bubble around 2.2, a name
     * plate 2.7, and the z's over a stopped worker higher still.
     */
    for (let back = 1; back <= 5.8; back += 0.25) {
      if (this.tapAt(fx + back, fy + back, true)) return;
    }
  }

  /**
   * Act on whatever is at a fractional tile position. `viaMarker` restricts the
   * hit to things that draw something above themselves, so probing up-screen for
   * a badge can never quietly select a fixture the player was not pointing at.
   */
  private tapAt(fx: number, fy: number, viaMarker: boolean): boolean {
    const staff = nearestActor(this.game.data.staff, fx, fy);
    if (staff) {
      const spent = staff.state === 'exhausted' || staff.energy < 25;
      if (spent) {
        audio.play('tap');
        this.toast(
          staff.state === 'exhausted'
            ? `${staff.name} has stopped — feed them here`
            : `${staff.name} is flagging at ${Math.round(staff.energy)}% — feed them here`,
          'bad',
        );
        this.openSheet('staff', 'team');
        return true;
      }
      if (!viaMarker) {
        audio.play('tap');
        this.toast(
          `${staff.name} is ${describeStaffState(staff.state)} (${Math.round(staff.energy)}% energy)`,
          'info',
        );
        return true;
      }
    }

    const customer = nearestActor(this.game.customers, fx, fy);
    if (customer && (!viaMarker || hasMarker(customer))) {
      audio.play('tap');
      if (customer.state === 'queueing' || customer.state === 'entering') {
        this.runCommand(this.sim.seatGuest(customer));
        return true;
      }
      const patience = Math.round(customer.patience * 100);
      this.toast(`${customer.name} · ${patience}% patience left`, patience < 35 ? 'bad' : 'info');
      return true;
    }

    const placed = this.sim.grid.anyAt(Math.floor(fx), Math.floor(fy));
    const def = placed ? this.game.defOf(placed) : undefined;
    if (!placed || !def) return false;

    if (placed.dirty) {
      audio.play('tap');
      this.runCommand(this.sim.cleanTable(placed));
      return true;
    }
    if (placed.plates?.length) {
      audio.play('tap');
      this.runCommand(this.sim.runPlateOut(placed));
      return true;
    }
    if (viaMarker) return false;
    audio.play('tap');
    this.toast(def.name, 'info');
    return true;
  }

  /** Report a command back to the player and keep the save honest. */
  private runCommand(result: CommandResult): void {
    this.toast(result.message, result.ok ? 'good' : result.kind);
    if (result.ok) {
      this.save();
      return;
    }
    audio.play('error');
    // Pan to whatever is in the way if it is not already in shot, so being told
    // to tap the dirty table does not turn into a hunt around the room.
    if (result.at && !this.isOnScreen(result.at)) this.focusTile(result.at.tx, result.at.ty);
  }

  private isOnScreen(at: { tx: number; ty: number }, margin = 70): boolean {
    const w = tileToWorld(at.tx + 0.5, at.ty + 0.5);
    const p = this.camera.worldToScreen(w.x, w.y);
    return (
      p.x > margin &&
      p.x < this.camera.viewW - margin &&
      p.y > margin &&
      p.y < this.camera.viewH - margin
    );
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

  showTextExport(options: TextExportOptions): void {
    this.ui.showTextExport(options);
  }

  promptImportText(options: TextImportOptions): Promise<string | null> {
    return this.ui.promptImportText(options);
  }

  focusTile(tx: number, ty: number): void {
    const w = tileToWorld(tx + 0.5, ty + 0.5);
    this.camera.glideTo(w.x, w.y);
  }

  /**
   * Autosave, and say so the once when the browser refuses it. A save that is
   * quietly dropped is how a diner disappears without warning, so the player is
   * told while there is still a session to copy out of Settings.
   */
  save(): void {
    // A sealed game is on its way out; its slot belongs to another diner now.
    if (this.game.sealed) return;
    if (this.game.save()) {
      this.saveRefused = false;
      return;
    }
    if (this.saveRefused) return;
    this.saveRefused = true;
    this.toast('This browser would not store your progress — copy your save from Manage', 'bad');
  }

  private saveRefused = false;
}

/** Name what a level or a star just opened up, skipping whatever it did not. */
function unlockLines(unlocks: Unlocks): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = [];
  if (unlocks.dishes.length) lines.push({ label: 'New recipes', value: unlocks.dishes.join(', ') });
  if (unlocks.furniture.length) {
    lines.push({ label: 'New in the shop', value: unlocks.furniture.join(', ') });
  }
  if (unlocks.regulars.length) {
    lines.push({ label: 'New regular', value: unlocks.regulars.join(', ') });
  }
  return lines;
}

/** Whether this guest has a bubble or a name plate floating over them. */
function hasMarker(c: Customer): boolean {
  if (c.regularId !== null) return true;
  return c.state !== 'entering' && c.state !== 'walkingToSeat' && c.state !== 'leaving';
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

  // Work the missed shift before the session starts, so everything that reads
  // the room on load — the coach's baseline included — sees where it stands now
  // rather than where it stood when the tab was shut. Saving straight after is
  // what stops the same stretch of time being paid for twice.
  const away = saved ? catchUpWhileAway(game, (Date.now() - saved.data.savedAt) / 1000) : null;
  if (saved) game.save();

  const app = new App(game, uiRoot, canvas, away);
  app.start();

  bootScreen?.classList.add('hidden');
  window.setTimeout(() => bootScreen?.remove(), 500);

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

  // A tab that was already controlled is running the previous build. The worker
  // claims its clients as soon as it activates, so that hand-over is the moment
  // the new build is on disk and one reload picks it up. A first visit goes from
  // no controller to a controller too, and must not reload out from under itself.
  const wasControlled = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!wasControlled || reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      // `updateViaCache: 'none'` keeps the update check off the HTTP cache, so a
      // stale copy of sw.js cannot be what decides there is nothing new.
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .catch(() => {
        // Offline support is a bonus; a failed registration must not break play.
      });
  });
}

boot();
