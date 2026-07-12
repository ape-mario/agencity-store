import * as Phaser from "phaser";
import type { WorldState } from "@/city/lib/types";
import { SCALE, DEPTH } from "../textures/constants";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 960;

/**
 * EventEffectSystem — celebrations, coin rain, star bursts, fireworks,
 * hearts, confetti, UFO flyby, announcement banner, and the bot-effect
 * dispatcher.
 *
 * Extracted verbatim from WorldScene (Phase 1 of PERFORMANCE_PLAN.md). All
 * effects are one-shot: particles/tweens are created on demand and
 * self-destroy via delayedCall. The system owns the announcement banner
 * (text + background) state across re-shows.
 *
 * handleBotAnimal / handleBotPokemon intentionally remain on the scene for
 * now — they dispatch into animal/pokemon methods that move to
 * DecorationSystem in Phase 2.
 */
export class EventEffectSystem {
  private scene: Phaser.Scene;

  private announcementText: Phaser.GameObjects.Text | null = null;
  private announcementBg: Phaser.GameObjects.Rectangle | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Destroy any open announcement banner (call on shutdown). */
  cleanup(): void {
    if (this.announcementText) {
      this.announcementText.destroy();
      this.announcementText = null;
    }
    if (this.announcementBg) {
      this.announcementBg.destroy();
      this.announcementBg = null;
    }
  }

  triggerEvent(event: WorldState["events"][0]): void {
    switch (event.type) {
      case "token_launch":
        this.playCelebration(GAME_WIDTH / 2, Math.round(350 * SCALE));
        break;
      case "fee_claim":
        this.playCoinsRain();
        break;
      case "price_pump":
        this.scene.cameras.main.flash(400, 74, 222, 128, true);
        this.playStarBurst();
        break;
      case "price_dump":
        this.scene.cameras.main.shake(400, 0.008);
        break;
      case "milestone":
        this.playCelebration(GAME_WIDTH / 2, Math.round(350 * SCALE));
        this.scene.cameras.main.flash(400, 251, 191, 36, true);
        break;
    }
  }

  playCelebration(x: number, y: number): void {
    // Coins (scaled)
    const coins = this.scene.add.particles(x, y, "coin", {
      speed: { min: Math.round(150 * SCALE), max: Math.round(250 * SCALE) },
      angle: { min: 220, max: 320 },
      lifespan: 1500,
      quantity: 25,
      scale: { start: 1.2 * SCALE, end: 0 },
      gravityY: Math.round(300 * SCALE),
      rotate: { min: 0, max: 360 },
    });

    // Stars (scaled)
    const stars = this.scene.add.particles(x, y, "star", {
      speed: { min: Math.round(100 * SCALE), max: Math.round(200 * SCALE) },
      angle: { min: 0, max: 360 },
      lifespan: 1200,
      quantity: 15,
      scale: { start: 0.8 * SCALE, end: 0 },
      alpha: { start: 1, end: 0 },
    });

    this.scene.time.delayedCall(1500, () => {
      coins.destroy();
      stars.destroy();
    });
  }

  playCoinsRain(): void {
    // Full screen coin rain effect
    const particles = this.scene.add.particles(GAME_WIDTH / 2, 0, "coin", {
      x: { min: 0, max: GAME_WIDTH },
      y: Math.round(-20 * SCALE),
      lifespan: 3000,
      speedY: { min: Math.round(150 * SCALE), max: Math.round(300 * SCALE) },
      speedX: { min: Math.round(-50 * SCALE), max: Math.round(50 * SCALE) },
      scale: { start: SCALE * 1.2, end: 0.5 * SCALE },
      quantity: 100,
      frequency: -1,
      rotate: { min: 0, max: 360 },
    });

    particles.setDepth(DEPTH.UI_LOW);
    particles.explode(100);

    this.scene.time.delayedCall(3000, () => {
      particles.destroy();
    });
  }

  playStarBurst(): void {
    const particles = this.scene.add.particles(GAME_WIDTH / 2, Math.round(300 * SCALE), "star", {
      speed: { min: Math.round(200 * SCALE), max: Math.round(400 * SCALE) },
      angle: { min: 0, max: 360 },
      lifespan: 1000,
      quantity: 20,
      scale: { start: SCALE, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0x4ade80, 0xfbbf24, 0x60a5fa],
    });

    particles.explode(20);

    this.scene.time.delayedCall(1000, () => {
      particles.destroy();
    });
  }

  handleBotEffect(event: CustomEvent): void {
    const { effectType, x = GAME_WIDTH / 2, y = Math.round(300 * SCALE) } = event.detail || {};

    switch (effectType) {
      case "fireworks":
        this.playFireworks(x, y);
        break;
      case "celebration":
        this.playCelebration(x, y);
        break;
      case "coins":
        this.playCoinsRain();
        break;
      case "hearts":
        this.playHeartsEffect(x, y);
        break;
      case "confetti":
        this.playConfetti();
        break;
      case "stars":
        this.playStarBurst();
        break;
      case "ufo":
        this.playUFO();
        break;
      default:
        break;
    }
  }

