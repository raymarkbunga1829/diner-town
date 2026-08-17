import type { Camera } from './camera';
import type { Point } from './iso';

/** Movement (CSS px) beyond which a press is treated as a drag, not a tap. */
const TAP_SLOP = 10;
const TAP_MAX_MS = 400;

export interface PointerHandlers {
  onTap(p: Point): void;
  /** Fired continuously while a single pointer is held still over the world. */
  onHold?(p: Point): void;
  onHoverMove?(p: Point | null): void;
  onDragStart?(p: Point): void;
  onDragEnd?(): void;
}

interface Track {
  id: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  startedAt: number;
  moved: boolean;
}

/**
 * Translates mouse, touch and pen events into the small set of gestures the game
 * needs: tap, one-finger drag to pan, two-finger pinch to zoom, wheel to zoom.
 *
 * Drag-to-pan is suppressed while `dragPansCamera` is false, which build mode
 * uses so that dragging paints/moves furniture instead of moving the camera.
 */
export class PointerInput {
  dragPansCamera = true;

  private readonly pointers = new Map<number, Track>();
  private pinchDistance = 0;
  private dragging = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: Camera,
    private readonly handlers: PointerHandlers,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  destroy(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('pointerleave', this.onLeave);
    this.el.removeEventListener('wheel', this.onWheel);
  }

  /** True while at least one pointer is down. */
  get isPressed(): boolean {
    return this.pointers.size > 0;
  }

  /** Call once per frame to emit hold events. */
  update(): void {
    if (this.pointers.size !== 1 || !this.handlers.onHold) return;
    const [t] = [...this.pointers.values()];
    if (!t.moved) return;
    this.handlers.onHold(this.local(t.x, t.y));
  }

  private local(clientX: number, clientY: number): Point {
    const r = this.el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  private onDown = (e: PointerEvent): void => {
    // Ignore right/middle mouse buttons entirely.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      startedAt: performance.now(),
      moved: false,
    });
    if (this.pointers.size === 2) {
      this.pinchDistance = this.currentPinchDistance();
      this.dragging = false;
    }
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    const t = this.pointers.get(e.pointerId);
    if (!t) {
      if (e.pointerType === 'mouse') this.handlers.onHoverMove?.(this.local(e.clientX, e.clientY));
      return;
    }

    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;

    const travelled = Math.hypot(e.clientX - t.startX, e.clientY - t.startY);
    if (travelled > TAP_SLOP) t.moved = true;

    if (this.pointers.size >= 2) {
      const d = this.currentPinchDistance();
      if (this.pinchDistance > 0 && d > 0) {
        this.camera.zoomAt(d / this.pinchDistance, this.pinchCentre());
      }
      this.pinchDistance = d;
      for (const p of this.pointers.values()) p.moved = true;
      e.preventDefault();
      return;
    }

    if (t.moved) {
      if (!this.dragging) {
        this.dragging = true;
        this.handlers.onDragStart?.(this.local(t.startX, t.startY));
      }
      if (this.dragPansCamera) this.camera.panBy(dx, dy);
    }
    this.handlers.onHoverMove?.(this.local(e.clientX, e.clientY));
    e.preventDefault();
  };

  private onUp = (e: PointerEvent): void => {
    const t = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.el.releasePointerCapture?.(e.pointerId);

    if (this.pointers.size < 2) this.pinchDistance = 0;

    if (t) {
      const held = performance.now() - t.startedAt;
      if (!t.moved && held < TAP_MAX_MS) {
        this.handlers.onTap(this.local(t.x, t.y));
      }
    }
    if (this.dragging && this.pointers.size === 0) {
      this.dragging = false;
      this.handlers.onDragEnd?.();
    }
    if (e.pointerType === 'touch' && this.pointers.size === 0) {
      this.handlers.onHoverMove?.(null);
    }
  };

  private onLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && !this.pointers.size) this.handlers.onHoverMove?.(null);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // Trackpad pinch arrives as ctrl+wheel with small deltas; normalise both.
    const intensity = e.ctrlKey ? 0.01 : 0.0016;
    const factor = Math.exp(-e.deltaY * intensity);
    this.camera.zoomAt(factor, this.local(e.clientX, e.clientY));
  };

  private currentPinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private pinchCentre(): Point {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return { x: this.camera.viewW / 2, y: this.camera.viewH / 2 };
    return this.local((a.x + b.x) / 2, (a.y + b.y) / 2);
  }
}
