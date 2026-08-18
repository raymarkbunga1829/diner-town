/**
 * Hold a deployed site against the shell this commit just built.
 *
 * The failure this exists to catch is quiet: a merge lands, the build is fine,
 * and the URL keeps handing out an `index.html` that names last week's bundle —
 * because something between the build and the browser kept a copy. So this asks
 * the live URL what it is serving, compares the fingerprinted entry script with
 * the one in `dist/index.html`, and prints the cache headers it was given.
 *
 * Usage: node tools/check-live-shell.mjs <url> [dist/index.html]
 *
 * A deploy takes as long as it takes, so drift is a warning by default and the
 * script still exits 0: it is a report on production, not a verdict on a commit.
 * Set STRICT=1 to make drift and a bad cache policy fail the run instead.
 */

import { readFileSync } from 'node:fs';

const [url, shellPath = 'dist/index.html'] = process.argv.slice(2);
if (!url) {
  console.error('usage: node tools/check-live-shell.mjs <url> [dist/index.html]');
  process.exit(2);
}

const STRICT = process.env.STRICT === '1';
const WAIT_SECONDS = Number(process.env.WAIT_SECONDS ?? 180);
const POLL_SECONDS = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GitHub renders these on the run itself, so a warning is not just log noise. */
function report(level, message) {
  if (process.env.GITHUB_ACTIONS) console.log(`::${level}::${message}`);
  else console.log(`${level.toUpperCase()}: ${message}`);
}

/** The fingerprinted entry script a built shell points at. */
function entryScript(html) {
  for (const match of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/gi)) {
    if (/\/assets\/.*-[A-Za-z0-9_-]{8,}\.js$/.test(match[1])) return match[1];
  }
  return null;
}

const built = entryScript(readFileSync(shellPath, 'utf8'));
if (!built) {
  console.error(`No fingerprinted entry script in ${shellPath}. Was the project built?`);
  process.exit(2);
}
console.log(`built  ${shellPath} -> ${built}`);

/** Ask for the shell the way a returning player's browser does: no stale copies. */
async function liveShell() {
  const response = await fetch(url, {
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return { html: await response.text(), headers: response.headers };
}

let live = null;
let served = null;
const deadline = Date.now() + WAIT_SECONDS * 1000;
for (let attempt = 1; ; attempt++) {
  try {
    live = await liveShell();
    served = entryScript(live.html);
    console.log(`live   ${url} -> ${served ?? '(no fingerprinted script)'}`);
    if (served === built) break;
  } catch (error) {
    console.log(`live   ${url} -> unreachable (${error.message})`);
  }
  if (Date.now() + POLL_SECONDS * 1000 > deadline) break;
  console.log(`       waiting ${POLL_SECONDS}s for the deploy to land (attempt ${attempt})`);
  await sleep(POLL_SECONDS * 1000);
}

const problems = [];

if (!live) {
  report('warning', `${url} never answered within ${WAIT_SECONDS}s.`);
} else if (served !== built) {
  problems.push(
    `${url} is serving ${served ?? 'no fingerprinted script'} but this commit built ${built}. ` +
      `A deploy that has not landed yet looks identical to a cached shell, so check ` +
      `x-vercel-cache and age on the response before blaming the build.`,
  );
}

/** A URL whose contents change without its name changing must be re-asked for. */
function mustRevalidate(value) {
  if (!value) return false;
  const policy = value.toLowerCase();
  if (policy.includes('immutable')) return false;
  return /no-store|no-cache/.test(policy) || (/max-age=0/.test(policy) && /must-revalidate/.test(policy));
}

if (live) {
  const cacheHeaders = [];
  const shellPolicy = live.headers.get('cache-control');
  cacheHeaders.push(['(shell)', shellPolicy]);
  if (!mustRevalidate(shellPolicy)) {
    problems.push(`the shell is served with Cache-Control: ${shellPolicy ?? 'unset'}`);
  }

  const base = new URL(url);
  for (const path of ['sw.js', 'manifest.webmanifest']) {
    try {
      const response = await fetch(new URL(path, base), { headers: { 'cache-control': 'no-cache' } });
      const policy = response.headers.get('cache-control');
      cacheHeaders.push([path, policy]);
      if (response.ok && !mustRevalidate(policy)) {
        problems.push(`${path} is served with Cache-Control: ${policy ?? 'unset'}`);
      }
    } catch (error) {
      report('warning', `could not read ${path}: ${error.message}`);
    }
  }

  if (served) {
    try {
      const response = await fetch(new URL(served, base));
      const policy = response.headers.get('cache-control');
      cacheHeaders.push([served, policy]);
      if (response.ok && !(policy ?? '').includes('immutable')) {
        problems.push(`the fingerprinted bundle is served with Cache-Control: ${policy ?? 'unset'}`);
      }
    } catch (error) {
      report('warning', `could not read ${served}: ${error.message}`);
    }
  }

  console.log('\ncache-control');
  for (const [what, policy] of cacheHeaders) console.log(`  ${what}: ${policy ?? '(unset)'}`);
}

console.log('');
if (problems.length === 0) {
  console.log(`PASS — ${url} is serving this build, and nothing may hold on to the shell.`);
  process.exit(0);
}
for (const problem of problems) report(STRICT ? 'error' : 'warning', problem);
console.log(STRICT ? 'FAIL' : 'WARN (set STRICT=1 to make this fail)');
process.exit(STRICT ? 1 : 0);
