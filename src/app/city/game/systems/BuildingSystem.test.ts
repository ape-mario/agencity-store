import { describe, it, expect, vi } from "vitest";
import { BuildingSystem } from "./BuildingSystem";
import type { WorldScene } from "../scenes/WorldScene";

function makeSceneStub(): WorldScene {
  return {
    add: {
      container: vi.fn(() => ({ add: vi.fn(), setDepth: vi.fn(), setSize: vi.fn(), destroy: vi.fn(), x: 0, y: 0, on: vi.fn() })),
      sprite: vi.fn(() => ({ setScale: vi.fn(), setOrigin: vi.fn(), setDepth: vi.fn(), setFlipX: vi.fn(), setTint: vi.fn(), setVisible: vi.fn(), x: 0, y: 0 })),
      rectangle: vi.fn(() => ({ setOrigin: vi.fn(), setStrokeStyle: vi.fn(), setFillStyle: vi.fn(), setDepth: vi.fn() })),
      text: vi.fn(() => ({ setOrigin: vi.fn(), setDepth: vi.fn(), setStyle: vi.fn() })),
      image: vi.fn(() => ({ setOrigin: vi.fn(), setDepth: vi.fn() })),
      graphics: vi.fn(() => ({ setDepth: vi.fn(), fillStyle: vi.fn(), fillRect: vi.fn() })),
    },
    tweens: { add: vi.fn(), killTweensOf: vi.fn() },
    time: { delayedCall: vi.fn(() => ({ remove: vi.fn() })) },
    buildingSprites: new Map() as any,
    buildingById: new Map() as any,
    buildingInitialized: new Set() as any,
    zonePopupBuildings: new Map() as any,
    currentZone: "main_city" as any,
    isMobile: false,
    playerEnabled: false,
    localPlayer: null,
    wasDragGesture: false,
    tooltipSystem: { showBuildingTooltip: vi.fn(), hideTooltip: vi.fn() } as any,
    audioSystem: { playBuildingClickSfx: vi.fn(), playBuildingClickBurst: vi.fn() } as any,
    input: { on: vi.fn(), off: vi.fn() } as any,
    events: { on: vi.fn() } as any,
  } as unknown as WorldScene;
}

describe("BuildingSystem", () => {
  it("getStatusFromHealth maps health to the correct status tier", () => {
    const sys = new BuildingSystem(makeSceneStub());
    // ECOSYSTEM_CONFIG.buildings.decay.thresholds drives these; assert the
    // monotonic relationship holds for the extremes.
    const dormant = sys.getStatusFromHealth(0);
    expect(dormant).toBe("dormant");
    const active = sys.getStatusFromHealth(100);
    expect(["active", "healthy", "thriving"]).toContain(active);
  });

  it("updateBuildings is a no-op (no throw) for an empty list", () => {
    const sys = new BuildingSystem(makeSceneStub());
    expect(() => sys.updateBuildings([])).not.toThrow();
  });
});
