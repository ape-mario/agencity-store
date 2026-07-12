import * as Phaser from "phaser";
import type { ZoneType, GameCharacter, GameBuilding } from "@/city/lib/types";
import { SCALE, DEPTH, Y } from "../textures/constants";
import { SpeechBubbleManager } from "@/city/lib/speech-bubble-manager";
import type { WorldScene } from "../scenes/WorldScene";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 960;

/**
 * PlayerSystem - local player controls, enter/exit world, tap-to-move, spawn
 * + iris effects, E-key interaction, the helper/guide NPC, and the tutorial.
 *
 * Per the state-ownership map in PERFORMANCE_PLAN.md, the input/movement fields
 * MOVE here (cursors, wasdKeys, playerVelocity, sprintKey, nearby*, helper bubble
 * state, iris, tutorial), while the shared coordination fields STAY on the scene
 * (localPlayer, playerEnabled, helperNPC, pendingEnterWorld, cameraFollowing,
 * moveTarget*, interactPrompt, tapMarker, localPlayerTextureKeys) because
 * ZoneSystem, cleanup(), and the character-sprite code read them.
 *
 * attachShadow / syncShadow stay on the scene - shared utilities used by both
 * the player and the per-frame NPC loop.
 */
export class PlayerSystem {
  private scene: WorldScene;

