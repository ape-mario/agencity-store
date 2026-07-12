import * as Phaser from "phaser";
import type { GameBuilding, BuildingStatus } from "@/city/lib/types";
import { ECOSYSTEM_CONFIG } from "@/city/lib/config";
import { SCALE, DEPTH, Y } from "../textures/constants";
import type { WorldScene } from "../scenes/WorldScene";

const GAME_WIDTH = 1280;

/**
 * BuildingSystem — building sprite lifecycle: create, update, decay visuals,
 * dormant indicators, and status derivation.
 *
 * Extracted from WorldScene (Phase 2 of PERFORMANCE_PLAN.md). The building
 * sprite maps (buildingSprites, buildingById, buildingInitialized,
 * zonePopupBuildings) stay public on the scene because zone setup files and
 * the proximity/interaction code read them directly; this system owns the
 * create/update/decay methods and reaches shared state via this.scene.
 *
 * getStatusFromHealth() also stays callable on the scene (TooltipSystem uses
 * it); BuildingSystem calls it via this.scene.getStatusFromHealth.
 */
export class BuildingSystem {
  private scene: WorldScene;

  constructor(scene: WorldScene) {
    this.scene = scene;
  }

  updateBuildings(buildings: GameBuilding[]): void {
    // Rebuild O(1) lookup map for proximity checks
    this.scene.buildingById.clear();
    for (const b of buildings) {
      this.scene.buildingById.set(b.id, b);
    }

    // First, hide all buildings
    this.scene.buildingSprites.forEach((container) => {
      container.setVisible(false);
    });

    // Filter buildings by current zone
    // Buildings with no zone appear in most zones, but NOT in arena/ascension (special zones)
    // Exception: platform buildings with an explicit zone assignment always render in their zone
    const zoneBuildings = buildings.filter((b) => {
      // Ascension zone handles its own platform showcase — don't create duplicate sprites
      if (b.isPlatform && b.zone === "ascension") return false;
      // Platform buildings render in their assigned zone
      if (b.isPlatform && b.zone) return b.zone === this.scene.currentZone;
      // Arena and Ascension zones have no regular token buildings
      if (this.scene.currentZone === "arena" || this.scene.currentZone === "ascension") return false;
      if (!b.zone) return true; // No zone = appears in all non-special zones
      return b.zone === this.scene.currentZone;
    });

    const allBuildingIds = new Set(buildings.map((b) => b.id));

    // Only destroy buildings that no longer exist in the world state
    this.scene.buildingSprites.forEach((container, id) => {
      if (!allBuildingIds.has(id)) {
        container.destroy();
        this.scene.buildingSprites.delete(id);
        this.scene.buildingInitialized.delete(id);
      }
    });

    // Separate buildings into existing (quick update) and new (needs creation)
    const existingBuildings: GameBuilding[] = [];
    const newBuildings: GameBuilding[] = [];

    zoneBuildings.forEach((building) => {
      if (this.scene.buildingSprites.has(building.id)) {
        existingBuildings.push(building);
      } else {
        newBuildings.push(building);
      }
    });

    // Update existing buildings immediately (fast path)
    existingBuildings.forEach((building) => {
      this.updateExistingBuilding(building);
    });

    // Batch create new buildings across frames to prevent frame drops
    const BATCH_SIZE = 3;
    const createBatch = (startIndex: number) => {
      const endIndex = Math.min(startIndex + BATCH_SIZE, newBuildings.length);
      for (let i = startIndex; i < endIndex; i++) {
        this.createBuildingSprite(newBuildings[i]);
      }
      // Schedule next batch if there are more buildings
      if (endIndex < newBuildings.length) {
        this.scene.time.delayedCall(0, () => createBatch(endIndex));
      }
    };

    if (newBuildings.length > 0) {
      createBatch(0);
    }

    // Update ascension showcase labels with platform token data
    const ascensionPlatform = buildings.filter((b) => b.isPlatform && b.zone === "ascension");
    ascensionPlatform.forEach((b, i) => {
      const label = (this as unknown as Record<string, unknown>)[
        `_platformLabel_ascension_showcase_${i}`
      ];
      if (label && (label as Phaser.GameObjects.Text).active) {
        (label as Phaser.GameObjects.Text).setText(`$${b.symbol}`);
      }
    });
  }

  // Get building decay status from health value
  getStatusFromHealth(health: number): BuildingStatus {
    const thresholds = ECOSYSTEM_CONFIG.buildings.decay.thresholds;
    if (health <= thresholds.dormant) return "dormant";
    if (health <= thresholds.critical) return "critical";
    if (health <= thresholds.warning) return "warning";
    return "active";
  }

