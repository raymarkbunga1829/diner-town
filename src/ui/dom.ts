type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/**
 * Terse element builder. Keys starting with `on` attach listeners, `class` and
 * `text`/`html` are special-cased, everything else becomes an attribute.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Array<Node | string | null | undefined> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** 1234567 -> "1,234,567" */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Compact coin display for tight spaces: 12500 -> "12.5k" */
export function fmtShort(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) < 10000) return fmt(v);
  if (Math.abs(v) < 1_000_000) return `${(v / 1000).toFixed(v < 100000 ? 1 : 0)}k`;
  return `${(v / 1_000_000).toFixed(2)}m`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmt(n)} ${n === 1 ? one : many}`;
}

/**
 * Draw into a canvas at device-pixel resolution so procedural icons stay crisp.
 * Returns the 2D context already scaled to CSS pixels.
 */
export function makeCanvas(
  cssWidth: number,
  cssHeight: number,
  className?: string,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  if (className) canvas.className = className;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
}
