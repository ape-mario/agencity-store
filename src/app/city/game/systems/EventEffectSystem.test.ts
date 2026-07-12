import { describe, it, expect, vi } from "vitest";
import { EventEffectSystem } from "./EventEffectSystem";

/**
 * Scene stub covering the Phaser surface EventEffectSystem touches:
 * add.particles/graphics/sprite/rectangle/text, make.graphics, time, tweens,
 * cameras.main, textures. All return chainable no-op stubs so the verbatim
 * effect methods run without a real canvas.
 */
function particleStub() {
  return {
    setDepth: vi.fn(),
    explode: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    setPosition: vi.fn(),
  };
}

function makeSceneStub() {
  return {
    add: {
      particles: vi.fn(() => particleStub()),
      graphics: vi.fn(() => ({
        setDepth: vi.fn(),
        clear: vi.fn(),
        destroy: vi.fn(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
        fillEllipse: vi.fn(),
        fillCircle: vi.fn(),
        fillTriangle: vi.fn(),
        generateTexture: vi.fn(),
      })),
      sprite: vi.fn(() => ({
        setDepth: vi.fn(),
        destroy: vi.fn(),
        setFlipX: vi.fn(),
        x: 0,
        y: 0,
        angle: 0,
      })),
      rectangle: vi.fn(() => ({
        setStrokeStyle: vi.fn(),
        setDepth: vi.fn(),
        setAlpha: vi.fn(),
        destroy: vi.fn(),
      })),
      text: vi.fn(() => ({
        setOrigin: vi.fn(),
        setDepth: vi.fn(),
        setAlpha: vi.fn(),
        destroy: vi.fn(),
      })),
    },
    make: {
      graphics: vi.fn(() => ({
        fillStyle: vi.fn(),
        fillEllipse: vi.fn(),
        fillCircle: vi.fn(),
        generateTexture: vi.fn(),
        destroy: vi.fn(),
      })),
    },
    time: {
      delayedCall: vi.fn((_ms: number, cb?: () => void) => {
        // Don't auto-fire; return a removable handle.
        return { remove: vi.fn() };
      }),
      addEvent: vi.fn(() => ({ destroy: vi.fn() })),
    },
    tweens: { add: vi.fn() },
    cameras: { main: { flash: vi.fn(), shake: vi.fn() } },
    textures: { remove: vi.fn() },
  } as unknown as import("phaser").Scene;
}

describe("EventEffectSystem", () => {
  it("triggerEvent routes each event type to its effect + camera cue", () => {
    const sys = new EventEffectSystem(makeSceneStub());
    const scene = sys["scene"] as any;
    const spy = vi.spyOn(sys, "playCelebration");

    sys.triggerEvent({ type: "token_launch" } as any);
    expect(spy).toHaveBeenCalled();
    expect(scene.cameras.main.shake).not.toHaveBeenCalled();

    vi.clearAllMocks();
    sys.triggerEvent({ type: "price_dump" } as any);
    expect(scene.cameras.main.shake).toHaveBeenCalledWith(400, 0.008);
  });

  it("handleBotEffect dispatches by effectType", () => {
    const sys = new EventEffectSystem(makeSceneStub());
    const fireworks = vi.spyOn(sys, "playFireworks");
    const confetti = vi.spyOn(sys, "playConfetti");
    const coins = vi.spyOn(sys, "playCoinsRain");

    sys.handleBotEffect({ detail: { effectType: "fireworks", x: 10, y: 20 } } as any);
    expect(fireworks).toHaveBeenCalledWith(10, 20);

    sys.handleBotEffect({ detail: { effectType: "confetti" } } as any);
    expect(confetti).toHaveBeenCalled();

    sys.handleBotEffect({ detail: { effectType: "coins" } } as any);
    expect(coins).toHaveBeenCalled();
  });

  it("handleBotEffect ignores unknown effect types", () => {
    const sys = new EventEffectSystem(makeSceneStub());
    expect(() =>
      sys.handleBotEffect({ detail: { effectType: "nope" } } as any)
    ).not.toThrow();
  });

  it("playCelebration creates particles + schedules cleanup", () => {
    const scene = makeSceneStub();
    const sys = new EventEffectSystem(scene);
    sys.playCelebration(640, 300);
    expect((scene.add as any).particles).toHaveBeenCalledTimes(2); // coins + stars
    expect((scene.time as any).delayedCall).toHaveBeenCalled();
  });

  it("showAnnouncement cleans up a prior banner before showing a new one", () => {
    const scene = makeSceneStub();
    const sys = new EventEffectSystem(scene);
    sys.showAnnouncement("first");
    // Calling again should not throw and should re-create text/bg.
    expect(() => sys.showAnnouncement("second")).not.toThrow();
    // Two text + two rectangle objects created across the two calls.
    expect((scene.add as any).text).toHaveBeenCalledTimes(2);
    expect((scene.add as any).rectangle).toHaveBeenCalledTimes(2);
  });

  it("cleanup() is safe when no announcement is shown", () => {
    const sys = new EventEffectSystem(makeSceneStub());
    expect(() => sys.cleanup()).not.toThrow();
  });
});
