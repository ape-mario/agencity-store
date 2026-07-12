import * as Phaser from "phaser";
import { SCALE, Y } from "../textures/constants";
import type { WorldScene } from "../scenes/WorldScene";

const GAME_WIDTH = 1280;

// Ambient creature shapes (mirrored from WorldScene — kept local so the system
// is self-documenting; the scene arrays are typed via these interfaces).
interface Animal {
  sprite: Phaser.GameObjects.Sprite;
  type: "dog" | "cat" | "bird" | "butterfly" | "squirrel";
  targetX: number;
  speed: number;
  direction: "left" | "right";
  idleTimer: number;
  isIdle: boolean;
}

interface Pokemon {
  sprite: Phaser.GameObjects.Sprite;
  type: "charmander" | "squirtle" | "bulbasaur";
  targetX: number;
  speed: number;
  direction: "left" | "right";
  idleTimer: number;
  isIdle: boolean;
  baseY: number;
}

interface BeachCrab {
  characterId: string;
  sprite: Phaser.GameObjects.Sprite;
  targetX: number;
  speed: number;
  direction: "left" | "right";
  idleTimer: number;
  isIdle: boolean;
  baseY: number;
  isLobster: boolean;
}

/**
 * DecorationSystem — ambient life + particles: trees/bushes/benches/lamps
 * (static decorations), clouds (with parallax), animals (main_city), Pokémon
 * (founders), beach crabs/lobsters (moltbook), the fountain, ambient pollen,
 * and fireflies.
 *
 * Extracted from WorldScene (Phase 2 of PERFORMANCE_PLAN.md). All creature
 * state lives on the scene as public arrays (animals, pokemon, beachCrabs,
 * ambientCreatures, decorations, fountainWater, fireflies, ambientParticles,
 * clouds) because zone setup files populate and toggle them directly; this
 * system owns the methods that create, drive, and clean them up.
 *
 * Per-frame motion (cloud parallax + creature roaming) lives in update() with
 * the Phase 0 culling guards folded in.
 */
export class DecorationSystem {
  private scene: WorldScene;

  constructor(scene: WorldScene) {
    this.scene = scene;
  }

