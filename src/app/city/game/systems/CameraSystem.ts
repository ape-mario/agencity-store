import * as Phaser from "phaser";
import { SCALE } from "../textures/constants";
import type { WorldScene } from "../scenes/WorldScene";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 960;

/**
 * CameraSystem — mobile camera drag/pan/zoom + tap-vs-drag detection.
 *
 * Extracted from WorldScene (Phase 3 of PERFORMANCE_PLAN.md). On mobile it
 * wires pointer handlers for one-finger drag-to-pan, two-finger pinch-to-zoom,
 * and double-tap-to-reset. The drag-vs-tap threshold (TAP_DISTANCE_THRESHOLD)
 * feeds wasDragGesture, which the player tap-to-move and tooltip code read to
 * suppress accidental taps after a drag.
 *
 * Camera/touch state (touchStartPos, touchStartTime, mobileDragPanEnabled)
 * moves here; wasDragGesture, moveTarget, playerEnabled, and localPlayer stay
 * on the scene (shared with PlayerSystem + TooltipSystem).
 *
 * In-world (playerEnabled), camera drag/pan/zoom is disabled because the
 * camera follows the player instead.
 */
export class CameraSystem {
  private scene: WorldScene;
  public static readonly TAP_DISTANCE_THRESHOLD = 12; // pixels
  public static readonly LONG_PRESS_SPRINT_MS = 250; // Hold this long to sprint on release

  constructor(scene: WorldScene) {
    this.scene = scene;
  }

  /** Wire mobile camera + touch handlers. No-op on desktop. */
  setupMobileCameraControls(): void {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Enable touch input globally for this scene
    this.scene.input.setTopOnly(false);

    if (!isMobile) return;

    // Set up camera bounds for panning
    const camera = this.scene.cameras.main;
    camera.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Track drag state
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let cameraStartX = 0;
    let cameraStartY = 0;

    // Track touch start for tap-vs-drag detection (prevents accidental clicks)
    // Also records the press start timestamp so pointerup can derive long-press sprint intent.
    this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.scene.touchStartPos = { x: pointer.x, y: pointer.y };
      this.scene.touchStartTime = Date.now();
      this.scene.wasDragGesture = false;
    });

    // Handle pointer down - start drag (disabled when player is in world — camera follows player)
    this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.scene.mobileDragPanEnabled) return;
      // Only start drag if not clicking on a character/building
      const hitObjects = this.scene.input.hitTestPointer(pointer);
      if (hitObjects.length === 0) {
        isDragging = true;
        dragStartX = pointer.x;
        dragStartY = pointer.y;
        cameraStartX = camera.scrollX;
        cameraStartY = camera.scrollY;
      }
    });

    // Handle pointer move - pan camera + mark drag gesture
    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      // Mark as drag if finger moved beyond threshold (prevents accidental taps)
      if (this.scene.touchStartPos && pointer.isDown && !this.scene.wasDragGesture) {
        const dist = Phaser.Math.Distance.Between(
          this.scene.touchStartPos.x,
          this.scene.touchStartPos.y,
          pointer.x,
          pointer.y
        );
        if (dist > CameraSystem.TAP_DISTANCE_THRESHOLD) {
          this.scene.wasDragGesture = true;
        }
      }

      if (!this.scene.mobileDragPanEnabled || !isDragging || !pointer.isDown) return;

      const deltaX = dragStartX - pointer.x;
      const deltaY = dragStartY - pointer.y;

      // Apply movement scaled by zoom level
      camera.scrollX = Phaser.Math.Clamp(
        cameraStartX + deltaX / camera.zoom,
        0,
        GAME_WIDTH - camera.width / camera.zoom
      );
      camera.scrollY = Phaser.Math.Clamp(
        cameraStartY + deltaY / camera.zoom,
        0,
        GAME_HEIGHT - camera.height / camera.zoom
      );
    });

    // Handle pointer up - stop drag. Do NOT reset wasDragGesture here: this
    // handler is registered before the tap-to-move / building / NPC pointerup
    // handlers, so clearing it now would defeat their drag-suppression guard.
    // wasDragGesture is instead reset at the start of the NEXT gesture, in the
    // pointerdown handler above.
    this.scene.input.on("pointerup", () => {
      isDragging = false;
    });

    // Handle pinch to zoom (two-finger gesture) — disabled in-world
    let initialPinchDistance = 0;
    let initialZoom = 1;

    this.scene.input.on("pointerdown", () => {
      if (this.scene.playerEnabled) return;
      const pointers = this.scene.input.manager.pointers.filter((p) => p.isDown);
      if (pointers.length === 2) {
        initialPinchDistance = Phaser.Math.Distance.Between(
          pointers[0].x,
          pointers[0].y,
          pointers[1].x,
          pointers[1].y
        );
        initialZoom = camera.zoom;
        isDragging = false;
      }
    });

    this.scene.input.on("pointermove", () => {
      if (this.scene.playerEnabled) return;
      const pointers = this.scene.input.manager.pointers.filter((p) => p.isDown);
      if (pointers.length === 2 && initialPinchDistance > 0) {
        const currentDistance = Phaser.Math.Distance.Between(
          pointers[0].x,
          pointers[0].y,
          pointers[1].x,
          pointers[1].y
        );
        const scale = currentDistance / initialPinchDistance;
        camera.setZoom(Phaser.Math.Clamp(initialZoom * scale, 0.5, 2));
      }
    });

    this.scene.input.on("pointerup", () => {
      if (this.scene.playerEnabled) return;
      const pointers = this.scene.input.manager.pointers.filter((p) => p.isDown);
      if (pointers.length < 2) {
        initialPinchDistance = 0;
      }
    });

    // Double-tap to reset zoom — disabled in-world
    let lastTapTime = 0;
    this.scene.input.on("pointerup", () => {
      if (this.scene.playerEnabled) return;
      const currentTime = Date.now();
      if (currentTime - lastTapTime < 300) {
        camera.setZoom(1);
        camera.scrollX = 0;
        camera.scrollY = 0;
      }
      lastTapTime = currentTime;
    });

    // Reset all touch state on system interrupts (incoming call, app switch)
    this.scene.input.on("pointercancel", () => {
      this.scene.moveTarget = null;
      this.scene.moveTargetBuilding = null;
      this.scene.moveTargetNPC = null;
      this.scene.wasDragGesture = false;
      isDragging = false;
      initialPinchDistance = 0;
    });
  }
}
