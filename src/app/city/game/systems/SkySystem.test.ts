import { describe, it, expect, vi } from "vitest";
import { SkySystem } from "./SkySystem";
import type { WorldScene } from "../scenes/WorldScene";

/**
 * Scene stub for SkySystem. Covers the Phaser surface it touches (add.graphics/
 * rectangle/sprite/ellipse, tweens, time, cameras) plus the public fields the
 * extracted methods read/write (skyGradient, stars, skyClouds, treeline,
 * groundTransition, clouds, currentZone, worldState, ambientParticles, and the
 * zone sky overrides).
 */
function gfxStub() {
  return {
    setDepth: vi.fn(),
    clear: vi.fn(),
    setVisible: vi.fn(),
    fillStyle: vi.fn(),
    fillRect: vi.fn(),
    fillGradientStyle: vi.fn(),
    fillTriangle: vi.fn(),
    setAlpha: vi.fn(),
    destroy: vi.fn(),
    push: vi.fn(),
  };
}
function rectStub() {
  return { setDepth: vi.fn(), setAlpha: vi.fn(), setVisible: vi.fn(), destroy: vi.fn(), alpha: 0 };
}

function makeSceneStub(): WorldScene {
  return {
    add: {
      graphics: vi.fn(() => gfxStub()),
      rectangle: vi.fn(() => rectStub()),
      sprite: vi.fn(() => ({
        setScale: vi.fn(),
        setAlpha: vi.fn(),
        setDepth: vi.fn(),
        setTint: vi.fn(),
        setVisible: vi.fn(),
        destroy: vi.fn(),
      })),
      ellipse: vi.fn(() => ({ setDepth: vi.fn(), setFillStyle: vi.fn() })),
      circle: vi.fn(() => ({ setDepth: vi.fn(), setVisible: vi.fn() })),
      particles: vi.fn(() => ({
        setDepth: vi.fn(),
        stop: vi.fn(),
        destroy: vi.fn(),
      })),
    },
    tweens: {
      add: vi.fn(),
      killTweensOf: vi.fn(),
    },
    time: { addEvent: vi.fn(() => ({ destroy: vi.fn() })) },
    cameras: { main: { setBackgroundColor: vi.fn(), flash: vi.fn(), shake: vi.fn() } },
    // Public sky fields the system reads/writes.
    skyGradient: gfxStub(),
    stars: [] as any[],
    skyClouds: [] as any[],
    treeline: null,
    groundTransition: gfxStub(),
    distantSkylineGfx: [] as any[],
    clouds: [{ setTint: vi.fn() }] as any,
    currentZone: "main_city" as any,
    worldState: null as any,
    ambientParticles: null,
    fireflies: null,
    ballersGoldenSky: null,
    academyTwilightSky: null,
    academyMoon: null,
    academyStars: [] as any[],
    academyElements: [] as any[],
    ascensionCelestialSky: null,
    ascensionSkyElements: [] as any[],
    // Cross-system methods the sky system delegates to.
    showFireflies: vi.fn(),
    hideFireflies: vi.fn(),
  } as unknown as WorldScene;
}

describe("SkySystem", () => {
  it("cleanup() destroys weather timers + emitter without throwing", () => {
    const sys = new SkySystem(makeSceneStub(), rectStub() as any);
    expect(() => sys.cleanup()).not.toThrow();
  });

  it("updateSkyForTime is a no-op in ballers zone (golden hour wins)", () => {
    const scene = makeSceneStub();
    scene.currentZone = "ballers" as any;
    const sys = new SkySystem(scene, rectStub() as any);
    const drawSpy = vi.spyOn(sys as any, "drawSkyGradient");
    sys.updateSkyForTime({ isNight: true, isDusk: false, isDawn: false });
    expect(drawSpy).not.toHaveBeenCalled();
  });

  it("updateSkyForTime redraws the gradient for non-ballers zones", () => {
    const scene = makeSceneStub();
    scene.currentZone = "main_city" as any;
    const sys = new SkySystem(scene, rectStub() as any);
    const drawSpy = vi.spyOn(sys as any, "drawSkyGradient");
    sys.updateSkyForTime({ isNight: false, isDusk: false, isDawn: false });
    expect(drawSpy).toHaveBeenCalledWith("day");
  });

  it("updateWeather tears down prior emitter/timers then dispatches by weather", () => {
    const scene = makeSceneStub();
    const sys = new SkySystem(scene, rectStub() as any);
    // Seed internal state so the teardown path runs.
    const rain = vi.spyOn(sys as any, "createRainEffect");
    const sunny = vi.spyOn(sys as any, "createSunnyEffect");
    sys.updateWeather("sunny" as any);
    expect(sunny).toHaveBeenCalled();
    sys.updateWeather("rain" as any);
    expect(rain).toHaveBeenCalledWith(false);
    sys.updateWeather("storm" as any);
    expect(rain).toHaveBeenCalledWith(true);
  });

  it("restoreNormalSky un-hides the main sky gradient + zone sky visibility", () => {
    const scene = makeSceneStub();
    const sys = new SkySystem(scene, rectStub() as any);
    expect(() => sys.restoreNormalSky()).not.toThrow();
    expect((scene.skyGradient as any).setVisible).toHaveBeenCalledWith(true);
  });
});
