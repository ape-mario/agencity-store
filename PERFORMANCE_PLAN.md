# Performance improvement plan: decompose `WorldScene.ts`

## Implementation status

Phases 0, 1, 2, and most of 3 are **implemented and verified** (typecheck +
build clean; 63 vitest tests pass, 53 new). `WorldScene.ts` dropped from
**10,295 → 3,788 lines** (−63%), with 10 systems extracted under
`src/app/city/game/systems/`:

| Phase | System | Status | Notes |
|-------|--------|--------|-------|
| 0a | update-loop culling | ✅ | viewport character cull, zone-guarded animal loop, modal/hidden pause |
| 0b | pause-on-popup | ✅ | dialogue bubbles + WS world-state updates gated on modal-open |
| 0c | memory-leak sweep | ✅ | tutorial listener + lightning/apocalypse/encounter/tooltip/arena timers torn down |
| 1 | `AudioSystem` | ✅ | all music + SFX; shared AudioContext via getters + `ensureContext()` |
| 1 | `TooltipSystem` | ✅ | all character + building hover tooltips + hide scheduler |
| 1 | `EventEffectSystem` | ✅ | celebrations, fireworks, coin rain, announcements, bot-effect dispatch |
| 1 | `SkySystem` | ✅ | sky gradient, stars, treeline, skyline, time-of-day, sun/moon, weather |
| 2 | `DecorationSystem` | ✅ | decorations, clouds, animals, Pokémon, beach creatures, fireflies, pollen; per-frame `update()` with Phase 0 culling guards folded in |
| 2 | `CharacterSystem` | ✅ | autonomous NPC behavior: idle activities, walking, greetings |
| 2 | `BuildingSystem` | ✅ | building sprite lifecycle: create, update, decay visuals, dormant state |
| 2 | `EncounterSystem` | ✅ | trigger + cooldown + stun glue (battle engine stays in `lib/`) |
| 3 | `DialogueSystem` | ✅ | speech-bubble glue (autonomous dialogue + direct speak) |
| 3 | `AgentSystem` | ✅ | agent-WebSocket glue: connect, world-state poll, command translation |
| 3 | `CameraSystem` | ✅ | mobile drag/pan/zoom + tap-vs-drag detection |
| 3 | `PlayerSystem` | ⏳ remaining | local player input, enter/exit world, tap-to-move, spawn/iris, E-key |
| 3 | `ZoneSystem` | ⏳ remaining | transitionToZone, setupZone, clearCurrentZone, offscreen caching |

### Remaining work

`PlayerSystem` and `ZoneSystem` are the scene's core coordination layer — they
share ~40 fields with each other, the `update()` loop, the input handlers, and
the React bridge. They are the highest-risk extractions (interactive movement +
zone-transition timing with no e2e coverage). A methods-bundle extraction is
mechanically possible but provides limited decoupling since the systems would
still reach through the scene for nearly all state; the real win requires the
shared state to move with the methods, which means touching every call site.

Phase 4 (zone lazy loading, object pooling) and Phase 5 (bundle analyzer,
phaser chunking) are independent of the remaining extractions and can proceed
on their own.

## Current state (original, for reference)


- `src/app/city/game/scenes/WorldScene.ts` is **10,295 lines / 359 KB**.
- It contains ~170 class properties and ~140 private/public methods.
- Responsibilities are mixed: player input, camera, zone transitions, characters, buildings, tooltips, audio, sky/weather, dialogue, agent WebSocket, encounters, effects, etc.
- The `update()` method (line 5830) is a single monolithic body that every frame
  iterates `characterSprites`, `clouds`, `animals`, Pokémon, and beach creatures,
  **with no viewport or zone checks**. The author has already applied the cheap
  micro-opts (O(1) `characterById` map, squared-distance compares, per-character
  cached speeds — see the inline `// Performance:` comments), so the next
  lever is **culling**, not more micro-opts.
- Some subsystems are **already externalized** to `src/app/city/lib/`:
  the full encounter engine (`encounter-engine.ts` ~16 KB, `encounter-creatures.ts`
  ~15 KB, `encounter-types.ts`, `encounter-xp.ts`), the agent WebSocket bridge
  (`agent-websocket-bridge.ts` ~11 KB), and speech bubbles
  (`speech-bubble-manager.ts`). The plan below builds on these rather than
  re-extracting them.
- There is no test coverage for the scene.

## Goals

1. Reduce `WorldScene.ts` to a thin coordinator (target ~1,500 lines).
2. Move each subsystem into its own manager/module under `src/app/city/game/systems/`.
3. Cut per-frame work by only updating entities in the current zone / viewport — **landed first as Phase 0**, independent of the refactor.
4. Improve first-load bundle size by lazy-loading zone setup functions (~6,200 lines today).
5. Keep behavior identical; verify with `npm run typecheck` and manual smoke tests.

## Proposed architecture

