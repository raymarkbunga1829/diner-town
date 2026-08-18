# Diner Town

A browser-based restaurant management simulation in the spirit of Playfish's
**Restaurant City**: build out a dining room tile by tile, staff it, stock the
pantry, design a menu, and keep a stream of hungry customers happy.

It runs in any modern browser and is built mobile-first — touch to pan, pinch to
zoom, tap to place — while still feeling right with a mouse and keyboard on a
desktop. There is no backend, no login and no build-time asset pipeline: the
whole game is a single static bundle that saves to `localStorage`.

## Playing

| | |
|---|---|
| **Pan** | Drag with one finger, or click and drag |
| **Zoom** | Pinch, or scroll the mouse wheel |
| **Place / select** | Tap a tile in build mode |
| **Give an order** | Tap a guest, a dirty table, a waiting plate or a tired worker |
| **Shortcuts** | `B` build mode · `R` rotate · `G` grid · `F` recentre · `1`/`2`/`3` speed · `Esc` back |

### The loop

1. Customers arrive through the door and queue for a **clean seat next to a table**.
2. They pick something from your **menu** — but only dishes you have the ingredients for.
3. A **waiter** takes the order, a **chef** cooks it at a **stove**, and a waiter runs the plate out.
4. The guest eats, pays, and leaves the table dirty. A **cleaner** wipes it so it can be reseated.
5. Everyone has a patience meter. Run out of seats, stoves, staff or ingredients and people walk out, which hurts your rating.

### Working the floor

The team runs the room on its own, so the game keeps ticking over while you are
in a panel, and works part of a shift for you when you shut the tab. When you do
want to intervene, tap what you want dealt with — including the marker floating
above it:

- **A guest at the door** walks to the nearest clean seat. If they cannot sit, the toast says why and rings the table that is in the way.
- **A dirty table** pulls the nearest free hand over to wipe it, cleaners first, so energy and wages still count.
- **A plate waiting on a counter or stove** is run out by the nearest free waiter, which is also how you unblock a kitchen with nowhere to put the next dish.
- **A worker who has stopped** opens the team list where you can feed them.

### The first hour

A coach thread runs alongside the game rather than in front of it — nothing is
ever paused, and the **×** hides a tip you would rather work out for yourself
until the next one is ready. What a tip will not do is tick itself off. Each one
waits for the thing it teaches to happen *while it is on screen*: the welcome
clears when a guest has eaten and paid, the cleaning tip when a table has gone
from dirty back to clean, the seating tip when the room has six seats a guest
could really sit in — a chair touching a table with a walkway to it, not a stool
parked on its own. Counting only what happens from the moment a tip appears is
what stops the team quietly satisfying a lesson before it has been read.
**Show me** pans to whatever the tip is about, opens the panel that fixes it
(hiring, when the wiping tip finds no cleaner), or starts placing the piece you
are missing, so reading the Market and the Menu still introduces them without
standing in for a shift.

### Keeping your diner

The game has no account, so the save lives in this browser's `localStorage` — and
a browser can throw that away. **Manage → Settings → Your save** is the way out
of that: **Copy save** hands you the whole diner as text to copy or download, and
**Load a save** takes it back, from a paste or the downloaded file, on any browser
or phone. Loading tells you whose diner is in the text before it replaces
anything, refuses text that is not a save without touching the game you are
playing, and puts the diner you were on into the **backup diner** slot — a second
key in the same browser that also catches **Start over**. Imports go through the
same migration a reload does, so a copy from an older build comes back with
everything added since.

### What drives progression

