import * as Phaser from "phaser";
import type { ZoneType, GameBuilding } from "@/city/lib/types";
import { SCALE } from "../textures/constants";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 960;
import {
  loadZoneModule,
  getLoadedZoneModule,
} from "../zones";
import type { WorldScene } from "../scenes/WorldScene";

/**
 * ZoneSystem — zone transitions, setup/clear, offscreen caching, and the
 * zone-popup-building registry.
 *
 * Extracted from WorldScene (Phase 3 of PERFORMANCE_PLAN.md). This is a
 * methods-bundle: all zone state (the *Elements[] arrays, *ZoneCreated flags,
 * ticker/billboard/arena state, currentZone, isTransitioning, originalPositions,
 * zonePopupBuildings) STAYS on the scene as public fields because the 8 zone
 * setup files + the update loop + cleanup read/write them directly. The system
 * owns the transition + setup + caching logic and reaches shared state via
 * this.scene.
 *
 * registerZonePopupBuilding / unregisterZonePopupBuilding(sByZone) /
 * storeZoneElementPositions remain callable on the scene via passthroughs so
 * the zone files keep compiling unchanged.
 */
export class ZoneSystem {
  private scene: WorldScene;

  constructor(scene: WorldScene) {
    this.scene = scene;
  }

  /**
   * Tear down zone timers. The arena/ticker/billboard/traffic timers live as
   * fields on the scene (zone setup files populate them); the scene's cleanup()
   * destroys them directly today. This method is the future home for that
   * teardown once the timer fields migrate into this system.
   */
  destroy(): void {
    // The zone module cache (zones/index.ts) is intentionally process-lifetime:
    // clearing it would force re-downloading chunks on scene re-mount, defeating
    // the purpose of lazy loading. The cached setup functions are pure
    // (scene) => void and don't hold stale scene references. So this is a no-op;
    // retained for lifecycle symmetry with the other systems.
  }

  /**
   * Async setup: dynamic-import the zone's module (cached after first visit)
   * and call its setup function. The transition overlay stays visible while
   * the module loads; on repeat visits the cached Promise resolves instantly.
   */
  async setupZoneAsync(zone: ZoneType): Promise<void> {
    const mod = await loadZoneModule(zone);
    mod.setup(this.scene);
  }

  /**
   * Disconnect a zone's optional teardown handler (arena replay, ascension
   * placeholder). Looks up the already-loaded module synchronously; if the zone
   * was never visited (module not cached), there's nothing to disconnect.
   * For trending, calls clearTrafficTimers (also lives in the trending module).
   */
  disconnectZone(zone: ZoneType): void {
    const mod = getLoadedZoneModule(zone);
    if (!mod) return;
    if (zone === "trending" && mod.clearTrafficTimers) {
      mod.clearTrafficTimers(this.scene);
    }
    if (mod.disconnect) {
      mod.disconnect(this.scene);
    }
  }

  handleZoneChange(event: CustomEvent<{ zone: ZoneType }>): void {
    const newZone = event.detail.zone;
    if (newZone === this.scene.currentZone || this.scene.isTransitioning) return;

    // Transition to new zone
    this.transitionToZone(newZone);
  }

