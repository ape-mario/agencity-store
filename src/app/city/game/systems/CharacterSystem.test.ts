import { describe, it, expect, vi } from "vitest";
import { CharacterSystem } from "./CharacterSystem";
import type { WorldScene } from "../scenes/WorldScene";

function makeSceneStub(): WorldScene {
  return {
    add: {
      graphics: vi.fn(() => ({ setDepth: vi.fn(), clear: vi.fn(), destroy: vi.fn() })),
      sprite: vi.fn(() => ({ setScale: vi.fn(), setDepth: vi.fn(), setFlipX: vi.fn(), x: 0, y: 0, active: true })),
      text: vi.fn(() => ({ setDepth: vi.fn(), setOrigin: vi.fn() })),
    },
    tweens: { add: vi.fn(), killTweensOf: vi.fn() },
    time: { delayedCall: vi.fn(() => ({ remove: vi.fn() })) },
    // Character state the system reads.
    characterSprites: new Map() as any,
    buildingSprites: new Map() as any,
    characterById: new Map() as any,
    npcGreetCooldowns: new Map() as any,
    lastNpcGreetTime: 0,
    npcGreetZoneEntryTime: 0,
    NPC_GREET_COOLDOWN_MS: 60000,
    GLOBAL_NPC_GREET_COOLDOWN_MS: 12000,
    NPC_GREET_ZONE_GRACE_MS: 5000,
    localPlayer: null,
    isMobile: false,
    speechBubbleManager: null,
    getCharacterBehaviorId: vi.fn((c: any) => c.id),
    findCharacterSprite: vi.fn(() => null),
  } as unknown as WorldScene;
}

describe("CharacterSystem", () => {
  it("getNPCGreeting returns a known line for a mapped character id", () => {
    const sys = new CharacterSystem(makeSceneStub());
    const line = sys.getNPCGreeting("toly");
    expect(typeof line).toBe("string");
    expect(line.length).toBeGreaterThan(0);
  });

  it("getNPCGreeting falls back to generic greetings for unknown ids", () => {
    const sys = new CharacterSystem(makeSceneStub());
    const line = sys.getNPCGreeting("nobody-knows-this-id");
    expect(["Hey there!", "Welcome!", "Nice to see you!"]).toContain(line);
  });

  it("triggerNPCGreeting is suppressed within the zone-entry grace period", () => {
    const scene = makeSceneStub();
    scene.npcGreetZoneEntryTime = Date.now(); // just entered zone
    const sys = new CharacterSystem(scene);
    const char = { id: "toly", username: "toly" } as any;
    // Should not throw and should early-return (no greeting scheduled).
    expect(() => sys.triggerNPCGreeting(char)).not.toThrow();
    // lastNpcGreetTime stays 0 because we bailed before recording.
    expect(scene.lastNpcGreetTime).toBe(0);
  });

  it("triggerNPCGreeting respects the per-NPC cooldown", () => {
    const scene = makeSceneStub();
    // Outside grace + global cooldown, but this NPC greeted recently.
    scene.npcGreetZoneEntryTime = 0;
    scene.npcGreetCooldowns.set("toly", Date.now());
    const sys = new CharacterSystem(scene);
    expect(() => sys.triggerNPCGreeting({ id: "toly" } as any)).not.toThrow();
    // Did not record a new greet time (bailed on per-NPC cooldown).
    expect(scene.lastNpcGreetTime).toBe(0);
  });

  it("findNearbyCharacter returns null when no characters exist", () => {
    const sys = new CharacterSystem(makeSceneStub());
    const sprite = { x: 100, y: 100, active: true } as any;
    expect(sys.findNearbyCharacter(sprite, 80)).toBeNull();
  });
});
