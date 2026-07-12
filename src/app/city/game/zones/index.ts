/**
 * Lazy zone loader — Phase 4 of PERFORMANCE_PLAN.md.
 *
 * Each zone's setup + disconnect functions live in the same module (they share
 * module-scoped state like replay timers). Eagerly re-exporting them pulled all
 * ~6,200 lines of zone code into the main game chunk. This loader dynamic-imports
 * a zone's module on first visit, so its code is only downloaded when needed.
 *
 * Usage:
 *   - `loadZoneModule(zone)` — async, returns the zone's module (cached after
 *     first load). Call from ZoneSystem.setupZone (awaitable).
 *   - `getLoadedZoneModule(zone)` — sync, returns the cached module if already
 *     loaded, or null. Call from disconnect/clear paths (the zone was already
 *     visited, so the module is in the cache; if not, there's nothing to
 *     disconnect).
 *
 * Zone modules export a `setup<Zone>Zone` function and optionally a
 * `disconnect<Zone>` function. trending.ts also exports `clearTrafficTimers`.
 */
import type { WorldScene } from "../scenes/WorldScene";

export type ZoneModule = {
  setup: (scene: WorldScene) => void;
  disconnect?: (scene: WorldScene) => void;
  clearTrafficTimers?: (scene: WorldScene) => void;
};

/** Cache of resolved zone modules so repeat visits are instant. */
const loaded = new Map<string, ZoneModule>();

/**
 * Dynamically load a zone's module. Cached after first load so subsequent
 * visits are synchronous-fast (the Promise resolves immediately).
 */
export async function loadZoneModule(zone: string): Promise<ZoneModule> {
  const cached = loaded.get(zone);
  if (cached) return cached;

  const mod = await importZone(zone);
  const setupName = setupFnName(zone);
  const disconnectName = disconnectFnName(zone);
  const wrapped: ZoneModule = {
    setup: (mod[setupName] as (scene: WorldScene) => void) ?? (() => {}),
    disconnect: disconnectName ? (mod[disconnectName] as (scene: WorldScene) => void) : undefined,
    clearTrafficTimers: mod.clearTrafficTimers as ((scene: WorldScene) => void) | undefined,
  };
  loaded.set(zone, wrapped);
  return wrapped;
}

/**
 * Synchronously get an already-loaded zone module. Returns null if the zone
 * hasn't been visited yet (module not imported). Disconnect/clear callers use
 * this — if the zone was never visited, there's nothing to tear down.
 */
export function getLoadedZoneModule(zone: string): ZoneModule | null {
  return loaded.get(zone) ?? null;
}

/** Clear all cached modules (e.g. on scene destroy). */
export function clearZoneModuleCache(): void {
  loaded.clear();
}

// ── Internals ─────────────────────────────────────────────────────────────

async function importZone(zone: string): Promise<Record<string, any>> {
  switch (zone) {
    case "trending":
      return import("./trending");
    case "ballers":
      return import("./ballers");
    case "founders":
      return import("./founders");
    case "labs":
      return import("./labs");
    case "moltbook":
      return import("./moltbook");
    case "arena":
      return import("./arena");
    case "ascension":
      return import("./ascension");
    case "main_city":
    default:
      return import("./main-city");
  }
}

function setupFnName(zone: string): string {
  const map: Record<string, string> = {
    trending: "setupTrendingZone",
    ballers: "setupBallersZone",
    founders: "setupFoundersZone",
    labs: "setupLabsZone",
    moltbook: "setupMoltbookZone",
    arena: "setupArenaZone",
    ascension: "setupAscensionZone",
    main_city: "setupMainCityZone",
  };
  return map[zone] ?? "setupMainCityZone";
}

function disconnectFnName(zone: string): string | undefined {
  const map: Record<string, string> = {
    arena: "disconnectArena",
    ascension: "disconnectAscension",
  };
  return map[zone];
}