  async transitionToZone(newZone: ZoneType): Promise<void> {
    // Guard against re-entrancy: the await below yields to the event loop, so
    // a second zone-change event could fire before isTransitioning is set.
    // Check + set synchronously BEFORE any await.
    if (newZone === this.scene.currentZone || this.scene.isTransitioning) return;
    this.scene.isTransitioning = true;

    this.scene.audioSystem.playZoneTransitionSfx();

    // Preload the new zone's module NOW (during the slide-out animation) so
    // it's cached by the time the slide-in onComplete fires and calls
    // setupZoneOffscreen. On first visit this downloads the chunk; on repeat
    // visits the cached Promise resolves instantly.
    try {
      await loadZoneModule(newZone);
    } catch (err) {
      // Chunk-load failure (offline, 404, ad-blocker). Reset the transition
      // guard so the player isn't soft-locked, and bail without changing zones.
      console.error(`[ZoneSystem] Failed to load zone "${newZone}" chunk:`, err);
      this.scene.isTransitioning = false;
      return;
    }

    // Cancel any active tap-to-move
    this.scene.moveTarget = null;
    this.scene.moveTargetBuilding = null;
    this.scene.moveTargetNPC = null;

    // Hide helper NPC during transitions; she only lives in the city
    if (this.scene.helperNPC) {
      this.scene.helperNPC.setVisible(false);
      const indicator = (this.scene.helperNPC as any)._helperIndicator as Phaser.GameObjects.Text | undefined;
      if (indicator) indicator.setVisible(false);
    }

    // Pause camera follow during transition
    if (this.scene.cameraFollowing) {
      this.scene.cameras.main.stopFollow();
    }

    // CLEANUP: Kill any existing transition tweens to prevent accumulation
    this.scene.decorations.forEach((d) => this.scene.tweens.killTweensOf(d));
    this.scene.animals.forEach((a) => this.scene.tweens.killTweensOf(a.sprite));
    this.scene.trendingElements.forEach((el) => this.scene.tweens.killTweensOf(el));
    this.scene.billboardTexts.forEach((t) => this.scene.tweens.killTweensOf(t));
    this.scene.skylineSprites.forEach((s) => this.scene.tweens.killTweensOf(s));
    if (this.scene.tickerText) this.scene.tweens.killTweensOf(this.scene.tickerText);
    this.scene.ballersElements.forEach((el) => this.scene.tweens.killTweensOf(el));
    this.scene.foundersElements.forEach((el) => this.scene.tweens.killTweensOf(el));
    this.scene.labsElements.forEach((el) => this.scene.tweens.killTweensOf(el));
    this.scene.moltbookElements.forEach((el) => this.scene.tweens.killTweensOf(el));
    this.scene.arenaElements.forEach((el) => this.scene.tweens.killTweensOf(el));
    this.scene.ascensionElements.forEach((el) => this.scene.tweens.killTweensOf(el));
    this.scene.buildingSprites.forEach((container) => this.scene.tweens.killTweensOf(container));
    this.scene.characterSprites.forEach((sprite) => this.scene.tweens.killTweensOf(sprite));

    // Reset all zone element positions to originals before transition
    // (slide-out animations corrupt x positions; this ensures correct starting positions)
    this.scene.decorations.forEach((d) => {
      const origX = this.scene.originalPositions.get(d);
      if (origX !== undefined) (d as any).x = origX;
    });
    this.scene.animals.forEach((a) => {
      const origX = this.scene.originalPositions.get(a.sprite);
      if (origX !== undefined) (a.sprite as any).x = origX;
    });
    this.resetZoneElementPositions(this.scene.trendingElements);
    this.resetZoneElementPositions(this.scene.skylineSprites);
    this.resetZoneElementPositions(this.scene.billboardTexts);
    this.resetZoneElementPositions(this.scene.ballersElements);
    this.resetZoneElementPositions(this.scene.foundersElements);
    this.resetZoneElementPositions(this.scene.labsElements);
    this.resetZoneElementPositions(this.scene.moltbookElements);
    this.resetZoneElementPositions(this.scene.arenaElements);
    this.resetZoneElementPositions(this.scene.ascensionElements);

    // Determine slide direction: Labs -> Moltbook Beach -> Park -> Catalog -> Ballers Valley -> Founder's Corner -> Arena (left to right)
    // Zone order: labs (-2) -> moltbook (-1) -> main_city (0) -> trending (1) -> ballers (2) -> founders (3) -> arena (4)
    const zoneOrder: Record<ZoneType, number> = {
      labs: -2,
      moltbook: -1,
      main_city: 0,
      trending: 1,
      ballers: 2,
      founders: 3,
      arena: 4,
      ascension: 5,
    };
    const isGoingRight = zoneOrder[newZone] > zoneOrder[this.scene.currentZone];
    const isAscensionTransition = newZone === "ascension" || this.scene.currentZone === "ascension";
    const isVerticalTransition = isAscensionTransition;
    const duration = isVerticalTransition ? 800 : 600; // Slower, dramatic for vertical transitions
    const slideDistance = Math.round(850 * SCALE); // Slightly more than screen width for full slide (scaled)

    // For ascension: vertical transition (ascend)
    // For all others: horizontal slide
    const slideOutOffset = isVerticalTransition ? 0 : isGoingRight ? -slideDistance : slideDistance;
    const slideInOffset = isVerticalTransition ? 0 : isGoingRight ? slideDistance : -slideDistance;

    // Collect current zone elements to slide out
    const oldElements: (Phaser.GameObjects.GameObject & { x?: number })[] = [];

    if (this.scene.currentZone === "trending") {
      oldElements.push(...this.scene.trendingElements);
      oldElements.push(...this.scene.billboardTexts);
      if (this.scene.tickerText) oldElements.push(this.scene.tickerText);
      oldElements.push(...this.scene.skylineSprites);
    } else if (this.scene.currentZone === "ballers") {
      oldElements.push(...this.scene.ballersElements);
    } else if (this.scene.currentZone === "founders") {
      oldElements.push(...this.scene.foundersElements);
    } else if (this.scene.currentZone === "labs") {
      oldElements.push(...this.scene.labsElements);
    } else if (this.scene.currentZone === "moltbook") {
      oldElements.push(...this.scene.moltbookElements);
    } else if (this.scene.currentZone === "arena") {
      oldElements.push(...this.scene.arenaElements);
    } else if (this.scene.currentZone === "ascension") {
      oldElements.push(...this.scene.ascensionElements);
    } else {
      // Main city (Park) decorations
      this.scene.decorations.forEach((d) => oldElements.push(d));
      this.scene.animals.forEach((a) => oldElements.push(a.sprite));
    }

    // Snapshot building/character sprite IDs at transition start
    // Only these will be destroyed after transition — sprites created mid-transition by worldState updates are preserved
    const oldBuildingSpriteIds = new Set(this.scene.buildingSprites.keys());
    const oldCharacterSpriteIds = new Set(this.scene.characterSprites.keys());

    // Include buildings and characters (they slide out and get recreated)
    this.scene.buildingSprites.forEach((container) => oldElements.push(container));
    this.scene.characterSprites.forEach((sprite) => oldElements.push(sprite));

    // Store old element original X positions for proper destruction
    const oldElementData = oldElements.map((el) => ({ el, origX: (el as any).x || 0 }));

    // Create transition overlay for ground swap (slides with content, scaled)
    const transitionOverlay = this.scene.add.rectangle(
      GAME_WIDTH / 2 + slideInOffset,
      Math.round(520 * SCALE),
      GAME_WIDTH,
      Math.round(200 * SCALE),
      {
        trending: 0x374151,
        labs: 0x1a1a2e,
        arena: 0x2d1b4e,
        ascension: 0xe8e8f0,
        moltbook: 0xc2b280,
        ballers: 0x22c55e,
        founders: 0x8b6914,
        main_city: 0x22c55e,
      }[this.scene.currentZone] || 0x22c55e, // Zone-appropriate ground color
      1
    );
    transitionOverlay.setDepth(0);

    if (isAscensionTransition) {
      const verticalDist = Math.round(600 * SCALE);
      const isEnteringAscension = newZone === "ascension";

      // Entering ascension (flying up): old elements slide DOWN (world drops away)
      // Leaving ascension (descending): old elements slide UP (world rises away)
      const verticalDelta = isEnteringAscension ? verticalDist : -verticalDist;
      oldElementData.forEach(({ el }) => {
        if ((el as any).y !== undefined) {
          this.scene.tweens.add({
            targets: el,
            y: (el as any).y + verticalDelta,
            alpha: 0,
            duration,
            ease: "Cubic.easeIn",
          });
          // Slide character drop shadow with its sprite so it doesn't lag
          const shadow = (el as any)._shadow as Phaser.GameObjects.Sprite | undefined;
          if (shadow && shadow.active) {
            this.scene.tweens.add({
              targets: shadow,
              y: shadow.y + verticalDelta,
              alpha: 0,
              duration,
              ease: "Cubic.easeIn",
            });
          }
        }
      });

      // Ground fades during transition
      this.scene.tweens.add({
        targets: this.scene.ground,
        alpha: 0,
        duration: duration * 0.4,
        ease: "Cubic.easeIn",
        onComplete: () => {
          this.scene.ground.setAlpha(1);
        },
      });

      // Sky-colored overlay (celestial cream-white, matching ascension cloud floor)
      transitionOverlay.setFillStyle(0xfff8e8, 1);
      transitionOverlay.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2);
      transitionOverlay.setSize(GAME_WIDTH, GAME_HEIGHT);
      transitionOverlay.setAlpha(0);
      transitionOverlay.setDepth(50);

      // Cloud wisps drifting during the sky transition
      const cloudWisps: Phaser.GameObjects.Ellipse[] = [];
      const cloudDirection = isEnteringAscension ? 1 : -1; // Down when flying up, up when descending

      for (let i = 0; i < 7; i++) {
        const w = Math.round((60 + Math.random() * 120) * SCALE);
        const h = Math.round((15 + Math.random() * 25) * SCALE);
        const startX = Math.random() * GAME_WIDTH;
        const startY = Math.random() * GAME_HEIGHT;
        const cloud = this.scene.add.ellipse(
          startX,
          startY,
          w,
          h,
          i % 3 === 0 ? 0xfff0c8 : 0xffffff, // Mix white + pale gold
          0.4 + Math.random() * 0.3
        );
        cloud.setDepth(51);
        cloud.setAlpha(0);
        cloudWisps.push(cloud);

        this.scene.tweens.add({
          targets: cloud,
          alpha: 0.3 + Math.random() * 0.4,
          y: startY + cloudDirection * Math.round((80 + Math.random() * 200) * SCALE),
          x: startX + Math.round((Math.random() - 0.5) * 100 * SCALE),
          duration: duration * 0.8,
          ease: "Sine.easeInOut",
          delay: Math.random() * 150,
          onComplete: () => {
            this.scene.tweens.add({
              targets: cloud,
              alpha: 0,
              duration: 200,
              onComplete: () => cloud.destroy(),
            });
          },
        });
      }

      // Main overlay fade
      this.scene.tweens.add({
        targets: transitionOverlay,
        alpha: 1,
        duration: duration * 0.5,
        ease: "Cubic.easeIn",
        yoyo: true,
        hold: duration * 0.15,
        onComplete: () => {
          transitionOverlay.destroy();
          cloudWisps.forEach((c) => {
            if (c.active) c.destroy();
          });
        },
      });
    } else {
      // Standard horizontal slide
      oldElementData.forEach(({ el }) => {
        if ((el as any).x !== undefined) {
          this.scene.tweens.add({
            targets: el,
            x: (el as any).x + slideOutOffset,
            duration,
            ease: "Cubic.easeInOut",
          });
          // Slide character drop shadow with its sprite so it doesn't lag
          const shadow = (el as any)._shadow as Phaser.GameObjects.Sprite | undefined;
          if (shadow && shadow.active) {
            this.scene.tweens.add({
              targets: shadow,
              x: shadow.x + slideOutOffset,
              duration,
              ease: "Cubic.easeInOut",
            });
          }
        }
      });

      // Slide ground texture overlay (scaled)
      this.scene.tweens.add({
        targets: this.scene.ground,
        tilePositionX:
          this.scene.ground.tilePositionX +
          (isGoingRight ? Math.round(100 * SCALE) : -Math.round(100 * SCALE)),
        duration,
        ease: "Cubic.easeInOut",
      });

      // Slide transition overlay in, destroy when complete
      this.scene.tweens.add({
        targets: transitionOverlay,
        x: GAME_WIDTH / 2,
        duration,
        ease: "Cubic.easeInOut",
        onComplete: () => {
          transitionOverlay.destroy();
        },
      });
    }

