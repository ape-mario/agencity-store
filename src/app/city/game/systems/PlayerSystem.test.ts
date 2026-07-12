import { describe, it, expect, vi } from "vitest";
import { PlayerSystem } from "./PlayerSystem";
import type { WorldScene } from "../scenes/WorldScene";

function makeSceneStub(): WorldScene {
  return {
    add: {
      container: vi.fn(() => ({ add: vi.fn(), setDepth: vi.fn(), destroy: vi.fn(), x: 0, y: 0 })),
      sprite: vi.fn(() => ({
        setScale: vi.fn(), setOrigin: vi.fn(), setDepth: vi.fn(), setFlipX: vi.fn(),
        setInteractive: vi.fn(), setVisible: vi.fn(), setTint: vi.fn(),
        destroy: vi.fn(), x: 0, y: 0, active: true, visible: true,
      })),
      rectangle: vi.fn(() => ({ setOrigin: vi.fn(), setStrokeStyle: vi.fn(), setFillStyle: vi.fn(), setDepth: vi.fn() })),
      text: vi.fn(() => ({ setOrigin: vi.fn(), setDepth: vi.fn(), setPosition: vi.fn(), destroy: vi.fn() })),
      graphics: vi.fn(() => ({ setDepth: vi.fn(), clear: vi.fn(), destroy: vi.fn(), fillStyle: vi.fn(), fillRect: vi.fn(), fillCircle: vi.fn() })),
      ellipse: vi.fn(() => ({ setDepth: vi.fn(), setVisible: vi.fn() })),
      circle: vi.fn(() => ({ setDepth: vi.fn(), setVisible: vi.fn() })),
    },
    tweens: { add: vi.fn(), killTweensOf: vi.fn() },
    time: { delayedCall: vi.fn(() => ({ remove: vi.fn() })), addEvent: vi.fn(() => ({ destroy: vi.fn() })) },
    cameras: { main: { fadeOut: vi.fn(), fadeIn: vi.fn(), pan: vi.fn() } },
    input: {
      keyboard: {
        on: vi.fn(),
        addKey: vi.fn(() => ({ on: vi.fn(), removeAllListeners: vi.fn() })),
        createCursorKeys: vi.fn(() => ({})),
      },
      on: vi.fn(),
      hitTestPointer: vi.fn(() => []),
    },
    load: { image: vi.fn(), on: vi.fn(), once: vi.fn() },
    anims: { create: vi.fn(), exists: vi.fn(() => false), generateFrameNames: vi.fn(() => []) },
    textures: { exists: vi.fn(() => false), remove: vi.fn(), get: vi.fn(() => ({ getSourceImage: () => ({ width: 32, height: 32 }) })) },
    scale: { width: 1440, height: 1100 },
    events: { on: vi.fn(), emit: vi.fn() },
    // Shared player fields
    localPlayer: null,
    playerEnabled: false,
    helperNPC: null,
    interactPrompt: null,
    tapMarker: null,
    localPlayerTextureKeys: [],
    pendingEnterWorld: null,
    cameraFollowing: false,
    moveTarget: null,
    moveTargetBuilding: null,
    moveTargetNPC: null,
    isMobile: false,
    wasDragGesture: false,
    touchStartTime: 0,
    boundEnterWorld: null,
    boundExitWorld: null,
    boundTutorialStep: null,
    // Scene methods PlayerSystem calls
    attachShadow: vi.fn(),
    syncShadow: vi.fn(),
    audioSystem: { playSpawnSfx: vi.fn(), playExitSfx: vi.fn(), playInteractSfx: vi.fn() } as any,
    tooltipSystem: {} as any,
    encounterSystem: { playerStunned: false, encounterActive: false } as any,
    characterSystem: { triggerNPCGreeting: vi.fn() } as any,
    speechBubbleManager: null,
    characterSprites: new Map() as any,
    characterById: new Map() as any,
    buildingById: new Map() as any,
    buildingSprites: new Map() as any,
    zonePopupBuildings: new Map() as any,
    currentZone: "main_city" as any,
    isTransitioning: false,
    worldState: null as any,
    npcGreetZoneEntryTime: 0,
    nearbyNPC: null,
    nearbyBuilding: null,
    nearbyHelper: false,
  } as unknown as WorldScene;
}

describe("PlayerSystem", () => {
  it("updateLocalPlayer is a no-op when the player is disabled", () => {
    const sys = new PlayerSystem(makeSceneStub());
    expect(() => sys.updateLocalPlayer()).not.toThrow();
  });

  it("destroy() is safe when nothing was set up", () => {
    const sys = new PlayerSystem(makeSceneStub());
    expect(() => sys.destroy()).not.toThrow();
  });

  it("getNearbyNPC / getNearbyBuilding / isNearbyHelper return defaults", () => {
    const sys = new PlayerSystem(makeSceneStub());
    expect(sys.getNearbyNPC()).toBeNull();
    expect(sys.getNearbyBuilding()).toBeNull();
    expect(sys.isNearbyHelper()).toBe(false);
  });

  it("clearTutorialArrows is a no-op when no arrows exist", () => {
    const sys = new PlayerSystem(makeSceneStub());
    expect(() => sys.clearTutorialArrows()).not.toThrow();
  });

  it("playerTriggerZoneChange dispatches a zone-change event", () => {
    const sys = new PlayerSystem(makeSceneStub());
    const dispatched: any[] = [];
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.dispatchEvent = (e: any) => dispatched.push(e);
    (globalThis as any).window.CustomEvent = (globalThis as any).window.CustomEvent || CustomEvent;
    sys.playerTriggerZoneChange("trending" as any, "right");
    expect(dispatched.some((e) => e.type === "agencity-zone-change")).toBe(true);
  });
});
