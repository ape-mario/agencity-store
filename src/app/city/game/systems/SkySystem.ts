import * as Phaser from "phaser";
import type { WorldState } from "@/city/lib/types";
import { SCALE } from "../textures/constants";
import type { WorldScene } from "../scenes/WorldScene";

const GAME_WIDTH = 1280;

/**
 * SkySystem — sky gradient, stars, treeline, distant skyline, time-of-day
 * palette + overlay, celestial bodies (sun/moon), and weather effects.
 *
 * Extracted from WorldScene (Phase 1 of PERFORMANCE_PLAN.md).
 *
 * State ownership split (the sky is the most zone-coupled subsystem):
 *   - Internal state (this class): skyTimeState, overlay, sunSprite, sunRays,
 *     currentTimeInfo, moonSprite, starsContainer, weatherEmitter,
 *     lightningTimer, apocalypseTimer, and the skyline tint layers
 *     (haze/windows/glow/flicker).
 *   - Scene-owned state (read here via this.scene): the actual graphics
 *     objects that zone setup files create, toggle, and reposition —
 *     skyGradient, stars, skyClouds, treeline, distantSkylineGfx, the
 *     zone-specific sky overrides (ballers/academy/ascension), clouds,
 *     currentZone, worldState, ambientParticles. These stay public on
 *     WorldScene so the 8 zone files keep compiling unchanged.
 *
 * Cross-system calls: showFireflies/hideFireflies delegate to the scene
 * (they own the firefly emitter, which moves to DecorationSystem in Phase 2).
 */
export class SkySystem {
  private scene: WorldScene;

  // Internal sky state (not accessed by zones).
  private timeOfDay = 0;
  private skyTimeState: "day" | "night" | "dusk" | "dawn" = "night";
  private overlay!: Phaser.GameObjects.Rectangle;
  private sunSprite: Phaser.GameObjects.Sprite | null = null;
  private sunRays: Phaser.GameObjects.Graphics | null = null;
  private moonSprite: Phaser.GameObjects.Sprite | null = null;
  private starsContainer: Phaser.GameObjects.Container | null = null;
  private currentTimeInfo: { isNight: boolean; isDusk: boolean; isDawn: boolean } | null = null;
  private weatherEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private lightningTimer: Phaser.Time.TimerEvent | null = null;
  private apocalypseTimer: Phaser.Time.TimerEvent | null = null;
  private skylineHazeLayer: Phaser.GameObjects.Graphics | null = null;
  private skylineWindowsLayer: Phaser.GameObjects.Graphics | null = null;
  private skylineGlowLayer: Phaser.GameObjects.Graphics | null = null;
  private skylineFlickerRects: Phaser.GameObjects.Rectangle[] = [];

  constructor(scene: WorldScene, overlay: Phaser.GameObjects.Rectangle) {
    this.scene = scene;
    this.overlay = overlay;
  }

  /** Tear down weather timers + emitters (call on shutdown). */
  cleanup(): void {
    if (this.weatherEmitter) {
      this.weatherEmitter.stop();
      this.weatherEmitter.destroy();
      this.weatherEmitter = null;
    }
    if (this.lightningTimer) {
      this.lightningTimer.destroy();
      this.lightningTimer = null;
    }
    if (this.apocalypseTimer) {
      this.apocalypseTimer.destroy();
      this.apocalypseTimer = null;
    }
  }

