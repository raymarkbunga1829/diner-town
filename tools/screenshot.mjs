/**
 * Captures screenshots of a running build so visual changes can be reviewed.
 *
 * Loads the URL, optionally fast-forwards the simulation and opens a panel, then
 * writes a PNG. Reuses the same Chrome-over-CDP approach as verify-live.mjs.
 *
 * Usage:
 *   node tools/screenshot.mjs <url> <out.png> [WIDTHxHEIGHT] [--wait=ms] [--panel=shop] [--zoom=1.4]
 *
 * `--clock` and `--eval` poke at the running game through the dev-build handle,
 * which is how moments that take a while to occur naturally — evening light, a
 * level-up, a busy service — can be captured without sitting through them.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
if (!url || !out) {
  console.error('usage: node tools/screenshot.mjs <url> <out.png> [WxH] [--wait=ms] [--panel=id]');
  process.exit(2);
}

const size = /^(\d+)x(\d+)$/.exec(args[2] ?? '');
const width = size ? Number(size[1]) : 1440;
const height = size ? Number(size[2]) : 900;
const mobile = width < 700;
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const waitMs = Number(flag('wait', '9000'));
const panel = flag('panel', '');

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.error('Could not find Chrome; set CHROME_PATH.');
    process.exit(2);
  }
  return found;
}

const profile = mkdtempSync(join(tmpdir(), 'shot-chrome-'));
const chrome = spawn(
  findChrome(),
  [
    '--headless=new',
    '--remote-debugging-port=9334',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--window-size=${width},${height}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'ignore'] },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9334/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome never exposed a target');
}

const ws = new WebSocket(await target());
let id = 1;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = id++;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 2,
  mobile,
});

await send('Page.navigate', { url });
await sleep(waitMs);

// Jump the in-game clock, so evening and night lighting can be reviewed without
// waiting out a trading day. Only works against a dev build.
const clock = flag('clock', '');
if (clock) {
  await send('Runtime.evaluate', {
    expression: `(() => { window.diner.game.data.clock = ${Number(clock)}; })()`,
  });
  await sleep(700);
}

// Arbitrary setup against the dev handle, e.g. --eval="diner.game.addXp(400)".
const evaluate = flag('eval', '');
if (evaluate) {
  await send('Runtime.evaluate', { expression: evaluate });
  await sleep(Number(flag('eval-wait', '600')));
}

// Zoom by feeding the canvas real wheel events, so this goes through the same
// input path a player would use.
const zoomSteps = Number(flag('zoom', '0'));
for (let i = 0; i < zoomSteps; i++) {
  await send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: Math.round(width / 2),
    y: Math.round(height / 2),
    deltaX: 0,
    deltaY: -240,
  });
  await sleep(120);
}
if (zoomSteps) await sleep(900);

if (panel) {
  await send('Runtime.evaluate', {
    expression: `document.querySelector('.dock button[data-id="${panel}"]')?.click()`,
  });
  await sleep(1200);
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(`wrote ${out} (${width}x${height}${panel ? `, panel=${panel}` : ''})`);

chrome.kill('SIGKILL');
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  /* best effort */
}
process.exit(0);