  // Apply visual decay effects to a building sprite
  applyDecayVisuals(
    building: GameBuilding,
    sprite: Phaser.GameObjects.Sprite,
    container: Phaser.GameObjects.Container
  ): void {
    // Skip floating buildings - they never decay
    // Agent beach buildings are isPermanent but DO show activity-based decay
    if (building.isFloating) return;
    if (building.isPermanent && !building.isBeachTheme) return;

    const status = building.status || this.scene.getStatusFromHealth(building.health);

    // Clear existing decay effects
    sprite.clearTint();
    sprite.setAlpha(1);

    // Remove any existing decay tweens on this sprite
    this.scene.tweens.killTweensOf(sprite);

    // Remove existing dormant indicator if any
    const existingZzz = container.getByName("dormantIndicator");
    if (existingZzz) {
      this.scene.tweens.killTweensOf(existingZzz);
      existingZzz.destroy();
    }

    switch (status) {
      case "warning":
        sprite.setTint(0xffcc00); // Yellow tint
        sprite.setAlpha(0.9);
        break;

      case "critical":
        sprite.setTint(0xff6600); // Orange tint
        sprite.setAlpha(0.75);
        // Add pulsing effect for urgency
        this.scene.tweens.add({
          targets: sprite,
          alpha: 0.6,
          duration: 1000,
          yoyo: true,
          repeat: -1,
        });
        break;

      case "dormant":
        sprite.setTint(0x666666); // Gray tint
        sprite.setAlpha(0.5);
        // Add sleeping indicator
        this.addDormantIndicator(container);
        break;

      default:
        // "active" - no special effects
        break;
    }
  }

  // Add a floating "ZZZ" indicator for dormant buildings
  addDormantIndicator(container: Phaser.GameObjects.Container): void {
    const zzz = this.scene.add.text(20, -60, "zzZ", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#9ca3af",
    });
    zzz.setName("dormantIndicator");

    // Float animation
    this.scene.tweens.add({
      targets: zzz,
      y: zzz.y - 10,
      alpha: { from: 1, to: 0.5 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
    });

    container.add(zzz);
  }