  playFireworks(x: number = GAME_WIDTH / 2, y: number = Math.round(200 * SCALE)): void {
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff];

    // Launch multiple firework bursts (scaled)
    for (let i = 0; i < 5; i++) {
      this.scene.time.delayedCall(i * 300, () => {
        const burstX = x + (Math.random() - 0.5) * Math.round(400 * SCALE);
        const burstY = y + (Math.random() - 0.5) * Math.round(100 * SCALE);
        const color = colors[Math.floor(Math.random() * colors.length)];

        // Flash effect
        this.scene.cameras.main.flash(50, 255, 255, 255, true);

        // Firework burst (scaled)
        const burst = this.scene.add.particles(burstX, burstY, "star", {
          speed: { min: Math.round(100 * SCALE), max: Math.round(200 * SCALE) },
          angle: { min: 0, max: 360 },
          lifespan: 1200,
          quantity: 30,
          scale: { start: 0.8 * SCALE, end: 0 },
          alpha: { start: 1, end: 0 },
          tint: color,
          gravityY: Math.round(100 * SCALE),
          blendMode: Phaser.BlendModes.ADD,
        });

        burst.explode(30);

        // Sparkle trail (scaled)
        const trail = this.scene.add.particles(burstX, burstY, "coin", {
          speed: { min: Math.round(50 * SCALE), max: Math.round(150 * SCALE) },
          angle: { min: 0, max: 360 },
          lifespan: 800,
          quantity: 15,
          scale: { start: 0.4 * SCALE, end: 0 },
          alpha: { start: 0.8, end: 0 },
          tint: color,
        });

        trail.explode(15);

        this.scene.time.delayedCall(1500, () => {
          burst.destroy();
          trail.destroy();
        });
      });
    }
  }

  // Hearts floating effect (scaled)
  playHeartsEffect(x: number = GAME_WIDTH / 2, y: number = Math.round(300 * SCALE)): void {
    // Create hearts using star particles with pink tint (scaled)
    const hearts = this.scene.add.particles(x, y, "star", {
      speed: { min: Math.round(30 * SCALE), max: Math.round(80 * SCALE) },
      angle: { min: 220, max: 320 },
      lifespan: 2000,
      quantity: 20,
      scale: { start: 0.8 * SCALE, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xff69b4, 0xff1493, 0xff6b6b, 0xffb6c1],
      gravityY: Math.round(-30 * SCALE), // Float upward
    });

    hearts.explode(20);

    // Screen tint
    this.scene.cameras.main.flash(200, 255, 182, 193, true);

    this.scene.time.delayedCall(2500, () => {
      hearts.destroy();
    });
  }

  // Confetti effect - colorful particles falling from top (scaled)
  playConfetti(): void {
    const confetti = this.scene.add.particles(GAME_WIDTH / 2, Math.round(-20 * SCALE), "star", {
      x: { min: 0, max: GAME_WIDTH },
      y: Math.round(-20 * SCALE),
      lifespan: 4000,
      speedY: { min: Math.round(100 * SCALE), max: Math.round(200 * SCALE) },
      speedX: { min: Math.round(-80 * SCALE), max: Math.round(80 * SCALE) },
      scale: { start: 0.8 * SCALE, end: 0.3 * SCALE },
      alpha: { start: 1, end: 0.5 },
      tint: [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffa500, 0x4ade80],
      rotate: { min: 0, max: 360 },
      quantity: 8,
      frequency: 30,
      gravityY: Math.round(50 * SCALE),
    });

    confetti.setDepth(DEPTH.UI_LOW);

    // Stop after 4 seconds
    this.scene.time.delayedCall(4000, () => {
      confetti.stop();
    });

    // Destroy after particles fade
    this.scene.time.delayedCall(8000, () => {
      confetti.destroy();
    });
  }

  // UFO flyby effect - alien saucer flies across screen with beam
  playUFO(): void {
    // Create UFO sprite using graphics
    const ufoG = this.scene.make.graphics({ x: 0, y: 0 });
    const ufoSize = Math.round(60 * SCALE);

    // Draw UFO saucer
    ufoG.fillStyle(0x888888);
    ufoG.fillEllipse(ufoSize / 2, ufoSize / 2 + 5, ufoSize, ufoSize / 3); // Body
    ufoG.fillStyle(0x4ade80);
    ufoG.fillEllipse(ufoSize / 2, ufoSize / 2, ufoSize / 2, ufoSize / 4); // Dome
    ufoG.fillStyle(0x00ff00);
    ufoG.fillCircle(ufoSize / 2, ufoSize / 2, 5); // Light

    // Lights on bottom
    ufoG.fillStyle(0xff0000);
    ufoG.fillCircle(ufoSize / 4, ufoSize / 2 + 8, 3);
    ufoG.fillStyle(0xffff00);
    ufoG.fillCircle(ufoSize / 2, ufoSize / 2 + 10, 3);
    ufoG.fillStyle(0x0000ff);
    ufoG.fillCircle((ufoSize * 3) / 4, ufoSize / 2 + 8, 3);

    ufoG.generateTexture("ufo_temp", ufoSize, ufoSize);
    ufoG.destroy();

    // Create UFO sprite starting off-screen left
    const ufo = this.scene.add.sprite(-100, Math.round(100 * SCALE), "ufo_temp");
    ufo.setDepth(150);

    // Create beam effect
    const beam = this.scene.add.graphics();
    beam.setDepth(149);

    // Animate UFO across screen with wobble
    this.scene.tweens.add({
      targets: ufo,
      x: GAME_WIDTH + 100,
      y: {
        value: Math.round(150 * SCALE),
        duration: 4000,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: 1,
      },
      duration: 8000,
      ease: "Linear",
      onUpdate: () => {
        // Update beam position
        beam.clear();
        if (ufo.x > 100 && ufo.x < GAME_WIDTH - 100) {
          beam.fillStyle(0x00ff00, 0.3);
          beam.fillTriangle(ufo.x - 15, ufo.y + 20, ufo.x + 15, ufo.y + 20, ufo.x, GAME_HEIGHT);
        }
        // Rotate UFO slightly
        ufo.angle = Math.sin(Date.now() / 200) * 5;
      },
      onComplete: () => {
        ufo.destroy();
        beam.destroy();
        this.scene.textures.remove("ufo_temp");
      },
    });

    // Add abduction particles
    const abductionParticles = this.scene.add.particles(GAME_WIDTH / 2, GAME_HEIGHT - 100, "star", {
      speed: { min: 50, max: 150 },
      angle: { min: 260, max: 280 },
      lifespan: 2000,
      scale: { start: 0.5, end: 0 },
      tint: 0x00ff00,
      alpha: { start: 0.8, end: 0 },
      quantity: 2,
      frequency: 100,
    });
    abductionParticles.setDepth(148);

    // Update particle position to follow UFO
    const particleUpdate = this.scene.time.addEvent({
      delay: 50,
      callback: () => {
        if (ufo.x > 0 && ufo.x < GAME_WIDTH) {
          abductionParticles.setPosition(ufo.x, GAME_HEIGHT - 100);
        }
      },
      loop: true,
    });

    this.scene.time.delayedCall(8000, () => {
      particleUpdate.destroy();
      abductionParticles.destroy();
    });

    // Screen flash when UFO enters
    this.scene.cameras.main.flash(200, 0, 255, 0, true);
  }

  // Show announcement banner (scaled)
  showAnnouncement(text: string, duration: number = 5000): void {
    // Remove existing announcement
    if (this.announcementText) {
      this.announcementText.destroy();
      this.announcementText = null;
    }
    if (this.announcementBg) {
      this.announcementBg.destroy();
      this.announcementBg = null;
    }

    // Create background (scaled)
    this.announcementBg = this.scene.add.rectangle(
      GAME_WIDTH / 2,
      Math.round(50 * SCALE),
      Math.round(600 * SCALE),
      Math.round(40 * SCALE),
      0x000000,
      0.8
    );
    this.announcementBg.setStrokeStyle(Math.round(2 * SCALE), 0x4ade80);
    this.announcementBg.setDepth(DEPTH.ANNOUNCE_BG);
    this.announcementBg.setAlpha(0);

    // Create text (scaled font)
    this.announcementText = this.scene.add.text(GAME_WIDTH / 2, Math.round(50 * SCALE), text, {
      fontFamily: "monospace",
      fontSize: `${Math.round(14 * SCALE)}px`,
      color: "#4ade80",
      align: "center",
    });
    this.announcementText.setOrigin(0.5, 0.5);
    this.announcementText.setDepth(DEPTH.ANNOUNCE_TEXT);
    this.announcementText.setAlpha(0);

    // Animate in (scaled)
    this.scene.tweens.add({
      targets: [this.announcementBg, this.announcementText],
      alpha: 1,
      y: Math.round(60 * SCALE),
      duration: 300,
      ease: "Back.easeOut",
    });

    // Animate out after duration
    this.scene.time.delayedCall(duration, () => {
      if (this.announcementBg && this.announcementText) {
        this.scene.tweens.add({
          targets: [this.announcementBg, this.announcementText],
          alpha: 0,
          y: 40,
          duration: 300,
          ease: "Back.easeIn",
          onComplete: () => {
            this.announcementText?.destroy();
            this.announcementBg?.destroy();
            this.announcementText = null;
            this.announcementBg = null;
          },
        });
      }
    });
  }

}
