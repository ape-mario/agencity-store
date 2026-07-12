import { describe, it, expect, vi } from "vitest";
import { EncounterSystem } from "./EncounterSystem";
import type { WorldScene } from "../scenes/WorldScene";

function makeSceneStub(): WorldScene {
  return {
    add: {
      text: vi.fn(() => ({ setOrigin: vi.fn(), setDepth: vi.fn(), setPosition: vi.fn(), destroy: vi.fn() })),
    },
    time: {
      addEvent: vi.fn(() => ({ destroy: vi.fn() })),
      delayedCall: vi.fn(() => ({ remove: vi.fn() })),
    },
    localPlayer: null,
    currentZone: "main_city" as any,
    animals: [] as any[],
    pokemon: [] as any[],
    ambientCreatures: [] as any[],
    audioSystem: { playEncounterSfx: vi.fn() } as any,
  } as unknown as WorldScene;
}

describe("EncounterSystem", () => {
  it("exposes encounterActive/playerStunned as public flags defaulting false", () => {
    const sys = new EncounterSystem(makeSceneStub());
    expect(sys.encounterActive).toBe(false);
    expect(sys.playerStunned).toBe(false);
  });

  it("checkCreatureEncounters is a no-op when the local player is absent", () => {
    const sys = new EncounterSystem(makeSceneStub());
    expect(() => sys.checkCreatureEncounters()).not.toThrow();
    expect(sys.encounterActive).toBe(false);
  });

  it("checkCreatureEncounters is a no-op while an encounter is already active", () => {
    const scene = makeSceneStub();
    scene.localPlayer = { x: 100, y: 100 } as any;
    const sys = new EncounterSystem(scene);
    sys.encounterActive = true;
    sys.checkCreatureEncounters();
    expect(sys.encounterActive).toBe(true); // unchanged
  });

  it("handleEncounterEnd clears encounterActive and the safety timeout", () => {
    const sys = new EncounterSystem(makeSceneStub());
    sys.encounterActive = true;
    sys.handleEncounterEnd({ detail: { result: "win" } } as any);
    expect(sys.encounterActive).toBe(false);
    expect(sys.playerStunned).toBe(false); // win -> no stun
  });

  it("cleanup() resets active/stun state without throwing", () => {
    const sys = new EncounterSystem(makeSceneStub());
    sys.encounterActive = true;
    sys.playerStunned = true;
    sys.cleanup();
    expect(sys.encounterActive).toBe(false);
    expect(sys.playerStunned).toBe(false);
  });
});
