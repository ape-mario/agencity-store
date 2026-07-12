import { describe, it, expect, vi } from "vitest";
import { ZoneSystem } from "./ZoneSystem";
import type { WorldScene } from "../scenes/WorldScene";

/**
 * Scene stub covering the surface ZoneSystem touches. The popup-registry +
 * position-store methods are pure map/array manipulation; hideAllZoneElements
 * iterates the zone-element arrays calling setVisible(false).
 */
function makeSceneStub(): WorldScene {
  return {
    add: { container: vi.fn(() => ({ add: vi.fn(), setDepth: vi.fn() })) },
    tweens: { add: vi.fn(), killTweensOf: vi.fn() },
    time: { delayedCall: vi.fn(() => ({ remove: vi.fn() })) },
    cameras: { main: { fadeOut: vi.fn(), fadeIn: vi.fn(), scrollX: 0, scrollY: 0, zoom: 1 } },
    audioSystem: { playZoneTransitionSfx: vi.fn() } as any,
    skySystem: { restoreNormalSky: vi.fn() } as any,
    // Zone element arrays (all start empty)
    trendingElements: [] as any[],
    academyElements: [] as any[],
    ballersElements: [] as any[],
    foundersElements: [] as any[],
    labsElements: [] as any[],
    moltbookElements: [] as any[],
    arenaElements: [] as any[],
    ascensionElements: [] as any[],
    skylineSprites: [] as any[],
    billboardTexts: [] as any[],
    tickerText: null,
    decorations: [] as any[],
    animals: [] as any[],
    fountainWater: null,
    distantSkylineGfx: [] as any[],
    // Zone coordination state
    currentZone: "main_city" as any,
    isTransitioning: false,
    zonePopupBuildings: new Map() as any,
    originalPositions: new Map() as any,
    // Player state ZoneSystem clears/touches
    moveTarget: null,
    moveTargetBuilding: null,
    moveTargetNPC: null,
    helperNPC: null,
    cameraFollowing: false,
    pendingEnterWorld: null,
    npcGreetZoneEntryTime: 0,
    previousNearbyNPC: null,
    // Methods ZoneSystem delegates to
    clearTutorialArrows: vi.fn(),
    updateCharacters: vi.fn(),
  } as unknown as WorldScene;
}

describe("ZoneSystem", () => {
  it("registerZonePopupBuilding stores an entry in the scene map", () => {
    const scene = makeSceneStub();
    const sys = new ZoneSystem(scene);
    const sprite = { x: 0, y: 0 } as any;
    const data = { id: "b1" } as any;
    sys.registerZonePopupBuilding("b1", sprite, data, "trending", () => {});
    expect(scene.zonePopupBuildings.has("b1")).toBe(true);
    const entry = scene.zonePopupBuildings.get("b1");
    expect(entry.sprite).toBe(sprite);
    expect(entry.zone).toBe("trending");
  });

  it("unregisterZonePopupBuilding removes the entry", () => {
    const scene = makeSceneStub();
    const sys = new ZoneSystem(scene);
    sys.registerZonePopupBuilding("b1", {} as any, {} as any, "trending", () => {});
    sys.unregisterZonePopupBuilding("b1");
    expect(scene.zonePopupBuildings.has("b1")).toBe(false);
  });

  it("unregisterZonePopupBuildingsByZone removes only matching entries", () => {
    const scene = makeSceneStub();
    const sys = new ZoneSystem(scene);
    sys.registerZonePopupBuilding("a", {} as any, {} as any, "trending", () => {});
    sys.registerZonePopupBuilding("b", {} as any, {} as any, "founders", () => {});
    sys.registerZonePopupBuilding("c", {} as any, {} as any, "trending", () => {});
    sys.unregisterZonePopupBuildingsByZone("trending");
    expect(scene.zonePopupBuildings.has("a")).toBe(false);
    expect(scene.zonePopupBuildings.has("c")).toBe(false);
    expect(scene.zonePopupBuildings.has("b")).toBe(true); // founders survives
  });

  it("storeZoneElementPositions records x positions in originalPositions", () => {
    const scene = makeSceneStub();
    const sys = new ZoneSystem(scene);
    const el1 = { x: 100 } as any;
    const el2 = { x: 200 } as any;
    sys.storeZoneElementPositions([el1, el2]);
    expect(scene.originalPositions.get(el1)).toBe(100);
    expect(scene.originalPositions.get(el2)).toBe(200);
  });

  it("hideAllZoneElements hides every element in every zone array without throwing", () => {
    const scene = makeSceneStub();
    scene.trendingElements.push({ setVisible: vi.fn() });
    scene.foundersElements.push({ setVisible: vi.fn() });
    scene.decorations.push({ setVisible: vi.fn() });
    const sys = new ZoneSystem(scene);
    expect(() => sys.hideAllZoneElements()).not.toThrow();
    expect((scene.trendingElements[0] as any).setVisible).toHaveBeenCalledWith(false);
    expect((scene.decorations[0] as any).setVisible).toHaveBeenCalledWith(false);
  });

  it("destroy() is a safe no-op", () => {
    const sys = new ZoneSystem(makeSceneStub());
    expect(() => sys.destroy()).not.toThrow();
  });
});
