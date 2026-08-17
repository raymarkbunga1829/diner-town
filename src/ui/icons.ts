/**
 * Inline SVG icon set. Keeping icons as paths avoids emoji rendering differences
 * across platforms and lets them inherit the surrounding text colour.
 */

const PATHS: Record<string, string> = {
  build: 'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.6 2.6-1.4-1.4 2.6-2.6a4 4 0 0 1-1.6-1.6z',
  shop: 'M6 7V6a6 6 0 0 1 12 0v1h2l1 14H3L4 7h2zm2 0h8V6a4 4 0 0 0-8 0v1z',
  menu: 'M5 3h11a3 3 0 0 1 3 3v15H8a3 3 0 0 1-3-3V3zm3 4v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z',
  market:
    'M4 8h16l-1.5 12a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8L4 8zm4-3a4 4 0 0 1 8 0v1h-2V5a2 2 0 0 0-4 0v1H8V5z',
  staff:
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6v1H2v-1zm15.6 1c.3-.6.4-1.3.4-2 0-1.9-.8-3.6-2.1-4.8 3.3.2 6.1 2.6 6.1 5.8v1h-4.4z',
  chart: 'M4 20V10h4v10H4zm6 0V4h4v16h-4zm6 0v-7h4v7h-4z',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9.4 4c0 .6 0 1.2-.1 1.7l2.1 1.6-2 3.4-2.5-1a7.6 7.6 0 0 1-3 1.7L15.5 22h-4l-.4-2.6a7.6 7.6 0 0 1-3-1.7l-2.4 1-2-3.4 2-1.6a8.6 8.6 0 0 1 0-3.4l-2-1.6 2-3.4 2.4 1a7.6 7.6 0 0 1 3-1.7L11.5 2h4l.4 2.6c1.1.3 2.1.9 3 1.7l2.4-1 2 3.4-2 1.6c.1.5.1 1.1.1 1.7z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z',
  rotate:
    'M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
  trash: 'M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 12H7L6 9z',
  move: 'M12 2l3 3h-2v5h5V8l3 3-3 3v-2h-5v5h2l-3 3-3-3h2v-5H6v2l-3-3 3-3v2h5V5H9l3-3z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z',
  minus: 'M5 11h14v2H5z',
  check: 'M9.6 17.2 4.4 12l1.4-1.4 3.8 3.8 8.6-8.6L19.6 7 9.6 17.2z',
  coin: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm.9 15.4v1.3h-1.6v-1.3c-1.5-.2-2.7-1-2.9-2.6h1.7c.1.8.7 1.3 1.9 1.3 1.1 0 1.7-.4 1.7-1.1 0-.6-.4-.9-1.9-1.3-2-.4-3.1-1.1-3.1-2.6 0-1.3 1-2.2 2.6-2.4V7.3h1.6v1.4c1.5.3 2.4 1.2 2.5 2.5h-1.7c-.1-.7-.6-1.2-1.6-1.2-1 0-1.6.4-1.6 1 0 .6.5.9 1.9 1.2 2 .4 3.1 1 3.1 2.6 0 1.4-1 2.4-2.6 2.6z',
  star: 'M12 2.5 15 9l7 .8-5.2 4.7 1.5 6.9L12 17.9 5.7 21.4l1.5-6.9L2 9.8 9 9l3-6.5z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v5.6l4 2.3-1 1.7-5-2.9V7h2z',
  speed: 'M13 2 4 14h6l-1 8 9-12h-6l1-8z',
  pause: 'M7 4h4v16H7V4zm6 0h4v16h-4V4z',
  play: 'M7 4l12 8-12 8V4z',
  sound: 'M4 9h3l5-4v14l-5-4H4V9zm12.5 3a3.5 3.5 0 0 0-2-3.2v6.4a3.5 3.5 0 0 0 2-3.2zM15 3.2v2.1a6.8 6.8 0 0 1 0 13.4v2.1a8.8 8.8 0 0 0 0-17.6z',
  mute: 'M4 9h3l5-4v14l-5-4H4V9zm12.6 1 1.4-1.4L20.4 11l2.4-2.4L24 10l-2.4 2.4L24 14.8l-1.6 1.6-2.4-2.4-2.4 2.4L16 14.8l2.4-2.4L16 10z',
  expand: 'M3 3h8v2H5v6H3V3zm10 0h8v8h-2V5h-6V3zM3 13h2v6h6v2H3v-8zm16 0h2v8h-8v-2h6v-6z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  fire: 'M12 2c1 3.5-1 5-2.5 6.5C8 10 7 11.4 7 13.5A5 5 0 0 0 12 22a5 5 0 0 0 5-5c0-3-2-5-3-7-.8 1-1.5 1.6-2 1.6.6-3.2.4-6.5 0-9.6z',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8z',
  broom: 'M16 2l6 6-5 2-3-3 2-5zM3 21l1-5 6-6 3 3-6 6-4 2z',
  refresh: 'M12 5V2L8 6l4 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7zm7 7h-2a5 5 0 0 1-5 5v-3l-4 4 4 4v-3a7 7 0 0 0 7-7z',
};

export type IconName = keyof typeof PATHS | string;

export function iconSvg(name: IconName, size = 20, color = 'currentColor'): string {
  const d = PATHS[name] ?? PATHS.info!;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" aria-hidden="true"><path d="${d}"/></svg>`;
}

export function iconEl(name: IconName, size = 20, color = 'currentColor'): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'glyph';
  span.innerHTML = iconSvg(name, size, color);
  return span;
}

/** Five-star rating strip used in the top bar. */
export function starsHtml(rating: number, size = 13): string {
  let out = '';
  for (let i = 0; i < 5; i++) {
    const fill = Math.max(0, Math.min(1, rating - i));
    const id = `st${i}-${Math.round(rating * 100)}`;
    out += `<svg class="star" viewBox="0 0 24 24" width="${size}" height="${size}">
      <defs><linearGradient id="${id}">
        <stop offset="${fill * 100}%" stop-color="#f2b429"/>
        <stop offset="${fill * 100}%" stop-color="rgba(168,42,32,0.18)"/>
      </linearGradient></defs>
      <path fill="url(#${id})" d="${PATHS.star}"/>
    </svg>`;
  }
  return `<span class="stars">${out}</span>`;
}
