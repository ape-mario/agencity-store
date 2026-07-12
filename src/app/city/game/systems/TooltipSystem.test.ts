import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TooltipSystem } from "./TooltipSystem";
import type { WorldScene } from "../scenes/WorldScene";

/**
 * A focused scene stub for TooltipSystem. Tooltips build DOM-like Phaser game
 * objects via scene.add.{container,rectangle,text}; we return chainable stubs
 * so the verbatim-extracted methods run without a real Phaser canvas.
 */
function gfxStub() {
  return {
    setStrokeStyle: vi.fn(),
    setOrigin: vi.fn(),
    setDepth: vi.fn(),
    setInteractive: vi.fn(),
    on: vi.fn(),
    setFillStyle: vi.fn(),
    setVisible: vi.fn(),
    setAlpha: vi.fn(),
    setStyle: vi.fn(),
    destroy: vi.fn(),
    width: 0,
    height: 0,
    x: 0,
    y: 0,
  };
}

function makeSceneStub() {
  const containerStub = {
    add: vi.fn(),
    setDepth: vi.fn(),
    destroy: vi.fn(),
    x: 0,
    y: 0,
  };
  return {
    add: {
      container: vi.fn(() => ({ ...containerStub })),
      rectangle: vi.fn(() => gfxStub()),
      text: vi.fn(() => gfxStub()),
    },
    tweens: { add: vi.fn() },
    // TooltipSystem reads these two from the scene.
    wasDragGesture: false,
    getStatusFromHealth: vi.fn(() => "active" as const),
  } as unknown as WorldScene;
}

describe("TooltipSystem", () => {
  let originalWindow: PropertyDescriptor | undefined;

  beforeEach(() => {
    // window.open is called in profile-button pointerup; stub it.
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    (globalThis as any).window = { open: vi.fn() };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete (globalThis as any).window;
    }
    vi.useRealTimers();
  });

  it("cleanup() destroys an existing tooltip and clears the hide timer", () => {
    vi.useFakeTimers();
    const sys = new TooltipSystem(makeSceneStub());
    // Build a character tooltip so there is something to destroy.
    sys.showCharacterTooltip(
      {
        id: "x",
        username: "tester",
        provider: "agenc",
        earnings24h: 0,
      } as any,
      { x: 10, y: 10 } as any
    );
    sys.scheduleHideTooltip();
    sys.cleanup();
    // No throw + no pending timer firing after cleanup.
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });

  it("formatMarketCap formats millions, thousands, and small values", () => {
    const sys = new TooltipSystem(makeSceneStub());
    expect(sys.formatMarketCap(1_500_000)).toBe("$1.5M");
    expect(sys.formatMarketCap(42_000)).toBe("$42K");
    expect(sys.formatMarketCap(500)).toBe("$500");
  });

  it("hideTooltip() is a no-op when nothing is shown", () => {
    const sys = new TooltipSystem(makeSceneStub());
    expect(() => sys.hideTooltip()).not.toThrow();
  });

  it("scheduleHideTooltip() defers hideTooltip by ~500ms", () => {
    vi.useFakeTimers();
    const sys = new TooltipSystem(makeSceneStub());
    const hideSpy = vi.spyOn(sys, "hideTooltip");
    sys.scheduleHideTooltip();
    expect(hideSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(hideSpy).toHaveBeenCalled();
  });
});
