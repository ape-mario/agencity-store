import * as Phaser from "phaser";
import type { GameCharacter, GameBuilding } from "@/city/lib/types";
import { SCALE } from "../textures/constants";
import type { WorldScene } from "../scenes/WorldScene";

/** Character glow sprite property keys — mirrors WorldScene.GLOW_KEYS. */
const GLOW_KEYS = [
  "tolyGlow", "ashGlow", "finnGlow", "devGlow", "scoutGlow", "cjGlow",
  "shawGlow", "ramoGlow", "sincaraGlow", "stuuGlow", "samGlow", "alaaGlow",
  "carloGlow", "bnnGlow", "professorOakGlow", "citybotGlow", "openClawGlow",
] as const;

/**
 * CharacterSystem — autonomous NPC behavior: idle activities (look around,
 * wave, point, stretch, nod), spaced walking, and proximity-triggered NPC
 * greetings to the local player.
 *
 * Extracted from WorldScene (Phase 2 of PERFORMANCE_PLAN.md). This system owns
 * the *behavior* logic; the character sprite maps (characterSprites,
 * buildingSprites, characterById) and greeting-cooldown state stay on the
 * scene because they're shared with the update loop, the agent bridge, and
 * the zone-transition code.
 *
 * startCharacterWalking() boots the per-NPC idle loop (a self-rescheduling
 * delayedCall). triggerNPCGreeting() fires a speech-bubble greeting when the
 * local player approaches, respecting per-NPC + global + zone-entry cooldowns.
 */
export class CharacterSystem {
  private scene: WorldScene;

  constructor(scene: WorldScene) {
    this.scene = scene;
  }

