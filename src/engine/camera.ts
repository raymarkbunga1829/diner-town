import { clamp, lerp, worldToTile, type Point, type Tile } from './iso';

export const MIN_ZOOM = 0.45;
export const MAX_ZOOM = 2.4;

/**
 * A 2D camera over world-pixel space. `x`/`y` is the world point pinned to the
 * centre of the viewport.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  /** Viewport size in CSS pixels. */
  viewW = 1;
  viewH = 1;

  private targetX = 0;
  private targetY = 0;
  private targetZoom = 1;
  private smoothing = true;

  setViewport(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  /** Jump immediately, skipping the easing. */
  snapTo(x: number, y: number, zoom = this.zoom): void {
    this.x = this.targetX = x;
    this.y = this.targetY = y;
    this.zoom = this.targetZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.targetX -= dxScreen / this.zoom;
    this.targetY -= dyScreen / this.zoom;
    // Dragging must track the finger exactly, so bypass easing.
    this.x = this.targetX;
    this.y = this.targetY;
  }

  glideTo(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
    this.smoothing = true;
  }

  /** Zoom while keeping the world point under `anchor` (screen px) stationary. */
  zoomAt(factor: number, anchor: Point): void {
    const next = clamp(this.targetZoom * factor, MIN_ZOOM, MAX_ZOOM);
    const applied = next / this.targetZoom;
    if (applied === 1) return;

    const before = this.screenToWorld(anchor.x, anchor.y);
    this.targetZoom = next;
    this.zoom = next;
    const after = this.screenToWorld(anchor.x, anchor.y);

    this.targetX += before.x - after.x;
    this.targetY += before.y - after.y;
    this.x = this.targetX;
    this.y = this.targetY;
  }

  update(dt: number): void {
    if (!this.smoothing) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.zoom = this.targetZoom;
      return;
    }
    const t = 1 - Math.pow(0.001, dt);
    this.x = lerp(this.x, this.targetX, t);
    this.y = lerp(this.y, this.targetY, t);
    this.zoom = lerp(this.zoom, this.targetZoom, t);
    if (Math.abs(this.x - this.targetX) < 0.05 && Math.abs(this.y - this.targetY) < 0.05) {
      this.x = this.targetX;
      this.y = this.targetY;
    }
  }

  /**
   * Keep the camera near the playable area so the player cannot get lost in
   * empty space. A slack margin still allows a comfortable overscroll.
   */
  clampToBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    const slack = 200;
    this.targetX = clamp(this.targetX, minX - slack, maxX + slack);
    this.targetY = clamp(this.targetY, minY - slack, maxY + slack);
    this.x = clamp(this.x, minX - slack, maxX + slack);
    this.y = clamp(this.y, minY - slack, maxY + slack);
  }

  worldToScreen(x: number, y: number): Point {
    return {
      x: (x - this.x) * this.zoom + this.viewW / 2,
      y: (y - this.y) * this.zoom + this.viewH / 2,
    };
  }

  screenToWorld(sx: number, sy: number): Point {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  screenToTile(sx: number, sy: number): Tile {
    const w = this.screenToWorld(sx, sy);
    return worldToTile(w.x, w.y);
  }

  /** Apply this camera to a canvas context. Caller is responsible for save/restore. */
  applyTo(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.viewW / 2, this.viewH / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
}