  createSky(): void {
    this.scene.skyGradient = this.scene.add.graphics();
    this.scene.skyGradient.setDepth(-2);

    // Start with night sky (will be updated by timeInfo)
    this.drawSkyGradient("night");

    // Add distant city skyline silhouette
    this.createDistantSkyline();

    // Initialize skyline to night mode (matches drawSkyGradient("night") above)
    this.updateSkylineForTime("night");

    // Add pixel-correct stars (rectangles instead of circles)
    this.scene.stars = [];
    const starCount = Math.round(50 * SCALE);
    for (let i = 0; i < starCount; i++) {
      const roll = Math.random();
      // Pixel sizes: 1x1 (55%), 2x1 (17%), 1x2 (17%), 2x2 (11%)
      let sw: number, sh: number;
      if (roll < 0.55) {
        sw = 1;
        sh = 1;
      } else if (roll < 0.72) {
        sw = 2;
        sh = 1;
      } else if (roll < 0.89) {
        sw = 1;
        sh = 2;
      } else {
        sw = 2;
        sh = 2;
      }

      // Color variation: 80% white, 12% warm, 8% cool
      const colorRoll = Math.random();
      let color = 0xffffff;
      if (colorRoll > 0.92)
        color = 0xddddff; // cool tint
      else if (colorRoll > 0.8) color = 0xffeedd; // warm tint

      const star = this.scene.add.rectangle(
        Math.random() * GAME_WIDTH,
        Math.random() * Math.round(300 * SCALE),
        Math.round(sw * SCALE),
        Math.round(sh * SCALE),
        color,
        Math.random() * 0.5 + 0.3
      );
      star.setDepth(-1);
      this.scene.stars.push(star);

      // Twinkle animation
      this.scene.tweens.add({
        targets: star,
        alpha: 0.1,
        duration: 1000 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Add drifting sky clouds
    this.createSkyClouds();

    // Draw treeline horizon
    this.drawTreeline();
  }

  drawSkyGradient(timeState: "day" | "night" | "dusk" | "dawn"): void {
    if (!this.scene.skyGradient) return;
    this.scene.skyGradient.clear();
    this.skyTimeState = timeState;

    const skyH = Math.round(430 * SCALE);
    const bandCount = 24;
    const bandH = Math.ceil(skyH / bandCount);

    // Color palettes per time state
    const palettes: Record<string, { pos: number; color: number }[]> = {
      day: [
        { pos: 0.0, color: 0x1560bd }, // deep blue zenith
        { pos: 0.2, color: 0x1e7ad8 },
        { pos: 0.4, color: 0x1e90ff }, // dodger blue
        { pos: 0.6, color: 0x5dade2 },
        { pos: 0.8, color: 0x87ceeb }, // sky blue
        { pos: 1.0, color: 0xb8dff0 }, // pale horizon
      ],
      night: [
        { pos: 0.0, color: 0x050810 }, // deep black
        { pos: 0.15, color: 0x080e20 },
        { pos: 0.35, color: 0x0b1424 }, // dark navy
        { pos: 0.55, color: 0x10182a },
        { pos: 0.75, color: 0x141e30 }, // dark slate
        { pos: 0.9, color: 0x182438 },
        { pos: 1.0, color: 0x1c2a40 }, // muted horizon
      ],
      dusk: [
        { pos: 0.0, color: 0x1a0a3e }, // deep purple
        { pos: 0.15, color: 0x2d1066 },
        { pos: 0.3, color: 0x5b2180 }, // violet
        { pos: 0.45, color: 0x8b3a62 }, // magenta transition
        { pos: 0.6, color: 0xc75030 }, // orange
        { pos: 0.75, color: 0xe87840 },
        { pos: 0.9, color: 0xf5a060 }, // peach
        { pos: 1.0, color: 0xfcc89b }, // peach horizon
      ],
      dawn: [
        { pos: 0.0, color: 0x0e1a3a }, // pre-dawn blue
        { pos: 0.2, color: 0x1a2855 },
        { pos: 0.35, color: 0x2a3a6a }, // transition blue
        { pos: 0.5, color: 0x5a4a60 }, // purple-blue transition
        { pos: 0.65, color: 0xb87030 }, // gold
        { pos: 0.8, color: 0xe8a050 },
        { pos: 0.9, color: 0xf5c080 }, // peach
        { pos: 1.0, color: 0xfde0b0 }, // peach horizon
      ],
    };

    const stops = palettes[timeState];

    const lerpColor = (c1: number, c2: number, t: number): number => {
      const r1 = (c1 >> 16) & 0xff,
        g1 = (c1 >> 8) & 0xff,
        b1 = c1 & 0xff;
      const r2 = (c2 >> 16) & 0xff,
        g2 = (c2 >> 8) & 0xff,
        b2 = c2 & 0xff;
      return (
        (Math.round(r1 + (r2 - r1) * t) << 16) |
        (Math.round(g1 + (g2 - g1) * t) << 8) |
        Math.round(b1 + (b2 - b1) * t)
      );
    };

    const getColor = (pos: number): number => {
      for (let i = 0; i < stops.length - 1; i++) {
        if (pos >= stops[i].pos && pos <= stops[i + 1].pos) {
          const t = (pos - stops[i].pos) / (stops[i + 1].pos - stops[i].pos);
          return lerpColor(stops[i].color, stops[i + 1].color, t);
        }
      }
      return stops[stops.length - 1].color;
    };

    for (let i = 0; i < bandCount; i++) {
      const pos = i / bandCount;
      const color = getColor(pos);
      this.scene.skyGradient.fillStyle(color, 1);
      this.scene.skyGradient.fillRect(0, i * bandH, GAME_WIDTH, bandH + 1);

      // Pixel-art dithering between bands
      if (i > 1 && i < bandCount - 1) {
        const nextColor = getColor((i + 1) / bandCount);
        const ditherColor = lerpColor(color, nextColor, 0.5);
        this.scene.skyGradient.fillStyle(ditherColor, 0.25);
        for (let dx = 0; dx < GAME_WIDTH; dx += 6) {
          if ((dx + i) % 3 === 0) {
            this.scene.skyGradient.fillRect(dx, i * bandH + bandH - 2, 2, 2);
          }
        }
      }
    }
  }

  updateSkyForTime(timeInfo: { isNight: boolean; isDusk: boolean; isDawn: boolean }): void {
    // Don't update sky if we're in Ballers Valley (always golden hour there)
    if (this.scene.currentZone === "ballers") {
      return;
    }

    // Map booleans to 4-state time
    let timeState: "day" | "night" | "dusk" | "dawn";
    if (timeInfo.isNight) timeState = "night";
    else if (timeInfo.isDusk) timeState = "dusk";
    else if (timeInfo.isDawn) timeState = "dawn";
    else timeState = "day";

    // Update sky gradient
    this.drawSkyGradient(timeState);

    // Graduated star alpha per time state — re-add twinkle after transition
    const starAlphaMap: Record<string, number> = { night: 0.6, dusk: 0.35, dawn: 0.15, day: 0 };
    const targetAlpha = starAlphaMap[timeState];
    this.scene.stars.forEach((star) => {
      this.scene.tweens.killTweensOf(star);
      this.scene.tweens.add({
        targets: star,
        alpha: targetAlpha,
        duration: 2000,
        ease: "Sine.easeInOut",
        onComplete: () => {
          if (targetAlpha > 0) {
            // Restore twinkle animation (killed by the transition tween above)
            this.scene.tweens.add({
              targets: star,
              alpha: targetAlpha * 0.2,
              duration: 1000 + Math.random() * 2000,
              yoyo: true,
              repeat: -1,
              ease: "Sine.easeInOut",
            });
          }
        },
      });
    });

    // Update sky cloud tinting
    const cloudTints: Record<string, { color: number; alpha: number }> = {
      day: { color: 0xffffff, alpha: 0.15 },
      dusk: { color: 0xffaa66, alpha: 0.18 },
      dawn: { color: 0xffd700, alpha: 0.16 },
      night: { color: 0xffffff, alpha: 0 },
    };
    const ct = cloudTints[timeState];
    this.scene.skyClouds.forEach((cloud) => {
      cloud.setFillStyle(ct.color, ct.alpha);
    });

    // Update ground transition
    this.drawGroundTransition(timeState);

    // Update skyline brightness for time of day
    this.updateSkylineForTime(timeState);
  }

  /**
   * Adjust distant skyline elements based on time of day.
   * During day/dawn: haze hidden, windows dimmed.
   * During night/dusk: haze hidden, windows bright.
   */
  updateSkylineForTime(timeState: "day" | "night" | "dusk" | "dawn"): void {
    // Haze: only visible during day (creates atmospheric depth)
    // Hidden at night/dusk/dawn to prevent warm glow bleeding through
    const hazeAlpha: Record<string, number> = {
      day: 1,
      dawn: 0.4,
      dusk: 0.2,
      night: 0,
    };
    if (this.skylineHazeLayer) {
      this.scene.tweens.killTweensOf(this.skylineHazeLayer);
      this.scene.tweens.add({
        targets: this.skylineHazeLayer,
        alpha: hazeAlpha[timeState],
        duration: 2000,
        ease: "Sine.easeInOut",
      });
    }

    // Window lights: brighter at night (building lights on), dimmer during day
    const windowAlpha: Record<string, number> = {
      day: 0.15,
      dawn: 0.4,
      dusk: 0.7,
      night: 0.6,
    };
    if (this.skylineWindowsLayer) {
      this.scene.tweens.killTweensOf(this.skylineWindowsLayer);
      this.scene.tweens.add({
        targets: this.skylineWindowsLayer,
        alpha: windowAlpha[timeState],
        duration: 2000,
        ease: "Sine.easeInOut",
      });
    }

    // Window glow: only visible at night/dusk
    const glowAlpha: Record<string, number> = {
      day: 0,
      dawn: 0.2,
      dusk: 0.6,
      night: 0.5,
    };
    if (this.skylineGlowLayer) {
      this.scene.tweens.killTweensOf(this.skylineGlowLayer);
      this.scene.tweens.add({
        targets: this.skylineGlowLayer,
        alpha: glowAlpha[timeState],
        duration: 2000,
        ease: "Sine.easeInOut",
      });
    }

    // Flicker rects: match window visibility
    const flickerAlpha = windowAlpha[timeState];
    this.skylineFlickerRects.forEach((rect) => {
      this.scene.tweens.killTweensOf(rect);
      this.scene.tweens.add({
        targets: rect,
        alpha: timeState === "day" ? 0 : flickerAlpha * (rect.alpha > 0 ? 1 : 0.5),
        duration: 2000,
        ease: "Sine.easeInOut",
      });
    });
  }

  createSkyClouds(): void {
    this.scene.skyClouds = [];
    const cloudData = [
      { x: 120, y: 160, w: 200, h: 16 },
      { x: 380, y: 200, w: 160, h: 12 },
      { x: 600, y: 140, w: 220, h: 18 },
      { x: 850, y: 190, w: 180, h: 14 },
      { x: 1050, y: 170, w: 150, h: 10 },
    ];

    cloudData.forEach((cd) => {
      const cloud = this.scene.add.ellipse(cd.x, cd.y, cd.w, cd.h, 0xffffff, 0.12 + Math.random() * 0.08);
      cloud.setDepth(-1.5);
      this.scene.skyClouds.push(cloud);

      this.scene.tweens.add({
        targets: cloud,
        x: cloud.x + 25 + Math.random() * 20,
        duration: 15000 + Math.random() * 10000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.random() * 5000,
      });
    });
  }

  drawTreeline(): void {
    if (!this.scene.treeline) {
      this.scene.treeline = this.scene.add.graphics();
      this.scene.treeline.setDepth(-0.3);
    }
    this.scene.treeline.clear();

    const baseY = Math.round(440 * SCALE);
    const treeColors = [0x0a2a18, 0x0e3520];
    let cx = 0;

    while (cx < GAME_WIDTH) {
      const w = Math.round((6 + Math.random() * 8) * SCALE);
      const h = Math.round((8 + Math.random() * 10) * SCALE);
      const color = treeColors[Math.floor(Math.random() * treeColors.length)];

      // Draw triangular crown as stacked narrowing rectangles (pixel-art style)
      this.scene.treeline.fillStyle(color);
      const layers = Math.max(3, Math.round(h / (2 * SCALE)));
      for (let row = 0; row < layers; row++) {
        const t = row / layers;
        const rowW = Math.round(w * (1 - t * 0.7));
        const rowX = cx + Math.round((w - rowW) / 2);
        const rowY = baseY - h + Math.round(row * (h / layers));
        this.scene.treeline.fillRect(rowX, rowY, rowW, Math.ceil(h / layers) + 1);
      }

      // Short trunk
      const trunkW = Math.round(2 * SCALE);
      this.scene.treeline.fillStyle(0x061a0e);
      this.scene.treeline.fillRect(
        cx + Math.round((w - trunkW) / 2),
        baseY,
        trunkW,
        Math.round(4 * SCALE)
      );

      cx += w + Math.round(Math.random() * 3 * SCALE);
    }
  }

  drawGroundTransition(timeState: "day" | "night" | "dusk" | "dawn"): void {
    if (!this.scene.groundTransition) return;
    this.scene.groundTransition.clear();

    const topY = Math.round(430 * SCALE);
    const bandH = Math.round(30 * SCALE);
    const bands = 8;
    const perBand = Math.ceil(bandH / bands);

    // Sky-side color per time state (blends into grass green at bottom)
    const skyColors: Record<string, number> = {
      day: 0xb8dff0, // pale blue horizon
      night: 0x1c2a40, // muted dark horizon (matches night palette bottom)
      dusk: 0xfcc89b, // peach
      dawn: 0xfde0b0, // warm peach
    };
    const grassColor = 0x1a472a; // matches grass base
    const skyC = skyColors[timeState];

    const lerpC = (c1: number, c2: number, t: number): number => {
      const r1 = (c1 >> 16) & 0xff,
        g1 = (c1 >> 8) & 0xff,
        b1 = c1 & 0xff;
      const r2 = (c2 >> 16) & 0xff,
        g2 = (c2 >> 8) & 0xff,
        b2 = c2 & 0xff;
      return (
        (Math.round(r1 + (r2 - r1) * t) << 16) |
        (Math.round(g1 + (g2 - g1) * t) << 8) |
        Math.round(b1 + (b2 - b1) * t)
      );
    };

    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const color = lerpC(skyC, grassColor, t);
      const alpha = 0.15 + t * 0.25; // fades in toward grass
      this.scene.groundTransition.fillStyle(color, alpha);
      this.scene.groundTransition.fillRect(0, topY + i * perBand, GAME_WIDTH, perBand + 1);
    }
  }

  /**
   * Draw the golden hour (sunset) sky for Ballers Valley
   * Creates a warm orange-to-peach gradient that gives the VIP zone
   * an exclusive, luxurious feel - always sunset, never changes
   */
  drawBallersGoldenSky(): void {
    // Create the golden sky graphics object if it doesn't exist
    if (!this.scene.ballersGoldenSky) {
      this.scene.ballersGoldenSky = this.scene.add.graphics();
      this.scene.ballersGoldenSky.setDepth(-2); // Same depth as main sky
      this.scene.ballersElements.push(this.scene.ballersGoldenSky);
    }

    this.scene.ballersGoldenSky.clear();

    // Golden hour sunset gradient - warm orange top to soft peach bottom
    // Top colors (warm orange)
    const topLeft = 0xf97316; // Tailwind orange-500
    const topRight = 0xfb923c; // Tailwind orange-400
    // Bottom colors (soft peach/gold)
    const bottomLeft = 0xfed7aa; // Tailwind orange-200
    const bottomRight = 0xfcd34d; // Tailwind amber-300

    this.scene.ballersGoldenSky.fillGradientStyle(
      topLeft,
      topRight,
      bottomLeft,
      bottomRight,
      1 // Full opacity
    );
    this.scene.ballersGoldenSky.fillRect(0, 0, GAME_WIDTH, Math.round(430 * SCALE));
    this.scene.ballersGoldenSky.setVisible(true);

    // Hide the main sky gradient when showing golden sky
    if (this.scene.skyGradient) {
      this.scene.skyGradient.setVisible(false);
    }

    // Dim stars in golden hour (sunset still has some stars starting to show)
    this.scene.stars.forEach((star) => {
      this.scene.tweens.add({
        targets: star,
        alpha: 0.15, // Very faint stars
        duration: 500,
        ease: "Sine.easeInOut",
      });
    });
  }

  /**
   * Restore the normal sky when leaving Ballers Valley
   * Shows the main sky gradient and updates it based on current time
   */
  restoreNormalSky(): void {
    // Hide the golden sky
    if (this.scene.ballersGoldenSky) {
      this.scene.ballersGoldenSky.setVisible(false);
    }

    // Hide the academy twilight sky
    if (this.scene.academyTwilightSky) {
      this.scene.academyTwilightSky.setVisible(false);
    }
    if (this.scene.academyMoon) {
      this.scene.academyMoon.setVisible(false);
    }
    this.scene.academyStars.forEach((star) => star.setVisible(false));

    // Hide the ascension celestial sky
    if (this.scene.ascensionCelestialSky) {
      this.scene.ascensionCelestialSky.setVisible(false);
    }
    this.scene.ascensionSkyElements.forEach((el) => (el as any).setVisible(false));

    // Show the main sky gradient
    if (this.scene.skyGradient) {
      this.scene.skyGradient.setVisible(true);
    }

    // Restore stars (may have been hidden by ascension zone)
    this.scene.stars.forEach((star) => star.setVisible(true));

    // Restore distant skyline (may have been hidden by ascension zone)
    this.scene.distantSkylineGfx.forEach((g) => g.setVisible(true));

    // Restore sky clouds
    this.scene.skyClouds.forEach((c) => c.setVisible(true));

    // Restore treeline
    if (this.scene.treeline) this.scene.treeline.setVisible(true);
  }

  /**
   * Draw the magical twilight sky for Academy zone
   * Creates a mystical purple-to-indigo gradient that gives the Academy
   * a Hogwarts-like magical atmosphere - always twilight, with bright stars and moon
   */
  drawAcademyTwilightSky(): void {
    // Create the twilight sky graphics object if it doesn't exist
    if (!this.scene.academyTwilightSky) {
      this.scene.academyTwilightSky = this.scene.add.graphics();
      this.scene.academyTwilightSky.setDepth(-2);
      this.scene.academyElements.push(this.scene.academyTwilightSky);
    }

    this.scene.academyTwilightSky.clear();

    // Magical twilight gradient - deep purple top to mystical indigo bottom
    // Top colors (deep space purple)
    const topLeft = 0x1e1b4b; // Very dark indigo
    const topRight = 0x312e81; // Deep indigo
    // Bottom colors (twilight purple-blue)
    const bottomLeft = 0x4c1d95; // Violet-purple
    const bottomRight = 0x5b21b6; // Rich purple

    this.scene.academyTwilightSky.fillGradientStyle(topLeft, topRight, bottomLeft, bottomRight, 1);
    this.scene.academyTwilightSky.fillRect(0, 0, GAME_WIDTH, Math.round(430 * SCALE));
    this.scene.academyTwilightSky.setVisible(true);

    // Hide the main sky gradient when showing twilight sky
    if (this.scene.skyGradient) {
      this.scene.skyGradient.setVisible(false);
    }
    if (this.scene.ballersGoldenSky) {
      this.scene.ballersGoldenSky.setVisible(false);
    }

    // Create crescent moon if it doesn't exist
    if (!this.scene.academyMoon) {
      const moonX = GAME_WIDTH - Math.round(120 * SCALE);
      const moonY = Math.round(80 * SCALE);
      const moonRadius = Math.round(35 * SCALE);

      // Main moon glow (outer)
      const moonGlow = this.scene.add.circle(
        moonX,
        moonY,
        moonRadius + Math.round(15 * SCALE),
        0xfef3c7,
        0.15
      );
      moonGlow.setDepth(-1.9);
      this.scene.academyElements.push(moonGlow);

      // Moon body
      this.scene.academyMoon = this.scene.add.circle(moonX, moonY, moonRadius, 0xfef9c3); // Pale yellow
      this.scene.academyMoon.setDepth(-1.8);
      this.scene.academyElements.push(this.scene.academyMoon);

      // Crescent shadow (to make it look like crescent moon)
      const crescentShadow = this.scene.add.circle(
        moonX + Math.round(12 * SCALE),
        moonY - Math.round(5 * SCALE),
        moonRadius - Math.round(5 * SCALE),
        0x1e1b4b // Same as sky top color
      );
      crescentShadow.setDepth(-1.7);
      this.scene.academyElements.push(crescentShadow);

      // Subtle moon surface details
      const crater1 = this.scene.add.circle(
        moonX - Math.round(8 * SCALE),
        moonY + Math.round(5 * SCALE),
        Math.round(4 * SCALE),
        0xfde68a,
        0.3
      );
      crater1.setDepth(-1.75);
      this.scene.academyElements.push(crater1);

      const crater2 = this.scene.add.circle(
        moonX - Math.round(12 * SCALE),
        moonY - Math.round(8 * SCALE),
        Math.round(3 * SCALE),
        0xfde68a,
        0.25
      );
      crater2.setDepth(-1.75);
      this.scene.academyElements.push(crater2);

      // Add gentle pulsing glow animation to moon
      this.scene.tweens.add({
        targets: moonGlow,
        alpha: 0.25,
        duration: 3000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    this.scene.academyMoon.setVisible(true);

    // Create extra bright stars for Academy if they don't exist
    if (this.scene.academyStars.length === 0) {
      // Bright constellation stars
      const starPositions = [
        { x: 100, y: 50, size: 3, alpha: 0.9 },
        { x: 180, y: 120, size: 2.5, alpha: 0.85 },
        { x: 250, y: 70, size: 2, alpha: 0.8 },
        { x: 320, y: 150, size: 2.5, alpha: 0.85 },
        { x: 400, y: 60, size: 3, alpha: 0.9 },
        { x: 480, y: 130, size: 2, alpha: 0.8 },
        { x: 550, y: 80, size: 2.5, alpha: 0.85 },
        { x: 620, y: 140, size: 2, alpha: 0.8 },
        { x: 700, y: 55, size: 3, alpha: 0.9 },
        { x: 760, y: 110, size: 2.5, alpha: 0.85 },
        { x: 150, y: 180, size: 2, alpha: 0.75 },
        { x: 350, y: 200, size: 2, alpha: 0.75 },
        { x: 580, y: 190, size: 2, alpha: 0.75 },
        { x: 220, y: 30, size: 2.5, alpha: 0.85 },
        { x: 450, y: 25, size: 2, alpha: 0.8 },
        { x: 680, y: 35, size: 2.5, alpha: 0.85 },
      ];

      starPositions.forEach((pos) => {
        const star = this.scene.add.circle(
          Math.round(pos.x * SCALE),
          Math.round(pos.y * SCALE),
          Math.round(pos.size * SCALE),
          0xffffff,
          pos.alpha
        );
        star.setDepth(-1.5);
        this.scene.academyStars.push(star);
        this.scene.academyElements.push(star);

        // Add twinkling animation with varying speeds
        this.scene.tweens.add({
          targets: star,
          alpha: pos.alpha * 0.4,
          duration: 800 + Math.random() * 1500,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      });

      // Add some smaller background stars
      for (let i = 0; i < 40; i++) {
        const star = this.scene.add.circle(
          Math.random() * GAME_WIDTH,
          Math.random() * Math.round(250 * SCALE),
          Math.round((0.8 + Math.random() * 1.2) * SCALE),
          0xc4b5fd, // Soft purple-white stars
          0.4 + Math.random() * 0.3
        );
        star.setDepth(-1.6);
        this.scene.academyStars.push(star);
        this.scene.academyElements.push(star);

        this.scene.tweens.add({
          targets: star,
          alpha: 0.2,
          duration: 1000 + Math.random() * 2000,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    }

    // Show all academy stars
    this.scene.academyStars.forEach((star) => star.setVisible(true));

    // Dim main stars in twilight
    this.scene.stars.forEach((star) => {
      this.scene.tweens.add({
        targets: star,
        alpha: 0.1,
        duration: 500,
        ease: "Sine.easeInOut",
      });
    });
  }



  updateDayNightFromEST(timeInfo: {
    isNight: boolean;
    isDusk: boolean;
    isDawn: boolean;
  }): void {
    const wasNight = this.currentTimeInfo?.isNight;
    this.currentTimeInfo = timeInfo;
    let alpha = 0;
    let tint = 0x000000;

    if (timeInfo.isNight) {
      // Night (8 PM to 6 AM EST) - deep blue overlay
      alpha = 0.45;
      tint = 0x0a0a2e;
      // Show fireflies at night (created once, then toggled)
      this.scene.decorationSystem.showFireflies();
      // Hide ambient particles at night
      if (this.scene.ambientParticles) {
        this.scene.ambientParticles.stop();
        this.scene.ambientParticles.setVisible(false);
      }
    } else if (timeInfo.isDusk) {
      // Dusk (6 PM to 8 PM EST) - warm orange/purple
      alpha = 0.25;
      tint = 0x4a2a3e;
      // Start showing some fireflies at dusk
      this.scene.decorationSystem.showFireflies();
    } else if (timeInfo.isDawn) {
      // Dawn (6 AM to 8 AM EST) - soft golden
      alpha = 0.2;
      tint = 0x3a2a1e;
      // Hide fireflies at dawn
      this.scene.decorationSystem.hideFireflies();
      if (this.scene.ambientParticles) {
        this.scene.ambientParticles.start();
        this.scene.ambientParticles.setVisible(true);
      }
    } else {
      // Daytime - hide fireflies, show ambient particles
      if (wasNight || this.currentTimeInfo === null) {
        this.scene.decorationSystem.hideFireflies();
        if (this.scene.ambientParticles) {
          this.scene.ambientParticles.start();
          this.scene.ambientParticles.setVisible(true);
        }
      }
    }

    // Set the fill style first, then animate alpha
    if (alpha > 0) {
      this.overlay.setFillStyle(tint, 1); // Set full color, alpha controlled by tween
    }

    // Smoothly transition the overlay alpha
    this.scene.tweens.add({
      targets: this.overlay,
      alpha,
      duration: 3000,
      ease: "Sine.easeInOut",
    });

    // Update sun/moon based on time - IMPORTANT: do this AFTER setting currentTimeInfo
    this.updateCelestialBody(timeInfo);

    // Update sky color and stars based on time
    this.updateSkyForTime(timeInfo);

    // If it's night and we have a sun, remove it immediately
    if (timeInfo.isNight && this.sunSprite) {
      this.sunSprite.destroy();
      this.sunSprite = null;
    }
  }


  updateCelestialBody(timeInfo: {
    isNight: boolean;
    isDusk: boolean;
    isDawn: boolean;
  }): void {
    // Remove existing sun if it's nighttime
    if (timeInfo.isNight && this.sunSprite) {
      this.scene.tweens.add({
        targets: this.sunSprite,
        alpha: 0,
        y: 150,
        duration: 2000,
        onComplete: () => {
          this.sunSprite?.destroy();
          this.sunSprite = null;
        },
      });
    }

    // Show moon at night
    if (timeInfo.isNight && !this.moonSprite) {
      this.moonSprite = this.scene.add.sprite(650, 80, "moon");
      this.moonSprite.setScale(1.5);
      this.moonSprite.setAlpha(0);
      this.moonSprite.setDepth(0);

      this.scene.tweens.add({
        targets: this.moonSprite,
        alpha: 0.9,
        duration: 2000,
      });

      // Gentle moon glow
      this.scene.tweens.add({
        targets: this.moonSprite,
        scale: 1.6,
        duration: 4000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Hide moon during day
    if (!timeInfo.isNight && this.moonSprite) {
      this.scene.tweens.add({
        targets: this.moonSprite,
        alpha: 0,
        duration: 2000,
        onComplete: () => {
          this.moonSprite?.destroy();
          this.moonSprite = null;
        },
      });
    }

    // Show sun during daytime (not night, not dusk)
    if (!timeInfo.isNight && !timeInfo.isDusk && !this.sunSprite) {
      this.sunSprite = this.scene.add.sprite(150, 80, "sun");
      this.sunSprite.setScale(2);
      this.sunSprite.setAlpha(0);
      this.sunSprite.setDepth(0);
      this.sunSprite.setTint(0xffdd44);

      // Fade in the sun
      this.scene.tweens.add({
        targets: this.sunSprite,
        alpha: 0.9,
        y: 60,
        duration: 2000,
      });

      // Gentle sun pulse
      this.scene.tweens.add({
        targets: this.sunSprite,
        scale: 2.1,
        duration: 3000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Hide sun at dusk (transition period)
    if (timeInfo.isDusk && this.sunSprite) {
      this.scene.tweens.add({
        targets: this.sunSprite,
        alpha: 0.4,
        y: 120,
        duration: 2000,
      });
    }
  }

  updateWeather(weather: WorldState["weather"]): void {
    // Clear existing weather effects
    if (this.weatherEmitter) {
      this.weatherEmitter.stop();
      this.weatherEmitter.destroy();
      this.weatherEmitter = null;
    }

    if (this.sunSprite) {
      this.sunSprite.destroy();
      this.sunSprite = null;
    }
    if (this.sunRays) {
      this.scene.tweens.killTweensOf(this.sunRays);
      this.sunRays.destroy();
      this.sunRays = null;
    }

    // Clean up weather-specific timers to prevent accumulation
    if (this.lightningTimer) {
      this.lightningTimer.destroy();
      this.lightningTimer = null;
    }
    if (this.apocalypseTimer) {
      this.apocalypseTimer.destroy();
      this.apocalypseTimer = null;
    }

    // Reset camera background color (apocalypse sets it to dark red)
    this.scene.cameras.main.setBackgroundColor(0x000000);

    // Update cloud appearance
    this.scene.clouds.forEach((cloud) => {
      let tint = 0xffffff;
      let alpha = 0.5;

      switch (weather) {
        case "sunny":
          tint = 0xffffff;
          alpha = 0.3;
          break;
        case "cloudy":
          tint = 0xaaaaaa;
          alpha = 0.7;
          break;
        case "rain":
          tint = 0x666666;
          alpha = 0.85;
          break;
        case "storm":
          tint = 0x444444;
          alpha = 0.95;
          break;
        case "apocalypse":
          tint = 0x442222;
          alpha = 1;
          break;
      }

      this.scene.tweens.add({
        targets: cloud,
        alpha,
        duration: 1000,
      });
      cloud.setTint(tint);
    });

    // Weather-specific effects
    switch (weather) {
      case "sunny":
        this.createSunnyEffect();
        break;
      case "rain":
        this.createRainEffect(false);
        break;
      case "storm":
        this.createRainEffect(true);
        this.createLightningEffect();
        break;
      case "apocalypse":
        this.createApocalypseEffect();
        break;
    }
  }

  createSunnyEffect(): void {
    // Only show sun during daytime - check multiple conditions
    if (this.currentTimeInfo?.isNight || this.currentTimeInfo?.isDusk) {
      // At night or dusk, don't show sun - moon will be shown instead
      return;
    }

    // Also destroy any existing sun to prevent duplicates
    if (this.sunSprite) {
      this.sunSprite.destroy();
      this.sunSprite = null;
    }

    this.sunSprite = this.scene.add.sprite(700, 70, "sun");
    this.sunSprite.setScale(2.5);
    this.sunSprite.setAlpha(0.9);
    this.sunSprite.setDepth(0);

    this.scene.tweens.add({
      targets: this.sunSprite,
      scale: 2.7,
      alpha: 0.7,
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Sun rays
    this.sunRays = this.scene.add.graphics();
    this.sunRays.setDepth(-1);
    this.sunRays.fillStyle(0xfbbf24, 0.1);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      this.sunRays.fillTriangle(
        700,
        70,
        700 + Math.cos(angle) * 150,
        70 + Math.sin(angle) * 150,
        700 + Math.cos(angle + 0.3) * 150,
        70 + Math.sin(angle + 0.3) * 150
      );
    }

    this.scene.tweens.add({
      targets: this.sunRays,
      alpha: 0.5,
      angle: 360,
      duration: 30000,
      repeat: -1,
    });
  }

  createRainEffect(isStorm: boolean): void {
    this.weatherEmitter = this.scene.add.particles(0, 0, "rain", {
      x: { min: 0, max: GAME_WIDTH },
      y: Math.round(-10 * SCALE),
      lifespan: 800,
      speedY: { min: Math.round(300 * SCALE), max: Math.round(500 * SCALE) },
      speedX: isStorm
        ? { min: Math.round(-100 * SCALE), max: Math.round(-150 * SCALE) }
        : { min: Math.round(-20 * SCALE), max: Math.round(20 * SCALE) },
      scale: { start: SCALE, end: 0.6 * SCALE },
      quantity: isStorm ? 15 : 8,
      frequency: 30,
      alpha: { start: 0.8, end: 0.3 },
    });
    this.weatherEmitter.setDepth(50);
  }

  createLightningEffect(): void {
    // Use a single looping timer instead of recursive chain to prevent accumulation
    // Random delay between strikes is achieved via the base delay + random skip logic
    this.lightningTimer = this.scene.time.addEvent({
      delay: 2000,
      callback: () => {
        if (this.scene.worldState?.weather !== "storm") return;
        // Random chance each tick to create variation (avg ~4s between strikes)
        if (Math.random() > 0.4) return;

        // Flash
        this.scene.cameras.main.flash(100, 255, 255, 255, true);

        // Lightning bolt (scaled)
        const x = Math.round(100 * SCALE) + Math.random() * Math.round(600 * SCALE);
        const lightning = this.scene.add.sprite(x, Math.round(100 * SCALE), "lightning");
        lightning.setScale(2 * SCALE);
        lightning.setDepth(60);

        this.scene.tweens.add({
          targets: lightning,
          alpha: 0,
          duration: 200,
          onComplete: () => lightning.destroy(),
        });
      },
      loop: true,
    });
  }

  createApocalypseEffect(): void {
    this.scene.cameras.main.setBackgroundColor(0x1a0505);
    this.overlay.setFillStyle(0xff0000, 0.15);

    // Shake periodically — stored so updateWeather can clean it up
    this.apocalypseTimer = this.scene.time.addEvent({
      delay: 2000,
      callback: () => {
        if (this.scene.worldState?.weather === "apocalypse") {
          this.scene.cameras.main.shake(500, 0.005);
        }
      },
      loop: true,
    });

    // Falling embers (scaled)
    this.weatherEmitter = this.scene.add.particles(0, 0, "coin", {
      x: { min: 0, max: GAME_WIDTH },
      y: Math.round(-10 * SCALE),
      lifespan: 3000,
      speedY: { min: Math.round(50 * SCALE), max: Math.round(100 * SCALE) },
      speedX: { min: Math.round(-30 * SCALE), max: Math.round(30 * SCALE) },
      scale: { start: 0.3 * SCALE, end: 0 },
      quantity: 2,
      frequency: 200,
      tint: 0xff4444,
      alpha: { start: 0.8, end: 0 },
    });
    this.weatherEmitter.setDepth(50);
  }


  createDistantSkyline(): void {
    const groundLevel = Math.round(440 * SCALE);

    // === LAYER 1: Atmospheric haze/glow at horizon ===
    const hazeLayer = this.scene.add.graphics();
    hazeLayer.setDepth(-2.5);
    this.scene.distantSkylineGfx.push(hazeLayer);
    this.skylineHazeLayer = hazeLayer;

    // Gradient haze from horizon upward (gives depth)
    // Starts hidden — updateSkylineForTime() sets correct alpha based on time
    for (let i = 0; i < 8; i++) {
      const alpha = 0.15 - i * 0.015;
      const y = groundLevel - Math.round(i * 12 * SCALE);
      hazeLayer.fillStyle(0x87ceeb, Math.max(0, alpha)); // Sky blue haze
      hazeLayer.fillRect(0, y, GAME_WIDTH, Math.round(15 * SCALE));
    }
    hazeLayer.setAlpha(0); // Hidden until updateSkylineForTime is called

    // === LAYER 2: Far distant buildings (very faded, smaller) ===
    const farSkyline = this.scene.add.graphics();
    farSkyline.setDepth(-2);
    this.scene.distantSkylineGfx.push(farSkyline);
    farSkyline.fillStyle(0x2d3748, 0.25); // Very faded

    const drawFarBuilding = (x: number, topY: number, width: number) => {
      farSkyline.fillRect(x, topY, width, groundLevel - topY);
    };

    // Scattered far buildings (smaller, behind main skyline)
    drawFarBuilding(Math.round(30 * SCALE), Math.round(395 * SCALE), Math.round(12 * SCALE));
    drawFarBuilding(Math.round(100 * SCALE), Math.round(385 * SCALE), Math.round(15 * SCALE));
    drawFarBuilding(Math.round(180 * SCALE), Math.round(375 * SCALE), Math.round(14 * SCALE));
    drawFarBuilding(Math.round(280 * SCALE), Math.round(365 * SCALE), Math.round(18 * SCALE));
    drawFarBuilding(Math.round(380 * SCALE), Math.round(355 * SCALE), Math.round(20 * SCALE));
    drawFarBuilding(Math.round(480 * SCALE), Math.round(370 * SCALE), Math.round(16 * SCALE));
    drawFarBuilding(Math.round(580 * SCALE), Math.round(380 * SCALE), Math.round(14 * SCALE));
    drawFarBuilding(Math.round(680 * SCALE), Math.round(375 * SCALE), Math.round(15 * SCALE));
    drawFarBuilding(Math.round(760 * SCALE), Math.round(390 * SCALE), Math.round(12 * SCALE));

    // === LAYER 3: Main skyline buildings (medium opacity) ===
    const mainSkyline = this.scene.add.graphics();
    mainSkyline.setDepth(-1.8);
    this.scene.distantSkylineGfx.push(mainSkyline);

    const drawBuilding = (
      g: Phaser.GameObjects.Graphics,
      x: number,
      topY: number,
      width: number,
      color: number,
      alpha: number
    ) => {
      g.fillStyle(color, alpha);
      g.fillRect(x, topY, width, groundLevel - topY);
    };

    // Left cluster
    drawBuilding(
      mainSkyline,
      Math.round(15 * SCALE),
      Math.round(380 * SCALE),
      Math.round(18 * SCALE),
      0x1e293b,
      0.45
    );
    drawBuilding(
      mainSkyline,
      Math.round(38 * SCALE),
      Math.round(360 * SCALE),
      Math.round(22 * SCALE),
      0x1a2535,
      0.5
    );
    drawBuilding(
      mainSkyline,
      Math.round(65 * SCALE),
      Math.round(375 * SCALE),
      Math.round(16 * SCALE),
      0x1e293b,
      0.45
    );
    drawBuilding(
      mainSkyline,
      Math.round(88 * SCALE),
      Math.round(355 * SCALE),
      Math.round(20 * SCALE),
      0x1a2535,
      0.5
    );
    drawBuilding(
      mainSkyline,
      Math.round(115 * SCALE),
      Math.round(370 * SCALE),
      Math.round(18 * SCALE),
      0x1e293b,
      0.45
    );

    // Center-left cluster
    drawBuilding(
      mainSkyline,
      Math.round(165 * SCALE),
      Math.round(350 * SCALE),
      Math.round(20 * SCALE),
      0x1a2535,
      0.5
    );
    drawBuilding(
      mainSkyline,
      Math.round(192 * SCALE),
      Math.round(330 * SCALE),
      Math.round(28 * SCALE),
      0x0f172a,
      0.55
    );
    drawBuilding(
      mainSkyline,
      Math.round(228 * SCALE),
      Math.round(355 * SCALE),
      Math.round(18 * SCALE),
      0x1e293b,
      0.45
    );
    drawBuilding(
      mainSkyline,
      Math.round(253 * SCALE),
      Math.round(340 * SCALE),
      Math.round(24 * SCALE),
      0x1a2535,
      0.5
    );

    // Center cluster (tallest - most prominent)
    drawBuilding(
      mainSkyline,
      Math.round(320 * SCALE),
      Math.round(310 * SCALE),
      Math.round(26 * SCALE),
      0x0f172a,
      0.6
    );
    drawBuilding(
      mainSkyline,
      Math.round(355 * SCALE),
      Math.round(280 * SCALE),
      Math.round(35 * SCALE),
      0x0f172a,
      0.65
    ); // Tallest
    drawBuilding(
      mainSkyline,
      Math.round(400 * SCALE),
      Math.round(295 * SCALE),
      Math.round(30 * SCALE),
      0x0f172a,
      0.6
    );
    drawBuilding(
      mainSkyline,
      Math.round(440 * SCALE),
      Math.round(320 * SCALE),
      Math.round(22 * SCALE),
      0x1a2535,
      0.55
    );
    drawBuilding(
      mainSkyline,
      Math.round(470 * SCALE),
      Math.round(345 * SCALE),
      Math.round(18 * SCALE),
      0x1e293b,
      0.5
    );

    // Center-right cluster
    drawBuilding(
      mainSkyline,
      Math.round(525 * SCALE),
      Math.round(355 * SCALE),
      Math.round(20 * SCALE),
      0x1e293b,
      0.45
    );
    drawBuilding(
      mainSkyline,
      Math.round(555 * SCALE),
      Math.round(335 * SCALE),
      Math.round(26 * SCALE),
      0x1a2535,
      0.5
    );
    drawBuilding(
      mainSkyline,
      Math.round(590 * SCALE),
      Math.round(360 * SCALE),
      Math.round(18 * SCALE),
      0x1e293b,
      0.45
    );

    // Right cluster
    drawBuilding(
      mainSkyline,
      Math.round(645 * SCALE),
      Math.round(350 * SCALE),
      Math.round(20 * SCALE),
      0x1a2535,
      0.5
    );
    drawBuilding(
      mainSkyline,
      Math.round(675 * SCALE),
      Math.round(330 * SCALE),
      Math.round(28 * SCALE),
      0x0f172a,
      0.55
    );
    drawBuilding(
      mainSkyline,
      Math.round(712 * SCALE),
      Math.round(355 * SCALE),
      Math.round(22 * SCALE),
      0x1e293b,
      0.45
    );
    drawBuilding(
      mainSkyline,
      Math.round(742 * SCALE),
      Math.round(340 * SCALE),
      Math.round(24 * SCALE),
      0x1a2535,
      0.5
    );
    drawBuilding(
      mainSkyline,
      Math.round(775 * SCALE),
      Math.round(365 * SCALE),
      Math.round(20 * SCALE),
      0x1e293b,
      0.45
    );

    // === LAYER 4: Building details (spires, antennas, rooftop features) ===
    const detailsLayer = this.scene.add.graphics();
    detailsLayer.setDepth(-1.7);
    this.scene.distantSkylineGfx.push(detailsLayer);
    detailsLayer.fillStyle(0x0f172a, 0.6);

    // Spire on tallest building
    detailsLayer.fillRect(
      Math.round(370 * SCALE),
      Math.round(260 * SCALE),
      Math.round(5 * SCALE),
      Math.round(20 * SCALE)
    );
    // Antenna details
    detailsLayer.fillRect(
      Math.round(205 * SCALE),
      Math.round(318 * SCALE),
      Math.round(2 * SCALE),
      Math.round(12 * SCALE)
    );
    detailsLayer.fillRect(
      Math.round(412 * SCALE),
      Math.round(283 * SCALE),
      Math.round(2 * SCALE),
      Math.round(12 * SCALE)
    );
    detailsLayer.fillRect(
      Math.round(688 * SCALE),
      Math.round(318 * SCALE),
      Math.round(2 * SCALE),
      Math.round(12 * SCALE)
    );
    // Rooftop boxes (AC units, etc.)
    detailsLayer.fillRect(
      Math.round(360 * SCALE),
      Math.round(278 * SCALE),
      Math.round(8 * SCALE),
      Math.round(4 * SCALE)
    );
    detailsLayer.fillRect(
      Math.round(378 * SCALE),
      Math.round(278 * SCALE),
      Math.round(6 * SCALE),
      Math.round(4 * SCALE)
    );

    // === LAYER 5: Window lights (varied brightness, more of them) ===
    const windowsLayer = this.scene.add.graphics();
    windowsLayer.setDepth(-1.6);
    this.scene.distantSkylineGfx.push(windowsLayer);
    this.skylineWindowsLayer = windowsLayer;

    // Window definitions: x, y, brightness (0.15-0.4)
    const windows = [
      // Tall center building - lots of windows
      { x: 362, y: 290, b: 0.35 },
      { x: 370, y: 290, b: 0.25 },
      { x: 378, y: 290, b: 0.3 },
      { x: 362, y: 310, b: 0.2 },
      { x: 370, y: 310, b: 0.4 },
      { x: 378, y: 310, b: 0.15 },
      { x: 362, y: 330, b: 0.3 },
      { x: 370, y: 330, b: 0.2 },
      { x: 378, y: 330, b: 0.35 },
      { x: 362, y: 350, b: 0.25 },
      { x: 370, y: 350, b: 0.3 },
      { x: 378, y: 350, b: 0.2 },
      { x: 362, y: 370, b: 0.15 },
      { x: 370, y: 370, b: 0.25 },
      { x: 378, y: 370, b: 0.4 },
      { x: 362, y: 390, b: 0.3 },
      { x: 370, y: 390, b: 0.2 },
      // Second tall building
      { x: 405, y: 305, b: 0.25 },
      { x: 415, y: 305, b: 0.35 },
      { x: 405, y: 325, b: 0.4 },
      { x: 415, y: 325, b: 0.2 },
      { x: 405, y: 345, b: 0.15 },
      { x: 415, y: 345, b: 0.3 },
      { x: 405, y: 365, b: 0.25 },
      // Left buildings
      { x: 45, y: 370, b: 0.2 },
      { x: 45, y: 390, b: 0.3 },
      { x: 95, y: 365, b: 0.35 },
      { x: 95, y: 385, b: 0.2 },
      { x: 198, y: 340, b: 0.3 },
      { x: 206, y: 340, b: 0.2 },
      { x: 198, y: 360, b: 0.25 },
      { x: 206, y: 360, b: 0.4 },
      { x: 198, y: 380, b: 0.15 },
      // Right buildings
      { x: 560, y: 345, b: 0.3 },
      { x: 568, y: 345, b: 0.2 },
      { x: 560, y: 365, b: 0.25 },
      { x: 568, y: 365, b: 0.35 },
      { x: 682, y: 340, b: 0.4 },
      { x: 690, y: 340, b: 0.2 },
      { x: 682, y: 360, b: 0.15 },
      { x: 690, y: 360, b: 0.3 },
      { x: 682, y: 380, b: 0.25 },
      { x: 690, y: 380, b: 0.35 },
      { x: 750, y: 350, b: 0.3 },
      { x: 750, y: 370, b: 0.2 },
    ];

    windows.forEach((w) => {
      windowsLayer.fillStyle(0xffeaa7, w.b); // Warm yellow light
      windowsLayer.fillRect(
        Math.round(w.x * SCALE),
        Math.round(w.y * SCALE),
        Math.round(4 * SCALE),
        Math.round(5 * SCALE)
      );
    });

    // === LAYER 6: Subtle glow beneath some windows ===
    const glowLayer = this.scene.add.graphics();
    glowLayer.setDepth(-1.65);
    this.scene.distantSkylineGfx.push(glowLayer);
    this.skylineGlowLayer = glowLayer;

    // Add small glow spots beneath brightest windows
    const brightWindows = windows.filter((w) => w.b >= 0.35);
    brightWindows.forEach((w) => {
      glowLayer.fillStyle(0xffeaa7, 0.08);
      glowLayer.fillCircle(
        Math.round((w.x + 2) * SCALE),
        Math.round((w.y + 8) * SCALE),
        Math.round(6 * SCALE)
      );
    });

    // === LAYER 7: Animated window flicker overlays ===
    const flickerWindows = brightWindows.slice(0, 10);
    const flickerRects: Phaser.GameObjects.Rectangle[] = [];
    flickerWindows.forEach((w) => {
      const rect = this.scene.add.rectangle(
        Math.round((w.x + 2) * SCALE),
        Math.round((w.y + 2.5) * SCALE),
        Math.round(4 * SCALE),
        Math.round(5 * SCALE),
        0xffeaa7,
        w.b
      );
      rect.setDepth(-1.55);
      flickerRects.push(rect);
      this.scene.distantSkylineGfx.push(rect);
    });
    this.skylineFlickerRects = flickerRects;

    // Timer: every 3.5s randomly flicker 2-3 windows
    this.scene.time.addEvent({
      delay: 3500,
      loop: true,
      callback: () => {
        const count = 2 + Math.floor(Math.random() * 2); // 2-3 windows
        for (let i = 0; i < count; i++) {
          const idx = Math.floor(Math.random() * flickerRects.length);
          const rect = flickerRects[idx];
          if (!rect || !(rect as Phaser.GameObjects.Rectangle).active) continue;
          const baseAlpha = flickerWindows[idx].b;
          this.scene.tweens.add({
            targets: rect,
            alpha: baseAlpha * (0.3 + Math.random() * 0.9),
            duration: 400 + Math.random() * 600,
            yoyo: true,
            ease: "Sine.easeInOut",
          });
        }
      },
    });
  }

}