  createDecorations(): void {
    // Ground reference for positioning (top of grass area)
    const grassTop = Y.GRASS_TOP;
    const pathLevel = Y.PATH_LEVEL;

    // Add trees (positioned at grass top level)
    const treePositions = [
      { x: Math.round(50 * SCALE), y: grassTop },
      { x: Math.round(750 * SCALE), y: grassTop - Math.round(5 * SCALE) },
      { x: Math.round(180 * SCALE), y: grassTop + Math.round(10 * SCALE) },
      { x: Math.round(620 * SCALE), y: grassTop + Math.round(5 * SCALE) },
    ];

    treePositions.forEach((pos, i) => {
      const tree = this.scene.add.sprite(pos.x, pos.y, "tree");
      tree.setOrigin(0.5, 1);
      tree.setDepth(2);
      tree.setScale((0.9 + Math.random() * 0.3) * SCALE);
      this.scene.decorations.push(tree);

      // Gentle sway animation
      this.scene.tweens.add({
        targets: tree,
        angle: 2,
        duration: 2000 + i * 500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });

    // Add bushes (positioned on grass)
    const bushPositions = [
      { x: Math.round(100 * SCALE), y: grassTop + Math.round(25 * SCALE) },
      { x: Math.round(300 * SCALE), y: grassTop + Math.round(20 * SCALE) },
      { x: Math.round(500 * SCALE), y: grassTop + Math.round(23 * SCALE) },
      { x: Math.round(700 * SCALE), y: grassTop + Math.round(21 * SCALE) },
    ];

    bushPositions.forEach((pos) => {
      const bush = this.scene.add.sprite(pos.x, pos.y, "bush");
      bush.setOrigin(0.5, 1);
      bush.setDepth(2);
      bush.setScale((0.7 + Math.random() * 0.3) * SCALE);
      this.scene.decorations.push(bush);
    });

    // Add lamp posts (positioned near path)
    const lampPositions = [
      { x: Math.round(200 * SCALE), y: pathLevel },
      { x: Math.round(600 * SCALE), y: pathLevel },
    ];

    lampPositions.forEach((pos) => {
      const lamp = this.scene.add.sprite(pos.x, pos.y, "lamp");
      lamp.setOrigin(0.5, 1);
      lamp.setDepth(3);
      this.scene.decorations.push(lamp);

      // Add light glow (scaled)
      const glow = this.scene.add.sprite(pos.x, pos.y - Math.round(30 * SCALE), "glow");
      glow.setAlpha(0.3);
      glow.setScale(0.8 * SCALE);
      glow.setDepth(2);
      glow.setTint(0xfbbf24);

      this.scene.tweens.add({
        targets: glow,
        alpha: 0.5,
        scale: 0.9 * SCALE,
        duration: 1500,
        yoyo: true,
        repeat: -1,
      });
    });

    // Add benches (positioned near path)
    const benchPositions = [
      { x: Math.round(350 * SCALE), y: pathLevel - Math.round(5 * SCALE) },
      { x: Math.round(450 * SCALE), y: pathLevel - Math.round(5 * SCALE) },
    ];

    benchPositions.forEach((pos) => {
      const bench = this.scene.add.sprite(pos.x, pos.y, "bench");
      bench.setOrigin(0.5, 1);
      bench.setDepth(3);
      this.scene.decorations.push(bench);
    });
  }

  createClouds(): void {
    for (let i = 0; i < 6; i++) {
      const cloud = this.scene.add.sprite(
        Math.random() * GAME_WIDTH * 1.1 - Math.round(50 * SCALE),
        Math.round(30 * SCALE) + Math.random() * Math.round(120 * SCALE),
        "cloud"
      );
      cloud.setAlpha(0.5 + Math.random() * 0.3);
      cloud.setScale((0.6 + Math.random() * 0.5) * SCALE);
      cloud.setDepth(1);
      this.scene.clouds.push(cloud);
    }
  }

  createAnimals(): void {
    const animalTypes: Animal["type"][] = ["dog", "cat", "bird", "butterfly", "squirrel"];

    // Reference positions
    const pathLevel = Y.PATH_LEVEL;
    const grassTop = Y.GRASS_TOP;

    // Create a variety of animals (positioned relative to ground)
    const animalConfigs = [
      {
        type: "dog" as const,
        x: Math.round(150 * SCALE),
        y: pathLevel + Math.round(10 * SCALE),
        scale: 1.2 * SCALE,
      },
      {
        type: "cat" as const,
        x: Math.round(650 * SCALE),
        y: pathLevel + Math.round(10 * SCALE),
        scale: 1.1 * SCALE,
      },
      {
        type: "bird" as const,
        x: Math.round(100 * SCALE),
        y: grassTop - Math.round(20 * SCALE),
        scale: 0.8 * SCALE,
      },
      {
        type: "bird" as const,
        x: Math.round(700 * SCALE),
        y: grassTop - Math.round(10 * SCALE),
        scale: 0.7 * SCALE,
      },
      {
        type: "butterfly" as const,
        x: Math.round(300 * SCALE),
        y: grassTop - Math.round(30 * SCALE),
        scale: 0.6 * SCALE,
      },
      {
        type: "butterfly" as const,
        x: Math.round(500 * SCALE),
        y: grassTop - Math.round(40 * SCALE),
        scale: 0.5 * SCALE,
      },
      {
        type: "squirrel" as const,
        x: Math.round(80 * SCALE),
        y: grassTop + Math.round(20 * SCALE),
        scale: 1.0 * SCALE,
      },
    ];

    animalConfigs.forEach((config) => {
      const sprite = this.scene.add.sprite(config.x, config.y, config.type);
      sprite.setScale(config.scale);
      sprite.setDepth(4);

      // Flying animals have higher depth
      if (config.type === "bird" || config.type === "butterfly") {
        sprite.setDepth(15);
      }

      const animal: Animal = {
        sprite,
        type: config.type,
        targetX: config.x + (Math.random() * Math.round(200 * SCALE) - Math.round(100 * SCALE)),
        speed:
          config.type === "butterfly"
            ? 0.3 * SCALE
            : config.type === "bird"
              ? 0.5 * SCALE
              : 0.2 * SCALE,
        direction: Math.random() > 0.5 ? "left" : "right",
        idleTimer: 0,
        isIdle: Math.random() > 0.5,
      };

      this.scene.animals.push(animal);

      // Add idle animation for ground animals (scaled movement)
      if (config.type !== "bird" && config.type !== "butterfly") {
        this.scene.tweens.add({
          targets: sprite,
          y: config.y - Math.round(2 * SCALE),
          duration: 500 + Math.random() * 300,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      // Flying animation for birds and butterflies (scaled movement)
      if (config.type === "bird") {
        this.scene.tweens.add({
          targets: sprite,
          y: config.y - Math.round(15 * SCALE),
          duration: 800 + Math.random() * 400,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      if (config.type === "butterfly") {
        this.scene.tweens.add({
          targets: sprite,
          y: config.y - Math.round(20 * SCALE),
          angle: 5,
          duration: 600 + Math.random() * 300,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    });
  }

  createExtraDecorations(): void {
    // Reference positions
    const grassTop = Y.GRASS_TOP;
    const pathLevel = Y.PATH_LEVEL;

    // Add flower patches (positioned on grass)
    const flowerPositions = [
      { x: Math.round(130 * SCALE), y: grassTop + Math.round(35 * SCALE) },
      { x: Math.round(280 * SCALE), y: grassTop + Math.round(30 * SCALE) },
      { x: Math.round(420 * SCALE), y: grassTop + Math.round(33 * SCALE) },
      { x: Math.round(560 * SCALE), y: grassTop + Math.round(27 * SCALE) },
      { x: Math.round(680 * SCALE), y: grassTop + Math.round(31 * SCALE) },
    ];

    flowerPositions.forEach((pos) => {
      const flower = this.scene.add.sprite(pos.x, pos.y, "flower");
      flower.setOrigin(0.5, 1);
      flower.setDepth(2);
      flower.setScale((0.8 + Math.random() * 0.4) * SCALE);
      this.scene.decorations.push(flower);

      // Gentle sway
      this.scene.tweens.add({
        targets: flower,
        angle: 3,
        duration: 1500 + Math.random() * 500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });

    // Add rocks (positioned near path)
    const rockPositions = [
      { x: Math.round(70 * SCALE), y: pathLevel + Math.round(5 * SCALE) },
      { x: Math.round(730 * SCALE), y: pathLevel + Math.round(2 * SCALE) },
      { x: Math.round(380 * SCALE), y: pathLevel + Math.round(8 * SCALE) },
    ];

    rockPositions.forEach((pos) => {
      const rock = this.scene.add.sprite(pos.x, pos.y, "rock");
      rock.setOrigin(0.5, 1);
      rock.setDepth(2);
      rock.setScale((0.6 + Math.random() * 0.3) * SCALE);
      this.scene.decorations.push(rock);
    });

    // Add fountain in center of park (above the path)
    const fountainY = grassTop + Math.round(30 * SCALE);
    const fountainX = GAME_WIDTH / 2;
    const fountain = this.scene.add.sprite(fountainX, fountainY, "fountain");
    fountain.setOrigin(0.5, 1);
    fountain.setDepth(2);
    fountain.setScale(SCALE);
    this.scene.decorations.push(fountain);

    // Water spray particles - aligned with fountain top
    this.scene.fountainWater = this.scene.add.particles(fountainX, fountainY - Math.round(35 * SCALE), "rain", {
      speed: { min: Math.round(30 * SCALE), max: Math.round(60 * SCALE) },
      angle: { min: 260, max: 280 },
      lifespan: 500,
      quantity: 3,
      frequency: 80,
      scale: { start: 0.4 * SCALE, end: 0.1 * SCALE },
      alpha: { start: 0.7, end: 0 },
      gravityY: Math.round(80 * SCALE),
      tint: 0x60a5fa, // Blue tint for water
    });
    this.scene.fountainWater.setDepth(2);

    // Add flag poles (positioned at skyline/grass transition)
    const flagY = grassTop - Math.round(20 * SCALE);
    const flagPositions = [
      { x: Math.round(50 * SCALE), y: flagY },
      { x: Math.round(750 * SCALE), y: flagY },
    ];
    flagPositions.forEach((pos) => {
      const flag = this.scene.add.sprite(pos.x, pos.y, "flag");
      flag.setOrigin(0.5, 1);
      flag.setDepth(1);
      this.scene.decorations.push(flag);

      // Flag waving
      this.scene.tweens.add({
        targets: flag,
        scaleX: 0.9 * SCALE,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });

    // Add pond in corner (positioned on grass)
    const pond = this.scene.add.sprite(
      Math.round(100 * SCALE),
      grassTop + Math.round(50 * SCALE),
      "pond"
    );
    pond.setOrigin(0.5, 0.5);
    pond.setDepth(0);
    pond.setScale(1.5 * SCALE);
    pond.setAlpha(0.8);
    this.scene.decorations.push(pond);

    // Ripple effect on pond (scaled)
    this.scene.tweens.add({
      targets: pond,
      scale: 1.55 * SCALE,
      alpha: 0.6,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  createAmbientParticles(): void {
    // Floating pollen/dust particles during day (scaled)
    this.scene.ambientParticles = this.scene.add.particles(GAME_WIDTH / 2, Math.round(200 * SCALE), "pollen", {
      x: { min: 0, max: GAME_WIDTH },
      y: { min: Math.round(100 * SCALE), max: Math.round(400 * SCALE) },
      lifespan: 8000,
      speedX: { min: Math.round(5 * SCALE), max: Math.round(20 * SCALE) },
      speedY: { min: Math.round(-5 * SCALE), max: Math.round(5 * SCALE) },
      scale: { start: 0.3 * SCALE, end: 0 },
      alpha: { start: 0.4, end: 0 },
      quantity: 1,
      frequency: 500,
    });
    this.scene.ambientParticles.setDepth(15);
  }

  createFireflies(): void {
    if (this.scene.fireflies) return;

    this.scene.fireflies = this.scene.add.particles(GAME_WIDTH / 2, Math.round(400 * SCALE), "firefly", {
      x: { min: Math.round(50 * SCALE), max: Math.round(750 * SCALE) },
      y: { min: Math.round(350 * SCALE), max: Math.round(500 * SCALE) },
      lifespan: 4000,
      speedX: { min: Math.round(-20 * SCALE), max: Math.round(20 * SCALE) },
      speedY: { min: Math.round(-20 * SCALE), max: Math.round(20 * SCALE) },
      scale: { start: 0.8 * SCALE, end: 0 },
      alpha: { start: 0, end: 1, ease: "Sine.easeInOut" },
      quantity: 1,
      frequency: 300,
      tint: 0xffff00,
      blendMode: Phaser.BlendModes.ADD,
    });
    this.scene.fireflies.setDepth(20);
  }

  showFireflies(): void {
    if (!this.scene.fireflies) {
      this.createFireflies();
    } else {
      this.scene.fireflies.start();
      this.scene.fireflies.setVisible(true);
    }
  }

  hideFireflies(): void {
    if (this.scene.fireflies) {
      this.scene.fireflies.stop();
      this.scene.fireflies.setVisible(false);
    }
  }


  moveAnimalTo(animalType: Animal["type"], targetX: number): void {
    const animal = this.scene.animals.find((a) => a.type === animalType);
    if (animal) {
      animal.targetX = Math.max(Math.round(50 * SCALE), Math.min(Math.round(750 * SCALE), targetX));
      animal.isIdle = false;
      animal.direction = animal.targetX > animal.sprite.x ? "right" : "left";
    }
  }

  petAnimal(animalType: Animal["type"]): void {
    const animal = this.scene.animals.find((a) => a.type === animalType);
    if (animal) {
      // Stop the animal
      animal.isIdle = true;
      animal.idleTimer = 0;

      // Happy bounce animation (scaled)
      this.scene.tweens.add({
        targets: animal.sprite,
        y: animal.sprite.y - Math.round(15 * SCALE),
        duration: 200,
        yoyo: true,
        repeat: 2,
        ease: "Bounce.easeOut",
      });

      // Hearts effect (scaled)
      const hearts = this.scene.add.particles(
        animal.sprite.x,
        animal.sprite.y - Math.round(20 * SCALE),
        "star",
        {
          speed: { min: Math.round(30 * SCALE), max: Math.round(60 * SCALE) },
          angle: { min: 220, max: 320 },
          lifespan: 1000,
          quantity: 5,
          scale: { start: 0.5 * SCALE, end: 0 },
          alpha: { start: 1, end: 0 },
          tint: 0xff69b4,
        }
      );

      hearts.explode(5);

      this.scene.time.delayedCall(1000, () => {
        hearts.destroy();
      });
    }
  }

  scareAnimal(animalType: Animal["type"]): void {
    const animal = this.scene.animals.find((a) => a.type === animalType);
    if (animal) {
      // Run away to random side (scaled)
      animal.isIdle = false;
      animal.targetX =
        animal.sprite.x > GAME_WIDTH / 2 ? Math.round(50 * SCALE) : Math.round(750 * SCALE);
      animal.speed = animal.speed * 3; // Temporarily faster

      // Shake animation (scaled)
      this.scene.tweens.add({
        targets: animal.sprite,
        x: animal.sprite.x + Math.round(5 * SCALE),
        duration: 50,
        yoyo: true,
        repeat: 4,
      });

      // Reset speed after 2 seconds (scaled)
      this.scene.time.delayedCall(2000, () => {
        animal.speed =
          animal.type === "butterfly"
            ? 0.3 * SCALE
            : animal.type === "bird"
              ? 0.5 * SCALE
              : 0.2 * SCALE;
      });
    }
  }

  callAnimal(animalType: Animal["type"], targetX: number): void {
    const animal = this.scene.animals.find((a) => a.type === animalType);
    if (animal) {
      animal.targetX = Math.max(Math.round(50 * SCALE), Math.min(Math.round(750 * SCALE), targetX));
      animal.isIdle = false;
      animal.direction = animal.targetX > animal.sprite.x ? "right" : "left";
      animal.speed = animal.speed * 1.5; // Move a bit faster when called

      // Reset speed after reaching target (scaled)
      this.scene.time.delayedCall(3000, () => {
        animal.speed = animal.type === "butterfly" ? 0.3 : animal.type === "bird" ? 0.5 : 0.2;
      });
    }
  }

  getAnimalPosition(animalType: Animal["type"]): { x: number; y: number } | null {
    const animal = this.scene.animals.find((a) => a.type === animalType);
    if (animal) {
      return { x: animal.sprite.x, y: animal.sprite.y };
    }
    return null;
  }

  getAllAnimals(): Array<{ type: Animal["type"]; x: number; y: number; isIdle: boolean }> {
    return this.scene.animals.map((a) => ({
      type: a.type,
      x: a.sprite.x,
      y: a.sprite.y,
      isIdle: a.isIdle,
    }));
  }

  // ===========================================
  // BOT EFFECT HANDLERS
  // ===========================================

  handleBotAnimal(event: CustomEvent): void {
    const { animalType, animalAction } = event.detail || {};

    if (!animalType) return;

    switch (animalAction) {
      case "pet":
        this.petAnimal(animalType);
        break;
      case "scare":
      case "chase": // Chase is similar to scare
        this.scareAnimal(animalType);
        break;
      case "call":
        this.callAnimal(animalType, GAME_WIDTH / 2); // Call to center
        break;
      case "feed":
        this.feedAnimal(animalType);
        break;
      default:
        this.petAnimal(animalType); // Default to pet
    }
  }

  handleBotPokemon(event: CustomEvent): void {
    const { pokemonType, pokemonAction } = event.detail || {};

    if (!pokemonType) return;

    switch (pokemonAction) {
      case "pet":
      case "play":
        this.petPokemon(pokemonType);
        break;
      case "call":
        this.callPokemon(pokemonType);
        break;
      default:
        this.petPokemon(pokemonType);
    }
  }

  // Pet/play with a Pokemon - happy reaction with particles
  petPokemon(pokemonType: Pokemon["type"]): void {
    const poke = this.scene.pokemon.find((p) => p.type === pokemonType);
    if (!poke || !poke.sprite.active) return;

    // Stop moving and react happily
    poke.isIdle = true;
    poke.idleTimer = 0;

    // Happy jump animation
    this.scene.tweens.add({
      targets: poke.sprite,
      y: poke.baseY - Math.round(20 * SCALE),
      scaleX: poke.sprite.scaleX * 1.15,
      scaleY: poke.sprite.scaleY * 0.85,
      duration: 150,
      yoyo: true,
      repeat: 2,
      ease: "Bounce.easeOut",
      onComplete: () => {
        poke.sprite.y = poke.baseY;
      },
    });

    // Happy particles (hearts and stars)
    const particles = this.scene.add.particles(
      poke.sprite.x,
      poke.sprite.y - Math.round(15 * SCALE),
      "star",
      {
        speed: { min: Math.round(30 * SCALE), max: Math.round(80 * SCALE) },
        angle: { min: 200, max: 340 },
        lifespan: 1000,
        quantity: 8,
        scale: { start: 0.6 * SCALE, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffcc00, 0xff6699, 0x66ffcc], // Gold, pink, teal for Pokemon vibes
        gravityY: Math.round(-20 * SCALE),
      }
    );

    particles.explode(8);

    this.scene.time.delayedCall(1200, () => {
      particles.destroy();
    });

    // Screen flash for extra feedback
    this.scene.cameras.main.flash(100, 255, 255, 200, true);
  }

  // Call a Pokemon - make it come to center
  callPokemon(pokemonType: Pokemon["type"]): void {
    const poke = this.scene.pokemon.find((p) => p.type === pokemonType);
    if (!poke || !poke.sprite.active) return;

    // Move to center
    poke.isIdle = false;
    poke.targetX = GAME_WIDTH / 2;
    poke.direction = poke.targetX > poke.sprite.x ? "right" : "left";

    // Little attention animation
    this.scene.tweens.add({
      targets: poke.sprite,
      angle: { from: -5, to: 5 },
      duration: 100,
      yoyo: true,
      repeat: 2,
    });
  }

  // Feed animal - similar to pet but with food particle (scaled)
  feedAnimal(animalType: Animal["type"]): void {
    const animal = this.scene.animals.find((a) => a.type === animalType);
    if (animal) {
      // Stop the animal
      animal.isIdle = true;
      animal.idleTimer = 0;

      // Eating animation - bounce and grow slightly
      this.scene.tweens.add({
        targets: animal.sprite,
        scaleX: animal.sprite.scaleX * 1.1,
        scaleY: animal.sprite.scaleY * 1.1,
        duration: 200,
        yoyo: true,
        repeat: 2,
        ease: "Bounce.easeOut",
      });

      // Food particles (using star as food, scaled)
      const food = this.scene.add.particles(
        animal.sprite.x,
        animal.sprite.y - Math.round(10 * SCALE),
        "star",
        {
          speed: { min: Math.round(10 * SCALE), max: Math.round(30 * SCALE) },
          angle: { min: 220, max: 320 },
          lifespan: 800,
          quantity: 3,
          scale: { start: 0.3 * SCALE, end: 0 },
          alpha: { start: 1, end: 0 },
          tint: 0xffd700,
        }
      );

      food.explode(3);

      this.scene.time.delayedCall(800, () => {
        food.destroy();
      });
    }
  }

  // Fireworks effect - multiple bursts in the sky (scaled)
  // Character walking system with activity variety

  /**
   * Per-frame ambient motion: cloud parallax + zone-scoped animal/pokémon/
   * beach-creature roaming. Phase 0 culling guards live here — clouds pause
   * when a modal covers the canvas or the tab is hidden, and each creature
   * set only runs in its own zone (main_city / founders / moltbook).
   */
  update(modalOpen: boolean, tabHidden: boolean): void {
    // Animate clouds with parallax — Phase 0 culling: pause when a modal is
    // open or the tab is hidden (Phaser already throttles hidden tabs, but the
    // modal case is not otherwise covered).
    if (!modalOpen && !tabHidden) {
      this.scene.clouds.forEach((cloud, i) => {
        cloud.x += 0.15 + i * 0.05;
        if (cloud.x > 870) {
          cloud.x = -70;
          cloud.y = 30 + Math.random() * 120;
        }
      });
    }

    // Ambient animals only populate main_city, so a zone guard drops the
    // cross-zone cost to ~zero.
    if (this.scene.currentZone === "main_city") {
    // Animate animals (scaled for 1280x960 resolution)
    const animalMinX = Math.round(50 * SCALE);
    const animalMaxX = Math.round(750 * SCALE);
    const animalRoamRange = Math.round(700 * SCALE);

    this.scene.animals.forEach((animal) => {
      if (animal.isIdle) {
        animal.idleTimer += 1;
        // After idle period, start moving again
        if (animal.idleTimer > 100 + Math.random() * 200) {
          animal.isIdle = false;
          animal.idleTimer = 0;
          animal.targetX = animalMinX + Math.random() * animalRoamRange;
          animal.direction = animal.targetX > animal.sprite.x ? "right" : "left";
        }
      } else {
        // Move toward target
        const dx = animal.targetX - animal.sprite.x;
        if (Math.abs(dx) < 5 * SCALE) {
          // Reached target, become idle
          animal.isIdle = true;
        } else {
          animal.sprite.x += animal.speed * (dx > 0 ? 1 : -1);
          animal.sprite.setFlipX(dx < 0);
        }

        // Keep within bounds (scaled)
        if (animal.sprite.x < animalMinX) {
          animal.sprite.x = animalMinX;
          animal.targetX = animalMinX + Math.random() * Math.round(300 * SCALE);
        }
        if (animal.sprite.x > animalMaxX) {
          animal.sprite.x = animalMaxX;
          animal.targetX = Math.round(400 * SCALE) + Math.random() * Math.round(350 * SCALE);
        }
      }
    });
    } // end main_city animal loop guard

    // === POKEMON MOVEMENT (Founders zone only) ===
    if (this.scene.currentZone === "founders") {
      const pokemonMinX = Math.round(80 * SCALE);
      const pokemonMaxX = Math.round(720 * SCALE);

      this.scene.pokemon.forEach((poke) => {
        if (!poke.sprite.active) return;

        if (!poke.isIdle) {
          // Move toward target
          const dx = poke.targetX - poke.sprite.x;
          if (Math.abs(dx) < 5 * SCALE) {
            // Reached target, become idle
            poke.isIdle = true;
            poke.idleTimer = 0;
          } else {
            poke.sprite.x += poke.speed * SCALE * (dx > 0 ? 1 : -1);
            poke.sprite.setFlipX(dx < 0);
          }

          // Keep within bounds
          if (poke.sprite.x < pokemonMinX) {
            poke.sprite.x = pokemonMinX;
            poke.isIdle = true;
            poke.targetX = pokemonMinX + Math.random() * Math.round(200 * SCALE);
          }
          if (poke.sprite.x > pokemonMaxX) {
            poke.sprite.x = pokemonMaxX;
            poke.isIdle = true;
            poke.targetX = pokemonMaxX - Math.random() * Math.round(200 * SCALE);
          }
        }
      });
    }

    // === BEACH CRAB/LOBSTER MOVEMENT (Moltbook Beach zone only) ===
    if (this.scene.currentZone === "moltbook") {
      const crabMinX = Math.round(60 * SCALE);
      const crabMaxX = Math.round(740 * SCALE);
      const crabRoamRange = Math.round(600 * SCALE);

      // Helper to update a single crab/lobster/hermit creature movement
      const updateCreatureMovement = (crab: BeachCrab) => {
        if (!crab.sprite || !crab.sprite.active) return;

        if (crab.isIdle) {
          crab.idleTimer += 1;

          // Idle claw snap: random chance for a quick scale pulse (visual "snap")
          if (crab.idleTimer % 60 === 0 && Math.random() < 0.08) {
            this.scene.tweens.add({
              targets: crab.sprite,
              scaleX: crab.sprite.scaleX * 1.15,
              scaleY: crab.sprite.scaleY * 1.12,
              duration: 100,
              yoyo: true,
              ease: "Quad.easeOut",
            });
          }

          // Crabs idle longer than regular animals - they're chill beach vibes
          if (crab.idleTimer > 150 + Math.random() * 250) {
            crab.isIdle = false;
            crab.idleTimer = 0;
            crab.targetX = crabMinX + Math.random() * crabRoamRange;
            crab.direction = crab.targetX > crab.sprite.x ? "right" : "left";
          }
        } else {
          // Move toward target (crabs are slower, more deliberate)
          const dx = crab.targetX - crab.sprite.x;
          if (Math.abs(dx) < 5 * SCALE) {
            // Reached target, become idle
            crab.isIdle = true;
            crab.idleTimer = 0;
          } else {
            crab.sprite.x += crab.speed * (dx > 0 ? 1 : -1);
            crab.sprite.setFlipX(dx < 0);
          }

          // Keep within beach bounds
          if (crab.sprite.x < crabMinX) {
            crab.sprite.x = crabMinX;
            crab.targetX = crabMinX + Math.random() * Math.round(200 * SCALE);
            crab.isIdle = true;
          }
          if (crab.sprite.x > crabMaxX) {
            crab.sprite.x = crabMaxX;
            crab.targetX = crabMaxX - Math.random() * Math.round(200 * SCALE);
            crab.isIdle = true;
          }
        }
      };

      // Update external agent crabs/lobsters
      this.scene.beachCrabs.forEach(updateCreatureMovement);

      // Update ambient creatures (always-present beach life)
      this.scene.ambientCreatures.forEach(updateCreatureMovement);
    }

  }
}
