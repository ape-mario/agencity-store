# AGENTS.md — AgenCity

Project context and conventions for AI agents working on this codebase.

## Project overview

AgenCity is a branded AgenC marketplace node built with Next.js. It renders a
live mainnet catalog of AI-agent listings and routes hires through a referrer
wallet. **The app UI is a full-screen Phaser 3 pixel-art city** — the root
layout (`src/app/layout.tsx`) wraps *every* route in `CityShell`, which mounts
the game canvas; marketplace pages render as modal popups over the
still-running world. There is no separate marketing page: `src/app/page.tsx`
returns `null` because the game (loaded via the layout) *is* the homepage.
(The legacy `/city` route just redirects to `/`.)

## Tech stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript 5.9
- **Styling:** Tailwind CSS 4, PostCSS
- **Game engine:** Phaser 3.80.0
- **Solana:** `@solana/kit` 6.x, `@tetsuo-ai/marketplace-sdk` 0.11.x
- **State:** Zustand 5.x (bridges React and Phaser; battle/XP progress lives in `localStorage`)
- **Testing:** Vitest 3.x
- **Package manager:** npm (primary; both `package-lock.json` and `bun.lock`
  are committed — keep them in sync if you switch tools)

## Build & quality commands

```bash
npm install
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run test       # vitest run
```

Always run `npm run typecheck` after changing TypeScript code. Run `npm run build` before declaring a feature complete.

## Project layout

```
agenc.config.ts              # validated store config (referrer, API, SEO)
src/app/
  layout.tsx                 # wraps EVERY route in CityShell (mounts the game)
  page.tsx                   # returns null — the game IS the homepage
  globals.css                # Tailwind 4 theme tokens
  catalog/                   # grid + filters (renders as a popup)
  listings/[pda]/            # listing detail + hire flow (popup)
  earnings/                  # referrer earnings (popup)
  dashboard/                 # buyer task dashboard (popup)
  trust/                     # buyer protection (popup)
  proof/                     # on-chain verification (popup)
  providers/[pda]/           # provider profile (popup)
  city/                      # THE GAME
    components/              # React UI overlays: CityShell, CityHUD, CityModal,
    │                           CityZoneBridge, GameCanvas, CityWalletButton, …
    game/
      scenes/                # Phaser scenes: BootScene, WorldScene, UIScene
      textures/              # procedural texture generation (no image assets)
      zones/                 # per-zone setup (main-city, trending, labs, …)
      systems/               # extracted subsystems (see PERFORMANCE_PLAN.md):
      │                           AudioSystem, TooltipSystem, EventEffectSystem,
      │                           SkySystem, DecorationSystem, CharacterSystem,
      │                           BuildingSystem, EncounterSystem, DialogueSystem,
      │                           AgentSystem, CameraSystem — each takes the scene
      │                           ref and owns its create/update/cleanup lifecycle.
    characters/              # 17 .character.ts persona definitions
    lib/                     # zustand store, types, encounter engine, speech
    │                           bubbles, agent data, popup state, …
    city.css                 # retro/CRT theme tokens & components
  api/                       # server routes (agenc activate/job-specs, agent-card)
src/components/              # shared React components (wallet, listing thumb, …)
src/lib/                     # shared utilities (config, providers, rpc, sections)
```

## Code conventions

- Use TypeScript strictly; prefer `type` over `interface` for simple shapes.
- Use functional React components with hooks. No class components.
- Path aliases (see `tsconfig.json`): `@/*` → `src/*`, and `@/city/*` → `src/app/city/*`.
- Game code shares constants from `src/app/city/game/textures/constants.ts`:
  `SCALE`, `PALETTE` (32-color palette), `DEPTH` (render-layer z-order), `Y`
  (vertical layout anchors), plus `darken()`/`lighten()` color helpers. Reuse
  these instead of hardcoding colors or depth numbers.
- Prefer `const` arrow functions for helpers; use named exports. Phaser scene
  methods are the exception (class methods on a `Phaser.Scene` subclass).
- Keep comments descriptive but concise. Avoid commenting obvious code.

## City game architecture

- `BootScene.ts` — draws the loader and procedurally generates **all** textures
  at runtime (no image assets ship with the app), then starts WorldScene + UIScene.
