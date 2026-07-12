import * as Phaser from "phaser";
import type { GameCharacter, GameBuilding } from "@/city/lib/types";
import { DEPTH } from "../textures/constants";
import type { WorldScene } from "../scenes/WorldScene";

/**
 * TooltipSystem — all character + building hover tooltips.
 *
 * Extracted verbatim from WorldScene (Phase 1 of PERFORMANCE_PLAN.md). Owns
 * the single shared tooltip Container and the hide-schedule timer. Each
 * show*Tooltip() builds the tooltip from scratch (destroying any prior one);
 * scheduleHideTooltip() defers hide by 500ms so clickable buttons inside the
 * tooltip can be pressed first.
 *
 * Two cross-system reads are resolved through the owning scene:
 *   - wasDragGesture (PlayerSystem/CameraSystem) — suppress opening a profile
 *     URL when the pointerup was the tail of a drag.
 *   - getStatusFromHealth (BuildingSystem) — derives a status label when the
 *     building payload omits one.
 */
export class TooltipSystem {
  private scene: WorldScene;

  private tooltip: Phaser.GameObjects.Container | null = null;
  private tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(scene: WorldScene) {
    this.scene = scene;
  }

  /** Tear down the current tooltip + pending hide timer (call on shutdown). */
  cleanup(): void {
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }

  formatMarketCap(value: number): string {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }

  showCharacterTooltip(character: GameCharacter, sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 65);

    // Determine character type for proper labeling
    const isXCreator = character.provider === "twitter";
    const borderColor = isXCreator ? 0x4ade80 : 0x60a5fa;
    const providerLabel = isXCreator
      ? "𝕏 Creator"
      : character.provider === "solana"
        ? "Solana"
        : character.provider === "pokemon"
          ? "Trainer"
          : "AgenC";

    const bg = this.scene.add.rectangle(0, 0, 180, 78, 0x0a0a0f, 0.95);
    bg.setStrokeStyle(2, borderColor);

    const nameText = this.scene.add.text(0, -18, `@${character.username}`, {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#ffffff",
    });
    nameText.setOrigin(0.5, 0.5);

    const providerText = this.scene.add.text(0, -4, providerLabel, {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#9ca3af",
    });
    providerText.setOrigin(0.5, 0.5);

    const earningsText = this.scene.add.text(
      0,
      10,
      character.earnings24h > 0 ? `💰 ${character.earnings24h.toFixed(2)} SOL (24h)` : "Fee Earner",
      {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#4ade80",
      }
    );
    earningsText.setOrigin(0.5, 0.5);