    // At 40% through animation, swap the zone for smooth visual transition
    this.scene.time.delayedCall(duration * 0.4, () => {
      // Hide old zone elements (don't destroy - they're cached for reuse)
      if (this.scene.currentZone === "trending") {
        this.scene.trendingElements.forEach((el) => (el as any).setVisible(false));
        this.scene.billboardTexts.forEach((t) => t.setVisible(false));
        if (this.scene.tickerText) this.scene.tickerText.setVisible(false);
        this.scene.skylineSprites.forEach((s) => s.setVisible(false));
        // Stop ticker animation
        if (this.scene.tickerTimer) {
          this.scene.tickerTimer.destroy();
          this.scene.tickerTimer = null;
        }
        // Stop billboard update timer
        if (this.scene.billboardTimer) {
          this.scene.billboardTimer.destroy();
          this.scene.billboardTimer = null;
        }
        // Stop traffic timers (trending.ts)
        this.disconnectZone("trending");
      } else if (this.scene.currentZone === "ballers") {
        this.scene.ballersElements.forEach((el) => (el as any).setVisible(false));
      } else if (this.scene.currentZone === "founders") {
        this.scene.foundersElements.forEach((el) => (el as any).setVisible(false));
      } else if (this.scene.currentZone === "labs") {
        this.scene.labsElements.forEach((el) => (el as any).setVisible(false));
      } else if (this.scene.currentZone === "moltbook") {
        this.scene.moltbookElements.forEach((el) => (el as any).setVisible(false));
      } else if (this.scene.currentZone === "arena") {
        this.scene.arenaElements.forEach((el) => (el as any).setVisible(false));
        this.disconnectZone("arena");
      } else if (this.scene.currentZone === "ascension") {
        this.scene.ascensionElements.forEach((el) => (el as any).setVisible(false));
        this.disconnectZone("ascension");
      }

      // Update zone and set up new content
      this.scene.currentZone = newZone;

      // Reset NPC greeting state on zone change
      this.scene.previousNearbyNPC = null;
      this.scene.npcGreetZoneEntryTime = Date.now();

      // Sync zone to Zustand store (used by ImmersiveHUD)
      window.dispatchEvent(
        new CustomEvent("agencity-phaser-zone-change", { detail: { zone: newZone } })
      );

      // Change ground texture based on zone
      const groundTextures: Record<ZoneType, string> = {
        labs: "labs_ground", // Tech Labs has futuristic floor tiles
        moltbook: "beach_ground", // Moltbook Beach has sand
        main_city: "grass",
        trending: "concrete",
        ballers: "grass", // Ballers Valley has premium grass (luxury estate feel)
        founders: "founders_ground", // Founder's Corner has warm workshop flooring
        arena: "arena_floor", // MoltBook Arena has dark checkerboard floor
        ascension: "ascension_cloud_ground", // Ascension Spire has bright cloud-tile floor
      };
      this.scene.ground.setTexture(groundTextures[newZone]);

      // Setup new zone content (will be positioned off-screen initially).
      // Fire-and-forget: the tween callback can't await. The module was
      // preloaded in transitionToZone so the await inside resolves from cache
      // instantly; the .catch() prevents an unhandled rejection if setup throws.
      this.setupZoneOffscreen(newZone, slideInOffset).catch((err) => {
        console.error("[ZoneSystem] setupZoneOffscreen failed:", err);
      });
    });