- **Dish mastery.** Every serving earns a recipe experience. Each of the ten mastery levels adds 12% to the price and shaves a little off the cook time, so a focused menu cooked constantly beats a sprawling one.
- **Star rating.** A weighted blend of Style (decor), Service (how fast you serve), Cleanliness (dirty tables) and Menu quality. Together with the size of the room it sets how often customers arrive, so it is the main dial you are turning.
- **Style.** Your decor is judged against the floor it has to fill rather than against your seating, so adding tables and chairs never drags the rating down. The first few pieces move the number the most, a room with nothing in it scores close to nothing, and every expansion leaves more floor to dress.
- **Seats you can fill.** Arrivals scale with the seats a guest could really sit in — a chair touching a table with a walkway to it — and a dirty table takes its whole group out of service until it is wiped. Stools parked on their own pull nobody in, so a room of fake seats never fills up with a queue it cannot serve. Reputation in Manage shows how many of your chairs count.
- **Restaurant level.** Earned by serving food; unlocks recipes, furniture, menu slots, staff positions and dining-room extensions up to 16x16. It runs to level 20, and every level to the top has a recipe and something in the shop waiting behind it.
- **Fame.** Once the level track caps out, the experience your kitchen earns becomes fame instead, and fame buys stars. The first five each hand over something real — a recipe, a showpiece, a face, a menu slot or a staff position past the usual ceiling — along with the title the diner is known by, from *Word of Mouth* up to *Diner of the Year*. After that stars keep counting, so the number is a score rather than a second wall. The fame bar only appears at the cap; nothing about the first hour changes.
- **Staff.** Waiters, chefs and cleaners each have a skill level you can train and an energy bar that drains as they work. Wages come out of the till at the start of every in-game day.
- **Regulars.** Eight named guests come back on their own cadence from your first morning, and three more arrive with the food they came for at the far end of the climb, each hoping for a particular dish drawn from your menu. Serve it to one of them while they are still in a good mood and they tip, hand over experience and return sooner; walk them out and it costs you twice over and they stay away. Manage lists who is due and what they are hoping for.
- **The day recap.** Crossing into a new day brings up that day's card: covers, walkouts, dish takings, tips, wages owed against wages paid, and the one thing worth doing before tomorrow. Manage keeps the last day's figures next to the lifetime totals.
- **Time away.** Close the tab and your team works on for a while, then locks up. The card waiting for you shows what that came to and what it cost: covers served, ingredients out of the pantry, wages for any day that ended, and what was actually left in the till. A whole night away is credited with one in-game day, so a shift you play is always worth more than one you skip — and a diner that could not have opened, whether the door was shut, the room had no seats, the kitchen had nobody in it or the pantry was bare, earns nothing at all. Stocking up before you go is what makes a shift away worth having.

## Running it locally

Requires Node 20 or newer.

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build     # typecheck, then bundle to dist/
npm run preview   # serve the production build
npm run typecheck # tsc --noEmit
npm run check     # headless sanity checks (see below)
npm run deploy    # build and publish to GitHub Pages without Actions
npm run verify:live <url> [WIDTHxHEIGHT]   # smoke-test a deployed build
npm run verify:shell <url>                 # is that URL serving this build?
```

`npm run check` bundles `tools/checks.ts` with esbuild and runs it under Node. It
covers the things that are easiest to get subtly wrong — the isometric
round-trip, picking a wall panel from a screen position, pathfinding and the
"don't let the player seal off the doorway" rule, the mastery curve — and then
runs four in-game minutes of the real simulation headlessly to confirm customers
are actually seated, fed and charged. It round-trips a played-in diner through
export and import to prove the same coins, room and regulars come back, and
throws a dozen kinds of rubbish at the importer to prove none of them can replace
a good save. It also replays the onboarding coach the way
the buttons drive it, to prove a game that only opens panels cannot finish it and
one that serves and wipes can, and holds the shift you get for being away against
twenty minutes of the shift you get for playing, so time away can never be the
better deal. The late game gets the same treatment: every level from 17 to 20 has
to hand over a recipe and something to buy, the late menu has to stay slow money
rather than free money, a maxed-out diner has to turn only the experience *past*
the cap into fame and unlock what the star promised, and none of it may be
visible to a diner on its first day.

It finishes on the least game-like thing in the repository: it runs the real
`public/sw.js` in-process against a stand-in cache and network, deploys a second
build over the first, and insists the shell, the worker and the manifest all come
back from the network while the fingerprinted bundle comes back from the cache
untouched — then pulls the plug and insists the game still boots. The same section
reads `vercel.json` and fails if the worker and the CDN disagree about which URLs
are safe to keep.

## Publishing this to your own GitHub repo

The project is already a git repository with its full history committed, so it
only needs a remote. Create an empty repository on GitHub (no README, no
`.gitignore` — this repo has both), then from the project directory:

```bash
git remote add origin https://github.com/<your-username>/diner-town.git
git branch -M main
git push -u origin main
```

Or, with the [GitHub CLI](https://cli.github.com) authenticated (`gh auth login`),
one command does the whole thing:

```bash
gh repo create diner-town --public --source=. --remote=origin --push
```

## Deploying

The bundle in `dist/` is plain static files, so any static host works. A GitHub
Actions workflow for GitHub Pages is included at
`.github/workflows/deploy.yml`; enable Pages for the repository with
**Settings → Pages → Source → GitHub Actions** and every push to `main`
publishes the game.

Because Pages serves projects from a subpath, the workflow passes the repository
name through `BASE_PATH`. For any other host the default (`/`) is correct.

### What may be cached, and for how long

Vite fingerprints its output, which sorts every URL the site serves into two
kinds. `assets/index-DlPaTXX-.js` is a promise about its bytes — the name changes
when the contents do — so it is cached for a year and marked `immutable`, both by
the CDN (`vercel.json`) and by the service worker, which answers it without
touching the network. `index.html`, `/`, `sw.js` and `manifest.webmanifest` keep
the same URL across every deploy, so all four are served `max-age=0,
must-revalidate` and the worker fetches them first and only falls back to its
cache when there is no network. A cached copy of one of those is exactly how a
browser ends up running last week's bundle a week after it shipped.

Bumping `CACHE` in `public/sw.js` is what evicts everything an older worker kept:
`activate` deletes every cache that is not the current one. A player who already
has an old worker gets the new one on their next visit, and because it claims its
clients as soon as it activates, the page reloads itself once onto the new build.

`npm run verify:shell <url>` reports on a deployment: it compares the
fingerprinted entry script in `dist/index.html` with the one the live URL is
serving and prints the cache headers behind both. Drift is a warning, since a
deploy that has not landed yet looks the same as a shell someone is holding on to;
`STRICT=1 npm run verify:shell <url>` turns it into a failure. CI runs it on
pushes to `main` only, for that reason.

After publishing, the workflow runs the deployed URL through a browser smoke test
(see below) at both desktop and phone sizes, so a deploy that publishes but does
not actually work still fails the run.

If Actions is ever unavailable on the account — a disabled runner, a billing hold,
or a private repository without minutes — `npm run deploy` publishes the same
build without it. It builds with the right `BASE_PATH`, force-pushes `dist/` to a
`gh-pages` branch, points Pages at that branch and asks it to rebuild. It needs
an authenticated `gh` CLI and takes about a minute to go live.

To confirm a deploy actually worked, `npm run verify:live <url>` drives headless
Chrome over the DevTools Protocol against the real URL and fails loudly on
anything wrong. It checks that the page is the deployed origin rather than a stray
dev server, that the boot screen clears and the canvas paints, that every dock
entry opens with real content, that a save reaches `localStorage`, that nothing
overflows the viewport, and that the service worker still serves the game with the
network switched off. Pass a viewport to test a phone: `npm run verify:live <url>
390x844`.

Two things it deliberately tolerates. Script-dispatched clicks are not a user
activation gesture, so Chrome refuses to start the `AudioContext` and warns once
per click; those warnings are counted separately and ignored. The offline reload
is expected to fail its network requests, so request errors are not recorded
during that phase. Pointed at `localhost`, it also skips the HTTPS and offline
assertions, since a dev server satisfies neither.

For looking at the art rather than asserting on it, `tools/screenshot.mjs` writes
a PNG of a running build:

```bash
node tools/screenshot.mjs http://localhost:5173/ shot.png 1440x900
node tools/screenshot.mjs http://localhost:5173/ shot.png 390x844 --zoom=8
node tools/screenshot.mjs http://localhost:5173/ shot.png --clock=320 --panel=shop
```

`--zoom` sends that many wheel notches to the canvas, `--clock` jumps the in-game
clock so evening lighting can be reviewed without waiting out a day (dev builds
only), and `--panel` opens a dock panel before the capture.

## How it is put together

```
src/
  engine/     Isometric maths, camera, pointer gestures, seeded RNG, Web Audio SFX
  game/       Rules and state: data tables, grid, A* pathfinding, the simulation
  render/     Canvas drawing: shape primitives, procedural sprites, the scene renderer
  ui/         DOM layer: status bar, dock, sliding panels, modals, tutorial