  private playerSpriteVariant = 0;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasdKeys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
  } | null = null;
  private playerVelocity = { x: 0, y: 0 };
  private playerWalkCycle = 0;
  private readonly PLAYER_WALK_SPEED = 1.8;
  private readonly PLAYER_SPRINT_SPEED = 3.6;
  private readonly PLAYER_ACCELERATION = 0.15;
  private readonly PLAYER_SPRINT_ACCELERATION = 0.25;
  private readonly PLAYER_FRICTION = 0.85;
  private sprintKey: Phaser.Input.Keyboard.Key | null = null;
  private nearbyNPC: GameCharacter | null = null;
  private nearbyBuilding: GameBuilding | null = null;
  private nearbyHelper = false;
  private eKeyPressed = false;
  private boundEKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private helperBubbleManager: SpeechBubbleManager | null = null;
  private helperLineIndex = 0;
  private helperGreeted = false;
  private irisGraphics: Phaser.GameObjects.Graphics | null = null;
  private tapMoveSuppressed = false;
  private tutorialStep = -1;
  private tutorialArrows: Phaser.GameObjects.Text[] = [];

  constructor(scene: WorldScene) {
    this.scene = scene;
  }

  /** Accessors for shared state the scene/ZoneSystem reads. */
  getNearbyNPC(): GameCharacter | null { return this.nearbyNPC; }
  getNearbyBuilding(): GameBuilding | null { return this.nearbyBuilding; }
  isNearbyHelper(): boolean { return this.nearbyHelper; }

  /**
   * Tear down player-owned resources: the E-key listener, interact prompt,
   * tap marker, meme textures, tutorial arrows, iris overlay. Call from the
   * scene's cleanup().
   */
  destroy(): void {
    this.clearTutorialArrows();
    if (this.boundEKeyDown) {
      window.removeEventListener("keydown", this.boundEKeyDown);
      this.boundEKeyDown = null;
    }
    if (this.scene.tapMarker) {
      this.scene.tweens.killTweensOf(this.scene.tapMarker);
      this.scene.tapMarker.destroy();
      this.scene.tapMarker = null;
    }
    for (const key of this.scene.localPlayerTextureKeys) {
      if (this.scene.textures.exists(key)) {
        this.scene.textures.remove(key);
      }
    }
    this.scene.localPlayerTextureKeys = [];
    this.scene.pendingEnterWorld = null;
    if (this.scene.interactPrompt) {
      this.scene.interactPrompt.destroy();
      this.scene.interactPrompt = null;
    }
    // Clear the camera geometry mask BEFORE destroying the iris graphics it
    // references (exitWorld does the same). Prevents a dangling-mask reference
    // if the scene shuts down mid-iris-reveal.
    if (this.irisGraphics) {
      this.scene.cameras.main.clearMask();
      this.irisGraphics.destroy();
      this.irisGraphics = null;
    }
    // Tear down the helper NPC: its bubble manager, infinite tweens, indicator,
    // and shadow. These leak across scene re-mounts if not cleaned up here.
    if (this.helperBubbleManager) {
      this.helperBubbleManager.destroy();
      this.helperBubbleManager = null;
    }
    if (this.scene.helperNPC) {
      this.scene.tweens.killTweensOf(this.scene.helperNPC);
      const indicator = (this.scene.helperNPC as any)._helperIndicator as
        | Phaser.GameObjects.Text
        | undefined;
      if (indicator) {
        this.scene.tweens.killTweensOf(indicator);
        indicator.destroy();
      }
      const shadow = (this.scene.helperNPC as any)._shadow as
        | Phaser.GameObjects.Sprite
        | undefined;
      if (shadow) shadow.destroy();
      this.scene.helperNPC.destroy();
      this.scene.helperNPC = null;
    }
  }

  setupLocalPlayer(): void {
    // Setup keyboard input
    if (this.scene.input.keyboard) {
      this.cursors = this.scene.input.keyboard.createCursorKeys();
      // Remove capture so arrow keys, space, and shift don't block typing in inputs
      this.scene.input.keyboard.removeCapture([
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.SHIFT,
      ]);
      // enableCapture = false so WASD/E/Shift keys still reach <input> elements
      this.wasdKeys = {
        W: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W, false),
        A: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A, false),
        S: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S, false),
        D: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D, false),
        E: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E, false),
      };
      this.sprintKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT, false);
    }

    // Fallback window listener for the E key: Phaser's JustDown misses presses
    // when the canvas is not focused (common after closing a React modal).
    this.boundEKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "e" && e.key !== "E") return;
      if ((window as any).__agencity_modal_open) return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") return;
      this.eKeyPressed = true;
    };
    window.addEventListener("keydown", this.boundEKeyDown);

    // Create "Press E to talk" prompt (hidden initially)
    this.createInteractPrompt();

    // Listen for "Enter World" event from React UI
    this.scene.boundEnterWorld = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const spriteVariant = detail?.spriteVariant ?? 0;
      const customSpriteUrl = detail?.customSpriteUrl;
      const walkSpriteSheetUrl = detail?.walkSpriteSheetUrl;
      const memeName = detail?.memeName;

      if (customSpriteUrl) {
        // Load AI-generated meme sprite (with optional walk animation)
        this.loadAndEnterWithCustomSprite(customSpriteUrl, memeName, walkSpriteSheetUrl);
      } else {
        // Use default sprite variant
        this.enterWorld(spriteVariant);
      }
    };
    window.addEventListener("agencity-enter-world", this.scene.boundEnterWorld);

    // Listen for "Exit World" event
    this.scene.boundExitWorld = () => this.exitWorld();
    window.addEventListener("agencity-exit-world", this.scene.boundExitWorld);
  }

  loadAndEnterWithCustomSprite(
    imageUrl: string,
    memeName: string,
    walkSpriteSheetUrl?: string
  ): void {
    if (this.scene.playerEnabled && this.scene.localPlayer) return;

    // Generate unique texture keys for this meme (tracked for cleanup on exit)
    const textureKey = `meme_player_${Date.now()}`;
    const walkTextureKey = walkSpriteSheetUrl ? `meme_walk_${Date.now()}` : null;
    this.scene.localPlayerTextureKeys = [textureKey];
    if (walkTextureKey) this.scene.localPlayerTextureKeys.push(walkTextureKey);

    // Load the main character image
    this.scene.load.image(textureKey, imageUrl);

    // Also load walk sprite sheet if provided
    if (walkSpriteSheetUrl && walkTextureKey) {
      // Load as spritesheet - 2x2 grid of 4 walk frames
      this.scene.load.spritesheet(walkTextureKey, walkSpriteSheetUrl, {
        frameWidth: 512, // 1024 / 2
        frameHeight: 512, // 1024 / 2
      });
    }

    this.scene.load.once("complete", () => {
      this.enterWorldWithTexture(textureKey, memeName, walkTextureKey);
    });
    this.scene.load.once("loaderror", () => {
      console.error("[WorldScene] Failed to load meme sprite, using default");
      this.enterWorld(0); // Fallback to default
    });
    this.scene.load.start();
  }

  enterWorldWithTexture(
    textureKey: string,
    memeName?: string,
    walkTextureKey?: string | null
  ): void {
    if (this.scene.playerEnabled && this.scene.localPlayer) return;

    // If a zone transition is in progress, queue the spawn for when it completes
    if (this.scene.isTransitioning) {
      this.scene.pendingEnterWorld = () =>
        this.enterWorldWithTexture(textureKey, memeName, walkTextureKey);
      return;
    }

    this.playerSpriteVariant = -1; // Custom sprite
    this.scene.playerEnabled = true;

    const pathLevel = Y.PATH_LEVEL;
    const startX = GAME_WIDTH / 2;

    // If we have a walk sprite sheet, use it as a sprite with animation
    if (walkTextureKey && this.scene.textures.exists(walkTextureKey)) {
      // Create walk animation from sprite sheet
      const walkAnimKey = `${walkTextureKey}_walk`;
      if (!this.scene.anims.exists(walkAnimKey)) {
        this.scene.anims.create({
          key: walkAnimKey,
          frames: this.scene.anims.generateFrameNumbers(walkTextureKey, { start: 0, end: 3 }),
          frameRate: 8,
          repeat: -1,
        });
      }

      // Create player with walk sprite sheet
      this.scene.localPlayer = this.scene.add.sprite(startX, pathLevel, walkTextureKey, 0);
      this.scene.localPlayer.setDepth(12);
      this.scene.localPlayer.setScale(0.15); // Scale down AI-generated image
      this.scene.localPlayer.setOrigin(0.5, 1);

      // Store keys for use during movement
      (this.scene.localPlayer as any).walkAnimKey = walkAnimKey;
      (this.scene.localPlayer as any).walkTextureKey = walkTextureKey;
      (this.scene.localPlayer as any).idleTextureKey = textureKey;
      (this.scene.localPlayer as any).hasWalkAnim = true;
    } else {
      // Create player with static meme texture (no walk animation)
      this.scene.localPlayer = this.scene.add.sprite(startX, pathLevel, textureKey);
      this.scene.localPlayer.setDepth(12);
      this.scene.localPlayer.setScale(0.15); // Scale down AI-generated image (usually 1024x1024)
      this.scene.localPlayer.setOrigin(0.5, 1);
      (this.scene.localPlayer as any).hasWalkAnim = false;
    }

    // Drop shadow under player feet — meme sprites are large, scale shadow wider
    this.scene.attachShadow(this.scene.localPlayer, 1.7);

    // Add player name label if meme name provided
    if (memeName) {
      const nameLabel = this.scene.add.text(startX, pathLevel + 10, memeName, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#22c55e",
        stroke: "#000000",
        strokeThickness: 2,
      });
      nameLabel.setOrigin(0.5, 0);
      nameLabel.setDepth(12);

      // Store reference for cleanup and movement sync
      (this.scene.localPlayer as any).nameLabel = nameLabel;
    }

    // Cool spawn effect
    this.playSpawnEffect(startX, pathLevel);

    // Camera follow + zoom
    if (this.scene.localPlayer) {
      this.scene.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
      this.scene.cameras.main.startFollow(this.scene.localPlayer, true, 0.08, 0.08);
      this.scene.cameras.main.setDeadzone(30, 15);
      this.scene.cameras.main.zoomTo(1.3, 800, "Sine.easeInOut");
      this.scene.cameraFollowing = true;
    }

    // Enable tap-to-move on mobile
    this.enableTapToMove();

    window.dispatchEvent(new CustomEvent("agencity-player-entered"));
  }

  enterWorld(spriteVariant: number): void {
    if (this.scene.playerEnabled && this.scene.localPlayer) return; // Already in world

    // If a zone transition is in progress, queue the spawn for when it completes
    if (this.scene.isTransitioning) {
      this.scene.pendingEnterWorld = () => this.enterWorld(spriteVariant);
      return;
    }

    this.playerSpriteVariant = spriteVariant;
    (window as unknown as Record<string, unknown>).__agencity_player_variant = spriteVariant;
    this.scene.playerEnabled = true;

    // Create player sprite with chosen variant
    const pathLevel = Y.PATH_LEVEL;
    const startX = GAME_WIDTH / 2;

    const textureKey = `character_${spriteVariant}`;
    this.scene.localPlayer = this.scene.add.sprite(startX, pathLevel, textureKey);
    this.scene.localPlayer.setDepth(12); // Above NPCs
    this.scene.localPlayer.setScale(1.4); // Slightly larger than NPCs
    this.scene.localPlayer.setOrigin(0.5, 1);

    // Drop shadow under player feet — pixel character sprites use 1.0 width
    this.scene.attachShadow(this.scene.localPlayer, 1.0);

    // Play cool spawn effect
    this.playSpawnEffect(startX, pathLevel, 1.4);

    // Camera follow + zoom
    this.scene.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.scene.cameras.main.startFollow(this.scene.localPlayer, true, 0.08, 0.08);
    this.scene.cameras.main.zoomTo(1.3, 800, "Sine.easeInOut");
    this.scene.cameraFollowing = true;

    // Enable tap-to-move on mobile
    this.enableTapToMove();

    // Notify React that player entered
    window.dispatchEvent(new CustomEvent("agencity-player-entered"));

    // Spawn the helper/guide NPC in the city
    this.createHelperNPC();
  }

  createHelperNPC(): void {
    if (this.scene.helperNPC) return; // Already spawned

    const pathLevel = Y.PATH_LEVEL;
    const x = Math.round(GAME_WIDTH * 0.32); // Slightly left of center so she greets arriving players

    const sprite = this.scene.add.sprite(x, pathLevel, "character_4");
    sprite.setOrigin(0.5, 1);
    sprite.setScale(1.3);
    sprite.setDepth(11); // Above generic NPCs, below local player
    sprite.setInteractive({ useHandCursor: true });
    this.scene.attachShadow(sprite, 0.9);

    // Idle bob animation
    this.scene.tweens.add({
      targets: sprite,
      y: pathLevel - 2,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Exclamation/question indicator to show she's interactive
    const indicator = this.scene.add.text(x, pathLevel - Math.round(42 * SCALE), "?", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "12px",
      color: "#fbbf24",
      fontStyle: "bold",
    });
    indicator.setOrigin(0.5, 0.5);
    indicator.setDepth(200);
    (sprite as any)._helperIndicator = indicator;
    this.scene.tweens.add({
      targets: indicator,
      y: pathLevel - Math.round(50 * SCALE),
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Click to talk
    sprite.on("pointerup", () => {
      if (this.scene.wasDragGesture) return;
      this.talkToHelper();
    });

    // Hover scale
    sprite.on("pointerover", () => sprite.setScale(1.45));
    sprite.on("pointerout", () => sprite.setScale(1.3));

    this.scene.helperNPC = sprite;

    // Speech bubble manager scoped to this single sprite
    this.helperBubbleManager = new SpeechBubbleManager(
      this.scene,
      new Map([["character_4", sprite]]),
      { displayDuration: 4500, maxWidth: 280, yOffset: -70 }
    );

    // Greet the player automatically the first time they enter the city
    this.scene.time.delayedCall(1200, () => {
      if (this.scene.helperNPC?.active && this.scene.currentZone === "main_city" && !this.helperGreeted) {
        this.helperGreeted = true;
        this.showHelperBubble("Hi! I'm AgenC #285. Press E or click me for a quick tour.");
      }
    });
  }

  showHelperBubble(message: string): void {
    if (!this.helperBubbleManager || !this.scene.helperNPC?.active) return;
    this.helperBubbleManager.showBubble({
      characterId: "character_4",
      characterName: "AgenC #285",
      message,
      timestamp: Date.now(),
      emotion: "happy",
    });
  }

  talkToHelper(): void {
    if (!this.scene.helperNPC?.active) return;

    const lines = [
      "Welcome to AgenCity! I'm AgenC #285, your guide.",
      "Each district maps to a feature of the app.",
      "City is home. Catalog is where you hire AI agents.",
      "My Tasks tracks your deliveries; Earnings shows referrals.",
      "Proof is live on-chain verification, and Trust covers buyer protection.",
      "Use WASD or arrow keys to move. Press E near a building to open it.",
      "On mobile, tap where you want to walk, then tap a building to enter.",
      "Good luck exploring the city!",
    ];

    this.showHelperBubble(lines[this.helperLineIndex]);
    this.helperLineIndex++;
    if (this.helperLineIndex >= lines.length) {
      this.helperLineIndex = 0;
    }
  }

  playSpawnEffect(x: number, y: number, targetScale: number = 1.4): void {
    if (!this.scene.localPlayer) return;

    // Play entry sound effect
    this.scene.audioSystem.playSpawnSfx();

    // Play iris-in reveal
    this.playIrisIn(x, y);

    // Start from above and drop down with effects
    const spawnY = y - 200;
    this.scene.localPlayer.setPosition(x, spawnY);
    this.scene.localPlayer.setAlpha(0);
    this.scene.localPlayer.setScale(targetScale * 0.2);

    // Create spawn particle burst
    const spawnParticles = this.scene.add.particles(x, y - 30, "particle", {
      speed: { min: 50, max: 150 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0x22c55e, 0x4ade80, 0x86efac, 0xffffff], // Green sparkles
      lifespan: 600,
      quantity: 20,
      emitting: false,
    });
    spawnParticles.setDepth(13);

    // Create landing dust effect
    const dustParticles = this.scene.add.particles(x, y, "particle", {
      speed: { min: 30, max: 80 },
      angle: { min: -150, max: -30 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: 0xd4a574, // Dusty brown
      lifespan: 400,
      quantity: 12,
      emitting: false,
    });
    dustParticles.setDepth(9);

    // Spawn animation - drop from sky with bounce
    this.scene.tweens.add({
      targets: this.scene.localPlayer,
      y: y,
      alpha: 1,
      scale: targetScale,
      duration: 500,
      ease: "Bounce.easeOut",
      onStart: () => {
        spawnParticles.emitParticle(20);
      },
      onComplete: () => {
        dustParticles.emitParticle(12);

        // Squash effect on landing
        this.scene.tweens.add({
          targets: this.scene.localPlayer,
          scaleX: targetScale * 1.15,
          scaleY: targetScale * 0.85,
          duration: 80,
          yoyo: true,
          ease: "Sine.easeInOut",
        });

        // Cleanup particles
        this.scene.time.delayedCall(800, () => {
          spawnParticles.destroy();
          dustParticles.destroy();
        });
      },
    });
  }

  playIrisIn(cx: number, cy: number): void {
    // Clean up any previous iris
    if (this.irisGraphics) {
      this.scene.cameras.main.clearMask();
      this.irisGraphics.destroy();
      this.irisGraphics = null;
    }

    const maxRadius = Math.max(GAME_WIDTH, GAME_HEIGHT);
    const gfx = this.scene.add.graphics();
    gfx.setDepth(200);
    this.irisGraphics = gfx;

    // Start with a tiny circle at spawn point
    gfx.clear();
    gfx.fillStyle(0xffffff);
    gfx.fillCircle(cx, cy, 1);

    const mask = gfx.createGeometryMask();
    this.scene.cameras.main.setMask(mask);

    // Tween a custom property to drive the radius
    const proxy = { radius: 1 };
    this.scene.tweens.add({
      targets: proxy,
      radius: maxRadius,
      duration: 700,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        gfx.clear();
        gfx.fillStyle(0xffffff);
        gfx.fillCircle(cx, cy, proxy.radius);
      },
      onComplete: () => {
        this.scene.cameras.main.clearMask();
        gfx.destroy();
        if (this.irisGraphics === gfx) {
          this.irisGraphics = null;
        }
      },
    });
  }

  exitWorld(): void {
    if (!this.scene.playerEnabled || !this.scene.localPlayer) return;

    this.scene.playerEnabled = false;

    // Disable tap-to-move on mobile
    this.disableTapToMove();

    // Play exit sound
    this.scene.audioSystem.playExitSfx();

    // Stop camera follow and zoom back to overview
    if (this.scene.cameraFollowing) {
      this.scene.cameras.main.stopFollow();
      this.scene.cameraFollowing = false;
      this.scene.cameras.main.zoomTo(1.0, 500, "Sine.easeInOut");
      this.scene.time.delayedCall(500, () => {
        this.scene.cameras.main.scrollX = 0;
        this.scene.cameras.main.scrollY = 0;
      });
    }

    // Clean up iris if mid-animation
    if (this.irisGraphics) {
      this.scene.cameras.main.clearMask();
      this.irisGraphics.destroy();
      this.irisGraphics = null;
    }

    // Capture references before nulling — the fade-out tween needs the sprite
    const exitingPlayer = this.scene.localPlayer;
    const textureKeysToClean = [...this.scene.localPlayerTextureKeys];
    this.scene.localPlayer = null; // Null immediately so re-entry is safe during fade
    this.scene.localPlayerTextureKeys = [];
    this.playerVelocity = { x: 0, y: 0 };
    this.nearbyNPC = null;
    this.nearbyBuilding = null;
    this.scene.pendingEnterWorld = null;
    if (this.scene.interactPrompt) {
      this.scene.interactPrompt.setVisible(false);
    }

    // Clean up name label if present (for meme sprites)
    const nameLabel = (exitingPlayer as any).nameLabel as Phaser.GameObjects.Text | undefined;
    if (nameLabel) {
      nameLabel.destroy();
    }

    // Capture player drop shadow so the fade-out tween can also fade and
    // destroy it together with the sprite. Stored on sprite as _shadow.
    const exitingShadow = (exitingPlayer as any)._shadow as Phaser.GameObjects.Sprite | undefined;
    (exitingPlayer as any)._shadow = null;

    // Camera fade out
    this.scene.cameras.main.fade(300, 0, 0, 0);

    // Fade the shadow out alongside the player so it doesn't pop
    if (exitingShadow) {
      this.scene.tweens.add({
        targets: exitingShadow,
        alpha: 0,
        duration: 300,
        ease: "Cubic.easeIn",
        onComplete: () => exitingShadow.destroy(),
      });
    }

    // Fade out animation on the captured sprite
    this.scene.tweens.add({
      targets: exitingPlayer,
      alpha: 0,
      scale: 0.5,
      duration: 300,
      ease: "Cubic.easeIn",
      onComplete: () => {
        exitingPlayer.destroy();
        // Clean up meme player textures to prevent memory leak (~4MB each)
        for (const key of textureKeysToClean) {
          if (this.scene.textures.exists(key)) {
            this.scene.textures.remove(key);
          }
        }
        // Reset camera FX after fade completes
        this.scene.cameras.main.resetFX();
      },
    });

    // Notify React that player exited
    window.dispatchEvent(new CustomEvent("agencity-player-exited"));
  }

  createInteractPrompt(): void {
    // Create a container for the interaction prompt
    this.scene.interactPrompt = this.scene.add.container(0, 0);
    this.scene.interactPrompt.setDepth(150);
    this.scene.interactPrompt.setVisible(false);

    const promptText = this.scene.isMobile ? "Tap to talk" : "Press E to talk";
    const pillWidth = this.scene.isMobile ? 100 : 120;

    // Background pill
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x000000, 0.8);
    bg.fillRoundedRect(-pillWidth / 2, -15, pillWidth, 30, 8);
    this.scene.interactPrompt.add(bg);

    // Text
    const text = this.scene.add.text(0, 0, promptText, {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#ffffff",
    });
    text.setOrigin(0.5, 0.5);
    this.scene.interactPrompt.add(text);

    // On mobile, make the prompt tappable to trigger interaction
    // Uses pointerup + drag guard to prevent accidental triggers while panning
    if (this.scene.isMobile) {
      const hitArea = this.scene.add.rectangle(0, 0, pillWidth + 20, 50, 0x000000, 0);
      hitArea.setInteractive({ useHandCursor: true });
      hitArea.on("pointerup", () => {
        if (this.scene.wasDragGesture) return;
        if (this.nearbyNPC) {
          this.interactWithNPC(this.nearbyNPC);
        } else if (this.nearbyBuilding) {
          this.interactWithBuilding(this.nearbyBuilding);
        }
      });
      this.scene.interactPrompt.add(hitArea);
    }
  }

  // === TAP-TO-MOVE (mobile) ===

  setupTapToMove(): void {
    if (!this.scene.isMobile) return;

    this.scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.scene.playerEnabled) return;
      if (this.scene.wasDragGesture) return;
      if ((window as any).__agencity_modal_open) return;
      if (this.scene.isTransitioning) return;
      if (this.scene.encounterSystem.encounterActive) return;
      if (this.tapMoveSuppressed) return;

      // Long-press to sprint: any press held >= LONG_PRESS_SPRINT_MS releases as sprint
      const heldMs = Date.now() - this.scene.touchStartTime;
      const sprint = heldMs >= 250 // LONG_PRESS_SPRINT_MS;

      const hitObjects = this.scene.input.hitTestPointer(pointer);

      // Check if tap hit a building
      for (const obj of hitObjects) {
        const buildingId = (obj as any)._buildingId as string | undefined;
        if (buildingId) {
          const building = this.scene.buildingById.get(buildingId);
          const container = obj as Phaser.GameObjects.Container;
          if (building && this.scene.localPlayer) {
            const dx = Math.abs(this.scene.localPlayer.x - container.x);
            if (dx > 150) {
              // Far — walk there, interact on arrival
              this.scene.moveTarget = { x: container.x, sprint };
              this.scene.moveTargetBuilding = building;
              this.scene.moveTargetNPC = null;
              this.showTapMarker(container.x, sprint);
              this.kickStartMovement(container.x, sprint);
            }
            // Close — the building's own pointerup handler opens the modal
          }
          return;
        }
      }

      // Check if tap hit an NPC
      for (const obj of hitObjects) {
        const characterId = (obj as any)._characterId as string | undefined;
        if (characterId) {
          const sprite = this.scene.characterSprites.get(characterId);
          if (sprite && this.scene.localPlayer) {
            const dx = Math.abs(this.scene.localPlayer.x - sprite.x);
            if (dx > 150) {
              this.scene.moveTarget = { x: sprite.x, sprint };
              this.scene.moveTargetNPC =
                this.scene.worldState?.population?.find((c: GameCharacter) => c.id === characterId) ||
                null;
              this.scene.moveTargetBuilding = null;
              this.showTapMarker(sprite.x, sprint);
              this.kickStartMovement(sprite.x, sprint);
            }
          }
          return;
        }
      }

      // Check if tap hit the player sprite — stop
      if (this.scene.localPlayer && hitObjects.includes(this.scene.localPlayer)) {
        this.scene.moveTarget = null;
        this.scene.moveTargetBuilding = null;
        this.scene.moveTargetNPC = null;
        this.hideTapMarker();
        return;
      }

      // Tap on empty ground — walk to world X position
      const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const targetX = Phaser.Math.Clamp(worldPoint.x, 40, GAME_WIDTH - 40);
      this.scene.moveTarget = { x: targetX, sprint };
      this.scene.moveTargetBuilding = null;
      this.scene.moveTargetNPC = null;
      this.showTapMarker(targetX, sprint);
      this.kickStartMovement(targetX, sprint);
    });
  }


  kickStartMovement(targetX: number, sprint: boolean): void {
    if (!this.scene.localPlayer) return;
    const dx = targetX - this.scene.localPlayer.x;
    const baseSpeed = sprint ? this.PLAYER_SPRINT_SPEED : this.PLAYER_WALK_SPEED;
    this.playerVelocity.x = Math.sign(dx) * baseSpeed * 0.5;
  }

  // Persistent destination marker — single reusable container that stays visible
  // until arrival or until the next tap repositions it. Color encodes sprint vs walk.
  showTapMarker(worldX: number, sprint: boolean): void {
    if (!this.scene.localPlayer) return;

    // Lazy-create the marker container once and reuse it forever
    if (!this.scene.tapMarker) {
      const container = this.scene.add.container(worldX, Y.PATH_LEVEL);
      container.setDepth(15);

      const ring = this.scene.add.graphics();
      const dot = this.scene.add.graphics();
      const arrow = this.scene.add.text(0, -18, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#4ade80",
      });
      arrow.setOrigin(0.5, 0.5);

      container.add(ring);
      container.add(dot);
      container.add(arrow);

      (container as any)._ring = ring;
      (container as any)._dot = dot;
      (container as any)._arrow = arrow;

      this.scene.tapMarker = container;

      // Subtle infinite pulse so the marker reads as alive
      this.scene.tweens.add({
        targets: container,
        scaleX: { from: 1.0, to: 1.18 },
        scaleY: { from: 1.0, to: 1.18 },
        alpha: { from: 0.95, to: 0.55 },
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    const ring = (this.scene.tapMarker as any)._ring as Phaser.GameObjects.Graphics;
    const dot = (this.scene.tapMarker as any)._dot as Phaser.GameObjects.Graphics;
    const arrow = (this.scene.tapMarker as any)._arrow as Phaser.GameObjects.Text;

    // Sprint = amber (#fbbf24), walk = green (#4ade80)
    const color = sprint ? 0xfbbf24 : 0x4ade80;
    const colorHex = sprint ? "#fbbf24" : "#4ade80";
    const radius = sprint ? 13 : 11;

    ring.clear();
    ring.lineStyle(sprint ? 3 : 2, color, 0.95);
    ring.strokeCircle(0, 0, radius);
    ring.fillStyle(color, 0.18);
    ring.fillCircle(0, 0, radius);

    dot.clear();
    dot.fillStyle(color, 1);
    dot.fillCircle(0, 0, 3);

    arrow.setColor(colorHex);
    arrow.setText(sprint ? "\u25be\u25be" : "\u25be");

    this.scene.tapMarker.setPosition(worldX, Y.PATH_LEVEL);
    this.scene.tapMarker.setVisible(true);
  }

  // Hide the persistent tap marker (called on arrival, stop-tap, or world exit)
  hideTapMarker(): void {
    if (this.scene.tapMarker) {
      this.scene.tapMarker.setVisible(false);
    }
  }

  arriveAtMoveTarget(): void {
    if (this.scene.moveTargetBuilding) {
      this.interactWithBuilding(this.scene.moveTargetBuilding);
    } else if (this.scene.moveTargetNPC) {
      this.interactWithNPC(this.scene.moveTargetNPC);
    }
    this.scene.moveTarget = null;
    this.scene.moveTargetBuilding = null;
    this.scene.moveTargetNPC = null;
    this.hideTapMarker();
  }

  enableTapToMove(): void {
    if (!this.scene.isMobile) return;
    this.scene.mobileDragPanEnabled = false;
    // Suppress taps for 800ms while zoom animation plays
    this.tapMoveSuppressed = true;
    this.scene.time.delayedCall(800, () => {
      this.tapMoveSuppressed = false;
    });
  }

  disableTapToMove(): void {
    if (!this.scene.isMobile) return;
    this.scene.moveTarget = null;
    this.scene.moveTargetBuilding = null;
    this.scene.moveTargetNPC = null;
    this.scene.mobileDragPanEnabled = true;
    this.hideTapMarker();
  }

  updateLocalPlayer(): void {
    if (!this.scene.localPlayer || !this.scene.playerEnabled) return;

    // Skip all movement when a modal (arcade, casino, etc.) is open
    if ((window as any).__agencity_modal_open) return;

    // Skip movement when stunned (after encounter loss) or in encounter
    if (this.scene.encounterSystem.playerStunned || this.scene.encounterSystem.encounterActive) return;

    // Skip WASD movement when a text input or textarea is focused (chat boxes, modals, etc.)
    const activeTag = document.activeElement?.tagName;
    const isTyping = activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";

    // Get input state — keyboard (desktop) or tap-to-move (mobile)
    let inputX = 0;
    let inputY = 0;
    let sprinting = false;
    let interact = false;

    if (this.scene.isMobile && this.scene.moveTarget && this.scene.localPlayer) {
      // Mobile: derive input from tap-to-move target. Sprint intent is set at
      // press time (long-press = sprint) — not from distance, which made every
      // medium tap accidentally sprint.
      const dx = this.scene.moveTarget.x - this.scene.localPlayer.x;
      if (Math.abs(dx) < 20) {
        this.arriveAtMoveTarget();
      } else {
        inputX = dx > 0 ? 1 : -1;
        sprinting = this.scene.moveTarget.sprint;
      }
    } else if (!this.scene.isMobile) {
      // Desktop: read from keyboard
      const left = this.cursors?.left.isDown || (!isTyping && this.wasdKeys?.A.isDown) || false;
      const right = this.cursors?.right.isDown || (!isTyping && this.wasdKeys?.D.isDown) || false;
      const up = this.cursors?.up.isDown || (!isTyping && this.wasdKeys?.W.isDown) || false;
      const down = this.cursors?.down.isDown || (!isTyping && this.wasdKeys?.S.isDown) || false;
      sprinting = this.sprintKey?.isDown || false;

      if (left) inputX = -1;
      else if (right) inputX = 1;
      if (up) inputY = -1;
      else if (down) inputY = 1;
    }

    // Prefer the window-level E-key tracker; fall back to Phaser's JustDown.
    interact = !isTyping && (this.eKeyPressed || (this.wasdKeys?.E ? Phaser.Input.Keyboard.JustDown(this.wasdKeys.E) : false));
    this.eKeyPressed = false;

    // Apply acceleration based on input (natural walking feel)
    const accel = sprinting ? this.PLAYER_SPRINT_ACCELERATION : this.PLAYER_ACCELERATION;
    if (inputX !== 0) {
      this.playerVelocity.x += inputX * accel;
    } else {
      // Apply friction when no input
      this.playerVelocity.x *= this.PLAYER_FRICTION;
    }

    if (inputY !== 0) {
      this.playerVelocity.y += inputY * accel;
    } else {
      this.playerVelocity.y *= this.PLAYER_FRICTION;
    }

    // Clamp velocity by vector magnitude (prevents diagonal sprint being ~41% faster)
    const maxSpeed = sprinting ? this.PLAYER_SPRINT_SPEED : this.PLAYER_WALK_SPEED;
    const mag = Math.sqrt(
      this.playerVelocity.x * this.playerVelocity.x + this.playerVelocity.y * this.playerVelocity.y
    );
    if (mag > maxSpeed) {
      const scale = maxSpeed / mag;
      this.playerVelocity.x *= scale;
      this.playerVelocity.y *= scale;
    }

    // Stop completely if velocity is very small
    if (Math.abs(this.playerVelocity.x) < 0.1) this.playerVelocity.x = 0;
    if (Math.abs(this.playerVelocity.y) < 0.1) this.playerVelocity.y = 0;

    // Apply velocity
    this.scene.localPlayer.x += this.playerVelocity.x;
    this.scene.localPlayer.y += this.playerVelocity.y;

    // Keep drop shadow planted under the player
    this.scene.syncShadow(this.scene.localPlayer);

    // Flip sprite based on movement direction
    if (this.playerVelocity.x < -0.1) {
      this.scene.localPlayer.setFlipX(true);
    } else if (this.playerVelocity.x > 0.1) {
      this.scene.localPlayer.setFlipX(false);
    }

    // Walking animation - use sprite sheet animation if available, otherwise bob
    // Use appropriate base scale based on sprite type
    const baseScale = this.playerSpriteVariant === -1 ? 0.15 : 1.4; // Custom meme sprites are larger images
    const isMoving = Math.abs(this.playerVelocity.x) > 0.2 || Math.abs(this.playerVelocity.y) > 0.2;
    const hasWalkAnim = (this.scene.localPlayer as any).hasWalkAnim;
    const walkAnimKey = (this.scene.localPlayer as any).walkAnimKey;

    if (isMoving) {
      // If we have a walk animation sprite sheet, play it
      if (hasWalkAnim && walkAnimKey) {
        // Make sure we're using the walk sprite sheet texture
        const walkTextureKey = (this.scene.localPlayer as any).walkTextureKey;
        if (
          walkTextureKey &&
          this.scene.localPlayer.texture.key !== walkTextureKey &&
          this.scene.textures.exists(walkTextureKey)
        ) {
          this.scene.localPlayer.setTexture(walkTextureKey);
        }
        if (
          !this.scene.localPlayer.anims.isPlaying ||
          this.scene.localPlayer.anims.currentAnim?.key !== walkAnimKey
        ) {
          this.scene.localPlayer.play(walkAnimKey);
        }
        // Still apply subtle bob for extra life
        this.playerWalkCycle += sprinting ? 0.3 : 0.15;
        const bobAmount = Math.sin(this.playerWalkCycle) * 2;
        this.scene.localPlayer.setOrigin(0.5, 1 - bobAmount / 50);
        this.scene.localPlayer.setScale(baseScale);
        this.scene.localPlayer.setRotation(0);
      } else {
        // No sprite sheet - use procedural bob animation
        this.playerWalkCycle += sprinting ? 0.45 : 0.25; // Animation speed
        // Vertical bob (subtle hop)
        const bobAmount = Math.sin(this.playerWalkCycle) * 3;
        this.scene.localPlayer.setOrigin(0.5, 1 - bobAmount / 50);
        // Slight squash/stretch for bounce feel
        const squash = 1 + Math.sin(this.playerWalkCycle * 2) * 0.03;
        this.scene.localPlayer.setScale(baseScale * squash, baseScale / squash);
        // Subtle rotation for swagger
        const tilt = Math.sin(this.playerWalkCycle) * 0.02;
        this.scene.localPlayer.setRotation(tilt);
      }
    } else {
      // Reset to idle pose
      if (hasWalkAnim) {
        this.scene.localPlayer.stop();
        // Switch back to the original idle character texture
        const idleTextureKey = (this.scene.localPlayer as any).idleTextureKey;
        if (idleTextureKey && this.scene.textures.exists(idleTextureKey)) {
          this.scene.localPlayer.setTexture(idleTextureKey);
        }
      }
      this.playerWalkCycle = 0;
      this.scene.localPlayer.setOrigin(0.5, 1);
      this.scene.localPlayer.setScale(baseScale);
      this.scene.localPlayer.setRotation(0);
    }

    // Clamp Y to path area (characters walk on the path)
    const pathLevel = Y.PATH_LEVEL;
    const pathMargin = Math.round(30 * SCALE);
    this.scene.localPlayer.y = Phaser.Math.Clamp(
      this.scene.localPlayer.y,
      pathLevel - pathMargin,
      pathLevel + pathMargin
    );

    // Sync name label position if present (for meme sprites)
    const nameLabel = (this.scene.localPlayer as any).nameLabel as Phaser.GameObjects.Text | undefined;
    if (nameLabel) {
      nameLabel.setPosition(this.scene.localPlayer.x, this.scene.localPlayer.y + 10);
    }

    // Emit player position for tutorial spotlight system
    if (isMoving) {
      window.dispatchEvent(
        new CustomEvent("agencity-player-position", {
          detail: { x: this.scene.localPlayer.x, y: this.scene.localPlayer.y },
        })
      );
    }

    // Keep tutorial arrow positions synced with NPC sprites
    if (this.tutorialStep === 1 && this.tutorialArrows.length > 0) {
      this.updateTutorialArrows();
    }

    // Check zone boundaries for transition
    this.checkZoneBoundaries();

    // Check NPC and building proximity for interaction
    this.checkProximityForInteraction();

    // Check for wild creature encounters
    this.scene.encounterSystem.checkCreatureEncounters();

    // Handle E key interaction (NPCs take priority over helper, helper over buildings)
    if (interact) {
      if (this.nearbyNPC) {
        this.interactWithNPC(this.nearbyNPC);
      } else if (this.nearbyHelper) {
        this.talkToHelper();
      } else if (this.nearbyBuilding) {
        this.interactWithBuilding(this.nearbyBuilding);
      }
    }
  }

  initTutorialListener(): void {
    // Store the bound handler so it can be removed on shutdown (was previously
    // an inline anonymous listener that leaked across scene re-mounts).
    this.scene.boundTutorialStep = ((e: CustomEvent<{ step: number }>) => {
      const prev = this.tutorialStep;
      this.tutorialStep = e.detail.step;

      // Clean up arrows when leaving step 1 or when tutorial ends
      if (prev === 1 && this.tutorialStep !== 1) {
        this.clearTutorialArrows();
      }

      // Add bouncing arrows above all NPCs when entering step 1
      if (this.tutorialStep === 1 && prev !== 1) {
        this.showTutorialNpcArrows();
      }
    }) as EventListener;
    window.addEventListener("agencity-tutorial-step", this.scene.boundTutorialStep);
  }

  showTutorialNpcArrows(): void {
    this.clearTutorialArrows();
    this.scene.characterSprites.forEach((sprite) => {
      if (!sprite.visible) return;
      const arrow = this.scene.add.text(sprite.x, sprite.y - 45, "\u25BC", {
        fontSize: "18px",
        color: "#22c55e",
        fontFamily: "monospace",
      });
      arrow.setOrigin(0.5, 1);
      arrow.setDepth(200);
      this.scene.tweens.add({
        targets: arrow,
        y: sprite.y - 55,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      (arrow as any)._tutorialTarget = sprite;
      this.tutorialArrows.push(arrow);
    });
  }

  updateTutorialArrows(): void {
    for (const arrow of this.tutorialArrows) {
      const target = (arrow as any)._tutorialTarget as Phaser.GameObjects.Sprite;
      if (target && target.active) {
        arrow.setX(target.x);
      }
    }
  }

  clearTutorialArrows(): void {
    for (const arrow of this.tutorialArrows) {
      this.scene.tweens.killTweensOf(arrow);
      arrow.destroy();
    }
    this.tutorialArrows = [];
  }

  checkZoneBoundaries(): void {
    if (!this.scene.localPlayer || this.scene.isTransitioning) return;

    const x = this.scene.localPlayer.x;
    const leftEdge = 40;
    const rightEdge = GAME_WIDTH - 40;

    // Zone order: labs -> moltbook -> main_city -> trending -> ballers -> founders (left to right)
    const zoneOrder: ZoneType[] = [
      "labs",
      "moltbook",
      "main_city",
      "trending",
      "ballers",
      "founders",
    ];
    const currentIndex = zoneOrder.indexOf(this.scene.currentZone);

    if (currentIndex === -1) return; // Safety: unknown zone

    if (x <= leftEdge && currentIndex > 0) {
      // Transition to previous zone
      const prevZone = zoneOrder[currentIndex - 1];
      this.playerTriggerZoneChange(prevZone, "left");
    } else if (x >= rightEdge && currentIndex < zoneOrder.length - 1) {
      // Transition to next zone
      const nextZone = zoneOrder[currentIndex + 1];
      this.playerTriggerZoneChange(nextZone, "right");
    }
  }

  playerTriggerZoneChange(zone: ZoneType, direction: "left" | "right"): void {
    // Dispatch zone change event marked as a walk so the router bridge can update the URL.
    window.dispatchEvent(
      new CustomEvent("agencity-zone-change", { detail: { zone, source: "walk", direction } })
    );

    // Move player to opposite edge after transition
    if (this.scene.localPlayer) {
      if (direction === "left") {
        this.scene.localPlayer.x = GAME_WIDTH - 80; // Appear on right side of new zone
      } else {
        this.scene.localPlayer.x = 80; // Appear on left side of new zone
      }
      // Reset velocity on zone change
      this.playerVelocity.x = 0;
      this.playerVelocity.y = 0;
    }
  }

  checkProximityForInteraction(): void {
    if (!this.scene.localPlayer) return;

    const npcRadius = 80; // Pixels - must be close to interact with NPC
    const buildingRadius = 120; // Larger radius for buildings (X distance only)

    // Check NPCs first (they take priority)
    const npcResult: {
      npc: GameCharacter | null;
      dist: number;
      pos: { x: number; y: number } | null;
    } = {
      npc: null,
      dist: Infinity,
      pos: null,
    };

    this.scene.characterSprites.forEach((sprite, id) => {
      const character = this.scene.characterById.get(id);
      if (!character) return;

      const dist = Phaser.Math.Distance.Between(
        this.scene.localPlayer!.x,
        this.scene.localPlayer!.y,
        sprite.x,
        sprite.y
      );

      if (dist < npcRadius && dist < npcResult.dist) {
        npcResult.dist = dist;
        npcResult.npc = character;
        npcResult.pos = { x: sprite.x, y: sprite.y };
      }
    });

    this.nearbyNPC = npcResult.npc;

    // NPC Awareness: greet player on first approach
    if (this.nearbyNPC && this.nearbyNPC !== this.scene.previousNearbyNPC) {
      this.scene.characterSystem.triggerNPCGreeting(this.nearbyNPC);
    }
    this.scene.previousNearbyNPC = this.nearbyNPC;

    // Check buildings (only if no NPC nearby)
    // Buildings are positioned higher on screen, so use X distance primarily
    const buildingResult: {
      building: GameBuilding | null;
      dist: number;
      pos: { x: number; y: number } | null;
    } = {
      building: null,
      dist: Infinity,
      pos: null,
    };

    if (!this.nearbyNPC) {
      this.scene.buildingSprites.forEach((container, id) => {
        // Skip if container is not visible (wrong zone)
        if (!container.visible) return;

        // Find the building data (O(1) map lookup instead of O(n) array scan)
        const building = this.scene.buildingById.get(id);
        if (!building) return;

        // Skip starter buildings (they're non-interactive)
        if (building.id.startsWith("Starter")) return;

        // Use horizontal distance only - buildings are above the walking path
        const xDist = Math.abs(this.scene.localPlayer!.x - container.x);

        if (xDist < buildingRadius && xDist < buildingResult.dist) {
          buildingResult.dist = xDist;
          buildingResult.building = building;
          buildingResult.pos = { x: container.x, y: container.y };
        }
      });

      // Also check zone-specific popup buildings (HQ, Arcade, Proof, Earnings, Trust)
      this.scene.zonePopupBuildings.forEach((entry, id) => {
        if (entry.zone !== this.scene.currentZone || !entry.sprite.active || !entry.sprite.visible) return;
        const xDist = Math.abs(this.scene.localPlayer!.x - entry.sprite.x);
        if (xDist < buildingRadius && xDist < buildingResult.dist) {
          buildingResult.dist = xDist;
          buildingResult.building = entry.data;
          buildingResult.pos = { x: entry.sprite.x, y: entry.sprite.y };
        }
      });
    }

    this.nearbyBuilding = buildingResult.building;

    // Check helper NPC (only in the city)
    this.nearbyHelper = false;
    if (!this.nearbyNPC && this.scene.helperNPC && this.scene.helperNPC.active && this.scene.helperNPC.visible) {
      const helperDist = Phaser.Math.Distance.Between(
        this.scene.localPlayer!.x,
        this.scene.localPlayer!.y,
        this.scene.helperNPC.x,
        this.scene.helperNPC.y
      );
      if (helperDist < npcRadius) {
        this.nearbyHelper = true;
      }
    }

    // Update interact prompt visibility and position
    if (this.scene.interactPrompt) {
      // On mobile, the floating interact button replaces the text prompt
      if (this.scene.isMobile) {
        this.scene.interactPrompt.setVisible(false);
      } else if (npcResult.npc && npcResult.pos) {
        this.updateInteractPromptText("Press E to talk");
        this.scene.interactPrompt.setVisible(true);
        this.scene.interactPrompt.setPosition(npcResult.pos.x, npcResult.pos.y - 70);
      } else if (this.nearbyHelper && this.scene.helperNPC) {
        this.updateInteractPromptText("Press E to talk");
        this.scene.interactPrompt.setVisible(true);
        this.scene.interactPrompt.setPosition(this.scene.helperNPC.x, this.scene.helperNPC.y - 70);
      } else if (buildingResult.building && buildingResult.pos) {
        this.updateInteractPromptText("Press E to enter");
        this.scene.interactPrompt.setVisible(true);
        this.scene.interactPrompt.setPosition(buildingResult.pos.x, buildingResult.pos.y - 120);
      } else {
        this.scene.interactPrompt.setVisible(false);
      }
    }
  }

  updateInteractPromptText(text: string): void {
    if (!this.scene.interactPrompt) return;
    const textObj = this.scene.interactPrompt.list[1] as Phaser.GameObjects.Text;
    if (textObj && textObj.setText) {
      textObj.setText(text);
    }
  }

  interactWithNPC(character: GameCharacter): void {
    this.scene.audioSystem.playInteractSfx();

    // Simulate the exact same click behavior as pointerdown handlers
    // This matches the logic in createCharacterSprite

    const isExternalAgent =
      character.id.startsWith("external-") || character.id.startsWith("agent-");

    if (isExternalAgent) {
      // Show tooltip with "Visit Profile" button instead of navigating directly
      const sprite = this.scene.characterSprites.get(character.id);
      if (sprite) {
        this.scene.tooltipSystem.showCharacterTooltip(character, sprite);
      }
    } else if (character.isToly) {
      window.dispatchEvent(new CustomEvent("agencity-toly-click"));
    } else if (character.isAsh) {
      window.dispatchEvent(new CustomEvent("agencity-ash-click"));
    } else if (character.isFinn) {
      window.dispatchEvent(new CustomEvent("agencity-finn-click"));
    } else if (character.isDev) {
      window.dispatchEvent(new CustomEvent("agencity-dev-click"));
    } else if (character.isScout) {
      window.dispatchEvent(new CustomEvent("agencity-scout-click"));
    } else if (character.isCJ) {
      window.dispatchEvent(new CustomEvent("agencity-cj-click"));
    } else if (character.isShaw) {
      window.dispatchEvent(new CustomEvent("agencity-shaw-click"));
    } else if (character.isRamo) {
      window.dispatchEvent(new CustomEvent("agencity-ramo-click"));
    } else if (character.isSincara) {
      window.dispatchEvent(new CustomEvent("agencity-sincara-click"));
    } else if (character.isStuu) {
      window.dispatchEvent(new CustomEvent("agencity-stuu-click"));
    } else if (character.isSam) {
      window.dispatchEvent(new CustomEvent("agencity-sam-click"));
    } else if (character.isAlaa) {
      window.dispatchEvent(new CustomEvent("agencity-alaa-click"));
    } else if (character.isCarlo) {
      window.dispatchEvent(new CustomEvent("agencity-carlo-click"));
    } else if (character.isBNN) {
      window.dispatchEvent(new CustomEvent("agencity-bnn-click"));
    } else if (character.isProfessorOak) {
      window.dispatchEvent(new CustomEvent("agencity-professoroak-click"));
    } else if (character.isCityBot) {
      window.dispatchEvent(new CustomEvent("agencity-citybot-click"));
    } else if (character.profileUrl) {
      // Show tooltip with "Visit Profile" button instead of navigating directly
      const sprite = this.scene.characterSprites.get(character.id);
      if (sprite) {
        this.scene.tooltipSystem.showCharacterTooltip(character, sprite);
      }
    }
  }

  interactWithBuilding(building: GameBuilding): void {
    this.scene.audioSystem.playBuildingClickSfx();

    // Zone-specific popup buildings have their own click handlers registered
    // in zonePopupBuildings. Use that callback if available.
    const zonePopup = this.scene.zonePopupBuildings.get(building.id);
    if (zonePopup) {
      this.scene.audioSystem.playBuildingClickBurst(zonePopup.sprite.x, zonePopup.sprite.y - 60);
      zonePopup.onInteract();
      return;
    }

    // Visual feedback at the building's visible center. This path has no
    // pointer event (proximity E-press or tap-to-move arrival), so derive
    // the position from the sprite container itself.
    const sprite = this.scene.buildingSprites.get(building.id);
    if (sprite) {
      // Containers anchor at the bottom (origin 0.5, 1) — offset upward by
      // half the hitbox height (~60–100px) so the burst sits over the body
      // of the building, not at its feet.
      this.scene.audioSystem.playBuildingClickBurst(sprite.x, sprite.y - 60);
    }

    // Simulate the exact same click behavior as building pointerdown handlers
    const isPokeCenter = building.id.includes("PokeCenter");
    const isCasino = building.id.includes("Casino");
    const isArcade = building.id.includes("Arcade") || building.symbol === "ARCADE";
    const isStarterBuilding = building.id.startsWith("Starter");
    const isTreasuryBuilding = building.id.startsWith("Treasury");
    const isAgenCityHQ = building.isFloating || building.symbol === "AGENCITY";
    const isMansionBuilding = building.isMansion;

    if (isMansionBuilding) {
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
      window.dispatchEvent(
        new CustomEvent("agencity-pokecenter-click", {
          detail: { buildingId: building.id, name: building.name },
        })
      );
    } else if (isCasino) {
      window.dispatchEvent(
        new CustomEvent("agencity-casino-click", {
          detail: { buildingId: building.id, name: building.name },
        })
      );
    } else if (isArcade) {
      window.dispatchEvent(
        new CustomEvent("agencity-arcade-click", {
          detail: { buildingId: building.id, name: building.name },
        })
      );
    } else if (isAgenCityHQ) {
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
    } else if (isStarterBuilding) {
      // Starter buildings do nothing - they're placeholders
    } else if (isTreasuryBuilding) {
      window.dispatchEvent(
        new CustomEvent("agencity-treasury-click", {
          detail: { buildingId: building.id, name: building.name },
        })
      );
    } else {
      // Regular token buildings
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
  }
}