```
src/app/city/game/
  scenes/
    WorldScene.ts          # thin coordinator: init, update dispatch, cleanup
  systems/
    PlayerSystem.ts        # local player, input, tap-to-move, spawn/exit
    CameraSystem.ts        # camera follow, mobile drag/pan/zoom
    ZoneSystem.ts          # zone transitions, setup/clear, offscreen caching
    CharacterSystem.ts     # character sprites, movement, glow, idle AI
    BuildingSystem.ts      # building sprites, tooltips, interaction
    TooltipSystem.ts       # all character + building tooltips
    AudioSystem.ts         # music tracks, SFX
    SkySystem.ts           # sky gradient, clouds, time-of-day, weather
    DecorationSystem.ts    # animals, pokemon, beach crabs, ambient particles
    DialogueSystem.ts      # helper NPC dialogue + speak/behavior wiring
    │                           (SpeechBubbleManager already lives in lib/)
    AgentSystem.ts         # in-scene agent behavior glue
    │                           (WebSocket transport already lives in lib/)
    EncounterSystem.ts     # trigger + cooldown + stun glue
    │                           (battle engine already lives in lib/)
    EventEffectSystem.ts   # celebrations, coins rain, bot effects
```

Each system receives a reference to the scene and exposes:

- `create()` / `init()` – setup
- `update(time, delta)` – per-frame work
- `destroy()` / `cleanup()` – remove listeners, timers, tweens, objects
- getters for state that `WorldScene` or other systems need

## Phase 0: Cheap per-frame wins (do this first, no refactor needed)

The biggest runtime cost today is the unculled `update()` loop, and the fix is
independent of the systems extraction — so do it first and bank the win. None
of these change behavior or file structure, and each can land as its own PR.

### Update-loop culling (the high-leverage one)

In `update()` (line 5830), gate each iteration:

- **Characters:** skip the `characterSprites.forEach` body for sprites whose
  world bounds are outside the camera viewport (plus a margin), via
  `this.cameras.main.worldView`. Movement targets are still respected when they
  re-enter view because `characterTargets` is keyed by id, not iterator state.
- **Zone-scoped entities:** guard the animal/pokémon/beach-creature loops on
  `currentZone` — e.g. skip the Pokémon loop entirely when
  `currentZone !== "founders"`, the beach creatures when
  `currentZone !== "moltbook"`, the ambient animals when
  `currentZone !== "main_city"`. Each creature set is only populated for its
  own zone, so a zone guard turns the cross-zone cost to ~zero.
- **Clouds/weather:** pause cloud parallax and weather emitters when a modal is
  open (`window.__agencity_modal_open`) or the tab is hidden
  (`document.hidden`). Phaser already throttles hidden tabs, but the modal case
  is not covered today.

Expected impact: per-frame work drops to "only what's on screen in this zone,"
which is the actual goal — the systems refactor is about *maintainability*,
this is about *frame time*.

### Pause work when a popup is open

Several timers and the autonomous-dialogue poll keep running while a route
popup covers the canvas. Gate them on `window.__agencity_modal_open` the same
way input already is. (Low impact, but free.)

### Memory-leak sweep

Audit every `time.addEvent`, `tweens.add`, `setTimeout`, `setInterval`, and DOM
`addEventListener` so each is stored and removed in `shutdown()`/`destroy()`.
This is a one-time, low-risk pass that prevents the slow leak players see on
long sessions. (The per-system `cleanup()` discipline in Phase 1+ makes this
self-sustaining going forward.)

> Do **not** attempt object pooling or tween pooling in Phase 0 — those change
> allocation patterns and are easy to get subtly wrong. Land culling first,
> measure, then revisit pooling with data (Phase 4).

## Phase 1: Extract low-risk systems (no behavior change)

Files to create and wire into `WorldScene`:

1. **`systems/AudioSystem.ts`** – move all music/SFX methods.
2. **`systems/SkySystem.ts`** – move sky, clouds, treeline, time-of-day, weather effects.
3. **`systems/TooltipSystem.ts`** – move all `show*Tooltip` + hide/schedule methods.
4. **`systems/EventEffectSystem.ts`** – move celebrations, coins rain, star burst, bot effects.

For each extraction:

- Copy methods verbatim into the new system.
- Replace `private` properties in `WorldScene` with a single `private audioSystem: AudioSystem` etc.
- Update method calls inside `WorldScene` to delegate (`this.audioSystem.playSpawnSfx()`).
- Run `npm run typecheck`.

Expected result after Phase 1: `WorldScene.ts` drops to ~7,000–8,000 lines.

## Phase 2: Extract entity/update systems

5. **`systems/DecorationSystem.ts`** – animals, Pokémon, beach crabs, ambient creatures, fireflies, particles, cloud parallax. Include the per-frame update loops for these entities (and fold in the culling guards from Phase 0).
6. **`systems/CharacterSystem.ts`** – character sprite creation/update, glow, visitor sparkles, shadow sync, idle activities, walking.
7. **`systems/BuildingSystem.ts`** – building sprite creation/update, decay visuals, dormant indicator, labels.
8. **`systems/EncounterSystem.ts`** – the in-scene glue only: `checkCreatureEncounters()`, the `encounterActive` flag, the stun effect, and the `agencity-encounter-start/end` event wiring. **The battle logic itself already lives in `lib/encounter-engine.ts` / `encounter-creatures.ts` / `encounter-xp.ts` — do not re-extract it.** This system just becomes a small owner for the trigger + cooldown state.

