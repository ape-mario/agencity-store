import { describe, it, expect, vi } from "vitest";
import { CameraSystem } from "./CameraSystem";
import type { WorldScene } from "../scenes/WorldScene";

describe("CameraSystem", () => {
  it("exposes the tap-distance + long-press thresholds as static constants", () => {
    expect(CameraSystem.TAP_DISTANCE_THRESHOLD).toBe(12);
    expect(CameraSystem.LONG_PRESS_SPRINT_MS).toBe(250);
  });

  it("setupMobileCameraControls returns without throwing on desktop (no input wiring)", () => {
    const scene = {
      input: {
        setTopOnly: vi.fn(),
        on: vi.fn(),
        manager: { pointers: [] },
        hitTestPointer: vi.fn(() => []),
      },
      cameras: { main: { setBounds: vi.fn(), zoom: 1, width: 1280, height: 960, scrollX: 0, scrollY: 0, setZoom: vi.fn() } },
      wasDragGesture: false,
      touchStartPos: null,
      touchStartTime: 0,
      mobileDragPanEnabled: true,
      moveTarget: null,
      moveTargetBuilding: null,
      moveTargetNPC: null,
      playerEnabled: false,
      localPlayer: null,
      isMobile: false,
    } as unknown as WorldScene;
    // navigator.userAgent is "node" in test env -> not mobile -> early return.
    const sys = new CameraSystem(scene);
    expect(() => sys.setupMobileCameraControls()).not.toThrow();
    expect((scene as any).input.setTopOnly).toHaveBeenCalledWith(false);
  });
});