  startCharacterWalking(
    sprite: Phaser.GameObjects.Sprite,
    character: GameCharacter,
    isSpecial: boolean
  ): void {
    // Store the original Y position for the character
    const baseY = character.y;
    const walkSpeed = isSpecial ? 0.3 : 0.5;
    const walkRange = isSpecial ? Math.round(60 * SCALE) : Math.round(100 * SCALE); // How far they can walk from starting position
    const minX = Math.max(Math.round(80 * SCALE), character.x - walkRange);
    const maxX = Math.min(Math.round(720 * SCALE), character.x + walkRange);

    // Walking and activity state stored on sprite
    (sprite as any).isWalking = false;
    (sprite as any).isDoingActivity = false;
    (sprite as any).walkDirection = 1;
    (sprite as any).baseY = baseY;
    (sprite as any).characterId = character.id;

    // Idle bounce when not walking
    const idleTween = this.scene.tweens.add({
      targets: sprite,
      y: baseY - (isSpecial ? 2 : 3),
      duration: isSpecial ? 1200 : 800 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Store tween reference for cleanup
    (sprite as any).idleTween = idleTween;

    // Randomly decide to walk or do an activity
    const maybeWalkOrActivity = () => {
      if (!sprite.active) return;

      const isWalking = (sprite as any).isWalking;
      const isDoingActivity = (sprite as any).isDoingActivity;

      if (!isWalking && !isDoingActivity) {
        // Check if too close to another character (should spread out)
        const tooClose = this.isCharacterTooClose(sprite, 40);
        const roll = Math.random();

        // If crowded, much higher chance to walk away
        const walkChance = tooClose ? 0.7 : 0.25;

        if (roll < walkChance) {
          // Walk (more likely if crowded)
          this.walkCharacter(sprite, minX, maxX, baseY, walkSpeed, isSpecial);
        } else if (roll < walkChance + 0.2) {
          // 20% chance to do an idle activity
          this.doIdleActivity(sprite, character, isSpecial);
        }
        // Rest of the time just keep bouncing
      }

      // Schedule next check (every 2-5 seconds for more liveliness)
      this.scene.time.delayedCall(2000 + Math.random() * 3000, maybeWalkOrActivity);
    };

    // Start the walking/activity checks after initial delay
    this.scene.time.delayedCall(1000 + Math.random() * 3000, maybeWalkOrActivity);
  }

  // Perform a random idle activity (looking around, waving, etc.)
  doIdleActivity(
    sprite: Phaser.GameObjects.Sprite,
    character: GameCharacter,
    isSpecial: boolean
  ): void {
    if (!sprite.active || (sprite as any).isDoingActivity) return;

    (sprite as any).isDoingActivity = true;

    // Check context for activity type
    const nearbyCharacter = this.findNearbyCharacter(sprite, 80);
    const nearbyBuilding = this.findNearbyBuilding(sprite, 100);

    let activityType: "lookAround" | "wave" | "pointAtBuilding" | "stretch" | "nod";

    if (nearbyCharacter && Math.random() < 0.6) {
      // Near another character - wave at them
      activityType = "wave";
    } else if (nearbyBuilding && Math.random() < 0.4) {
      // Near a building - point at it or look at it
      activityType = "pointAtBuilding";
    } else {
      // Random idle activity
      const randomActivities: (typeof activityType)[] = ["lookAround", "stretch", "nod"];
      activityType = randomActivities[Math.floor(Math.random() * randomActivities.length)];
    }

    // Pause idle bounce during activity
    const idleTween = (sprite as any).idleTween as Phaser.Tweens.Tween;
    if (idleTween) idleTween.pause();

    const baseY = (sprite as any).baseY || sprite.y;

    switch (activityType) {
      case "lookAround":
        this.activityLookAround(sprite, baseY, idleTween);
        break;
      case "wave":
        this.activityWave(sprite, baseY, idleTween, nearbyCharacter);
        break;
      case "pointAtBuilding":
        this.activityPointAtBuilding(sprite, baseY, idleTween, nearbyBuilding);
        break;
      case "stretch":
        this.activityStretch(sprite, baseY, idleTween);
        break;
      case "nod":
        this.activityNod(sprite, baseY, idleTween);
        break;
    }
  }

  // Find a nearby character sprite within radius
  findNearbyCharacter(
    sprite: Phaser.GameObjects.Sprite,
    radius: number
  ): Phaser.GameObjects.Sprite | null {
    const myId = (sprite as any).characterId;
    let closest: Phaser.GameObjects.Sprite | null = null;
    let closestDist = radius;

    this.scene.characterSprites.forEach((otherSprite, id) => {
      if (id === myId || !otherSprite.active) return;
      const dist = Math.abs(otherSprite.x - sprite.x);
      if (dist < closestDist) {
        closestDist = dist;
        closest = otherSprite;
      }
    });

    return closest;
  }

  // Check if character is too close to another (for spacing)
  isCharacterTooClose(sprite: Phaser.GameObjects.Sprite, threshold: number): boolean {
    const myId = (sprite as any).characterId;

    for (const [id, otherSprite] of this.scene.characterSprites) {
      if (id === myId || !otherSprite.active || !otherSprite.visible) continue;
      const dist = Math.abs(otherSprite.x - sprite.x);
      if (dist < threshold) {
        return true;
      }
    }
    return false;
  }

  // Find a nearby building within radius
  findNearbyBuilding(
    sprite: Phaser.GameObjects.Sprite,
    radius: number
  ): Phaser.GameObjects.Container | null {
    let closest: Phaser.GameObjects.Container | null = null;
    let closestDist = radius;

    this.scene.buildingSprites.forEach((container) => {
      if (!container.active) return;
      const dist = Math.abs(container.x - sprite.x);
      if (dist < closestDist) {
        closestDist = dist;
        closest = container;
      }
    });

    return closest;
  }

  // Activity: Look around (tilt left, pause, tilt right, pause)
  activityLookAround(
    sprite: Phaser.GameObjects.Sprite,
    baseY: number,
    idleTween: Phaser.Tweens.Tween | null
  ): void {
    // Tilt/rotate slightly to simulate looking around
    this.scene.tweens.chain({
      targets: sprite,
      tweens: [
        { angle: -8, duration: 300, ease: "Sine.easeOut" },
        { angle: -8, duration: 400 }, // Hold
        { angle: 8, duration: 400, ease: "Sine.easeInOut" },
        { angle: 8, duration: 400 }, // Hold
        { angle: 0, duration: 300, ease: "Sine.easeIn" },
      ],
      onComplete: () => {
        (sprite as any).isDoingActivity = false;
        if (idleTween) idleTween.resume();
      },
    });
  }

  // Activity: Wave at nearby character
  activityWave(
    sprite: Phaser.GameObjects.Sprite,
    baseY: number,
    idleTween: Phaser.Tweens.Tween | null,
    targetSprite: Phaser.GameObjects.Sprite | null
  ): void {
    // Face toward the other character
    if (targetSprite) {
      sprite.setFlipX(targetSprite.x < sprite.x);
    }

    // Bounce up and down excitedly (simulates waving)
    this.scene.tweens.chain({
      targets: sprite,
      tweens: [
        { y: baseY - 8, scaleX: 1.05, duration: 120, ease: "Quad.easeOut" },
        { y: baseY, scaleX: 1.0, duration: 120, ease: "Quad.easeIn" },
        { y: baseY - 8, scaleX: 1.05, duration: 120, ease: "Quad.easeOut" },
        { y: baseY, scaleX: 1.0, duration: 120, ease: "Quad.easeIn" },
        { y: baseY - 6, scaleX: 1.03, duration: 100, ease: "Quad.easeOut" },
        { y: baseY, scaleX: 1.0, duration: 100, ease: "Quad.easeIn" },
      ],
      onComplete: () => {
        sprite.setY(baseY);
        sprite.setScale(sprite.scaleX > 1 ? 1.4 : sprite.scaleX); // Reset to normal
        (sprite as any).isDoingActivity = false;
        if (idleTween) idleTween.resume();
      },
    });
  }

  // Activity: Point at a nearby building (lean toward it)
  activityPointAtBuilding(
    sprite: Phaser.GameObjects.Sprite,
    baseY: number,
    idleTween: Phaser.Tweens.Tween | null,
    building: Phaser.GameObjects.Container | null
  ): void {
    // Face toward the building
    if (building) {
      sprite.setFlipX(building.x < sprite.x);
    }

    // Lean forward and hold (looking up at building)
    const leanAngle = building && building.x < sprite.x ? 10 : -10;

    this.scene.tweens.chain({
      targets: sprite,
      tweens: [
        { angle: leanAngle, y: baseY - 3, duration: 250, ease: "Sine.easeOut" },
        { angle: leanAngle, y: baseY - 3, duration: 800 }, // Hold - looking at building
        { angle: 0, y: baseY, duration: 250, ease: "Sine.easeIn" },
      ],
      onComplete: () => {
        (sprite as any).isDoingActivity = false;
        if (idleTween) idleTween.resume();
      },
    });
  }

  // Activity: Stretch (grow taller briefly)
  activityStretch(
    sprite: Phaser.GameObjects.Sprite,
    baseY: number,
    idleTween: Phaser.Tweens.Tween | null
  ): void {
    const baseScaleY = sprite.scaleY;

    this.scene.tweens.chain({
      targets: sprite,
      tweens: [
        { scaleY: baseScaleY * 1.15, y: baseY - 5, duration: 400, ease: "Sine.easeOut" },
        { scaleY: baseScaleY * 1.15, y: baseY - 5, duration: 300 }, // Hold stretch
        { scaleY: baseScaleY, y: baseY, duration: 300, ease: "Sine.easeIn" },
      ],
      onComplete: () => {
        sprite.setY(baseY);
        (sprite as any).isDoingActivity = false;
        if (idleTween) idleTween.resume();
      },
    });
  }

  // Activity: Nod (quick up-down motion like agreeing)
  activityNod(
    sprite: Phaser.GameObjects.Sprite,
    baseY: number,
    idleTween: Phaser.Tweens.Tween | null
  ): void {
    this.scene.tweens.chain({
      targets: sprite,
      tweens: [
        { y: baseY + 3, duration: 100, ease: "Quad.easeIn" },
        { y: baseY - 2, duration: 100, ease: "Quad.easeOut" },
        { y: baseY + 2, duration: 80, ease: "Quad.easeIn" },
        { y: baseY, duration: 80, ease: "Quad.easeOut" },
      ],
      onComplete: () => {
        sprite.setY(baseY);
        (sprite as any).isDoingActivity = false;
        if (idleTween) idleTween.resume();
      },
    });
  }

  // Find a walk target that avoids other characters (prevents clumping)
  findSpacedWalkTarget(
    sprite: Phaser.GameObjects.Sprite,
    minX: number,
    maxX: number
  ): number {
    const currentX = sprite.x;
    const myId = (sprite as any).characterId;
    const MIN_SPACING = 50; // Minimum pixels between characters

    // Find all nearby character positions
    const nearbyPositions: number[] = [];
    this.scene.characterSprites.forEach((otherSprite, id) => {
      if (id === myId || !otherSprite.active || !otherSprite.visible) return;
      const dist = Math.abs(otherSprite.x - currentX);
      if (dist < 200) {
        // Only consider characters within 200px
        nearbyPositions.push(otherSprite.x);
      }
    });

    // If no one nearby, pick random target
    if (nearbyPositions.length === 0) {
      return minX + Math.random() * (maxX - minX);
    }

    // Try to find a target that maintains spacing from others
    // Strategy: sample several candidates and pick the one with best spacing
    let bestTarget = currentX;
    let bestMinDist = 0;

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = minX + Math.random() * (maxX - minX);

      // Calculate minimum distance to any other character at this target
      let minDistToOthers = Infinity;
      for (const otherX of nearbyPositions) {
        const dist = Math.abs(candidate - otherX);
        if (dist < minDistToOthers) {
          minDistToOthers = dist;
        }
      }

      // If this candidate has better spacing, use it
      if (minDistToOthers > bestMinDist) {
        bestMinDist = minDistToOthers;
        bestTarget = candidate;
      }
    }

    // If even the best target is too close, move away from the crowd
    if (bestMinDist < MIN_SPACING) {
      // Find average position of nearby characters
      const avgX = nearbyPositions.reduce((a, b) => a + b, 0) / nearbyPositions.length;

      // Move away from the crowd
      if (avgX > currentX) {
        // Crowd is to the right, move left
        bestTarget = Math.max(minX, currentX - 60 - Math.random() * 40);
      } else {
        // Crowd is to the left, move right
        bestTarget = Math.min(maxX, currentX + 60 + Math.random() * 40);
      }
    }

    return bestTarget;
  }

  walkCharacter(
    sprite: Phaser.GameObjects.Sprite,
    minX: number,
    maxX: number,
    baseY: number,
    speed: number,
    isSpecial: boolean
  ): void {
    if (!sprite.active) return;

    (sprite as any).isWalking = true;

    // Pick a destination that avoids clumping with other characters
    const currentX = sprite.x;
    const targetX = this.findSpacedWalkTarget(sprite, minX, maxX);
    const distance = Math.abs(targetX - currentX);

    // Flip sprite based on direction
    const goingRight = targetX > currentX;
    sprite.setFlipX(!goingRight);

    // Stop idle bounce while walking
    const idleTween = (sprite as any).idleTween as Phaser.Tweens.Tween;
    if (idleTween) {
      idleTween.pause();
    }

    // Step-based walking: each step moves a fixed distance with hop animation
    const stepSize = isSpecial ? 12 : 16; // Pixels per step
    const stepDuration = isSpecial ? 280 : 220; // Ms per step (slower = more deliberate)
    const numSteps = Math.max(2, Math.floor(distance / stepSize));
    const actualStepSize = distance / numSteps;
    const direction = goingRight ? 1 : -1;

    let currentStep = 0;
    const baseScaleX = sprite.scaleX;
    const baseScaleY = sprite.scaleY;

    // Update glow + shadow helper. Shadow x tracks the sprite, but shadow y is
    // locked to baseY (the ground) so the character hops while the shadow
    // stays planted — much more convincing than a shadow that bobs.
    const updateGlow = () => {
      GLOW_KEYS.forEach((key) => {
        const glow = (sprite as any)[key];
        if (glow && glow.active) {
          glow.setX(sprite.x);
        }
      });
      const shadow = (sprite as any)._shadow as Phaser.GameObjects.Sprite | undefined;
      if (shadow && shadow.active) {
        const offsetY = (sprite as any)._shadowFeetOffsetY ?? 0;
        shadow.x = sprite.x;
        shadow.y = baseY + offsetY;
      }
    };

    // Take one step with hop animation
    const takeStep = () => {
      if (!sprite.active || currentStep >= numSteps) {
        // Walking complete
        (sprite as any).isWalking = false;
        sprite.setY(baseY);
        sprite.setAngle(0);
        sprite.setScale(baseScaleX, baseScaleY);
        if (idleTween) idleTween.resume();
        updateGlow();
        return;
      }

      const nextX = sprite.x + actualStepSize * direction;
      const isLeftFoot = currentStep % 2 === 0;

      // Each step: lift (hop up + tilt) -> land (drop + squash) -> recover
      this.scene.tweens.chain({
        targets: sprite,
        tweens: [
          // Lift phase: hop up, slight tilt, move halfway
          {
            x: sprite.x + actualStepSize * direction * 0.5,
            y: baseY - 6,
            angle: isLeftFoot ? 3 : -3,
            scaleX: baseScaleX * 0.98,
            scaleY: baseScaleY * 1.04,
            duration: stepDuration * 0.4,
            ease: "Quad.easeOut",
            onUpdate: updateGlow,
          },
          // Land phase: drop down, squash, complete the step
          {
            x: nextX,
            y: baseY + 2,
            angle: 0,
            scaleX: baseScaleX * 1.04,
            scaleY: baseScaleY * 0.96,
            duration: stepDuration * 0.35,
            ease: "Quad.easeIn",
            onUpdate: updateGlow,
          },
          // Recover phase: return to normal
          {
            y: baseY,
            scaleX: baseScaleX,
            scaleY: baseScaleY,
            duration: stepDuration * 0.25,
            ease: "Sine.easeOut",
          },
        ],
        onComplete: () => {
          currentStep++;
          takeStep(); // Next step
        },
      });
    };

    // Start walking
    takeStep();
  }

  // === NPC AWARENESS ===

  triggerNPCGreeting(character: GameCharacter): void {
    const now = Date.now();

    // Suppress greetings shortly after zone entry
    if (now - this.scene.npcGreetZoneEntryTime < this.scene.NPC_GREET_ZONE_GRACE_MS) return;

    // Global cooldown: only one NPC greeting at a time
    if (now - this.scene.lastNpcGreetTime < this.scene.GLOBAL_NPC_GREET_COOLDOWN_MS) return;

    const behaviorId = this.scene.getCharacterBehaviorId(character);
    if (!behaviorId) return;

    // Per-NPC cooldown
    const lastGreet = this.scene.npcGreetCooldowns.get(behaviorId) ?? 0;
    if (now - lastGreet < this.scene.NPC_GREET_COOLDOWN_MS) return;

    const sprite = this.scene.findCharacterSprite(behaviorId);
    if (!sprite || !sprite.active) return;

    // Skip if already doing something
    if ((sprite as any).isDoingActivity || (sprite as any).isWalking) return;

    // Set cooldowns
    this.scene.npcGreetCooldowns.set(behaviorId, now);
    this.scene.lastNpcGreetTime = now;

    // Face the player
    if (this.scene.localPlayer) {
      sprite.setFlipX(this.scene.localPlayer.x < sprite.x);
    }

    // Mark as busy
    (sprite as any).isDoingActivity = true;

    // Get idle tween to pause it
    const idleTween = (sprite as any).idleTween as Phaser.Tweens.Tween | null;
    if (idleTween) idleTween.pause();

    const baseY = (sprite as any).baseY ?? sprite.y;

    // Wave animation (reuse existing pattern)
    this.activityWave(sprite, baseY, null, this.scene.localPlayer);

    // Show greeting bubble
    const greeting = this.getNPCGreeting(behaviorId);
    window.dispatchEvent(
      new CustomEvent("agencity-character-speak", {
        detail: { characterId: behaviorId, message: greeting, emotion: "happy" },
      })
    );

    // Hold NPC still for 3.5s (speech bubble display duration)
    this.scene.time.delayedCall(3500, () => {
      (sprite as any).isDoingActivity = false;
      if (idleTween) idleTween.resume();
    });
  }

  getNPCGreeting(characterId: string): string {
    const greetings: Record<string, string[]> = {
      finn: [
        "Hey! Welcome to AgenCity!",
        "Yo, nice to see you here!",
        "The vibes are immaculate today!",
      ],
      ghost: ["Sup, legend. Stay ghostly.", "Welcome back, fren.", "Bags up, always."],
      neo: [
        "*scanning*... New launch detected: YOU!",
        "Tracking your moves... impressive.",
        "Welcome, builder.",
      ],
      ash: ["A new trainer approaches!", "Gotta catch 'em all, right?", "Ready for an adventure?"],
      toly: ["Building on Solana? Based.", "Welcome, anon. Ship fast.", "The future is onchain."],
      shaw: [
        "Agents are the future.",
        "Welcome to the swarm.",
        "Let's build something autonomous.",
      ],
      cj: ["Yo, what's good homie!", "Welcome to the block!", "Big things happening, stay sharp!"],
      ramo: ["The smart contracts are ready.", "Welcome, developer.", "Let's ship some code."],
      sincara: ["The UI is looking clean!", "Hey there, pixel friend!", "Welcome to the frontend!"],
      stuu: ["Need help? I got you!", "Welcome aboard!", "Operations running smooth!"],
      sam: ["Let's grow this thing!", "Hey, welcome!", "Spreading the word!"],
      alaa: ["Research lab is open!", "Something experimental today?", "Welcome to Skunk Works!"],
      carlo: ["Welcome, ambassador!", "Great to have you here!", "Community first, always!"],
      bnn: [
        "Breaking: New visitor spotted!",
        "Welcome! News at 11.",
        "Reporting live from AgenCity!",
      ],
      professorOak: [
        "Ah, a new trainer!",
        "Ready to launch your first token?",
        "The world awaits, young one!",
      ],
      citybot: ["HYPE! Welcome fren!", "LFG! Bags are pumping!", "The vibes are IMMACULATE!"],
    };

    const options = greetings[characterId] ?? ["Hey there!", "Welcome!", "Nice to see you!"];
    return options[Math.floor(Math.random() * options.length)];
  }
}