Expected result: `WorldScene.ts` drops to ~4,000–5,000 lines.

## Phase 3: Extract coordinator/core systems

9. **`systems/PlayerSystem.ts`** – local player controls, enter/exit world, tap-to-move, spawn effects, iris effect, E-key handling.
10. **`systems/CameraSystem.ts`** – mobile camera drag/pan/zoom.
11. **`systems/ZoneSystem.ts`** – `transitionToZone`, `setupZone`, `clearCurrentZone`, `hideAllZoneElements`, offscreen caching.
12. **`systems/DialogueSystem.ts`** – helper NPC dialogue and the `agencity-character-speak`/`-behavior` wiring. **`SpeechBubbleManager` is already its own class in `lib/`** — this system owns its lifecycle + the (currently stubbed) autonomous-dialogue calls, not the renderer.
13. **`systems/AgentSystem.ts`** – the in-scene glue for agent behavior commands (`handleBehaviorCommand`, `characterTargets` updates). **The WebSocket transport already lives in `lib/agent-websocket-bridge.ts` — do not re-extract it.** This system only owns translating incoming events into sprite actions.

Expected result: `WorldScene.ts` is a ~1,500-line coordinator.

## Phase 4: Further optimizations (after culling + extraction land)

### Update-loop culling — already done in Phase 0

The viewport/zone culling lands in Phase 0 as a standalone win. Once systems
exist (Phases 1–3), push the guards *into* each system's `update()` so
`WorldScene.update()` stays a thin dispatcher and culling is collocated with
the entity it owns.

### Zone lazy loading

Today `src/app/city/game/zones/index.ts` is 8 lines of eager re-exports, so
**all 8 zone files (~6,200 lines total; `arena.ts` alone is ~2,060) ship in
the main game chunk** whether or not the player visits them. Switch to a
dynamic loader:

```ts
export async function loadZoneSetup(zone: ZoneType) {
  switch (zone) {
    case "trending": return (await import("./trending")).setupTrendingZone;
    case "labs":     return (await import("./labs")).setupLabsZone;
    // ...
  }
}
```

Call it in `ZoneSystem` during transitions so a zone's code is only downloaded
when first visited. `WorldScene.setupZone` becomes async; gate transitions on
the loaded function resolving and show the existing transition overlay meanwhile.

### Object pooling

- Reuse particle emitters, tweens, and temporary text objects instead of creating/destroying per effect.
- Pool character sprite objects when characters leave/join to avoid GC churn.

Only pursue this **after** Phase 0 culling has landed and you have profile data
showing allocation pressure is still a bottleneck — pooling is easy to get
subtly wrong and regress.

## Phase 5: Build / bundle improvements

- Add `webpackBundleAnalyzer` (or Next.js built-in bundle analyzer) to measure the city game chunk.
- Consider moving `phaser` to a separate chunk with Next.js `experimental.optimizePackageImports` or dynamic `import("phaser")` so the initial page load does not block on the game bundle. (Phaser is already loaded via `next/dynamic` with `ssr: false` in `GameCanvas.tsx`, so this is about chunking, not SSR safety.)
- Zone lazy loading (Phase 4) is the bigger bundle win — ~6,200 lines of zone code move out of the main chunk.

## Validation

- After each phase: `npm run typecheck`.
- After each phase: `npm run build`.
- Manual smoke test: open `/` (the game), walk through every zone, enter/exit world, click a building, trigger a tooltip, check zone transitions. (Note: `/city` is a redirect to `/`.)
- Add at least one unit test for each new system under `src/app/city/game/systems/*.test.ts` using vitest + a mocked Phaser scene. (There is currently **no** test coverage under `src/app/city/` at all — adding the first ones also establishes the mock-scene harness.)

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Breaking subtle interaction order | Move methods verbatim first; optimize only after tests pass. |
| Systems tightly coupled via `this` | Pass `WorldScene` reference; add public getters for shared state. |
| Dynamic imports break SSR | Only import inside `useEffect`/Phaser `create()`, never during module init. |
| Large diff hard to review | Split into the phases above; each phase is one commit/PR. |
| Culling lets an off-screen NPC miss a target | Targets are keyed by id in a `Map`, not iterator state — re-entry resumes correctly. Verify with a "walk away, walk back, NPC still moving" smoke test. |
| Re-extracting already-externalized libs | Encounter/SpeechBubble/AgentWebSocket logic already lives in `lib/`; Phase 2/3 systems are thin in-scene glue only (see notes on steps 8/12/13). |

## Recommended first step

Start with **Phase 0, update-loop culling** — it's the highest-leverage runtime
win, requires no file moves, and lands as a small, reviewable diff. Once that's
banked, begin the systems extraction with **Phase 1, `AudioSystem`** (the most
self-contained subsystem), then `SkySystem` and `TooltipSystem`.
