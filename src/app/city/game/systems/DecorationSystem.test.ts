import { describe, it, expect, vi } from "vitest";
import { DecorationSystem } from "./DecorationSystem";
import type { WorldScene } from "../scenes/WorldScene";

/** Scene stub covering the DecorationSystem surface. */
function makeSceneStub(): WorldScene {
  return {
    add: {
      graphics: vi.fn(() => ({ setDepth: vi.fn(), clear: vi.fn(), fillStyle: vi.fn(), fillRect: vi.fn() })),
      sprite: vi.fn(() => ({
        setScale: vi.fn(),
        setDepth: vi.fn(),
        setFlipX: vi.fn(),
        play: vi.fn(),
        setVisible: vi.fn(),
        destroy: vi.fn(),
        setTint: vi.fn(),
        x: 0,
        y: 0,
        active: true,
      })),
      ellipse: vi.fn(() => ({ setDepth: vi.fn(), setFillStyle: vi.fn() })),
      rectangle: vi.fn(() => ({ setDepth: vi.fn(), setVisible: vi.fn() })),
      circle: vi.fn(() => ({ setDepth: vi.fn() })),
      particles: vi.fn(() => ({
        setDepth: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        setVisible: vi.fn(),
        destroy: vi.fn(),
        explode: vi.fn(),
      })),
      text: vi.fn(() => ({ setDepth: vi.fn(), setOrigin: vi.fn() })),
    },
    tweens: { add: vi.fn(), killTweensOf: vi.fn() },
    time: { delayedCall: vi.fn(() => ({ remove: vi.fn() })), addEvent: vi.fn(() => ({ destroy: vi.fn() })) },
    cameras: { main: { worldView: { x: 0, right: 1280 } } },
    // Decoration state (public arrays/fields the system reads/writes).
    decorations: [] as any[],
    animals: [] as any[],
    pokemon: [] as any[],
    beachCrabs: [] as any[],
    ambientCreatures: [] as any[],
    fountainWater: null as any,
    fireflies: null as any,
    ambientParticles: null as any,
    clouds: [] as any[],
    currentZone: "main_city" as any,
  } as unknown as WorldScene;
}

describe("DecorationSystem", () => {
  it("update() is a no-op (no throw) when arrays are empty", () => {
    const sys = new DecorationSystem(makeSceneStub());
    expect(() => sys.update(false, false)).not.toThrow();
  });

  it("update() drives cloud parallax only when not modal/hidden", () => {
    const scene = makeSceneStub();
    const cloud = { x: 500, y: 50 };
    scene.clouds = [cloud] as any;
    const sys = new DecorationSystem(scene);

    sys.update(false, false);
    expect(cloud.x).toBeGreaterThan(500); // moved right

    cloud.x = 500;
    sys.update(true, false); // modal open -> paused
    expect(cloud.x).toBe(500);
  });

  it("update() only roams animals in main_city", () => {
    const scene = makeSceneStub();
    const animal = {
      sprite: { x: 100, setFlipX: vi.fn() },
      isIdle: false,
      targetX: 600,
      speed: 2,
      direction: "right",
    };
    scene.animals = [animal] as any;

    const sys = new DecorationSystem(scene);
    scene.currentZone = "founders" as any;
    sys.update(false, false);
    expect(animal.sprite.x).toBe(100); // no roaming outside main_city

    scene.currentZone = "main_city" as any;
    sys.update(false, false);
    expect(animal.sprite.x).toBeGreaterThan(100); // roamed toward target
  });

  it("petAnimal marks the matching animal idle (happy reaction)", () => {
    const scene = makeSceneStub();
    const animal = {
      sprite: { x: 100, y: 200, setScale: vi.fn(), setFlipX: vi.fn() },
      type: "cat",
      isIdle: false,
      targetX: 0,
      speed: 1,
      direction: "right",
    };
    scene.animals = [animal] as any;
    const sys = new DecorationSystem(scene);
    sys.petAnimal("cat");
    expect(animal.isIdle).toBe(true);
  });

  it("petAnimal is a no-op for a missing animal type", () => {
    const sys = new DecorationSystem(makeSceneStub());
    expect(() => sys.petAnimal("dog")).not.toThrow();
  });

  it("handleBotAnimal dispatches pet/scare/call/feed", () => {
    const scene = makeSceneStub();
    const sys = new DecorationSystem(scene);
    const petSpy = vi.spyOn(sys, "petAnimal");
    const scareSpy = vi.spyOn(sys, "scareAnimal");
    const callSpy = vi.spyOn(sys, "callAnimal");
    const feedSpy = vi.spyOn(sys, "feedAnimal");

    sys.handleBotAnimal({ detail: { animalType: "cat", animalAction: "pet" } } as any);
    expect(petSpy).toHaveBeenCalledWith("cat");
    sys.handleBotAnimal({ detail: { animalType: "cat", animalAction: "scare" } } as any);
    expect(scareSpy).toHaveBeenCalledWith("cat");
    sys.handleBotAnimal({ detail: { animalType: "cat", animalAction: "call" } } as any);
    expect(callSpy).toHaveBeenCalled();
    sys.handleBotAnimal({ detail: { animalType: "cat", animalAction: "feed" } } as any);
    expect(feedSpy).toHaveBeenCalledWith("cat");
  });

  it("handleBotAnimal ignores events with no animalType", () => {
    const sys = new DecorationSystem(makeSceneStub());
    expect(() => sys.handleBotAnimal({ detail: {} } as any)).not.toThrow();
  });
});
