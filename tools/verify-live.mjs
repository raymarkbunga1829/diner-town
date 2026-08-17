/**
 * First-hand verification of a deployed build, driven over the Chrome DevTools
 * Protocol. Loads the URL in a throwaway headless Chrome profile, records every
 * console message, uncaught exception and failed request, then inspects the live
 * page to confirm the game actually booted.
 *
 * Usage: node tools/verify-live.mjs <url>
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_UNDER_TEST = process.argv[2];
if (!URL_UNDER_TEST) {
  console.error('usage: node tools/verify-live.mjs <url> [WIDTHxHEIGHT]');
  process.exit(2);
}

const [, VIEW_W = '1440', VIEW_H = '900'] = /^(\d+)x(\d+)$/.exec(process.argv[3] ?? '') ?? [];
const width = Number(VIEW_W);
const height = Number(VIEW_H);
const mobile = width < 700;

const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), 'verify-chrome-'));

const chrome = spawn(
  '/opt/google/chrome/chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--no-sandbox',
    `--window-size=${width},${height}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome never exposed a debugging target');
}

const consoleMessages = [];
const exceptions = [];
const httpFailures = [];

// Flipped off around the deliberate offline reload, where request failures and
// the resulting console noise are the expected outcome rather than a defect.
let recording = true;

function finish(code) {
  chrome.kill('SIGKILL');
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  process.exit(code);
}

const ws = new WebSocket(await targetUrl());
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);

  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
    return;
  }

  if (!recording && msg.method !== 'Runtime.evaluate') {
    if (
      msg.method === 'Runtime.consoleAPICalled' ||
      msg.method === 'Runtime.exceptionThrown' ||
      msg.method === 'Log.entryAdded' ||
      msg.method === 'Network.responseReceived' ||
      msg.method === 'Network.loadingFailed'
    ) {
      return;
    }
  }

  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args ?? [])
      .map((a) => a.value ?? a.description ?? a.unserializableValue ?? `<${a.type}>`)
      .join(' ');
    consoleMessages.push(`[${msg.params.type}] ${text}`);
  }

  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    exceptions.push(d.exception?.description ?? d.text ?? 'unknown exception');
  }

  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error' || e.level === 'warning') {
      consoleMessages.push(`[log:${e.level}] ${e.text}${e.url ? ` (${e.url})` : ''}`);
    }
  }

  if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
    httpFailures.push(`${msg.params.response.status} ${msg.params.response.url}`);
  }

  if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) {
    httpFailures.push(`FAILED ${msg.params.errorText} ${msg.params.requestId}`);
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', () => reject(new Error('CDP socket error')), { once: true });
});

await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Page.enable');

await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: mobile ? 3 : 1,
  mobile,
});
if (mobile) {
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}

console.log(`Loading ${URL_UNDER_TEST} at ${width}x${height} (${mobile ? 'mobile' : 'desktop'}) ...`);
await send('Page.navigate', { url: URL_UNDER_TEST });

// Long enough for the boot screen to clear and the simulation to tick.
await sleep(18000);

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result?.value;
}

const probe = await evaluate(`(() => {
  const canvas = document.querySelector('canvas');
  const save = localStorage.getItem('diner-town/save/v1');
  const parsed = save ? JSON.parse(save) : null;
  const text = document.body.innerText;
  return {
    origin: location.origin,
    href: location.href,
    canvas: canvas ? { w: canvas.width, h: canvas.height } : null,
    bootVisible: !!document.querySelector('#boot'),
    dockButtons: document.querySelectorAll('.dock button').length,
    topbarText: (document.querySelector('.topbar')?.innerText ?? '').replace(/\\n/g, ' | '),
    hasSave: !!save,
    saveDay: parsed?.stats?.days ?? parsed?.day ?? null,
    saveCoins: parsed?.coins ?? null,
    saveLevel: parsed?.level ?? null,
    serviceWorker: navigator.serviceWorker?.controller ? 'active' : 'none-yet',
    bodyTextSample: text.slice(0, 200).replace(/\\n/g, ' | '),
  };
})()`);

// Is the canvas actually drawing, or is it a blank rectangle?
const painted = await evaluate(`(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return null;
  const probeCtx = canvas.getContext('2d');
  if (!probeCtx) return 'no-2d-context';
  const { width, height } = canvas;
  const data = probeCtx.getImageData(0, 0, width, height).data;
  const seen = new Set();
  for (let i = 0; i < data.length; i += 4 * 997) {
    seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (seen.size > 40) break;
  }
  return { distinctColoursSampled: seen.size };
})()`);

// Work through the dock and confirm each entry does its job. Every button opens
// a sheet except "Build", which switches the scene into build mode instead.
const panels = await evaluate(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const buttons = [...document.querySelectorAll('.dock button')];
  const out = [];
  for (const button of buttons) {
    const id = button.getAttribute('data-id') ?? '?';
    const label = (button.innerText || id).trim();
    button.click();
    await wait(500);

    if (id === 'build') {
      const bar = document.querySelector('.buildbar');
      out.push({
        label,
        kind: 'build-mode',
        opened: !!bar,
        textLength: bar ? bar.innerText.trim().length : 0,
      });
      // Leave build mode again so it cannot interfere with the sheet checks.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(300);
      continue;
    }

    const body = document.querySelector('.sheet-body');
    out.push({
      label,
      kind: 'sheet',
      opened: document.querySelector('.sheet')?.classList.contains('show') ?? false,
      children: body ? body.children.length : 0,
      textLength: body ? body.innerText.trim().length : 0,
    });
    document.querySelector('.sheet-close')?.click();
    await wait(300);
  }
  return out;
})()`);

// On a phone-sized viewport, nothing should spill outside the visible area.
const layout = await evaluate(`(() => {
  const dock = document.querySelector('.dock');
  const rect = dock?.getBoundingClientRect();
  return {
    horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    dockWithinViewport: rect
      ? rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1
      : null,
    dockRect: rect ? { l: Math.round(rect.left), r: Math.round(rect.right), b: Math.round(rect.bottom) } : null,
  };
})()`);

// The service worker claims to make the game playable with no network. Cut the
// connection and reload to find out whether that is true.
recording = false;
await send('Network.emulateNetworkConditions', {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
});
await send('Page.reload', { ignoreCache: false });
await sleep(9000);

const offline = await evaluate(`(() => {
  const canvas = document.querySelector('canvas');
  return {
    booted: !!canvas && !document.querySelector('#boot'),
    canvasPainted: canvas ? canvas.width > 0 && canvas.height > 0 : false,
    dockButtons: document.querySelectorAll('.dock button').length,
    topbarText: (document.querySelector('.topbar')?.innerText ?? '').replace(/\\n/g, ' | '),
  };
})()`);

await send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
});

console.log('\n=== page probe ===');
console.log(JSON.stringify(probe, null, 2));
console.log('\n=== canvas paint check ===');
console.log(JSON.stringify(painted, null, 2));
console.log('\n=== panels ===');
console.log(JSON.stringify(panels, null, 2));
console.log('\n=== layout ===');
console.log(JSON.stringify(layout, null, 2));
console.log('\n=== offline reload (service worker) ===');
console.log(JSON.stringify(offline, null, 2));
// Synthetic clicks are not a user activation gesture, so Chrome refuses to start
// the AudioContext and warns once per attempt. That is an artefact of driving the
// page from script, not a fault in the build.
const AUTOMATION_ARTEFACT = /AudioContext was not allowed to start/;
const realMessages = consoleMessages.filter((m) => !AUTOMATION_ARTEFACT.test(m));
const artefacts = consoleMessages.length - realMessages.length;

console.log('\n=== console messages ===');
console.log(realMessages.length ? realMessages.join('\n') : '(none)');
if (artefacts) {
  console.log(`(plus ${artefacts} expected "AudioContext was not allowed to start" warnings from synthetic clicks)`);
}
console.log('\n=== uncaught exceptions ===');
console.log(exceptions.length ? exceptions.join('\n') : '(none)');
console.log('\n=== failed requests ===');
console.log(httpFailures.length ? httpFailures.join('\n') : '(none)');

const problems = [];
if (!probe) problems.push('page probe returned nothing');
if (probe && !probe.origin.startsWith('https://')) problems.push(`not served over https: ${probe.origin}`);
if (probe && !probe.canvas) problems.push('no canvas element');
if (probe && probe.bootVisible) problems.push('boot screen never cleared');
if (probe && probe.dockButtons === 0) problems.push('no dock buttons rendered');
if (probe && !probe.hasSave) problems.push('no save written to localStorage');
if (painted && painted.distinctColoursSampled !== undefined && painted.distinctColoursSampled < 5) {
  problems.push(`canvas looks blank (${painted.distinctColoursSampled} distinct colours sampled)`);
}
for (const panel of panels ?? []) {
  if (!panel.opened) problems.push(`dock entry "${panel.label}" (${panel.kind}) did not open`);
  else if (panel.textLength < 10) {
    problems.push(`dock entry "${panel.label}" opened empty (${panel.textLength} chars of text)`);
  }
}
if (layout && layout.horizontalOverflow > 1) {
  problems.push(`content overflows horizontally by ${layout.horizontalOverflow}px`);
}
if (layout && layout.dockWithinViewport === false) {
  problems.push(`dock sits outside the viewport: ${JSON.stringify(layout.dockRect)}`);
}
if (offline && !offline.booted) problems.push('game did not boot offline (service worker fallback failed)');
if (offline && offline.dockButtons === 0) problems.push('no dock buttons after the offline reload');
if (exceptions.length) problems.push(`${exceptions.length} uncaught exception(s)`);
if (httpFailures.length) problems.push(`${httpFailures.length} failed request(s)`);

console.log('\n=== verdict ===');
if (problems.length) {
  console.log('FAIL');
  for (const p of problems) console.log(` - ${p}`);
  finish(1);
} else {
  console.log('PASS — deployed build boots, paints and saves with no errors.');
  finish(0);
}