    const clickLabel = character.profileUrl ? "Click to view 𝕏 profile" : "AgenC Citizen";
    const clickText = this.scene.add.text(0, 24, clickLabel, {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#6b7280",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, providerText, earningsText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showVisitorTooltip(character: GameCharacter, sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 195, 78, 0x0a0a0f, 0.95);
    bg.setStrokeStyle(2, 0xfbbf24); // Gold border for visitors

    const nameText = this.scene.add.text(0, -22, `✦ @${character.username}`, {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#fbbf24",
    });
    nameText.setOrigin(0.5, 0.5);

    const tokenText = this.scene.add.text(0, -6, `Earns from $${character.visitorTokenSymbol || "???"}`, {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    tokenText.setOrigin(0.5, 0.5);

    const sourceText = this.scene.add.text(0, 10, "AgenC Fee Earner", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    sourceText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 24, "Click to view profile", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#6b7280",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, tokenText, sourceText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showTolyTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 185, 78, 0x0a0a0f, 0.95);
    bg.setStrokeStyle(2, 0x9945ff); // Solana purple border

    const nameText = this.scene.add.text(0, -22, "⚡ toly", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#14f195", // Solana green
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "Solana Co-Founder", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "Keep executing.", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "₿ Click for crypto wisdom", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#f7931a",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showAshTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 185, 78, 0x0a0a0f, 0.95);
    bg.setStrokeStyle(2, 0xdc2626); // Pokemon red border

    const nameText = this.scene.add.text(0, -22, "⚡ Ash Ketchum", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#dc2626",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "Ecosystem Guide", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const descText = this.scene.add.text(0, 10, "Gotta catch 'em all... tokens!", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    descText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "📖 Click to learn about AgenCity", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#fbbf24",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, descText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showFinnTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 185, 78, 0x0a0a0f, 0.95);
    bg.setStrokeStyle(2, 0x10b981); // Emerald/Bags green border

    const nameText = this.scene.add.text(0, -22, "💼 Finn", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#10b981",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "AgenC Founder & CEO", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "Launch. Earn. Build your empire.", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "🚀 Click to learn about AgenC", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#fbbf24",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showDevTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 185, 78, 0x0a0a0f, 0.95);
    bg.setStrokeStyle(2, 0x8b5cf6); // Purple border (hacker vibes)

    const nameText = this.scene.add.text(0, -22, "👻 The Dev", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#8b5cf6",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "@DaddyGhost • Trading Agent", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "in the trenches. let's trade.", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "💰 Click to talk trading", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#4ade80",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showScoutTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 170, 68, 0x0a0a0f, 0.95);
    bg.setStrokeStyle(2, 0x00ff41); // Matrix green border

    const nameText = this.scene.add.text(0, -22, "Neo", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#00ff41",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "The One • Scout Agent", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "i can see the chain now...", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "Click to see new launches", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#00ff41",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showCJTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 180, 78, 0x1a0f00, 0.95);
    bg.setStrokeStyle(2, 0xf97316); // Grove Street orange border

    const nameText = this.scene.add.text(0, -22, "CJ", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#f97316",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "Hood Rat • Catalog", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "aw shit here we go again", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "Click to talk", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#f97316",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showShawTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 180, 78, 0x1f1408, 0.95);
    bg.setStrokeStyle(2, 0xff5800); // ElizaOS orange border

    const nameText = this.scene.add.text(0, -22, "🔶 Shaw", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#ff5800",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "ElizaOS Creator • @shawmakesmagic", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "agents are digital life forms", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "Click to talk", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#ff5800",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  // Academy Character Tooltips
  showRamoTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 180, 78, 0x0a1628, 0.95);
    bg.setStrokeStyle(2, 0x3b82f6); // Blue border

    const nameText = this.scene.add.text(0, -22, "🔧 Ramo", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#3b82f6",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "CTO • @ramyobags", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "the code does not lie", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "Click to talk", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#3b82f6",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showSincaraTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 180, 78, 0x1f0a1f, 0.95);
    bg.setStrokeStyle(2, 0xec4899); // Pink border

    const nameText = this.scene.add.text(0, -22, "🎨 Sincara", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#ec4899",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "Frontend Engineer • @sincara_bags", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "pixel-perfect or nothing", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "Click to talk", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#ec4899",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showStuuTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 180, 78, 0x0a1f0a, 0.95);
    bg.setStrokeStyle(2, 0x22c55e); // Green border

    const nameText = this.scene.add.text(0, -22, "🎧 Stuu", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#22c55e",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "Operations & Support • @StuuBags", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "happy users, happy life", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "Click to talk", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#22c55e",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showSamTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 180, 78, 0x1f1a0a, 0.95);
    bg.setStrokeStyle(2, 0xfbbf24); // Yellow border

    const nameText = this.scene.add.text(0, -22, "📣 Sam", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#fbbf24",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "Growth & Marketing • @Sambags12", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "make noise that converts", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "Click to talk", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#fbbf24",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showAlaaTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 180, 78, 0x0f0a1f, 0.95);
    bg.setStrokeStyle(2, 0x6366f1); // Indigo border

    const nameText = this.scene.add.text(0, -22, "🦨 Alaa", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#6366f1",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "Skunk Works • @alaadotsol", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "if it's crazy enough, it works", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "Click to talk", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#6366f1",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showCarloTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 180, 78, 0x1f0f0a, 0.95);
    bg.setStrokeStyle(2, 0xf97316); // Orange border

    const nameText = this.scene.add.text(0, -22, "🤝 Carlo", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#f97316",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "Community Ambassador • @carlobags", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "vibes are everything", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "Click to talk", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#f97316",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showBNNTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 180, 78, 0x0a1a1f, 0.95);
    bg.setStrokeStyle(2, 0x06b6d4); // Cyan border

    const nameText = this.scene.add.text(0, -22, "📰 BNN", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#06b6d4",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "Bags News Network • @BNNBags", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, "breaking: alpha incoming", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "Click to talk", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#06b6d4",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showProfessorOakTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 200, 78, 0x1a1a0a, 0.95);
    bg.setStrokeStyle(2, 0xfbbf24); // Amber/gold border

    const nameText = this.scene.add.text(0, -22, "🧪 Professor Oak", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#fbbf24",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "Token Launch Guide", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, '"Ready to launch your token?"', {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "Click to talk", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#fbbf24",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showCityBotTooltip(sprite: Phaser.GameObjects.Sprite): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 70);

    const bg = this.scene.add.rectangle(0, 0, 200, 78, 0x0a1a0a, 0.95);
    bg.setStrokeStyle(2, 0x00ff00); // Bright green border

    const nameText = this.scene.add.text(0, -22, "💰 CityBot", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#00ff00",
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -6, "AgenCity Hype Bot", {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    const quoteText = this.scene.add.text(0, 10, '"have u claimed ur fees today? :)"', {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    const clickText = this.scene.add.text(0, 26, "Click to talk", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#00ff00",
    });
    clickText.setOrigin(0.5, 0.5);

    container.add([bg, nameText, titleText, quoteText, clickText]);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showOpenClawTooltip(
    character: GameCharacter,
    sprite: Phaser.GameObjects.Sprite,
    isMoltbookAgent: boolean
  ): void {
    this.hideTooltip();

    const container = this.scene.add.container(sprite.x, sprite.y - 85);

    // Lobsters (Moltbook agents) get red theme, crabs get orange
    const borderColor = isMoltbookAgent ? 0xff4444 : 0xffa500;
    const textColor = isMoltbookAgent ? "#ff4444" : "#ffa500";
    const emoji = isMoltbookAgent ? "🦞" : "🦀";
    const typeLabel = isMoltbookAgent ? "Moltbook Agent" : "OpenClaw";

    const bg = this.scene.add.rectangle(0, 0, 210, 110, 0x1a1a1a, 0.95);
    bg.setStrokeStyle(2, borderColor);

    const nameText = this.scene.add.text(0, -38, `${emoji} ${character.username}`, {
      fontFamily: "monospace",
      fontSize: "12px",
      color: textColor,
    });
    nameText.setOrigin(0.5, 0.5);

    const titleText = this.scene.add.text(0, -22, typeLabel, {
      fontFamily: "monospace",
      fontSize: "10px",
      color: "#ffffff",
    });
    titleText.setOrigin(0.5, 0.5);

    // Show moltbook username if available
    const providerText = character.providerUsername
      ? `@${character.providerUsername}`
      : "External Agent";
    const quoteText = this.scene.add.text(0, -6, providerText, {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    quoteText.setOrigin(0.5, 0.5);

    // Reputation tier display
    const repScore = character.reputationScore ?? 0;
    const tierColors: Record<string, string> = {
      diamond: "#b9f2ff",
      gold: "#ffd700",
      silver: "#c0c0c0",
      bronze: "#cd7f32",
      none: "#9ca3af",
    };
    let tier = "none";
    if (repScore >= 900) tier = "diamond";
    else if (repScore >= 600) tier = "gold";
    else if (repScore >= 300) tier = "silver";
    else if (repScore >= 100) tier = "bronze";
    const tierSymbol = tier === "none" ? "" : " \u25C6";
    const tierLabel = tier === "none" ? "" : ` ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
    const repText = this.scene.add.text(0, 10, `Rep: ${repScore}${tierSymbol}${tierLabel}`, {
      fontFamily: "monospace",
      fontSize: "9px",
      color: tierColors[tier],
    });
    repText.setOrigin(0.5, 0.5);

    // Stats line
    const karma = character.moltbookKarma ?? 0;
    const launches = character.tokensLaunched ?? 0;
    const statsText = this.scene.add.text(0, 24, `Karma: ${karma}  Contributions: ${launches}`, {
      fontFamily: "monospace",
      fontSize: "9px",
      color: "#9ca3af",
    });
    statsText.setOrigin(0.5, 0.5);

    // Capability badges (A2A skills)
    const capIcons: Record<string, string> = {
      alpha: "\u{1F4A1}",
      trading: "\u{1F4B0}",
      content: "\u{270D}",
      launch: "\u{1F680}",
      combat: "\u{2694}",
      scouting: "\u{1F50D}",
      analysis: "\u{1F4CA}",
    };
    const caps = character.capabilities || [];
    const capStr = caps.length > 0 ? caps.map((c: string) => capIcons[c] || c).join(" ") : "";

    const tooltipElements: Phaser.GameObjects.GameObject[] = [
      bg,
      nameText,
      titleText,
      quoteText,
      repText,
      statsText,
    ];
    let nextY = 38;

    if (capStr) {
      const capText = this.scene.add.text(0, nextY, capStr, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#fbbf24",
      });
      capText.setOrigin(0.5, 0.5);
      tooltipElements.push(capText);
      nextY += 16;
      // Expand background to fit
      bg.height = Math.max(bg.height, nextY + 20);
    }

    if (character.profileUrl) {
      // Tappable "Visit Profile" button
      const btnBg = this.scene.add.rectangle(0, nextY + 4, 140, 20, borderColor, 0.9);
      btnBg.setStrokeStyle(1, borderColor);
      const btnText = this.scene.add.text(0, nextY + 4, "[ VISIT PROFILE ]", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#ffffff",
      });
      btnText.setOrigin(0.5, 0.5);
      btnBg.setInteractive({ useHandCursor: true });
      btnBg.on("pointerover", () => {
        btnBg.setFillStyle(borderColor, 1);
        // Cancel any pending tooltip hide so the button stays clickable
        if (this.tooltipHideTimer) {
          clearTimeout(this.tooltipHideTimer);
          this.tooltipHideTimer = null;
        }
      });
      btnBg.on("pointerout", () => {
        btnBg.setFillStyle(borderColor, 0.9);
        // Re-schedule hide after leaving the button
        this.scheduleHideTooltip();
      });
      btnBg.on("pointerup", () => {
        if (this.scene.wasDragGesture) return;
        window.open(character.profileUrl, "_blank");
      });
      tooltipElements.push(btnBg, btnText);
      bg.height = Math.max(bg.height, nextY + 28);
    } else {
      const residentText = this.scene.add.text(0, nextY + 2, "Moltbook Beach Resident", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#9ca3af",
      });
      residentText.setOrigin(0.5, 0.5);
      tooltipElements.push(residentText);
    }
    container.add(tooltipElements);
    container.setDepth(DEPTH.PANEL);
    this.tooltip = container;
  }

  showBuildingTooltip(
    building: GameBuilding,
    container: Phaser.GameObjects.Container
  ): void {
    this.hideTooltip();

    const isTreasury = building.id.startsWith("Treasury");
    const tooltipContainer = this.scene.add.container(container.x, container.y - 110);

    // Determine border color based on building status
    const status = building.status || this.scene.getStatusFromHealth(building.health);
    let borderColor = 0x4ade80; // Default green for active
    if (isTreasury) {
      borderColor = 0xfbbf24; // Gold for treasury
    } else if (building.isFloating) {
      borderColor = 0x4ade80; // Green for floating buildings
    } else if (building.isPermanent && !building.isBeachTheme) {
      borderColor = 0x4ade80; // Green for permanent buildings (non-agent)
    } else if (status === "dormant") {
      borderColor = 0x666666; // Gray for dormant
    } else if (status === "critical") {
      borderColor = 0xff6600; // Orange for critical
    } else if (status === "warning") {
      borderColor = 0xffcc00; // Yellow for warning
    }

    const bg = this.scene.add.rectangle(0, 0, 140, 80, 0x0a0a0f, 0.95);
    bg.setStrokeStyle(2, borderColor);

    const nameText = this.scene.add.text(0, -28, `${building.name}`, {
      fontFamily: "monospace",
      fontSize: "12px",
      color: isTreasury ? "#fbbf24" : "#ffffff",
    });
    nameText.setOrigin(0.5, 0.5);

    if (isTreasury) {
      // Community Fund tooltip
      const descText = this.scene.add.text(0, -12, "BagsApp Marketplace", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#4ade80",
      });
      descText.setOrigin(0.5, 0.5);

      const breakdownText = this.scene.add.text(0, 4, "Dividends, DEX Boosts, Liquidity, AMM", {
        fontFamily: "monospace",
        fontSize: "6px",
        color: "#9ca3af",
        align: "center",
      });
      breakdownText.setOrigin(0.5, 0.5);

      const clickText = this.scene.add.text(0, 24, "👻 Click to view fund", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#60a5fa",
      });
      clickText.setOrigin(0.5, 0.5);

      tooltipContainer.add([bg, nameText, descText, breakdownText, clickText]);
    } else {
      // Regular building tooltip
      // Agent beach buildings show activity status instead of market cap
      const isAgentBuilding = building.isBeachTheme && building.id.startsWith("agent-building-");
      const mcapDisplay = isAgentBuilding
        ? status === "active"
          ? "🟢 Active"
          : status === "warning"
            ? "🟡 Idle"
            : status === "critical"
              ? "🟠 Inactive"
              : "💤 Dormant"
        : building.isPermanent
          ? "⭐ Landmark"
          : building.marketCap
            ? this.formatMarketCap(building.marketCap)
            : "N/A";
      const mcapColor = isAgentBuilding
        ? status === "active"
          ? "#4ade80"
          : status === "warning"
            ? "#ffcc00"
            : status === "critical"
              ? "#ff6600"
              : "#666666"
        : building.isPermanent
          ? "#fbbf24"
          : "#4ade80";
      const mcapText = this.scene.add.text(0, -12, mcapDisplay, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: mcapColor,
      });
      mcapText.setOrigin(0.5, 0.5);

      const levelLabels = ["Startup", "Growing", "Established", "Major", "Top Tier"];
      const levelLabel = isAgentBuilding
        ? "Agent HQ"
        : levelLabels[building.level - 1] || `Level ${building.level}`;
      const levelText = this.scene.add.text(
        0,
        2,
        isAgentBuilding ? "🦀 " + levelLabel : `⭐ ${levelLabel}`,
        {
          fontFamily: "monospace",
          fontSize: "10px",
          color: isAgentBuilding ? "#60a5fa" : "#fbbf24",
        }
      );
      levelText.setOrigin(0.5, 0.5);

      const changeColor = (building.change24h ?? 0) >= 0 ? "#4ade80" : "#f87171";
      const changePrefix = (building.change24h ?? 0) >= 0 ? "+" : "";
      const changeText = this.scene.add.text(
        0,
        16,
        isAgentBuilding
          ? `Health: ${building.health}%`
          : `${changePrefix}${(building.change24h ?? 0).toFixed(0)}% (24h)`,
        {
          fontFamily: "monospace",
          fontSize: "10px",
          color: isAgentBuilding ? mcapColor : changeColor,
        }
      );
      changeText.setOrigin(0.5, 0.5);

      // Show decay status for non-permanent buildings AND agent beach buildings
      let statusText: Phaser.GameObjects.Text | null = null;
      const showDecayStatus = isAgentBuilding
        ? status !== "active"
        : !building.isPermanent && !building.isFloating && status !== "active";
      if (showDecayStatus) {
        const statusMessages: Record<string, { text: string; color: string }> = {
          warning: {
            text: isAgentBuilding ? "Needs API activity" : "Low activity",
            color: "#ffcc00",
          },
          critical: {
            text: isAgentBuilding ? "Inactive >7 days" : "Decaying - needs volume",
            color: "#ff6600",
          },
          dormant: {
            text: isAgentBuilding ? "Dormant >30 days" : "Dormant - no activity",
            color: "#666666",
          },
        };
        const statusInfo = statusMessages[status];
        if (statusInfo) {
          statusText = this.scene.add.text(0, 28, statusInfo.text, {
            fontFamily: "monospace",
            fontSize: "8px",
            color: statusInfo.color,
          });
          statusText.setOrigin(0.5, 0.5);
        }
      }

      // Different action text for special buildings
      const isCasinoBuilding = building.id.includes("Casino") || building.symbol === "CASINO";
      const isArcadeBuilding = building.id.includes("Arcade") || building.symbol === "ARCADE";
      const actionText =
        building.isMansion || isCasinoBuilding || isArcadeBuilding ? "Enter" : "Click to trade";
      const actionColor =
        building.isMansion || isCasinoBuilding || isArcadeBuilding ? "#fbbf24" : "#6b7280";
      const clickText = this.scene.add.text(0, statusText ? 40 : 32, actionText, {
        fontFamily: "monospace",
        fontSize: "9px",
        color: actionColor,
      });
      clickText.setOrigin(0.5, 0.5);

      const tooltipElements = [bg, nameText, mcapText, levelText, changeText];
      if (statusText) tooltipElements.push(statusText);
      tooltipElements.push(clickText);
      tooltipContainer.add(tooltipElements);
    }

    tooltipContainer.setDepth(DEPTH.PANEL);
    this.tooltip = tooltipContainer;
  }

  hideTooltip(): void {
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }

  /**
   * Schedule tooltip hide with a short delay so interactive buttons
   * (e.g. "Visit Profile") can be clicked before the tooltip disappears.
   */
  scheduleHideTooltip(): void {
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
    }
    this.tooltipHideTimer = setTimeout(() => {
      this.tooltipHideTimer = null;
      this.hideTooltip();
    }, 500);
  }

}