- `WorldScene.ts` — the engine. Originally **~10,300 lines**; now **~3,800
  lines** after extracting 10 subsystems into `systems/` (audio, tooltip,
  event-effect, sky/weather, decoration, character, building, encounter,
  dialogue, agent, camera). It still owns player input, zone transitions, and
  the `update()`/`cleanup()` coordination. Each system takes the scene ref and
  exposes `create()`/`init()`/`update()`/`cleanup()`; some keep their state on
  the scene as public fields because zone files read/write them directly. See
  `PERFORMANCE_PLAN.md` for the extraction status and the remaining
  `PlayerSystem` / `ZoneSystem` work.
- `UIScene.ts` — minimal; only strokes the four green viewport corner brackets.
  All real HUD/overlay UI is rendered in React (`components/`), not Phaser.
- `textures/*.ts` — generate Phaser textures procedurally. Keys are plain names
  (e.g. `"labs_hq"`, `"arena_floor"`, `"finn"` — character keys are bare names,
  not suffixed with `_idle`). Keep keys in sync between generators and consumers.
- `zones/*.ts` — setup/cleanup for each city zone (8 zones total; 6 map to a
  route, 2 are hidden walk-in districts). `index.ts` re-exports the setup fns.
- `lib/store.ts` — Zustand store bridging React and Phaser (world snapshot,
  selected entity, current zone). Battle/XP progress is **not** in the store —
  it lives in `localStorage` (`agencity_player_progress`).
- React ↔ Phaser bridge is **custom DOM events** on `window` (e.g.
  `agencity-enter-world`, `agencity-zone-change`, `agencity-building-click`,
  `agencity-encounter-start`). See `CityZoneBridge.tsx` for the route↔zone sync.

## Common gotchas

- **Phaser + Next.js SSR:** Phaser must only run in the browser. The game canvas
  is mounted via `next/dynamic` (`ssr: false`) inside the client component
  `GameCanvas.tsx`. Don't import Phaser or call `window` at module top level.
- **React ↔ Phaser coupling is stringly-typed.** The two layers communicate only
  via `window` `CustomEvent`s (`agencity-*`). When adding a feature, search both
  sides (e.g. `dispatchEvent(new CustomEvent("agencity-…"))` in `WorldScene.ts`
  and the matching `addEventListener` in React) — there is no type checking on
  the event names or payloads.
- **Modal state:** `window.__agencity_modal_open` is checked in input handlers to
  suppress movement/interaction while a popup is open. `CityModal` sets it on
  mount and clears it on unmount. Respect this in any new overlay.
- **E-key interaction:** there are two paths — Phaser's `JustDown` check and a
  window `keydown` fallback (needed because Phaser misses E when the canvas
  loses focus, e.g. after closing a React modal). Keep both in sync.
- **Zone transitions:** `WorldScene` caches zone elements and uses
  `originalPositions` to restore layouts. Walking off-screen edges changes only
  the store/scenery (no URL change); clicking a building or nav item calls
  `router.push(route)` to open a popup. Don't mutate element positions during
  transitions without storing/restoring them via `originalPositions`.
- **The `/city` route is a redirect.** `src/app/city/page.tsx` does
  `redirect("/")`. The game is mounted by the **root layout**, not by a page.
- **Two lockfiles.** Both `package-lock.json` and `bun.lock` are committed. Pick
  one tool per change and don't let them drift; `engines.node >= 20.18`.
- **Git history:** this repo was force-squashed to a single `Initial commit`.
  Force-pushing rewrites remote history for all clones — see the guidance below.

## Working with AI agents

- When asked to change game visuals, identify the correct texture generator or zone file; many elements are drawn with `Phaser.GameObjects.Graphics`, not images.
- When refactoring, prefer small, testable extractions. Run `typecheck` after each file move.
- `WorldScene.ts` is the single biggest source of complexity. For any non-trivial change there, first check whether `PERFORMANCE_PLAN.md` already plans to extract the relevant subsystem — extend the plan rather than piling more onto the scene.
- Do not run `git push --force` without explicit user approval unless the user has already authorized history rewriting for that repo.
- Do not add new dependencies without confirming they are needed and compatible with the existing stack.

## Related docs

- `PERFORMANCE_PLAN.md` — planned refactor of `WorldScene.ts`.
- `README.md` — setup, deployment, and the gameplay UI (zones, controls, encounters).
- `agenc.config.ts` — single source of truth for store configuration.
- `proof/` — listings API capture and screenshot (deliverable evidence).