  updateExistingBuilding(building: GameBuilding): void {
    const container = this.scene.buildingSprites.get(building.id);
    if (!container) return;

    // Show the existing building
    container.setVisible(true);

    // Special buildings have fixed textures - no need to update
    const isPokeCenter = building.id.includes("PokeCenter") || building.symbol === "HEAL";
    const isCasino = building.id.includes("Casino") || building.symbol === "CASINO";
    const isArcade = building.id.includes("Arcade") || building.symbol === "ARCADE";
    const isBagsHQ = building.isFloating || building.symbol === "AGENCITY";
    const isTreasury = building.id.startsWith("Treasury");
    const isMansion = building.isMansion;

    // Beach-themed agent buildings (Moltbook Beach zone)
    const isBeachBuilding = building.isBeachTheme || building.zone === "moltbook";
    // Agent buildings have fixed textures keyed by zone — skip texture swap
    const isAgentBuilding = building.id.startsWith("agent-building-");

    // Skip texture updates for special buildings (they don't change)
    if (isPokeCenter || isCasino || isArcade || isBagsHQ || isTreasury || isMansion) {
      return;
    }

    // Platform buildings use zone-specific showcase textures — skip generic texture swap
    if (building.isPlatform) {
      this.applyDecayVisuals(building, container.getAt(1) as Phaser.GameObjects.Sprite, container);
      return;
    }

    // Agent buildings: update decay visuals and check for level/texture changes (admin override)
    if (isAgentBuilding) {
      const agentSprite = container.getAt(1) as Phaser.GameObjects.Sprite;
      if (agentSprite) {
        this.applyDecayVisuals(building, agentSprite, container);
        // Check if level changed (e.g. admin override) and update texture accordingly
        const agentLevel = Math.min(Math.max(building.level, 1), 5);
        const expectedTexture = isBeachBuilding
          ? `beach_building_${agentLevel}`
          : `building_${agentLevel}_0`;
        if (agentSprite.texture?.key !== expectedTexture) {
          this.scene.tweens.add({
            targets: container,
            scale: 1.15,
            duration: 150,
            yoyo: true,
            onComplete: () => {
              agentSprite.setTexture(expectedTexture);
            },
          });
        }
      }
      return;
    }

    // Regular buildings: sprite is at index 1 (after shadow at index 0)
    const sprite = container.getAt(1) as Phaser.GameObjects.Sprite;
    if (!sprite) return;

    // Apply decay visuals
    this.applyDecayVisuals(building, sprite, container);

    // Use same hash function to get consistent style
    const getBuildingStyleUpdate = (id: string): number => {
      let hash = 0;
      for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash = hash & hash;
      }
      return Math.abs(hash) % 4;
    };
    const updateStyleIndex = getBuildingStyleUpdate(building.id);
    // Beach buildings use their own texture set
    const beachBuildingLevel = Math.min(Math.max(building.level, 1), 5);
    const newTexture = isBeachBuilding
      ? `beach_building_${beachBuildingLevel}`
      : `building_${building.level}_${updateStyleIndex}`;
    if (sprite.texture?.key !== newTexture) {
      this.scene.tweens.add({
        targets: container,
        scale: 1.15,
        duration: 150,
        yoyo: true,
        onComplete: () => {
          sprite.setTexture(newTexture);
        },
      });
    }
  }

  createBuildingSprite(building: GameBuilding): void {
    if (this.scene.buildingSprites.has(building.id)) return; // Already exists

    const isFirstTimeCreation = !this.scene.buildingInitialized.has(building.id);
    const container = this.scene.add.container(building.x, building.y);

    // Scale building based on level (market cap)
    // Level 1: 0.8x, Level 2: 0.9x, Level 3: 1.0x, Level 4: 1.15x, Level 5: 1.3x
    const buildingScales = [0.8, 0.9, 1.0, 1.15, 1.3];
    const buildingScale = buildingScales[building.level - 1] || 1.0;

    // Shadow scales with building (floating HQ has no direct shadow)
    const isBagsHQ = building.isFloating || building.symbol === "AGENCITY";
    if (!isBagsHQ) {
      const shadowWidth = 20 + building.level * 6;
      const shadow = this.scene.add.ellipse(2, 2, shadowWidth, 8, 0x000000, 0.3);
      container.add(shadow);
    }

    // Use special texture for PokeCenter/Casino/HQ/Mansions, otherwise use level-based building with style
    const isPokeCenter = building.id.includes("PokeCenter") || building.symbol === "HEAL";
    const isCasino = building.id.includes("Casino") || building.symbol === "CASINO";
    const isArcade = building.id.includes("Arcade") || building.symbol === "ARCADE";
    const isTreasury = building.id.startsWith("Treasury");
    const isAgenCityHQ = building.isFloating || building.symbol === "AGENCITY";
    const isMansion = building.isMansion;

    // Determine building style from mint address (deterministic - same token always gets same style)
    // Each level has 4 styles (0-3)
    const getBuildingStyle = (id: string): number => {
      // Use a simple hash of the building id to get a style index 0-3
      let hash = 0;
      for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash) % 4;
    };

    // For mansions, use holderRank to determine style (0-4)
    const mansionStyleIndex = isMansion ? Math.min((building.holderRank || 1) - 1, 4) : 0;

    const styleIndex = getBuildingStyle(building.id);
    // Beach-themed buildings for Moltbook Beach zone
    const isBeachBuilding = building.isBeachTheme || building.zone === "moltbook";
    const beachBuildingLevel = Math.min(Math.max(building.level, 1), 5); // Clamp to 1-5

    // Platform buildings use zone-specific showcase textures or themed textures
    const getPlatformShowcaseTexture = (
      zone: string | undefined,
      rank: number | undefined,
      theme: string | undefined
    ): string | null => {
      switch (zone) {
        case "ascension": {
          // Ranks 1-4: temple, observatory, vault, shrine
          const ascTextures = [
            "ascension_temple",
            "ascension_observatory",
            "ascension_vault",
            "ascension_token_shrine",
          ];
          const ascSlot = (rank || 1) - 1; // rank 1→0, rank 2→1, etc.
          return ascTextures[ascSlot] || ascTextures[0];
        }
        case "trending": {
          const trendSlot = ((rank || 5) - 5) % 3; // ranks 5-7 → 0,1,2
          return ["city_showcase_1", "city_showcase_2", "city_showcase_3"][trendSlot];
        }
        case "main_city": {
          // Park: nature-themed — greenhouse, garden pavilion, treehouse
          const parkSlot = ((rank || 8) - 8) % 3; // ranks 8-10 → 0,1,2
          return ["park_showcase_1", "park_showcase_2", "park_showcase_3"][parkSlot];
        }
        case "moltbook": {
          // Moltbook Beach: volcanic/tiki — volcanos fit the tropical island theme
          const beachSlot = ((rank || 14) - 14) % 2; // ranks 14-15 → 0,1
          return ["beach_showcase_1", "beach_showcase_2"][beachSlot];
        }
        default: {
          // Use themed platform textures for non-showcase zones (labs)
          // Override volcano to crystal only in labs (peaceful HQ zone)
          const safeTheme = theme === "volcano" && zone === "labs" ? "crystal" : theme;
          if (safeTheme && this.scene.textures.exists(`platform_${safeTheme}`)) {
            return `platform_${safeTheme}`;
          }
          return null;
        }
      }
    };

    const platformTexture = building.isPlatform
      ? getPlatformShowcaseTexture(building.zone, building.platformRank, building.platformTheme)
      : null;

    const buildingTexture = platformTexture
      ? platformTexture
      : isAgenCityHQ
        ? "bagshq"
        : isMansion
          ? `mansion_${mansionStyleIndex}`
          : isPokeCenter
            ? "pokecenter"
            : isCasino
              ? "casino"
              : isArcade
                ? "arcade_building"
                : isTreasury
                  ? "treasury"
                  : isBeachBuilding
                    ? `beach_building_${beachBuildingLevel}`
                    : `building_${building.level}_${styleIndex}`;
    const sprite = this.scene.add.sprite(0, 0, buildingTexture);
    sprite.setOrigin(0.5, 1);
    // HQ is larger and floating, mansions use rank-based scaling from building data
    const hqScale = 1.5;
    // Mansions use mansionScale from world-calculator (1.5 for #1, 1.3 for #2-3, 1.15 for #4-5)
    const mansionScale = building.mansionScale || 1.2;
    sprite.setScale(
      isAgenCityHQ
        ? hqScale
        : isMansion
          ? mansionScale
          : isPokeCenter
            ? 1.0
            : isCasino
              ? 1.0
              : isArcade
                ? 1.0
                : isTreasury
                  ? 1.0
                  : building.platformScale
                    ? building.platformScale
                    : buildingScale
    );
    container.add(sprite);

    // Apply decay visuals for non-permanent buildings
    if (!building.isPermanent && !building.isFloating) {
      this.applyDecayVisuals(building, sprite, container);
    }

    // Add floating animation for HQ
    if (isAgenCityHQ) {
      this.scene.tweens.add({
        targets: container,
        y: building.y - 10,
        duration: 2000,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });

      // Add subtle gold glow around HQ
      const hqGlow = this.scene.add.sprite(0, -60, "glow");
      hqGlow.setScale(1.2);
      hqGlow.setAlpha(0.15);
      hqGlow.setTint(0xffd700); // Gold glow
      container.add(hqGlow);

      this.scene.tweens.add({
        targets: hqGlow,
        alpha: 0.25,
        scale: 1.4,
        duration: 2000,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    }

    // Add gold glow, rank badge, and holder info for Mansions (Ballers Valley)
    if (isMansion) {
      const isWhale = building.holderRank === 1;
      const glowScale = isWhale ? 1.8 : 1.4;
      const glowAlpha = isWhale ? 0.3 : 0.2;
      const glowY = isWhale ? -100 : -80;

      // Gold glow effect (larger and brighter for #1 WHALE)
      const mansionGlow = this.scene.add.sprite(0, glowY, "glow");
      mansionGlow.setScale(glowScale);
      mansionGlow.setAlpha(glowAlpha);
      mansionGlow.setTint(0xfbbf24); // Gold
      container.addAt(mansionGlow, 0); // Add behind sprite

      // Pulsing glow animation (more dramatic for #1)
      this.scene.tweens.add({
        targets: mansionGlow,
        alpha: isWhale ? 0.5 : 0.35,
        scale: glowScale + (isWhale ? 0.4 : 0.2),
        duration: isWhale ? 2000 : 2500,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });

      // #1 WHALE gets a secondary sparkle glow
      if (isWhale) {
        const sparkleGlow = this.scene.add.sprite(0, glowY + 20, "glow");
        sparkleGlow.setScale(1.0);
        sparkleGlow.setAlpha(0.15);
        sparkleGlow.setTint(0xfcd34d); // Brighter gold/amber
        container.addAt(sparkleGlow, 0);

        this.scene.tweens.add({
          targets: sparkleGlow,
          alpha: 0.3,
          scale: 1.3,
          duration: 1500,
          ease: "Sine.easeInOut",
          yoyo: true,
          repeat: -1,
          delay: 500, // Offset for layered effect
        });
      }

      // Make mansion interactive (clickable cursor)
      sprite.setInteractive({ useHandCursor: true });
    }

    // Glow effect for pumping buildings (skip for HQ - it has its own gold glow)
    if (building.glowing && !isAgenCityHQ) {
      const glow = this.scene.add.sprite(0, -40, "glow");
      glow.setScale(1.5);
      glow.setAlpha(0.4);
      glow.setTint(0x4ade80);
      container.add(glow);

      this.scene.tweens.add({
        targets: glow,
        alpha: 0.7,
        scale: 1.8,
        duration: 800,
        yoyo: true,
        repeat: -1,
      });
    }

    // Label with background - HQ and Mansions get gold styling
    const isHQBuilding = building.isFloating || building.symbol === "AGENCITY";
    const isMansionLandmark = building.isMansion && building.isPermanent;
    const isGoldLabel = isHQBuilding || isMansionLandmark;

    // Determine label text: HQ shows "$AgenCity", mansions show their landmark name, others show symbol
    const labelText = isHQBuilding
      ? "$AgenCity"
      : isMansionLandmark
        ? building.name
        : building.symbol;
    const labelWidth = isHQBuilding ? 85 : isMansionLandmark ? 95 : 50;

    const labelBg = this.scene.add.rectangle(
      0,
      isGoldLabel ? 20 : 12,
      labelWidth,
      isGoldLabel ? 16 : 14,
      0x000000,
      0.8
    );
    labelBg.setStrokeStyle(isGoldLabel ? 2 : 1, isGoldLabel ? 0xffd700 : 0x4ade80);
    container.add(labelBg);
    const label = this.scene.add.text(0, isGoldLabel ? 20 : 12, labelText, {
      fontFamily: "monospace",
      fontSize: isGoldLabel ? "11px" : "9px",
      color: isGoldLabel ? "#ffd700" : "#4ade80",
    });
    label.setOrigin(0.5, 0.5);
    container.add(label);

    // Platform buildings get an AgenC badge below the label
    if (building.isPlatform) {
      const badge = this.scene.add
        .text(0, (isGoldLabel ? 20 : 12) + 10, "AgenC", {
          fontSize: "8px",
          fontFamily: "monospace",
          color: "#a78bfa",
        })
        .setOrigin(0.5, 0)
        .setDepth(6);
      container.add(badge);
    }

    // Buildings render behind characters (depth 10-11) but in front of ground elements
    // Buildings on the right appear behind buildings on the left when overlapping
    // HQ floats in sky so it's always visible above other buildings
    const buildingDepth = isHQBuilding ? 8 : 5 - building.x / 10000;
    container.setDepth(buildingDepth);
    const hitboxSize = this.scene.isMobile
      ? isHQBuilding
        ? { w: 120, h: 200 }
        : { w: 80, h: 120 }
      : isHQBuilding
        ? { w: 80, h: 160 }
        : { w: 40, h: 80 };
    container.setInteractive(
      new Phaser.Geom.Rectangle(-hitboxSize.w / 2, -hitboxSize.h, hitboxSize.w, hitboxSize.h),
      Phaser.Geom.Rectangle.Contains
    );
    (container as any)._buildingId = building.id;

    container.on("pointerover", () => {
      container?.setScale(1.1);
      this.scene.tooltipSystem.showBuildingTooltip(building, container!);
      this.scene.input.setDefaultCursor("pointer");
    });
    container.on("pointerout", () => {
      container?.setScale(1);
      this.scene.tooltipSystem.hideTooltip();
      this.scene.input.setDefaultCursor("default");
    });
    container.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.scene.wasDragGesture) return;
      // On mobile, skip if player is too far — tap-to-move walks there
      if (this.scene.isMobile && this.scene.playerEnabled && this.scene.localPlayer) {
        const dist = Math.abs(this.scene.localPlayer.x - container.x);
        if (dist > 150) return;
      }

      // If a zone decoration (MoltBook HQ, Agent Hut, Molt Bar, Bounty Board)
      // already handled this click, skip the building handler to avoid
      // opening a BuildingModal on top of the zone's custom modal.
      // Uses timestamp instead of boolean so the flag auto-expires (100ms)
      // and can't persist across separate clicks.
      if (Date.now() - ((this as any)._zoneClickTime || 0) < 100) {
        return;
      }

      // Visual feedback at the exact click point (this path has the pointer)
      this.scene.audioSystem.playBuildingClickBurst(pointer.worldX, pointer.worldY);

      const isPokeCenter = building.id.includes("PokeCenter");
      const isCasino = building.id.includes("Casino") || building.symbol === "CASINO";
      const isArcade = building.id.includes("Arcade") || building.symbol === "ARCADE";
      const isStarterBuilding = building.id.startsWith("Starter");
      const isTreasuryBuilding = building.id.startsWith("Treasury");
      const isAgenCityHQ = building.isFloating || building.symbol === "AGENCITY";
      const isMansionBuilding = building.isMansion;

      if (isMansionBuilding) {
        // Mansion click - show holder info popup (modal handles Solscan link)
        window.dispatchEvent(
          new CustomEvent("agencity-mansion-click", {
            detail: {
              name: building.name,
              holderRank: building.holderRank,
              holderAddress: building.holderAddress,
              holderBalance: building.holderBalance,
            },
          })
        );
      } else if (isPokeCenter) {
        // PokeCenter opens the auto-claim hub modal
        window.dispatchEvent(
          new CustomEvent("agencity-pokecenter-click", {
            detail: { buildingId: building.id, name: building.name },
          })
        );
      } else if (isCasino) {
        // Casino opens the gambling modal with raffle and wheel
        window.dispatchEvent(
          new CustomEvent("agencity-casino-click", {
            detail: { buildingId: building.id, name: building.name },
          })
        );
      } else if (isArcade) {
        // Arcade opens the Metal Bags game modal
        window.dispatchEvent(
          new CustomEvent("agencity-arcade-click", {
            detail: { buildingId: building.id, name: building.name },
          })
        );
      } else if (isAgenCityHQ) {
        // AgenCity HQ - opens the official token page with trade modal
        window.dispatchEvent(
          new CustomEvent("agencity-building-click", {
            detail: {
              mint: building.tokenMint || building.id,
              symbol: building.symbol || "AGENCITY",
              name: building.name || "AgenCity HQ",
              tokenUrl: building.tokenUrl || `https://agencity.app/${building.tokenMint || building.id}`,
              isPlatform: building.isPlatform || false,
              platformTheme: building.platformTheme,
            },
          })
        );
      } else if (building.id.startsWith("agent-building-")) {
        // External agent buildings - open their Moltbook profile or Solscan
        if (building.tokenUrl) {
          window.open(building.tokenUrl, "_blank");
        }
      } else if (isStarterBuilding) {
        // Starter buildings do nothing when clicked - they're placeholders
      } else if (isTreasuryBuilding) {
        // Treasury building opens the Creator Rewards Hub modal
        window.dispatchEvent(
          new CustomEvent("agencity-treasury-click", {
            detail: { buildingId: building.id, name: building.name },
          })
        );
      } else {
        // Regular tokens emit event for React to open trade modal
        window.dispatchEvent(
          new CustomEvent("agencity-building-click", {
            detail: {
              mint: building.tokenMint || building.id,
              symbol: building.symbol || building.name,
              name: building.name,
              tokenUrl: building.tokenUrl,
              isPlatform: building.isPlatform || false,
              platformTheme: building.platformTheme,
            },
          })
        );
      }
    });

    this.scene.buildingSprites.set(building.id, container);
    this.scene.buildingInitialized.add(building.id);

    // Add a bouncing marker above buildings that open AgenCity popups
    const popupZones = ["trending", "labs", "ballers", "founders", "arena"];
    const isInteractive =
      !building.id.startsWith("Starter") && !building.id.startsWith("agent-building-");
    const isPopupZone = popupZones.includes(this.scene.currentZone);
    if (isFirstTimeCreation && isInteractive && isPopupZone) {
      const marker = this.scene.add.text(0, -70, "\u25BC", {
        fontSize: "18px",
        color: "#ef4444",
        fontFamily: "monospace",
      });
      marker.setOrigin(0.5, 1);
      marker.setDepth(100);
      container.add(marker);
      this.scene.tweens.add({
        targets: marker,
        y: -82,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Spawn animation only on first creation
    if (isFirstTimeCreation) {
      container.setScale(0);
      container.setAlpha(0);
      this.scene.tweens.add({
        targets: container,
        scale: 1,
        alpha: 1,
        duration: 600,
        ease: "Back.easeOut",
      });
    }
  }
}
