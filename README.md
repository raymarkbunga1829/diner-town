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
| **Place / select** | Tap a tile |
| **Shortcuts** | `B` build mode · `R` rotate · `G` grid · `F` recentre · `1`/`2`/`3` speed · `Esc` back |

### The loop

1. Customers arrive through the door and queue for a **clean seat next to a table**.
2. They pick something from your **menu** — but only dishes you have the ingredients for.
3. A **waiter** takes the order, a **chef** cooks it at a **stove**, and a waiter runs the plate out.
4. The guest eats, pays, and leaves the table dirty. A **cleaner** wipes it so it can be reseated.
5. Everyone has a patience meter. Run out of seats, stoves, staff or ingredients and people walk out, which hurts your rating.

### What drives progression

- **Dish mastery.** Every serving earns a recipe experience. Each of the ten mastery levels adds 12% to the price and shaves a little off the cook time, so a focused menu cooked constantly beats a sprawling one.
- **Star rating.** A weighted blend of Style (decor), Service (how fast you serve), Cleanliness (dirty tables) and Menu quality. It directly sets how often customers arrive, so it is the main dial you are turning.
- **Restaurant level.** Earned by serving food; unlocks recipes, furniture, menu slots, staff positions and dining-room extensions up to 16x16.
- **Staff.** Waiters, chefs and cleaners each have a skill level you can train and an energy bar that drains as they work. Wages come out of the till at the start of every in-game day.

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
```

`npm run check` bundles `tools/checks.ts` with esbuild and runs it under Node. It
covers the things that are easiest to get subtly wrong — the isometric
round-trip, picking a wall panel from a screen position, pathfinding and the
"don't let the player seal off the doorway" rule, the mastery curve — and then
runs four in-game minutes of the real simulation headlessly to confirm customers
are actually seated, fed and charged.

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

If Actions is not available on the account — a disabled runner, a billing hold,
or a private repository without minutes — `npm run deploy` publishes the same
build without it. It builds with the right `BASE_PATH`, force-pushes `dist/` to a
`gh-pages` branch, points Pages at that branch and asks it to rebuild. It needs
an authenticated `gh` CLI and takes about a minute to go live.

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
- **The grid is the source of truth.** `game/grid.ts` indexes placed furniture into solid / flat / wall layers and answers all the spatial questions the simulation asks. Placement is rejected if it would strand part of the floor, which is checked with a flood fill from the doorway.
- **Persistent versus live state.** `SaveData` holds only what should survive a reload. Customers, orders and floating text are rebuilt each session, so closing the tab simply sends the current diners home. Time away is paid out through a capped offline-earnings estimate rather than by replaying the simulation.
- **Panels are re-rendered, not diffed.** Every panel is a function of current state; a `revision` counter on the game marks state dirty. At this scale it is far simpler than incremental updates and fast enough to be invisible.

## Licence

MIT — see [LICENSE](LICENSE).

This is an original implementation inspired by the design of Restaurant City. It
contains no assets, code or trademarks from that game.