tools/        Headless checks run by `npm run check`
```

A few decisions worth knowing about:

- **No image or audio files.** Every sprite is drawn with canvas paths from a palette on the furniture definition, and every sound effect is synthesised with the Web Audio API. That keeps the repository text-only and the download tiny.
- **Original 2009-diner look.** The cream, cherry and gold HUD, chibi staff and sunny dining room are original art — a genre homage, not a copy of Playfish or EA assets.
- **The grid is the source of truth.** `game/grid.ts` indexes placed furniture into solid / flat / wall layers and answers all the spatial questions the simulation asks. Placement is rejected if it would strand part of the floor, which is checked with a flood fill from the doorway.
- **Persistent versus live state.** `SaveData` holds only what should survive a reload. Customers, orders and floating text are rebuilt each session, so closing the tab simply sends the current diners home.
- **Time away is worked, not estimated.** Rather than guessing what the diner took while the tab was shut, loading a save fast-forwards the real simulation for the shift you missed, so the same code cooks out of your pantry, ends the day and draws payroll. What being away buys is *time*, and not much of it: a full night away is credited with one in-game day, which is the most that can pass without skipping a payroll or burying one day's card under the next. Playing is always worth more than not playing.
- **Panels are re-rendered, not diffed.** Every panel is a function of current state; a `revision` counter on the game marks state dirty. At this scale it is far simpler than incremental updates and fast enough to be invisible.

## Licence

MIT — see [LICENSE](LICENSE).

This is an original implementation inspired by the design of Restaurant City. It
contains no assets, code or trademarks from that game.