    // Clean up old elements after animation completes
    this.scene.time.delayedCall(duration + 50, () => {
      oldElementData.forEach(({ el }) => {
        // Only destroy elements that aren't persistent (zone elements are reused)
        const isDecoration = this.scene.decorations.includes(el as any);
        const isAnimal = this.scene.animals.some((a) => a.sprite === el);
        const isTrendingElement =
          this.scene.trendingElements.includes(el) ||
          this.scene.skylineSprites.includes(el as any) ||
          this.scene.billboardTexts.includes(el as any) ||
          el === this.scene.tickerText;
        const isBallersElement = this.scene.ballersElements.includes(el);
        const isFoundersElement = this.scene.foundersElements.includes(el);
        const isMoltbookElement = this.scene.moltbookElements.includes(el);
        const isLabsElement = this.scene.labsElements.includes(el);
        const isArenaElement = this.scene.arenaElements.includes(el);
        const isAscensionElement = this.scene.ascensionElements.includes(el);

        if (
          !isDecoration &&
          !isAnimal &&
          !isTrendingElement &&
          !isBallersElement &&
          !isFoundersElement &&
          !isMoltbookElement &&
          !isLabsElement &&
          !isArenaElement &&
          !isAscensionElement &&
          el &&
          (el as any).destroy &&
          (el as any).active !== false
        ) {
          (el as any).destroy();
        }
      });

      // Only clear building/character sprites that existed at transition start
      // Sprites created mid-transition by worldState updates are preserved
      oldBuildingSpriteIds.forEach((id) => {
        const sprite = this.scene.buildingSprites.get(id);
        if (sprite && (sprite as any).active !== false) {
          (sprite as any).destroy();
        }
        this.scene.buildingSprites.delete(id);
      });
      oldCharacterSpriteIds.forEach((id) => {
        const sprite = this.scene.characterSprites.get(id);
        if (sprite && (sprite as any).active !== false) {
          // Destroy attached drop shadow before the sprite itself
          const shadow = (sprite as any)._shadow as Phaser.GameObjects.Sprite | undefined;
          if (shadow) {
            shadow.destroy();
            (sprite as any)._shadow = null;
          }
          (sprite as any).destroy();
        }
        this.scene.characterSprites.delete(id);
      });

      // CRITICAL: Immediately recreate sprites from existing worldState
      // Without this, sprites stay destroyed until next React Query poll (up to 60s)
      if (this.scene.worldState) {
        this.scene.updateCharacters(this.scene.worldState.population);
        this.scene.buildingSystem.updateBuildings(this.scene.worldState.buildings);
      }

      // Mark transition complete
      this.scene.isTransitioning = false;

      // Resume camera follow after transition
      if (this.scene.cameraFollowing && this.scene.localPlayer) {
        this.scene.cameras.main.startFollow(this.scene.localPlayer, true, 0.08, 0.08);
        this.scene.cameras.main.setDeadzone(30, 15);
      }

      // Flush any pending player spawn that was queued during this transition
      if (this.scene.pendingEnterWorld) {
        const pending = this.scene.pendingEnterWorld;
        this.scene.pendingEnterWorld = null;
        pending();
      }

      // Show helper NPC only when the player is back in the city
      if (this.scene.helperNPC) {
        const inCity = this.scene.currentZone === "main_city";
        this.scene.helperNPC.setVisible(inCity);
        const indicator = (this.scene.helperNPC as any)._helperIndicator as Phaser.GameObjects.Text | undefined;
        if (indicator) indicator.setVisible(inCity);
      }
    });
  }

  async setupZoneOffscreen(zone: ZoneType, offsetX: number): Promise<void> {
    // Hide all zone elements once, before setting up the new zone
    this.hideAllZoneElements();

    // Ensure ground is visible by default (zones that need it hidden will override)
    this.scene.ground.setVisible(true);
    if (this.scene.groundPath) this.scene.groundPath.setVisible(true);
    if (this.scene.groundTransition) this.scene.groundTransition.setVisible(true);

    // Setup zone with elements offset, then animate them into position
    const duration = 400; // Smooth slide-in matching the overall transition feel

    if (zone === "trending") {
      await this.setupZoneAsync("trending");

      // Offset all new Catalog elements and animate them in
      const newElements = [
        ...this.scene.trendingElements,
        ...this.scene.billboardTexts,
        this.scene.tickerText,
        ...this.scene.skylineSprites,
      ].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).x !== undefined) {
          const targetX = (el as any).x;
          (el as any).x = targetX + offsetX;
          this.scene.tweens.add({
            targets: el,
            x: targetX,
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    } else if (zone === "ballers") {
      await this.setupZoneAsync("ballers");

      // Offset all new Ballers Valley elements and animate them in
      const newElements = [...this.scene.ballersElements].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).x !== undefined) {
          const targetX = (el as any).x;
          (el as any).x = targetX + offsetX;
          this.scene.tweens.add({
            targets: el,
            x: targetX,
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    } else if (zone === "founders") {
      await this.setupZoneAsync("founders");

      // Offset all new Founder's Corner elements and animate them in
      const newElements = [...this.scene.foundersElements].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).x !== undefined) {
          const targetX = (el as any).x;
          (el as any).x = targetX + offsetX;
          this.scene.tweens.add({
            targets: el,
            x: targetX,
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    } else if (zone === "labs") {
      await this.setupZoneAsync("labs");

      // Offset all new Tech Labs elements and animate them in
      const newElements = [...this.scene.labsElements].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).x !== undefined) {
          const targetX = (el as any).x;
          (el as any).x = targetX + offsetX;
          this.scene.tweens.add({
            targets: el,
            x: targetX,
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    } else if (zone === "moltbook") {
      await this.setupZoneAsync("moltbook");

      // Offset all new Moltbook Beach elements and animate them in
      const newElements = [...this.scene.moltbookElements].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).x !== undefined) {
          const targetX = (el as any).x;
          (el as any).x = targetX + offsetX;
          this.scene.tweens.add({
            targets: el,
            x: targetX,
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    } else if (zone === "arena") {
      await this.setupZoneAsync("arena");

      // Offset all new Arena elements and animate them in
      const newElements = [...this.scene.arenaElements].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).x !== undefined) {
          const targetX = (el as any).x;
          (el as any).x = targetX + offsetX;
          this.scene.tweens.add({
            targets: el,
            x: targetX,
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    } else if (zone === "ascension") {
      await this.setupZoneAsync("ascension");

      // Ascension elements rise from below (upward float-in)
      const verticalDist = Math.round(300 * SCALE);
      const newElements = [...this.scene.ascensionElements].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).y !== undefined) {
          const targetY = (el as any).y;
          (el as any).y = targetY + verticalDist;
          (el as any).alpha = 0;
          this.scene.tweens.add({
            targets: el,
            y: targetY,
            alpha: 1,
            duration: 600,
            ease: "Cubic.easeOut",
            delay: Math.random() * 200,
          });
        }
      });
    } else {
      await this.setupZoneAsync("main_city");

      // Animate Park elements in using their ORIGINAL positions
      const newElements = [...this.scene.decorations, ...this.scene.animals.map((a) => a.sprite)];

      newElements.forEach((el) => {
        // Get the original position, not the current (off-screen) position
        const originalX = this.scene.originalPositions.get(el);
        if (originalX !== undefined) {
          (el as any).x = originalX + offsetX; // Start off-screen
          this.scene.tweens.add({
            targets: el,
            x: originalX, // Animate to original position
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    }
  }

  storeOriginalPositions(): void {
    // Store original X positions of decorations and animals for zone transitions
    this.scene.decorations.forEach((d) => {
      this.scene.originalPositions.set(d, (d as any).x || 0);
    });
    this.scene.animals.forEach((a) => {
      this.scene.originalPositions.set(a.sprite, (a.sprite as any).x || 0);
    });
  }

  /**
   * Store original X positions for zone elements that participate in slide animations.
   * Called after zone elements are first created so positions can be restored
   * before the next slide-out/slide-in cycle.
   */
  storeZoneElementPositions(elements: Phaser.GameObjects.GameObject[]): void {
    elements.forEach((el) => {
      if ((el as any).x !== undefined) {
        this.scene.originalPositions.set(el, (el as any).x);
      }
    });
  }

  /**
   * Reset zone elements to their original X positions (counteracts slide-out corruption).
   */
  resetZoneElementPositions(elements: Phaser.GameObjects.GameObject[]): void {
    elements.forEach((el) => {
      const origX = this.scene.originalPositions.get(el);
      if (origX !== undefined) (el as any).x = origX;
    });
  }

  clearCurrentZone(): void {
    // Clear zone-specific elements based on current zone
    if (this.scene.currentZone === "trending") {
      // Just hide elements instead of destroying (they're cached for reuse)
      this.scene.trendingElements.forEach((el) => (el as any).setVisible(false));
      this.scene.billboardTexts.forEach((t) => t.setVisible(false));
      if (this.scene.tickerText) {
        this.scene.tickerText.setVisible(false);
      }
      if (this.scene.tickerTimer) {
        this.scene.tickerTimer.destroy();
        this.scene.tickerTimer = null;
      }
      this.scene.skylineSprites.forEach((s) => s.setVisible(false));
    } else if (this.scene.currentZone === "ballers") {
      // Hide ballers elements
      this.scene.ballersElements.forEach((el) => (el as any).setVisible(false));
    } else if (this.scene.currentZone === "founders") {
      // Hide founders elements
      this.scene.foundersElements.forEach((el) => (el as any).setVisible(false));
    } else if (this.scene.currentZone === "labs") {
      // Hide labs elements
      this.scene.labsElements.forEach((el) => (el as any).setVisible(false));
    } else if (this.scene.currentZone === "arena") {
      // Hide arena elements and disconnect WebSocket
      this.scene.arenaElements.forEach((el) => (el as any).setVisible(false));
      this.disconnectZone("arena");
    } else if (this.scene.currentZone === "ascension") {
      // Hide ascension elements and stop polling
      this.scene.ascensionElements.forEach((el) => (el as any).setVisible(false));
      this.disconnectZone("ascension");
    } else if (this.scene.currentZone === "main_city") {
      // Main city uses shared decorations, don't destroy them
      // Just hide them
      this.scene.decorations.forEach((d) => d.setVisible(false));
      this.scene.animals.forEach((a) => a.sprite.setVisible(false));
      if (this.scene.helperNPC) {
        this.scene.helperNPC.setVisible(false);
        const indicator = (this.scene.helperNPC as any)._helperIndicator as Phaser.GameObjects.Text | undefined;
        if (indicator) indicator.setVisible(false);
      }
    }

    // Reset ground
    if (this.scene.zoneGround) {
      this.scene.zoneGround.destroy();
      this.scene.zoneGround = null;
    }
    if (this.scene.zonePath) {
      this.scene.zonePath.destroy();
      this.scene.zonePath = null;
    }
  }

  /**
   * Hide all zone-specific elements in a single pass.
   * Called once before setting up a new zone, replacing the duplicated
   * hide-everything blocks that were copied into each setup method.
   */
  hideAllZoneElements(): void {
    this.scene.decorations.forEach((d) => d.setVisible(false));
    this.scene.animals.forEach((a) => a.sprite.setVisible(false));
    if (this.scene.fountainWater) this.scene.fountainWater.setVisible(false);
    this.scene.trendingElements.forEach((el) => (el as any).setVisible(false));
    this.scene.skylineSprites.forEach((s) => s.setVisible(false));
    this.scene.billboardTexts.forEach((t) => t.setVisible(false));
    if (this.scene.tickerText) this.scene.tickerText.setVisible(false);
    this.scene.academyElements.forEach((el) => (el as any).setVisible(false));
    this.scene.ballersElements.forEach((el) => (el as any).setVisible(false));
    this.scene.foundersElements.forEach((el) => (el as any).setVisible(false));
    this.scene.labsElements.forEach((el) => (el as any).setVisible(false));
    this.scene.moltbookElements.forEach((el) => (el as any).setVisible(false));
    this.scene.arenaElements.forEach((el) => (el as any).setVisible(false));
    this.scene.ascensionElements.forEach((el) => (el as any).setVisible(false));
    this.disconnectZone("arena");
    this.disconnectZone("ascension");
    if (this.scene.helperNPC) {
      this.scene.helperNPC.setVisible(false);
      const indicator = (this.scene.helperNPC as any)._helperIndicator as Phaser.GameObjects.Text | undefined;
      if (indicator) indicator.setVisible(false);
    }
    if (this.scene.foundersPopup) {
      this.scene.foundersPopup.destroy();
      this.scene.foundersPopup = null;
    }
  }

  /**
   * Setup dispatcher — dynamic-imports the zone's module and calls its setup
   * function. Async because the first visit to a zone downloads its chunk;
   * repeat visits resolve from the cache instantly.
   */
  setupZone(zone: ZoneType): Promise<void> {
    return this.setupZoneAsync(zone);
  }

  // Handle AI behavior commands for characters
  // Find a character sprite by character ID (handles special character naming)


  registerZonePopupBuilding(
    id: string,
    sprite: Phaser.GameObjects.Sprite,
    data: GameBuilding,
    zone: ZoneType,
    onInteract: () => void
  ): void {
    this.scene.zonePopupBuildings.set(id, { sprite, data, zone, onInteract });
  }

  unregisterZonePopupBuilding(id: string): void {
    this.scene.zonePopupBuildings.delete(id);
  }

  unregisterZonePopupBuildingsByZone(zone: ZoneType): void {
    for (const [id, entry] of this.scene.zonePopupBuildings) {
      if (entry.zone === zone) {
        this.scene.zonePopupBuildings.delete(id);
      }
    }
  }
}
