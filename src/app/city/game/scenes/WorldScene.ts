import * as Phaser from "phaser";
import type {
  WorldState,
  GameCharacter,
  GameBuilding,
  ZoneType,
  BuildingStatus,
} from "@/city/lib/types";
import { ECOSYSTEM_CONFIG } from "@/city/lib/config";
import { extractBattleTextures } from "@/city/lib/texture-bridge";
import { SpeechBubbleManager } from "@/city/lib/speech-bubble-manager";
import type { DialogueLine } from "@/city/lib/autonomous-dialogue";
import { getCurrentLine, getActiveConversation } from "@/city/lib/autonomous-dialogue";
import { useGameStore } from "@/city/lib/store";
import { SCALE, DEPTH, Y } from "../textures/constants";
import { AudioSystem } from "../systems/AudioSystem";
import { TooltipSystem } from "../systems/TooltipSystem";
import { EventEffectSystem } from "../systems/EventEffectSystem";
import { SkySystem } from "../systems/SkySystem";
import { DecorationSystem } from "../systems/DecorationSystem";
import { CharacterSystem } from "../systems/CharacterSystem";
import { BuildingSystem } from "../systems/BuildingSystem";
import { EncounterSystem } from "../systems/EncounterSystem";
import { AgentSystem } from "../systems/AgentSystem";
import { DialogueSystem } from "../systems/DialogueSystem";
import {
  setupTrendingZone,
  clearTrafficTimers,
  setupBallersZone,
  setupFoundersZone,
  setupLabsZone,
  setupMoltbookZone,
  setupArenaZone,
  disconnectArena,
  setupAscensionZone,
  disconnectAscension,
  setupMainCityZone,
} from "../zones";
const GAME_WIDTH = 1280;
const GAME_HEIGHT = 960;

/** All character glow sprite property keys — single source of truth */
const GLOW_KEYS = [
  "tolyGlow",
  "ashGlow",
  "finnGlow",
  "devGlow",
  "scoutGlow",
  "cjGlow",
  "shawGlow",
  "ramoGlow",
  "sincaraGlow",
  "stuuGlow",
  "samGlow",
  "alaaGlow",
  "carloGlow",
  "bnnGlow",
  "professorOakGlow",
  "citybotGlow",
  "openClawGlow",
] as const;

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
  baseY: number; // Store base Y position for this Pokemon
}

// Beach crabs/lobsters - external agents that wander MoltBeach
interface BeachCrab {
  characterId: string;
  sprite: Phaser.GameObjects.Sprite;
  targetX: number;
  speed: number;
  direction: "left" | "right";
  idleTimer: number;
  isIdle: boolean;
  baseY: number;
  isLobster: boolean; // Moltbook agents are lobsters, others are crabs
}

export class WorldScene extends Phaser.Scene {
  public worldState: WorldState | null = null;
  public characterSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private characterVariants: Map<string, number> = new Map(); // Store which variant each character uses
  public buildingSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  public buildingById: Map<string, GameBuilding> = new Map(); // O(1) lookup for proximity checks
  public buildingInitialized: Set<string> = new Set(); // Track which buildings have been created

  // Zone-specific popup buildings (HQ, Arcade, Proof Hall, Earnings Hall, Trust Hall).
  // These are not part of worldState.buildings, so they need a separate registry for
  // E-key / proximity interaction to work reliably.
  public zonePopupBuildings: Map<
    string,
    {
      sprite: Phaser.GameObjects.Sprite;
      data: GameBuilding;
      zone: ZoneType;
      onInteract: () => void;
    }
  > = new Map();
  public clouds: Phaser.GameObjects.Sprite[] = [];
  public decorations: Phaser.GameObjects.Sprite[] = [];
  public animals: Animal[] = [];
  public pokemon: Pokemon[] = []; // Pokemon in Founders zone
  public beachCrabs: BeachCrab[] = []; // External agents wandering MoltBeach
  public ambientCreatures: BeachCrab[] = []; // Ambient crabs/lobsters/hermit crabs (always present)
  public fountainWater: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  public ground!: Phaser.GameObjects.TileSprite;
  public groundPath!: Phaser.GameObjects.TileSprite;
  public groundTransition!: Phaser.GameObjects.Graphics;
  public fireflies: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  public ambientParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  public skyGradient: Phaser.GameObjects.Graphics | null = null;
  public stars: Phaser.GameObjects.Rectangle[] = [];
  public skyClouds: Phaser.GameObjects.Ellipse[] = [];
  public treeline: Phaser.GameObjects.Graphics | null = null;

  /** Procedural music + SFX. Owns the shared AudioContext/GainNode. */
  public audioSystem: AudioSystem = new AudioSystem(this);
  // Back-compat getters so zone files (arena.ts) that reach for the shared
  // audio context keep compiling without referencing private state.
  public get audioContext(): AudioContext | null {
    return this.audioSystem.context;
  }
  public get gainNode(): GainNode | null {
    return this.audioSystem.masterGain;
  }

  /** Character + building hover tooltips. */
  public tooltipSystem: TooltipSystem = new TooltipSystem(this);

  /** Celebrations, fireworks, coin rain, announcements, bot-effect dispatch. */
  public eventEffectSystem: EventEffectSystem = new EventEffectSystem(this);

  /** Ambient life + particles: decorations, clouds, animals, Pokémon, beach
   *  creatures, fountain, pollen, fireflies. */
  public decorationSystem: DecorationSystem = new DecorationSystem(this);

  /** Autonomous NPC behavior: idle activities, walking, greetings. */
  public characterSystem: CharacterSystem = new CharacterSystem(this);

  /** Building sprite lifecycle: create, update, decay visuals, dormant state. */
  public buildingSystem: BuildingSystem = new BuildingSystem(this);

  /** Wild-creature encounter trigger + cooldown + stun glue. */
  public encounterSystem: EncounterSystem = new EncounterSystem(this);

  /** Agent WebSocket glue: connect, world-state poll, command translation. */
  public agentSystem: AgentSystem = new AgentSystem(this);

  /** Character speech-bubble glue (autonomous dialogue + direct speak). */
  public dialogueSystem: DialogueSystem = new DialogueSystem(this);

  /** Sky gradient, stars, time-of-day palette, sun/moon, weather effects.
   *  Constructed in create() once the day/night overlay exists. */
  public skySystem!: SkySystem;

  /** Passthrough so zone setup files can call scene.restoreNormalSky(). */
  public restoreNormalSky(): void {
    this.skySystem.restoreNormalSky();
  }

  /** Passthrough — TooltipSystem derives a status label via the scene. */
  public getStatusFromHealth(health: number): BuildingStatus {
    return this.buildingSystem.getStatusFromHealth(health);
  }

  // ── Decoration passthroughs ─────────────────────────────────────────────
  // React (GameCanvas.tsx) and zone setup files call these on the scene; they
  // delegate to DecorationSystem, which owns the ambient-life methods.
  moveAnimalTo(animalType: Animal["type"], targetX: number): void {
    this.decorationSystem.moveAnimalTo(animalType, targetX);
  }
  petAnimal(animalType: Animal["type"]): void {
    this.decorationSystem.petAnimal(animalType);
  }
  scareAnimal(animalType: Animal["type"]): void {
    this.decorationSystem.scareAnimal(animalType);
  }
  callAnimal(animalType: Animal["type"], targetX: number): void {
    this.decorationSystem.callAnimal(animalType, targetX);
  }
  petPokemon(pokemonType: Pokemon["type"]): void {
    this.decorationSystem.petPokemon(pokemonType);
  }

  // Store bound event handlers for cleanup
  private boundBotEffect: ((e: Event) => void) | null = null;
  private boundBotAnimal: ((e: Event) => void) | null = null;
  private boundBotPokemon: ((e: Event) => void) | null = null;

  // Zone system
  public currentZone: ZoneType = "main_city";
  private isTransitioning = false; // Prevent overlapping transitions
  public trendingElements: Phaser.GameObjects.GameObject[] = [];
  private mainCityElements: Phaser.GameObjects.GameObject[] = [];
  public academyElements: Phaser.GameObjects.GameObject[] = []; // Academy zone elements
  public ballersElements: Phaser.GameObjects.GameObject[] = []; // Ballers Valley zone elements
  public foundersElements: Phaser.GameObjects.GameObject[] = []; // Founder's Corner zone elements
  public labsElements: Phaser.GameObjects.GameObject[] = []; // Tech Labs zone elements
  public moltbookElements: Phaser.GameObjects.GameObject[] = []; // Moltbook Beach zone elements
  public trendingZoneCreated = false; // Cache trending zone elements
  private academyZoneCreated = false; // Cache academy zone elements
  public ballersZoneCreated = false; // Cache ballers zone elements
  public foundersZoneCreated = false; // Cache founders zone elements
  public labsZoneCreated = false; // Cache labs zone elements
  public moltbookZoneCreated = false; // Cache moltbook zone elements
  public arenaElements: Phaser.GameObjects.GameObject[] = []; // Arena zone elements
  public arenaZoneCreated = false; // Cache arena zone elements
  public arenaPollingTimer: Phaser.Time.TimerEvent | null = null; // Polling/replay timer
  public arenaReplayCleanup: (() => void) | null = null; // Replay event listener cleanup
  private localPlayerTextureKeys: string[] = []; // Track meme textures for cleanup
  public arenaCrowdSprites: Phaser.GameObjects.Sprite[] = []; // Crowd sprites for cheer reactions
  public arenaSpotlightCones: Phaser.GameObjects.Sprite[] = []; // Spotlight cone sprites
  public arenaCrowdCheering = false; // Flag to track if crowd is cheering
  public arenaFighters: Map<number, Phaser.GameObjects.Sprite> = new Map(); // Fighter sprites
  public arenaHealthBars: Map<
    number,
    { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle }
  > = new Map();
  public arenaLastHitEffect: Map<number, number> = new Map(); // Track when last hit effect was shown (prevents spam)
  public arenaLastFighterState: Map<number, string> = new Map(); // Track previous state for transition detection
  public arenaComboCount: Map<number, number> = new Map(); // Track combo hits per fighter
  public arenaLastAttacker: number = 0; // Track who attacked last for combo system
  public arenaMatchState: {
    matchId: number;
    status: string;
    fighter1: { id: number; hp: number; maxHp: number; x: number; y: number; state: string };
    fighter2: { id: number; hp: number; maxHp: number; x: number; y: number; state: string };
  } | null = null;
  public ascensionElements: Phaser.GameObjects.GameObject[] = []; // Ascension zone elements
  public ascensionZoneCreated = false; // Cache ascension zone elements
  public foundersPopup: Phaser.GameObjects.Container | null = null; // Popup modal for building info
  public foundersActiveTab: string = "overview"; // Current tab in DexScreener Workshop popup
  public ballersGoldenSky: Phaser.GameObjects.Graphics | null = null; // Golden hour sky for Ballers Valley
  public academyTwilightSky: Phaser.GameObjects.Graphics | null = null; // Magical twilight sky for Academy
  public ascensionCelestialSky: Phaser.GameObjects.Graphics | null = null; // Celestial sky for ascension zone
  public ascensionSkyElements: Phaser.GameObjects.GameObject[] = []; // Stars, motes, auroras, etc.
  public academyMoon: Phaser.GameObjects.Arc | null = null; // Moon for Academy zone
  public academyStars: Phaser.GameObjects.Arc[] = []; // Extra bright stars for Academy
  private boundZoneChange: ((e: Event) => void) | null = null;
  private zoneGround: Phaser.GameObjects.TileSprite | null = null;
  private zonePath: Phaser.GameObjects.TileSprite | null = null;
  public billboardTexts: Phaser.GameObjects.Text[] = [];
  public tickerText: Phaser.GameObjects.Text | null = null;
  public tickerOffset = 0;
  public tickerTimer: Phaser.Time.TimerEvent | null = null;
  public cachedTickerContent: string | null = null;
  public tickerWorldStateVersion = -1;
  public worldStateVersion = 0;
  public skylineSprites: Phaser.GameObjects.Sprite[] = [];
  public distantSkylineGfx: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Rectangle)[] = []; // Persistent background skyline (not animated in transitions)
  private academyBuildings: Phaser.GameObjects.Sprite[] = []; // Academy building sprites
  public billboardTimer: Phaser.Time.TimerEvent | null = null;
  public trafficTimers: Phaser.Time.TimerEvent[] = [];
  public originalPositions: Map<Phaser.GameObjects.GameObject, number> = new Map(); // Store original X positions

  // Speech bubble manager for autonomous dialogue
  public speechBubbleManager: SpeechBubbleManager | null = null;

  // AI-driven character behavior
  public characterTargets: Map<string, { x: number; y: number; action: string }> = new Map();
  private boundBehaviorHandler: ((e: Event) => void) | null = null;
  private boundSpeakHandler: ((e: Event) => void) | null = null;

  // Agent server WebSocket connection

  // Performance: character lookup map for O(1) access in update loop
  private characterById: Map<string, GameCharacter> = new Map();
  // Performance: cached movement speeds per character (avoid random() every frame)
  private characterSpeeds: Map<string, number> = new Map();

  // === LOCAL PLAYER CONTROLS ===
  public localPlayer: Phaser.GameObjects.Sprite | null = null;
  public playerEnabled = false; // Disabled by default - enabled via "Enter World" button
  private playerSpriteVariant = 0; // Which character sprite the player chose
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private wasdKeys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key; // Interact key
  } | null = null;
  private playerVelocity = { x: 0, y: 0 }; // Smooth movement
  private playerWalkCycle = 0; // Animation cycle for walking bob
  private readonly PLAYER_WALK_SPEED = 1.8; // Natural walking speed (pixels per frame)
  private readonly PLAYER_SPRINT_SPEED = 3.6; // Sprint speed when holding Shift
  private readonly PLAYER_ACCELERATION = 0.15; // How quickly player reaches walk speed
  private readonly PLAYER_SPRINT_ACCELERATION = 0.25; // Faster acceleration when sprinting
  private readonly PLAYER_FRICTION = 0.85; // Deceleration when not pressing keys
  private sprintKey: Phaser.Input.Keyboard.Key | null = null;
  private nearbyNPC: GameCharacter | null = null; // NPC player is near (for interaction)
  private nearbyBuilding: GameBuilding | null = null; // Building player is near (for interaction)
  private nearbyHelper = false; // Player is near the helper NPC
  private interactPrompt: Phaser.GameObjects.Container | null = null; // "Press E to talk/enter" UI

  // Robust E-key interaction: Phaser's JustDown can miss presses when the canvas
  // lacks focus, so we also track the key via a window listener.
  private eKeyPressed = false;
  private boundEKeyDown: ((e: KeyboardEvent) => void) | null = null;

  // Helper/guide NPC
  public helperNPC: Phaser.GameObjects.Sprite | null = null;
  private helperBubbleManager: SpeechBubbleManager | null = null;
  private helperLineIndex = 0;
  private helperGreeted = false;

  // NPC Awareness — NPCs greet the player when approached
  private previousNearbyNPC: GameCharacter | null = null;
  public npcGreetCooldowns: Map<string, number> = new Map();
  public readonly NPC_GREET_COOLDOWN_MS = 60000; // 60s per NPC
  public lastNpcGreetTime = 0;
  public readonly GLOBAL_NPC_GREET_COOLDOWN_MS = 12000; // 12s between any greetings
  public npcGreetZoneEntryTime = 0; // suppress greetings for 5s after zone entry
  public readonly NPC_GREET_ZONE_GRACE_MS = 5000;

  // Wild Encounter system state now lives in EncounterSystem; only the window
  // listener binding is tracked here for cleanup.
  private boundEncounterEnd: ((e: Event) => void) | null = null;
  private boundEnterWorld: ((e: Event) => void) | null = null;
  private boundExitWorld: ((e: Event) => void) | null = null;
  private boundTutorialStep: ((e: Event) => void) | null = null;
  private pendingEnterWorld: (() => void) | null = null; // Queued spawn when zone is transitioning

  public isMobile = false;

  // Immersive camera state
  private cameraFollowing = false;
  private irisGraphics: Phaser.GameObjects.Graphics | null = null;

  // Drag detection: prevents accidental taps when scrolling on mobile
  private touchStartPos: { x: number; y: number } | null = null;
  private touchStartTime = 0; // Timestamp of last pointerdown — used to detect long-press sprint
  public wasDragGesture = false; // public: TooltipSystem reads it to suppress profile opens after a drag
  private static readonly TAP_DISTANCE_THRESHOLD = 12; // pixels
  private static readonly LONG_PRESS_SPRINT_MS = 250; // Hold this long to sprint on release

  // Tap-to-move (mobile only). `sprint` is set at release time from press duration.
  private moveTarget: { x: number; sprint: boolean } | null = null;
  private moveTargetBuilding: GameBuilding | null = null;
  private moveTargetNPC: GameCharacter | null = null;
  private tapMoveSuppressed = false;
  private tapMarker: Phaser.GameObjects.Container | null = null;

  // Mobile drag-to-pan disabled when player is in world
  private mobileDragPanEnabled = true;

  constructor() {
    super({ key: "WorldScene" });
  }

  create(): void {
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Suppress NPC greetings for 5s on initial load
    this.npcGreetZoneEntryTime = Date.now();

    // Create layered ground
    this.createGround();

    // Create day/night overlay first — SkySystem owns it from here on.
    const overlay = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0
    );
    overlay.setDepth(DEPTH.UI_LOW);

    // Boot the sky subsystem (gradient, stars, clouds, treeline, skyline).
    this.skySystem = new SkySystem(this, overlay);
    this.skySystem.createSky();
    // Paint the initial night ground transition (was previously in createGround).
    this.skySystem.drawGroundTransition("night");

    // Decorations, clouds, animals, ambient particles (DecorationSystem).
    this.decorationSystem.createDecorations();
    this.decorationSystem.createExtraDecorations();
    this.decorationSystem.createClouds();
    this.decorationSystem.createAnimals();

    // Store original positions of decorations and animals for zone transitions
    this.storeOriginalPositions();

    // Create ambient particles (pollen/leaves)
    this.decorationSystem.createAmbientParticles();

    // Add subtle ground animation
    this.tweens.add({
      targets: this.ground,
      tilePositionX: 16,
      duration: 20000,
      repeat: -1,
      ease: "Linear",
    });

    // Start background music + register music-control listeners
    this.audioSystem.init();

    // Listen for bot effect commands
    this.boundBotEffect = (e: Event) => this.eventEffectSystem.handleBotEffect(e as CustomEvent);
    window.addEventListener("agencity-bot-effect", this.boundBotEffect);

    // Listen for bot animal commands
    this.boundBotAnimal = (e: Event) => this.decorationSystem.handleBotAnimal(e as CustomEvent);
    window.addEventListener("agencity-bot-animal", this.boundBotAnimal);

    // Listen for bot pokemon commands (Founders zone)
    this.boundBotPokemon = (e: Event) => this.decorationSystem.handleBotPokemon(e as CustomEvent);
    window.addEventListener("agencity-bot-pokemon", this.boundBotPokemon);

    // Listen for zone change events
    this.boundZoneChange = (e: Event) => this.handleZoneChange(e as CustomEvent);
    window.addEventListener("agencity-zone-change", this.boundZoneChange);

    // Register cleanup on scene shutdown and destroy
    this.events.on("shutdown", this.cleanup, this);
    this.events.on("destroy", this.cleanup, this);

    // Initialize speech bubble manager for autonomous dialogue
    this.speechBubbleManager = new SpeechBubbleManager(this, this.characterSprites);

    // Listen for AI behavior commands
    this.boundBehaviorHandler = (e: Event) => this.agentSystem.handleBehaviorCommand(e as CustomEvent);
    window.addEventListener("agencity-character-behavior", this.boundBehaviorHandler);

    // Listen for character speak events
    this.boundSpeakHandler = (e: Event) => this.dialogueSystem.handleCharacterSpeak(e as CustomEvent);
    window.addEventListener("agencity-character-speak", this.boundSpeakHandler);

    // Listen for encounter end events (from React overlay)
    this.boundEncounterEnd = (e: Event) => this.encounterSystem.handleEncounterEnd(e as CustomEvent);
    window.addEventListener("agencity-encounter-end", this.boundEncounterEnd);

    // Setup local player controls (WASD/arrow keys to walk around)
    this.setupLocalPlayer();

    // Setup mobile camera controls (drag to pan, pinch to zoom)
    this.setupMobileCameraControls();

    // Set up tap-to-move input handler (mobile only)
    this.setupTapToMove();

    // Listen for tutorial step changes from React
    this.initTutorialListener();

    // Connect to agent server for bidirectional communication
    this.agentSystem.connect();

    // Extract Phaser textures to data URLs for React battle overlay
    extractBattleTextures(this);

    // Signal to React that the scene is ready for worldState updates
    window.dispatchEvent(new Event("worldscene-ready"));
  }

  // === LOCAL PLAYER SETUP ===
  private setupLocalPlayer(): void {
    // Setup keyboard input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      // Remove capture so arrow keys, space, and shift don't block typing in inputs
      this.input.keyboard.removeCapture([
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.SHIFT,
      ]);
      // enableCapture = false so WASD/E/Shift keys still reach <input> elements
      this.wasdKeys = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W, false),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A, false),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S, false),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D, false),
        E: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E, false),
      };
      this.sprintKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT, false);
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
    this.boundEnterWorld = (e: Event) => {
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
    window.addEventListener("agencity-enter-world", this.boundEnterWorld);

    // Listen for "Exit World" event
    this.boundExitWorld = () => this.exitWorld();
    window.addEventListener("agencity-exit-world", this.boundExitWorld);
  }

  private loadAndEnterWithCustomSprite(
    imageUrl: string,
    memeName: string,
    walkSpriteSheetUrl?: string
  ): void {
    if (this.playerEnabled && this.localPlayer) return;

    // Generate unique texture keys for this meme (tracked for cleanup on exit)
    const textureKey = `meme_player_${Date.now()}`;
    const walkTextureKey = walkSpriteSheetUrl ? `meme_walk_${Date.now()}` : null;
    this.localPlayerTextureKeys = [textureKey];
    if (walkTextureKey) this.localPlayerTextureKeys.push(walkTextureKey);

    // Load the main character image
    this.load.image(textureKey, imageUrl);

    // Also load walk sprite sheet if provided
    if (walkSpriteSheetUrl && walkTextureKey) {
      // Load as spritesheet - 2x2 grid of 4 walk frames
      this.load.spritesheet(walkTextureKey, walkSpriteSheetUrl, {
        frameWidth: 512, // 1024 / 2
        frameHeight: 512, // 1024 / 2
      });
    }

    this.load.once("complete", () => {
      this.enterWorldWithTexture(textureKey, memeName, walkTextureKey);
    });
    this.load.once("loaderror", () => {
      console.error("[WorldScene] Failed to load meme sprite, using default");
      this.enterWorld(0); // Fallback to default
    });
    this.load.start();
  }

  private enterWorldWithTexture(
    textureKey: string,
    memeName?: string,
    walkTextureKey?: string | null
  ): void {
    if (this.playerEnabled && this.localPlayer) return;

    // If a zone transition is in progress, queue the spawn for when it completes
    if (this.isTransitioning) {
      this.pendingEnterWorld = () =>
        this.enterWorldWithTexture(textureKey, memeName, walkTextureKey);
      return;
    }

    this.playerSpriteVariant = -1; // Custom sprite
    this.playerEnabled = true;

    const pathLevel = Y.PATH_LEVEL;
    const startX = GAME_WIDTH / 2;

    // If we have a walk sprite sheet, use it as a sprite with animation
    if (walkTextureKey && this.textures.exists(walkTextureKey)) {
      // Create walk animation from sprite sheet
      const walkAnimKey = `${walkTextureKey}_walk`;
      if (!this.anims.exists(walkAnimKey)) {
        this.anims.create({
          key: walkAnimKey,
          frames: this.anims.generateFrameNumbers(walkTextureKey, { start: 0, end: 3 }),
          frameRate: 8,
          repeat: -1,
        });
      }

      // Create player with walk sprite sheet
      this.localPlayer = this.add.sprite(startX, pathLevel, walkTextureKey, 0);
      this.localPlayer.setDepth(12);
      this.localPlayer.setScale(0.15); // Scale down AI-generated image
      this.localPlayer.setOrigin(0.5, 1);

      // Store keys for use during movement
      (this.localPlayer as any).walkAnimKey = walkAnimKey;
      (this.localPlayer as any).walkTextureKey = walkTextureKey;
      (this.localPlayer as any).idleTextureKey = textureKey;
      (this.localPlayer as any).hasWalkAnim = true;
    } else {
      // Create player with static meme texture (no walk animation)
      this.localPlayer = this.add.sprite(startX, pathLevel, textureKey);
      this.localPlayer.setDepth(12);
      this.localPlayer.setScale(0.15); // Scale down AI-generated image (usually 1024x1024)
      this.localPlayer.setOrigin(0.5, 1);
      (this.localPlayer as any).hasWalkAnim = false;
    }

    // Drop shadow under player feet — meme sprites are large, scale shadow wider
    this.attachShadow(this.localPlayer, 1.7);

    // Add player name label if meme name provided
    if (memeName) {
      const nameLabel = this.add.text(startX, pathLevel + 10, memeName, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#22c55e",
        stroke: "#000000",
        strokeThickness: 2,
      });
      nameLabel.setOrigin(0.5, 0);
      nameLabel.setDepth(12);

      // Store reference for cleanup and movement sync
      (this.localPlayer as any).nameLabel = nameLabel;
    }

    // Cool spawn effect
    this.playSpawnEffect(startX, pathLevel);

    // Camera follow + zoom
    if (this.localPlayer) {
      this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
      this.cameras.main.startFollow(this.localPlayer, true, 0.08, 0.08);
      this.cameras.main.setDeadzone(30, 15);
      this.cameras.main.zoomTo(1.3, 800, "Sine.easeInOut");
      this.cameraFollowing = true;
    }

    // Enable tap-to-move on mobile
    this.enableTapToMove();

    window.dispatchEvent(new CustomEvent("agencity-player-entered"));
  }

  private enterWorld(spriteVariant: number): void {
    if (this.playerEnabled && this.localPlayer) return; // Already in world

    // If a zone transition is in progress, queue the spawn for when it completes
    if (this.isTransitioning) {
      this.pendingEnterWorld = () => this.enterWorld(spriteVariant);
      return;
    }

    this.playerSpriteVariant = spriteVariant;
    (window as unknown as Record<string, unknown>).__agencity_player_variant = spriteVariant;
    this.playerEnabled = true;

    // Create player sprite with chosen variant
    const pathLevel = Y.PATH_LEVEL;
    const startX = GAME_WIDTH / 2;

    const textureKey = `character_${spriteVariant}`;
    this.localPlayer = this.add.sprite(startX, pathLevel, textureKey);
    this.localPlayer.setDepth(12); // Above NPCs
    this.localPlayer.setScale(1.4); // Slightly larger than NPCs
    this.localPlayer.setOrigin(0.5, 1);

    // Drop shadow under player feet — pixel character sprites use 1.0 width
    this.attachShadow(this.localPlayer, 1.0);

    // Play cool spawn effect
    this.playSpawnEffect(startX, pathLevel, 1.4);

    // Camera follow + zoom
    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main.startFollow(this.localPlayer, true, 0.08, 0.08);
    this.cameras.main.zoomTo(1.3, 800, "Sine.easeInOut");
    this.cameraFollowing = true;

    // Enable tap-to-move on mobile
    this.enableTapToMove();

    // Notify React that player entered
    window.dispatchEvent(new CustomEvent("agencity-player-entered"));

    // Spawn the helper/guide NPC in the city
    this.createHelperNPC();
  }

  private createHelperNPC(): void {
    if (this.helperNPC) return; // Already spawned

    const pathLevel = Y.PATH_LEVEL;
    const x = Math.round(GAME_WIDTH * 0.32); // Slightly left of center so she greets arriving players

    const sprite = this.add.sprite(x, pathLevel, "character_4");
    sprite.setOrigin(0.5, 1);
    sprite.setScale(1.3);
    sprite.setDepth(11); // Above generic NPCs, below local player
    sprite.setInteractive({ useHandCursor: true });
    this.attachShadow(sprite, 0.9);

    // Idle bob animation
    this.tweens.add({
      targets: sprite,
      y: pathLevel - 2,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Exclamation/question indicator to show she's interactive
    const indicator = this.add.text(x, pathLevel - Math.round(42 * SCALE), "?", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "12px",
      color: "#fbbf24",
      fontStyle: "bold",
    });
    indicator.setOrigin(0.5, 0.5);
    indicator.setDepth(200);
    (sprite as any)._helperIndicator = indicator;
    this.tweens.add({
      targets: indicator,
      y: pathLevel - Math.round(50 * SCALE),
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Click to talk
    sprite.on("pointerup", () => {
      if (this.wasDragGesture) return;
      this.talkToHelper();
    });

    // Hover scale
    sprite.on("pointerover", () => sprite.setScale(1.45));
    sprite.on("pointerout", () => sprite.setScale(1.3));

    this.helperNPC = sprite;

    // Speech bubble manager scoped to this single sprite
    this.helperBubbleManager = new SpeechBubbleManager(
      this,
      new Map([["character_4", sprite]]),
      { displayDuration: 4500, maxWidth: 280, yOffset: -70 }
    );

    // Greet the player automatically the first time they enter the city
    this.time.delayedCall(1200, () => {
      if (this.helperNPC?.active && this.currentZone === "main_city" && !this.helperGreeted) {
        this.helperGreeted = true;
        this.showHelperBubble("Hi! I'm AgenC #285. Press E or click me for a quick tour.");
      }
    });
  }

  private showHelperBubble(message: string): void {
    if (!this.helperBubbleManager || !this.helperNPC?.active) return;
    this.helperBubbleManager.showBubble({
      characterId: "character_4",
      characterName: "AgenC #285",
      message,
      timestamp: Date.now(),
      emotion: "happy",
    });
  }

  private talkToHelper(): void {
    if (!this.helperNPC?.active) return;

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

  private playSpawnEffect(x: number, y: number, targetScale: number = 1.4): void {
    if (!this.localPlayer) return;

    // Play entry sound effect
    this.audioSystem.playSpawnSfx();

    // Play iris-in reveal
    this.playIrisIn(x, y);

    // Start from above and drop down with effects
    const spawnY = y - 200;
    this.localPlayer.setPosition(x, spawnY);
    this.localPlayer.setAlpha(0);
    this.localPlayer.setScale(targetScale * 0.2);

    // Create spawn particle burst
    const spawnParticles = this.add.particles(x, y - 30, "particle", {
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
    const dustParticles = this.add.particles(x, y, "particle", {
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
    this.tweens.add({
      targets: this.localPlayer,
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
        this.tweens.add({
          targets: this.localPlayer,
          scaleX: targetScale * 1.15,
          scaleY: targetScale * 0.85,
          duration: 80,
          yoyo: true,
          ease: "Sine.easeInOut",
        });

        // Cleanup particles
        this.time.delayedCall(800, () => {
          spawnParticles.destroy();
          dustParticles.destroy();
        });
      },
    });
  }

  private playIrisIn(cx: number, cy: number): void {
    // Clean up any previous iris
    if (this.irisGraphics) {
      this.cameras.main.clearMask();
      this.irisGraphics.destroy();
      this.irisGraphics = null;
    }

    const maxRadius = Math.max(GAME_WIDTH, GAME_HEIGHT);
    const gfx = this.add.graphics();
    gfx.setDepth(200);
    this.irisGraphics = gfx;

    // Start with a tiny circle at spawn point
    gfx.clear();
    gfx.fillStyle(0xffffff);
    gfx.fillCircle(cx, cy, 1);

    const mask = gfx.createGeometryMask();
    this.cameras.main.setMask(mask);

    // Tween a custom property to drive the radius
    const proxy = { radius: 1 };
    this.tweens.add({
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
        this.cameras.main.clearMask();
        gfx.destroy();
        if (this.irisGraphics === gfx) {
          this.irisGraphics = null;
        }
      },
    });
  }

  private exitWorld(): void {
    if (!this.playerEnabled || !this.localPlayer) return;

    this.playerEnabled = false;

    // Disable tap-to-move on mobile
    this.disableTapToMove();

    // Play exit sound
    this.audioSystem.playExitSfx();

    // Stop camera follow and zoom back to overview
    if (this.cameraFollowing) {
      this.cameras.main.stopFollow();
      this.cameraFollowing = false;
      this.cameras.main.zoomTo(1.0, 500, "Sine.easeInOut");
      this.time.delayedCall(500, () => {
        this.cameras.main.scrollX = 0;
        this.cameras.main.scrollY = 0;
      });
    }

    // Clean up iris if mid-animation
    if (this.irisGraphics) {
      this.cameras.main.clearMask();
      this.irisGraphics.destroy();
      this.irisGraphics = null;
    }

    // Capture references before nulling — the fade-out tween needs the sprite
    const exitingPlayer = this.localPlayer;
    const textureKeysToClean = [...this.localPlayerTextureKeys];
    this.localPlayer = null; // Null immediately so re-entry is safe during fade
    this.localPlayerTextureKeys = [];
    this.playerVelocity = { x: 0, y: 0 };
    this.nearbyNPC = null;
    this.nearbyBuilding = null;
    this.pendingEnterWorld = null;
    if (this.interactPrompt) {
      this.interactPrompt.setVisible(false);
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
    this.cameras.main.fade(300, 0, 0, 0);

    // Fade the shadow out alongside the player so it doesn't pop
    if (exitingShadow) {
      this.tweens.add({
        targets: exitingShadow,
        alpha: 0,
        duration: 300,
        ease: "Cubic.easeIn",
        onComplete: () => exitingShadow.destroy(),
      });
    }

    // Fade out animation on the captured sprite
    this.tweens.add({
      targets: exitingPlayer,
      alpha: 0,
      scale: 0.5,
      duration: 300,
      ease: "Cubic.easeIn",
      onComplete: () => {
        exitingPlayer.destroy();
        // Clean up meme player textures to prevent memory leak (~4MB each)
        for (const key of textureKeysToClean) {
          if (this.textures.exists(key)) {
            this.textures.remove(key);
          }
        }
        // Reset camera FX after fade completes
        this.cameras.main.resetFX();
      },
    });

    // Notify React that player exited
    window.dispatchEvent(new CustomEvent("agencity-player-exited"));
  }

  private createInteractPrompt(): void {
    // Create a container for the interaction prompt
    this.interactPrompt = this.add.container(0, 0);
    this.interactPrompt.setDepth(150);
    this.interactPrompt.setVisible(false);

    const promptText = this.isMobile ? "Tap to talk" : "Press E to talk";
    const pillWidth = this.isMobile ? 100 : 120;

    // Background pill
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.8);
    bg.fillRoundedRect(-pillWidth / 2, -15, pillWidth, 30, 8);
    this.interactPrompt.add(bg);

    // Text
    const text = this.add.text(0, 0, promptText, {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#ffffff",
    });
    text.setOrigin(0.5, 0.5);
    this.interactPrompt.add(text);

    // On mobile, make the prompt tappable to trigger interaction
    // Uses pointerup + drag guard to prevent accidental triggers while panning
    if (this.isMobile) {
      const hitArea = this.add.rectangle(0, 0, pillWidth + 20, 50, 0x000000, 0);
      hitArea.setInteractive({ useHandCursor: true });
      hitArea.on("pointerup", () => {
        if (this.wasDragGesture) return;
        if (this.nearbyNPC) {
          this.interactWithNPC(this.nearbyNPC);
        } else if (this.nearbyBuilding) {
          this.interactWithBuilding(this.nearbyBuilding);
        }
      });
      this.interactPrompt.add(hitArea);
    }
  }

  // === TAP-TO-MOVE (mobile) ===

  private setupTapToMove(): void {
    if (!this.isMobile) return;

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.playerEnabled) return;
      if (this.wasDragGesture) return;
      if ((window as any).__agencity_modal_open) return;
      if (this.isTransitioning) return;
      if (this.encounterSystem.encounterActive) return;
      if (this.tapMoveSuppressed) return;

      // Long-press to sprint: any press held >= LONG_PRESS_SPRINT_MS releases as sprint
      const heldMs = Date.now() - this.touchStartTime;
      const sprint = heldMs >= WorldScene.LONG_PRESS_SPRINT_MS;

      const hitObjects = this.input.hitTestPointer(pointer);

      // Check if tap hit a building
      for (const obj of hitObjects) {
        const buildingId = (obj as any)._buildingId as string | undefined;
        if (buildingId) {
          const building = this.buildingById.get(buildingId);
          const container = obj as Phaser.GameObjects.Container;
          if (building && this.localPlayer) {
            const dx = Math.abs(this.localPlayer.x - container.x);
            if (dx > 150) {
              // Far — walk there, interact on arrival
              this.moveTarget = { x: container.x, sprint };
              this.moveTargetBuilding = building;
              this.moveTargetNPC = null;
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
          const sprite = this.characterSprites.get(characterId);
          if (sprite && this.localPlayer) {
            const dx = Math.abs(this.localPlayer.x - sprite.x);
            if (dx > 150) {
              this.moveTarget = { x: sprite.x, sprint };
              this.moveTargetNPC =
                this.worldState?.population?.find((c: GameCharacter) => c.id === characterId) ||
                null;
              this.moveTargetBuilding = null;
              this.showTapMarker(sprite.x, sprint);
              this.kickStartMovement(sprite.x, sprint);
            }
          }
          return;
        }
      }

      // Check if tap hit the player sprite — stop
      if (this.localPlayer && hitObjects.includes(this.localPlayer)) {
        this.moveTarget = null;
        this.moveTargetBuilding = null;
        this.moveTargetNPC = null;
        this.hideTapMarker();
        return;
      }

      // Tap on empty ground — walk to world X position
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const targetX = Phaser.Math.Clamp(worldPoint.x, 40, GAME_WIDTH - 40);
      this.moveTarget = { x: targetX, sprint };
      this.moveTargetBuilding = null;
      this.moveTargetNPC = null;
      this.showTapMarker(targetX, sprint);
      this.kickStartMovement(targetX, sprint);
    });
  }

  // === DROP SHADOWS ===
  // Attach a soft elliptical shadow under a sprite (player or NPC). Stored on
  // the sprite as `_shadow` so cleanup paths can destroy it. The vertical
  // offset is computed from the sprite's current display height + origin so
  // it works for both bottom-anchored players (origin 0.5, 1) and
  // center-anchored NPCs (origin 0.5, 0.5).
  private attachShadow(sprite: Phaser.GameObjects.Sprite, scaleX: number): void {
    const feetOffsetY = sprite.displayHeight * (1 - sprite.originY) + 1;
    const shadow = this.add.sprite(sprite.x, sprite.y + feetOffsetY, "character_shadow");
    shadow.setOrigin(0.5, 0.5);
    // Depth 9: above ground/path/decorations (0–4), below NPCs (10–11) and player (12)
    shadow.setDepth(9);
    shadow.setScale(scaleX, 1.0);
    shadow.setVisible(sprite.visible);
    (sprite as any)._shadow = shadow;
    (sprite as any)._shadowFeetOffsetY = feetOffsetY;
  }

  // Sync a sprite's shadow to its current world position. Cheap — just two
  // assignments. Called from updateLocalPlayer and the per-frame NPC loop.
  private syncShadow(sprite: Phaser.GameObjects.Sprite): void {
    const shadow = (sprite as any)._shadow as Phaser.GameObjects.Sprite | undefined;
    if (!shadow) return;
    const offsetY = (sprite as any)._shadowFeetOffsetY ?? 0;
    shadow.x = sprite.x;
    shadow.y = sprite.y + offsetY;
  }

  // Velocity kick for responsive tap feel — sprint taps kick at sprint speed,
  // walk taps kick at walk speed. Both at 50% to feel snappy without overshooting.
  private kickStartMovement(targetX: number, sprint: boolean): void {
    if (!this.localPlayer) return;
    const dx = targetX - this.localPlayer.x;
    const baseSpeed = sprint ? this.PLAYER_SPRINT_SPEED : this.PLAYER_WALK_SPEED;
    this.playerVelocity.x = Math.sign(dx) * baseSpeed * 0.5;
  }

  // Persistent destination marker — single reusable container that stays visible
  // until arrival or until the next tap repositions it. Color encodes sprint vs walk.
  private showTapMarker(worldX: number, sprint: boolean): void {
    if (!this.localPlayer) return;

    // Lazy-create the marker container once and reuse it forever
    if (!this.tapMarker) {
      const container = this.add.container(worldX, Y.PATH_LEVEL);
      container.setDepth(15);

      const ring = this.add.graphics();
      const dot = this.add.graphics();
      const arrow = this.add.text(0, -18, "", {
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

      this.tapMarker = container;

      // Subtle infinite pulse so the marker reads as alive
      this.tweens.add({
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

    const ring = (this.tapMarker as any)._ring as Phaser.GameObjects.Graphics;
    const dot = (this.tapMarker as any)._dot as Phaser.GameObjects.Graphics;
    const arrow = (this.tapMarker as any)._arrow as Phaser.GameObjects.Text;

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

    this.tapMarker.setPosition(worldX, Y.PATH_LEVEL);
    this.tapMarker.setVisible(true);
  }

  // Hide the persistent tap marker (called on arrival, stop-tap, or world exit)
  private hideTapMarker(): void {
    if (this.tapMarker) {
      this.tapMarker.setVisible(false);
    }
  }

  private arriveAtMoveTarget(): void {
    if (this.moveTargetBuilding) {
      this.interactWithBuilding(this.moveTargetBuilding);
    } else if (this.moveTargetNPC) {
      this.interactWithNPC(this.moveTargetNPC);
    }
    this.moveTarget = null;
    this.moveTargetBuilding = null;
    this.moveTargetNPC = null;
    this.hideTapMarker();
  }

  private enableTapToMove(): void {
    if (!this.isMobile) return;
    this.mobileDragPanEnabled = false;
    // Suppress taps for 800ms while zoom animation plays
    this.tapMoveSuppressed = true;
    this.time.delayedCall(800, () => {
      this.tapMoveSuppressed = false;
    });
  }

  private disableTapToMove(): void {
    if (!this.isMobile) return;
    this.moveTarget = null;
    this.moveTargetBuilding = null;
    this.moveTargetNPC = null;
    this.mobileDragPanEnabled = true;
    this.hideTapMarker();
  }

  private updateLocalPlayer(): void {
    if (!this.localPlayer || !this.playerEnabled) return;

    // Skip all movement when a modal (arcade, casino, etc.) is open
    if ((window as any).__agencity_modal_open) return;

    // Skip movement when stunned (after encounter loss) or in encounter
    if (this.encounterSystem.playerStunned || this.encounterSystem.encounterActive) return;

    // Skip WASD movement when a text input or textarea is focused (chat boxes, modals, etc.)
    const activeTag = document.activeElement?.tagName;
    const isTyping = activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT";

    // Get input state — keyboard (desktop) or tap-to-move (mobile)
    let inputX = 0;
    let inputY = 0;
    let sprinting = false;
    let interact = false;

    if (this.isMobile && this.moveTarget && this.localPlayer) {
      // Mobile: derive input from tap-to-move target. Sprint intent is set at
      // press time (long-press = sprint) — not from distance, which made every
      // medium tap accidentally sprint.
      const dx = this.moveTarget.x - this.localPlayer.x;
      if (Math.abs(dx) < 20) {
        this.arriveAtMoveTarget();
      } else {
        inputX = dx > 0 ? 1 : -1;
        sprinting = this.moveTarget.sprint;
      }
    } else if (!this.isMobile) {
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
    this.localPlayer.x += this.playerVelocity.x;
    this.localPlayer.y += this.playerVelocity.y;

    // Keep drop shadow planted under the player
    this.syncShadow(this.localPlayer);

    // Flip sprite based on movement direction
    if (this.playerVelocity.x < -0.1) {
      this.localPlayer.setFlipX(true);
    } else if (this.playerVelocity.x > 0.1) {
      this.localPlayer.setFlipX(false);
    }

    // Walking animation - use sprite sheet animation if available, otherwise bob
    // Use appropriate base scale based on sprite type
    const baseScale = this.playerSpriteVariant === -1 ? 0.15 : 1.4; // Custom meme sprites are larger images
    const isMoving = Math.abs(this.playerVelocity.x) > 0.2 || Math.abs(this.playerVelocity.y) > 0.2;
    const hasWalkAnim = (this.localPlayer as any).hasWalkAnim;
    const walkAnimKey = (this.localPlayer as any).walkAnimKey;

    if (isMoving) {
      // If we have a walk animation sprite sheet, play it
      if (hasWalkAnim && walkAnimKey) {
        // Make sure we're using the walk sprite sheet texture
        const walkTextureKey = (this.localPlayer as any).walkTextureKey;
        if (
          walkTextureKey &&
          this.localPlayer.texture.key !== walkTextureKey &&
          this.textures.exists(walkTextureKey)
        ) {
          this.localPlayer.setTexture(walkTextureKey);
        }
        if (
          !this.localPlayer.anims.isPlaying ||
          this.localPlayer.anims.currentAnim?.key !== walkAnimKey
        ) {
          this.localPlayer.play(walkAnimKey);
        }
        // Still apply subtle bob for extra life
        this.playerWalkCycle += sprinting ? 0.3 : 0.15;
        const bobAmount = Math.sin(this.playerWalkCycle) * 2;
        this.localPlayer.setOrigin(0.5, 1 - bobAmount / 50);
        this.localPlayer.setScale(baseScale);
        this.localPlayer.setRotation(0);
      } else {
        // No sprite sheet - use procedural bob animation
        this.playerWalkCycle += sprinting ? 0.45 : 0.25; // Animation speed
        // Vertical bob (subtle hop)
        const bobAmount = Math.sin(this.playerWalkCycle) * 3;
        this.localPlayer.setOrigin(0.5, 1 - bobAmount / 50);
        // Slight squash/stretch for bounce feel
        const squash = 1 + Math.sin(this.playerWalkCycle * 2) * 0.03;
        this.localPlayer.setScale(baseScale * squash, baseScale / squash);
        // Subtle rotation for swagger
        const tilt = Math.sin(this.playerWalkCycle) * 0.02;
        this.localPlayer.setRotation(tilt);
      }
    } else {
      // Reset to idle pose
      if (hasWalkAnim) {
        this.localPlayer.stop();
        // Switch back to the original idle character texture
        const idleTextureKey = (this.localPlayer as any).idleTextureKey;
        if (idleTextureKey && this.textures.exists(idleTextureKey)) {
          this.localPlayer.setTexture(idleTextureKey);
        }
      }
      this.playerWalkCycle = 0;
      this.localPlayer.setOrigin(0.5, 1);
      this.localPlayer.setScale(baseScale);
      this.localPlayer.setRotation(0);
    }

    // Clamp Y to path area (characters walk on the path)
    const pathLevel = Y.PATH_LEVEL;
    const pathMargin = Math.round(30 * SCALE);
    this.localPlayer.y = Phaser.Math.Clamp(
      this.localPlayer.y,
      pathLevel - pathMargin,
      pathLevel + pathMargin
    );

    // Sync name label position if present (for meme sprites)
    const nameLabel = (this.localPlayer as any).nameLabel as Phaser.GameObjects.Text | undefined;
    if (nameLabel) {
      nameLabel.setPosition(this.localPlayer.x, this.localPlayer.y + 10);
    }

    // Emit player position for tutorial spotlight system
    if (isMoving) {
      window.dispatchEvent(
        new CustomEvent("agencity-player-position", {
          detail: { x: this.localPlayer.x, y: this.localPlayer.y },
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
    this.encounterSystem.checkCreatureEncounters();

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

  private tutorialStep = -1;
  private tutorialArrows: Phaser.GameObjects.Text[] = [];

  private initTutorialListener(): void {
    // Store the bound handler so it can be removed on shutdown (was previously
    // an inline anonymous listener that leaked across scene re-mounts).
    this.boundTutorialStep = ((e: CustomEvent<{ step: number }>) => {
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
    window.addEventListener("agencity-tutorial-step", this.boundTutorialStep);
  }

  private showTutorialNpcArrows(): void {
    this.clearTutorialArrows();
    this.characterSprites.forEach((sprite) => {
      if (!sprite.visible) return;
      const arrow = this.add.text(sprite.x, sprite.y - 45, "\u25BC", {
        fontSize: "18px",
        color: "#22c55e",
        fontFamily: "monospace",
      });
      arrow.setOrigin(0.5, 1);
      arrow.setDepth(200);
      this.tweens.add({
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

  private updateTutorialArrows(): void {
    for (const arrow of this.tutorialArrows) {
      const target = (arrow as any)._tutorialTarget as Phaser.GameObjects.Sprite;
      if (target && target.active) {
        arrow.setX(target.x);
      }
    }
  }

  private clearTutorialArrows(): void {
    for (const arrow of this.tutorialArrows) {
      this.tweens.killTweensOf(arrow);
      arrow.destroy();
    }
    this.tutorialArrows = [];
  }

  private checkZoneBoundaries(): void {
    if (!this.localPlayer || this.isTransitioning) return;

    const x = this.localPlayer.x;
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
    const currentIndex = zoneOrder.indexOf(this.currentZone);

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

  private playerTriggerZoneChange(zone: ZoneType, direction: "left" | "right"): void {
    // Dispatch zone change event marked as a walk so the router bridge can update the URL.
    window.dispatchEvent(
      new CustomEvent("agencity-zone-change", { detail: { zone, source: "walk", direction } })
    );

    // Move player to opposite edge after transition
    if (this.localPlayer) {
      if (direction === "left") {
        this.localPlayer.x = GAME_WIDTH - 80; // Appear on right side of new zone
      } else {
        this.localPlayer.x = 80; // Appear on left side of new zone
      }
      // Reset velocity on zone change
      this.playerVelocity.x = 0;
      this.playerVelocity.y = 0;
    }
  }

  private checkProximityForInteraction(): void {
    if (!this.localPlayer) return;

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

    this.characterSprites.forEach((sprite, id) => {
      const character = this.characterById.get(id);
      if (!character) return;

      const dist = Phaser.Math.Distance.Between(
        this.localPlayer!.x,
        this.localPlayer!.y,
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
    if (this.nearbyNPC && this.nearbyNPC !== this.previousNearbyNPC) {
      this.characterSystem.triggerNPCGreeting(this.nearbyNPC);
    }
    this.previousNearbyNPC = this.nearbyNPC;

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
      this.buildingSprites.forEach((container, id) => {
        // Skip if container is not visible (wrong zone)
        if (!container.visible) return;

        // Find the building data (O(1) map lookup instead of O(n) array scan)
        const building = this.buildingById.get(id);
        if (!building) return;

        // Skip starter buildings (they're non-interactive)
        if (building.id.startsWith("Starter")) return;

        // Use horizontal distance only - buildings are above the walking path
        const xDist = Math.abs(this.localPlayer!.x - container.x);

        if (xDist < buildingRadius && xDist < buildingResult.dist) {
          buildingResult.dist = xDist;
          buildingResult.building = building;
          buildingResult.pos = { x: container.x, y: container.y };
        }
      });

      // Also check zone-specific popup buildings (HQ, Arcade, Proof, Earnings, Trust)
      this.zonePopupBuildings.forEach((entry, id) => {
        if (entry.zone !== this.currentZone || !entry.sprite.active || !entry.sprite.visible) return;
        const xDist = Math.abs(this.localPlayer!.x - entry.sprite.x);
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
    if (!this.nearbyNPC && this.helperNPC && this.helperNPC.active && this.helperNPC.visible) {
      const helperDist = Phaser.Math.Distance.Between(
        this.localPlayer!.x,
        this.localPlayer!.y,
        this.helperNPC.x,
        this.helperNPC.y
      );
      if (helperDist < npcRadius) {
        this.nearbyHelper = true;
      }
    }

    // Update interact prompt visibility and position
    if (this.interactPrompt) {
      // On mobile, the floating interact button replaces the text prompt
      if (this.isMobile) {
        this.interactPrompt.setVisible(false);
      } else if (npcResult.npc && npcResult.pos) {
        this.updateInteractPromptText("Press E to talk");
        this.interactPrompt.setVisible(true);
        this.interactPrompt.setPosition(npcResult.pos.x, npcResult.pos.y - 70);
      } else if (this.nearbyHelper && this.helperNPC) {
        this.updateInteractPromptText("Press E to talk");
        this.interactPrompt.setVisible(true);
        this.interactPrompt.setPosition(this.helperNPC.x, this.helperNPC.y - 70);
      } else if (buildingResult.building && buildingResult.pos) {
        this.updateInteractPromptText("Press E to enter");
        this.interactPrompt.setVisible(true);
        this.interactPrompt.setPosition(buildingResult.pos.x, buildingResult.pos.y - 120);
      } else {
        this.interactPrompt.setVisible(false);
      }
    }
  }

  private updateInteractPromptText(text: string): void {
    if (!this.interactPrompt) return;
    const textObj = this.interactPrompt.list[1] as Phaser.GameObjects.Text;
    if (textObj && textObj.setText) {
      textObj.setText(text);
    }
  }

  private interactWithNPC(character: GameCharacter): void {
    this.audioSystem.playInteractSfx();

    // Simulate the exact same click behavior as pointerdown handlers
    // This matches the logic in createCharacterSprite

    const isExternalAgent =
      character.id.startsWith("external-") || character.id.startsWith("agent-");

    if (isExternalAgent) {
      // Show tooltip with "Visit Profile" button instead of navigating directly
      const sprite = this.characterSprites.get(character.id);
      if (sprite) {
        this.tooltipSystem.showCharacterTooltip(character, sprite);
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
      const sprite = this.characterSprites.get(character.id);
      if (sprite) {
        this.tooltipSystem.showCharacterTooltip(character, sprite);
      }
    }
  }

  private interactWithBuilding(building: GameBuilding): void {
    this.audioSystem.playBuildingClickSfx();

    // Zone-specific popup buildings have their own click handlers registered
    // in zonePopupBuildings. Use that callback if available.
    const zonePopup = this.zonePopupBuildings.get(building.id);
    if (zonePopup) {
      this.audioSystem.playBuildingClickBurst(zonePopup.sprite.x, zonePopup.sprite.y - 60);
      zonePopup.onInteract();
      return;
    }

    // Visual feedback at the building's visible center. This path has no
    // pointer event (proximity E-press or tap-to-move arrival), so derive
    // the position from the sprite container itself.
    const sprite = this.buildingSprites.get(building.id);
    if (sprite) {
      // Containers anchor at the bottom (origin 0.5, 1) — offset upward by
      // half the hitbox height (~60–100px) so the burst sits over the body
      // of the building, not at its feet.
      this.audioSystem.playBuildingClickBurst(sprite.x, sprite.y - 60);
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

  private setupMobileCameraControls(): void {
    // Check if mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Enable touch input globally for this scene
    this.input.setTopOnly(false);

    if (!isMobile) return;

    // Set up camera bounds for panning
    const camera = this.cameras.main;
    camera.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Track drag state
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let cameraStartX = 0;
    let cameraStartY = 0;

    // Track touch start for tap-vs-drag detection (prevents accidental clicks)
    // Also records the press start timestamp so pointerup can derive long-press sprint intent.
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.touchStartPos = { x: pointer.x, y: pointer.y };
      this.touchStartTime = Date.now();
      this.wasDragGesture = false;
    });

    // Handle pointer down - start drag (disabled when player is in world — camera follows player)
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.mobileDragPanEnabled) return;
      // Only start drag if not clicking on a character/building
      const hitObjects = this.input.hitTestPointer(pointer);
      if (hitObjects.length === 0) {
        isDragging = true;
        dragStartX = pointer.x;
        dragStartY = pointer.y;
        cameraStartX = camera.scrollX;
        cameraStartY = camera.scrollY;
      }
    });

    // Handle pointer move - pan camera + mark drag gesture
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      // Mark as drag if finger moved beyond threshold (prevents accidental taps)
      if (this.touchStartPos && pointer.isDown && !this.wasDragGesture) {
        const dist = Phaser.Math.Distance.Between(
          this.touchStartPos.x,
          this.touchStartPos.y,
          pointer.x,
          pointer.y
        );
        if (dist > WorldScene.TAP_DISTANCE_THRESHOLD) {
          this.wasDragGesture = true;
        }
      }

      if (!this.mobileDragPanEnabled || !isDragging || !pointer.isDown) return;

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

    // Handle pointer up - stop drag + reset wasDragGesture to prevent stale-true
    this.input.on("pointerup", () => {
      isDragging = false;
      this.wasDragGesture = false;
    });

    // Handle pinch to zoom (two-finger gesture) — disabled in-world
    let initialPinchDistance = 0;
    let initialZoom = 1;

    this.input.on("pointerdown", () => {
      if (this.playerEnabled) return;
      const pointers = this.input.manager.pointers.filter((p) => p.isDown);
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

    this.input.on("pointermove", () => {
      if (this.playerEnabled) return;
      const pointers = this.input.manager.pointers.filter((p) => p.isDown);
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

    this.input.on("pointerup", () => {
      if (this.playerEnabled) return;
      const pointers = this.input.manager.pointers.filter((p) => p.isDown);
      if (pointers.length < 2) {
        initialPinchDistance = 0;
      }
    });

    // Double-tap to reset zoom — disabled in-world
    let lastTapTime = 0;
    this.input.on("pointerup", () => {
      if (this.playerEnabled) return;
      const currentTime = Date.now();
      if (currentTime - lastTapTime < 300) {
        camera.setZoom(1);
        camera.scrollX = 0;
        camera.scrollY = 0;
      }
      lastTapTime = currentTime;
    });

    // Reset all touch state on system interrupts (incoming call, app switch)
    this.input.on("pointercancel", () => {
      this.moveTarget = null;
      this.moveTargetBuilding = null;
      this.moveTargetNPC = null;
      this.wasDragGesture = false;
      isDragging = false;
      initialPinchDistance = 0;
    });
  }

  private handleZoneChange(event: CustomEvent<{ zone: ZoneType }>): void {
    const newZone = event.detail.zone;
    if (newZone === this.currentZone || this.isTransitioning) return;

    // Transition to new zone
    this.transitionToZone(newZone);
  }

  private transitionToZone(newZone: ZoneType): void {
    this.audioSystem.playZoneTransitionSfx();

    // Mark transition in progress and cancel any active tap-to-move
    this.isTransitioning = true;
    this.moveTarget = null;
    this.moveTargetBuilding = null;
    this.moveTargetNPC = null;

    // Hide helper NPC during transitions; she only lives in the city
    if (this.helperNPC) {
      this.helperNPC.setVisible(false);
      const indicator = (this.helperNPC as any)._helperIndicator as Phaser.GameObjects.Text | undefined;
      if (indicator) indicator.setVisible(false);
    }

    // Pause camera follow during transition
    if (this.cameraFollowing) {
      this.cameras.main.stopFollow();
    }

    // CLEANUP: Kill any existing transition tweens to prevent accumulation
    this.decorations.forEach((d) => this.tweens.killTweensOf(d));
    this.animals.forEach((a) => this.tweens.killTweensOf(a.sprite));
    this.trendingElements.forEach((el) => this.tweens.killTweensOf(el));
    this.billboardTexts.forEach((t) => this.tweens.killTweensOf(t));
    this.skylineSprites.forEach((s) => this.tweens.killTweensOf(s));
    if (this.tickerText) this.tweens.killTweensOf(this.tickerText);
    this.ballersElements.forEach((el) => this.tweens.killTweensOf(el));
    this.foundersElements.forEach((el) => this.tweens.killTweensOf(el));
    this.labsElements.forEach((el) => this.tweens.killTweensOf(el));
    this.moltbookElements.forEach((el) => this.tweens.killTweensOf(el));
    this.arenaElements.forEach((el) => this.tweens.killTweensOf(el));
    this.ascensionElements.forEach((el) => this.tweens.killTweensOf(el));
    this.buildingSprites.forEach((container) => this.tweens.killTweensOf(container));
    this.characterSprites.forEach((sprite) => this.tweens.killTweensOf(sprite));

    // Reset all zone element positions to originals before transition
    // (slide-out animations corrupt x positions; this ensures correct starting positions)
    this.decorations.forEach((d) => {
      const origX = this.originalPositions.get(d);
      if (origX !== undefined) (d as any).x = origX;
    });
    this.animals.forEach((a) => {
      const origX = this.originalPositions.get(a.sprite);
      if (origX !== undefined) (a.sprite as any).x = origX;
    });
    this.resetZoneElementPositions(this.trendingElements);
    this.resetZoneElementPositions(this.skylineSprites);
    this.resetZoneElementPositions(this.billboardTexts);
    this.resetZoneElementPositions(this.ballersElements);
    this.resetZoneElementPositions(this.foundersElements);
    this.resetZoneElementPositions(this.labsElements);
    this.resetZoneElementPositions(this.moltbookElements);
    this.resetZoneElementPositions(this.arenaElements);
    this.resetZoneElementPositions(this.ascensionElements);

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
    const isGoingRight = zoneOrder[newZone] > zoneOrder[this.currentZone];
    const isAscensionTransition = newZone === "ascension" || this.currentZone === "ascension";
    const isVerticalTransition = isAscensionTransition;
    const duration = isVerticalTransition ? 800 : 600; // Slower, dramatic for vertical transitions
    const slideDistance = Math.round(850 * SCALE); // Slightly more than screen width for full slide (scaled)

    // For ascension: vertical transition (ascend)
    // For all others: horizontal slide
    const slideOutOffset = isVerticalTransition ? 0 : isGoingRight ? -slideDistance : slideDistance;
    const slideInOffset = isVerticalTransition ? 0 : isGoingRight ? slideDistance : -slideDistance;

    // Collect current zone elements to slide out
    const oldElements: (Phaser.GameObjects.GameObject & { x?: number })[] = [];

    if (this.currentZone === "trending") {
      oldElements.push(...this.trendingElements);
      oldElements.push(...this.billboardTexts);
      if (this.tickerText) oldElements.push(this.tickerText);
      oldElements.push(...this.skylineSprites);
    } else if (this.currentZone === "ballers") {
      oldElements.push(...this.ballersElements);
    } else if (this.currentZone === "founders") {
      oldElements.push(...this.foundersElements);
    } else if (this.currentZone === "labs") {
      oldElements.push(...this.labsElements);
    } else if (this.currentZone === "moltbook") {
      oldElements.push(...this.moltbookElements);
    } else if (this.currentZone === "arena") {
      oldElements.push(...this.arenaElements);
    } else if (this.currentZone === "ascension") {
      oldElements.push(...this.ascensionElements);
    } else {
      // Main city (Park) decorations
      this.decorations.forEach((d) => oldElements.push(d));
      this.animals.forEach((a) => oldElements.push(a.sprite));
    }

    // Snapshot building/character sprite IDs at transition start
    // Only these will be destroyed after transition — sprites created mid-transition by worldState updates are preserved
    const oldBuildingSpriteIds = new Set(this.buildingSprites.keys());
    const oldCharacterSpriteIds = new Set(this.characterSprites.keys());

    // Include buildings and characters (they slide out and get recreated)
    this.buildingSprites.forEach((container) => oldElements.push(container));
    this.characterSprites.forEach((sprite) => oldElements.push(sprite));

    // Store old element original X positions for proper destruction
    const oldElementData = oldElements.map((el) => ({ el, origX: (el as any).x || 0 }));

    // Create transition overlay for ground swap (slides with content, scaled)
    const transitionOverlay = this.add.rectangle(
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
      }[this.currentZone] || 0x22c55e, // Zone-appropriate ground color
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
          this.tweens.add({
            targets: el,
            y: (el as any).y + verticalDelta,
            alpha: 0,
            duration,
            ease: "Cubic.easeIn",
          });
          // Slide character drop shadow with its sprite so it doesn't lag
          const shadow = (el as any)._shadow as Phaser.GameObjects.Sprite | undefined;
          if (shadow && shadow.active) {
            this.tweens.add({
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
      this.tweens.add({
        targets: this.ground,
        alpha: 0,
        duration: duration * 0.4,
        ease: "Cubic.easeIn",
        onComplete: () => {
          this.ground.setAlpha(1);
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
        const cloud = this.add.ellipse(
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

        this.tweens.add({
          targets: cloud,
          alpha: 0.3 + Math.random() * 0.4,
          y: startY + cloudDirection * Math.round((80 + Math.random() * 200) * SCALE),
          x: startX + Math.round((Math.random() - 0.5) * 100 * SCALE),
          duration: duration * 0.8,
          ease: "Sine.easeInOut",
          delay: Math.random() * 150,
          onComplete: () => {
            this.tweens.add({
              targets: cloud,
              alpha: 0,
              duration: 200,
              onComplete: () => cloud.destroy(),
            });
          },
        });
      }

      // Main overlay fade
      this.tweens.add({
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
          this.tweens.add({
            targets: el,
            x: (el as any).x + slideOutOffset,
            duration,
            ease: "Cubic.easeInOut",
          });
          // Slide character drop shadow with its sprite so it doesn't lag
          const shadow = (el as any)._shadow as Phaser.GameObjects.Sprite | undefined;
          if (shadow && shadow.active) {
            this.tweens.add({
              targets: shadow,
              x: shadow.x + slideOutOffset,
              duration,
              ease: "Cubic.easeInOut",
            });
          }
        }
      });

      // Slide ground texture overlay (scaled)
      this.tweens.add({
        targets: this.ground,
        tilePositionX:
          this.ground.tilePositionX +
          (isGoingRight ? Math.round(100 * SCALE) : -Math.round(100 * SCALE)),
        duration,
        ease: "Cubic.easeInOut",
      });

      // Slide transition overlay in, destroy when complete
      this.tweens.add({
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
    this.time.delayedCall(duration * 0.4, () => {
      // Hide old zone elements (don't destroy - they're cached for reuse)
      if (this.currentZone === "trending") {
        this.trendingElements.forEach((el) => (el as any).setVisible(false));
        this.billboardTexts.forEach((t) => t.setVisible(false));
        if (this.tickerText) this.tickerText.setVisible(false);
        this.skylineSprites.forEach((s) => s.setVisible(false));
        // Stop ticker animation
        if (this.tickerTimer) {
          this.tickerTimer.destroy();
          this.tickerTimer = null;
        }
        // Stop billboard update timer
        if (this.billboardTimer) {
          this.billboardTimer.destroy();
          this.billboardTimer = null;
        }
        // Stop traffic timers
        clearTrafficTimers(this);
      } else if (this.currentZone === "ballers") {
        this.ballersElements.forEach((el) => (el as any).setVisible(false));
      } else if (this.currentZone === "founders") {
        this.foundersElements.forEach((el) => (el as any).setVisible(false));
      } else if (this.currentZone === "labs") {
        this.labsElements.forEach((el) => (el as any).setVisible(false));
      } else if (this.currentZone === "moltbook") {
        this.moltbookElements.forEach((el) => (el as any).setVisible(false));
      } else if (this.currentZone === "arena") {
        this.arenaElements.forEach((el) => (el as any).setVisible(false));
        disconnectArena(this);
      } else if (this.currentZone === "ascension") {
        this.ascensionElements.forEach((el) => (el as any).setVisible(false));
        disconnectAscension(this);
      }

      // Update zone and set up new content
      this.currentZone = newZone;

      // Reset NPC greeting state on zone change
      this.previousNearbyNPC = null;
      this.npcGreetZoneEntryTime = Date.now();

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
      this.ground.setTexture(groundTextures[newZone]);

      // Setup new zone content (will be positioned off-screen initially)
      this.setupZoneOffscreen(newZone, slideInOffset);
    });

    // Clean up old elements after animation completes
    this.time.delayedCall(duration + 50, () => {
      oldElementData.forEach(({ el }) => {
        // Only destroy elements that aren't persistent (zone elements are reused)
        const isDecoration = this.decorations.includes(el as any);
        const isAnimal = this.animals.some((a) => a.sprite === el);
        const isTrendingElement =
          this.trendingElements.includes(el) ||
          this.skylineSprites.includes(el as any) ||
          this.billboardTexts.includes(el as any) ||
          el === this.tickerText;
        const isBallersElement = this.ballersElements.includes(el);
        const isFoundersElement = this.foundersElements.includes(el);
        const isMoltbookElement = this.moltbookElements.includes(el);
        const isLabsElement = this.labsElements.includes(el);
        const isArenaElement = this.arenaElements.includes(el);
        const isAscensionElement = this.ascensionElements.includes(el);

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
        const sprite = this.buildingSprites.get(id);
        if (sprite && (sprite as any).active !== false) {
          (sprite as any).destroy();
        }
        this.buildingSprites.delete(id);
      });
      oldCharacterSpriteIds.forEach((id) => {
        const sprite = this.characterSprites.get(id);
        if (sprite && (sprite as any).active !== false) {
          // Destroy attached drop shadow before the sprite itself
          const shadow = (sprite as any)._shadow as Phaser.GameObjects.Sprite | undefined;
          if (shadow) {
            shadow.destroy();
            (sprite as any)._shadow = null;
          }
          (sprite as any).destroy();
        }
        this.characterSprites.delete(id);
      });

      // CRITICAL: Immediately recreate sprites from existing worldState
      // Without this, sprites stay destroyed until next React Query poll (up to 60s)
      if (this.worldState) {
        this.updateCharacters(this.worldState.population);
        this.buildingSystem.updateBuildings(this.worldState.buildings);
      }

      // Mark transition complete
      this.isTransitioning = false;

      // Resume camera follow after transition
      if (this.cameraFollowing && this.localPlayer) {
        this.cameras.main.startFollow(this.localPlayer, true, 0.08, 0.08);
        this.cameras.main.setDeadzone(30, 15);
      }

      // Flush any pending player spawn that was queued during this transition
      if (this.pendingEnterWorld) {
        const pending = this.pendingEnterWorld;
        this.pendingEnterWorld = null;
        pending();
      }

      // Show helper NPC only when the player is back in the city
      if (this.helperNPC) {
        const inCity = this.currentZone === "main_city";
        this.helperNPC.setVisible(inCity);
        const indicator = (this.helperNPC as any)._helperIndicator as Phaser.GameObjects.Text | undefined;
        if (indicator) indicator.setVisible(inCity);
      }
    });
  }

  private setupZoneOffscreen(zone: ZoneType, offsetX: number): void {
    // Hide all zone elements once, before setting up the new zone
    this.hideAllZoneElements();

    // Ensure ground is visible by default (zones that need it hidden will override)
    this.ground.setVisible(true);
    if (this.groundPath) this.groundPath.setVisible(true);
    if (this.groundTransition) this.groundTransition.setVisible(true);

    // Setup zone with elements offset, then animate them into position
    const duration = 400; // Smooth slide-in matching the overall transition feel

    if (zone === "trending") {
      setupTrendingZone(this);

      // Offset all new Catalog elements and animate them in
      const newElements = [
        ...this.trendingElements,
        ...this.billboardTexts,
        this.tickerText,
        ...this.skylineSprites,
      ].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).x !== undefined) {
          const targetX = (el as any).x;
          (el as any).x = targetX + offsetX;
          this.tweens.add({
            targets: el,
            x: targetX,
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    } else if (zone === "ballers") {
      setupBallersZone(this);

      // Offset all new Ballers Valley elements and animate them in
      const newElements = [...this.ballersElements].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).x !== undefined) {
          const targetX = (el as any).x;
          (el as any).x = targetX + offsetX;
          this.tweens.add({
            targets: el,
            x: targetX,
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    } else if (zone === "founders") {
      setupFoundersZone(this);

      // Offset all new Founder's Corner elements and animate them in
      const newElements = [...this.foundersElements].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).x !== undefined) {
          const targetX = (el as any).x;
          (el as any).x = targetX + offsetX;
          this.tweens.add({
            targets: el,
            x: targetX,
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    } else if (zone === "labs") {
      setupLabsZone(this);

      // Offset all new Tech Labs elements and animate them in
      const newElements = [...this.labsElements].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).x !== undefined) {
          const targetX = (el as any).x;
          (el as any).x = targetX + offsetX;
          this.tweens.add({
            targets: el,
            x: targetX,
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    } else if (zone === "moltbook") {
      setupMoltbookZone(this);

      // Offset all new Moltbook Beach elements and animate them in
      const newElements = [...this.moltbookElements].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).x !== undefined) {
          const targetX = (el as any).x;
          (el as any).x = targetX + offsetX;
          this.tweens.add({
            targets: el,
            x: targetX,
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    } else if (zone === "arena") {
      setupArenaZone(this);

      // Offset all new Arena elements and animate them in
      const newElements = [...this.arenaElements].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).x !== undefined) {
          const targetX = (el as any).x;
          (el as any).x = targetX + offsetX;
          this.tweens.add({
            targets: el,
            x: targetX,
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    } else if (zone === "ascension") {
      setupAscensionZone(this);

      // Ascension elements rise from below (upward float-in)
      const verticalDist = Math.round(300 * SCALE);
      const newElements = [...this.ascensionElements].filter(Boolean);

      newElements.forEach((el) => {
        if ((el as any).y !== undefined) {
          const targetY = (el as any).y;
          (el as any).y = targetY + verticalDist;
          (el as any).alpha = 0;
          this.tweens.add({
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
      setupMainCityZone(this);

      // Animate Park elements in using their ORIGINAL positions
      const newElements = [...this.decorations, ...this.animals.map((a) => a.sprite)];

      newElements.forEach((el) => {
        // Get the original position, not the current (off-screen) position
        const originalX = this.originalPositions.get(el);
        if (originalX !== undefined) {
          (el as any).x = originalX + offsetX; // Start off-screen
          this.tweens.add({
            targets: el,
            x: originalX, // Animate to original position
            duration,
            ease: "Cubic.easeOut",
          });
        }
      });
    }
  }

  private storeOriginalPositions(): void {
    // Store original X positions of decorations and animals for zone transitions
    this.decorations.forEach((d) => {
      this.originalPositions.set(d, (d as any).x || 0);
    });
    this.animals.forEach((a) => {
      this.originalPositions.set(a.sprite, (a.sprite as any).x || 0);
    });
  }

  /**
   * Store original X positions for zone elements that participate in slide animations.
   * Called after zone elements are first created so positions can be restored
   * before the next slide-out/slide-in cycle.
   */
  public storeZoneElementPositions(elements: Phaser.GameObjects.GameObject[]): void {
    elements.forEach((el) => {
      if ((el as any).x !== undefined) {
        this.originalPositions.set(el, (el as any).x);
      }
    });
  }

  /**
   * Reset zone elements to their original X positions (counteracts slide-out corruption).
   */
  private resetZoneElementPositions(elements: Phaser.GameObjects.GameObject[]): void {
    elements.forEach((el) => {
      const origX = this.originalPositions.get(el);
      if (origX !== undefined) (el as any).x = origX;
    });
  }

  private clearCurrentZone(): void {
    // Clear zone-specific elements based on current zone
    if (this.currentZone === "trending") {
      // Just hide elements instead of destroying (they're cached for reuse)
      this.trendingElements.forEach((el) => (el as any).setVisible(false));
      this.billboardTexts.forEach((t) => t.setVisible(false));
      if (this.tickerText) {
        this.tickerText.setVisible(false);
      }
      if (this.tickerTimer) {
        this.tickerTimer.destroy();
        this.tickerTimer = null;
      }
      this.skylineSprites.forEach((s) => s.setVisible(false));
    } else if (this.currentZone === "ballers") {
      // Hide ballers elements
      this.ballersElements.forEach((el) => (el as any).setVisible(false));
    } else if (this.currentZone === "founders") {
      // Hide founders elements
      this.foundersElements.forEach((el) => (el as any).setVisible(false));
    } else if (this.currentZone === "labs") {
      // Hide labs elements
      this.labsElements.forEach((el) => (el as any).setVisible(false));
    } else if (this.currentZone === "arena") {
      // Hide arena elements and disconnect WebSocket
      this.arenaElements.forEach((el) => (el as any).setVisible(false));
      disconnectArena(this);
    } else if (this.currentZone === "ascension") {
      // Hide ascension elements and stop polling
      this.ascensionElements.forEach((el) => (el as any).setVisible(false));
      disconnectAscension(this);
    } else if (this.currentZone === "main_city") {
      // Main city uses shared decorations, don't destroy them
      // Just hide them
      this.decorations.forEach((d) => d.setVisible(false));
      this.animals.forEach((a) => a.sprite.setVisible(false));
      if (this.helperNPC) {
        this.helperNPC.setVisible(false);
        const indicator = (this.helperNPC as any)._helperIndicator as Phaser.GameObjects.Text | undefined;
        if (indicator) indicator.setVisible(false);
      }
    }

    // Reset ground
    if (this.zoneGround) {
      this.zoneGround.destroy();
      this.zoneGround = null;
    }
    if (this.zonePath) {
      this.zonePath.destroy();
      this.zonePath = null;
    }
  }

  /**
   * Hide all zone-specific elements in a single pass.
   * Called once before setting up a new zone, replacing the duplicated
   * hide-everything blocks that were copied into each setup method.
   */
  private hideAllZoneElements(): void {
    this.decorations.forEach((d) => d.setVisible(false));
    this.animals.forEach((a) => a.sprite.setVisible(false));
    if (this.fountainWater) this.fountainWater.setVisible(false);
    this.trendingElements.forEach((el) => (el as any).setVisible(false));
    this.skylineSprites.forEach((s) => s.setVisible(false));
    this.billboardTexts.forEach((t) => t.setVisible(false));
    if (this.tickerText) this.tickerText.setVisible(false);
    this.academyElements.forEach((el) => (el as any).setVisible(false));
    this.academyBuildings.forEach((s) => s.setVisible(false));
    this.ballersElements.forEach((el) => (el as any).setVisible(false));
    this.foundersElements.forEach((el) => (el as any).setVisible(false));
    this.labsElements.forEach((el) => (el as any).setVisible(false));
    this.moltbookElements.forEach((el) => (el as any).setVisible(false));
    this.arenaElements.forEach((el) => (el as any).setVisible(false));
    this.ascensionElements.forEach((el) => (el as any).setVisible(false));
    disconnectArena(this);
    disconnectAscension(this);
    if (this.helperNPC) {
      this.helperNPC.setVisible(false);
      const indicator = (this.helperNPC as any)._helperIndicator as Phaser.GameObjects.Text | undefined;
      if (indicator) indicator.setVisible(false);
    }
    if (this.foundersPopup) {
      this.foundersPopup.destroy();
      this.foundersPopup = null;
    }
  }

  private setupZone(zone: ZoneType): void {
    switch (zone) {
      case "labs":
        setupLabsZone(this);
        break;
      case "moltbook":
        setupMoltbookZone(this);
        break;
      case "trending":
        setupTrendingZone(this);
        break;
      case "ballers":
        setupBallersZone(this);
        break;
      case "founders":
        setupFoundersZone(this);
        break;
      case "arena":
        setupArenaZone(this);
        break;
      case "ascension":
        setupAscensionZone(this);
        break;
      case "main_city":
      default:
        setupMainCityZone(this);
        break;
    }
  }

  // Handle AI behavior commands for characters
  // Find a character sprite by character ID (handles special character naming)
  public findCharacterSprite(characterId: string): Phaser.GameObjects.Sprite | null {
    // Direct lookup
    const direct = this.characterSprites.get(characterId);
    if (direct) return direct;

    // Search by special character flags
    for (const [, sprite] of this.characterSprites) {
      const spriteData = sprite as any;
      // Core characters
      if (characterId === "finn" && spriteData.isFinn) return sprite;
      if (characterId === "ghost" && spriteData.isDev) return sprite;
      if (characterId === "neo" && spriteData.isScout) return sprite;
      if (characterId === "ash" && spriteData.isAsh) return sprite;
      if (characterId === "toly" && spriteData.isToly) return sprite;
      if (characterId === "cj" && spriteData.isCJ) return sprite;
      if (characterId === "shaw" && spriteData.isShaw) return sprite;
      // Academy Zone - AgenC Team
      if (characterId === "ramo" && spriteData.isRamo) return sprite;
      if (characterId === "sincara" && spriteData.isSincara) return sprite;
      if (characterId === "stuu" && spriteData.isStuu) return sprite;
      if (characterId === "sam" && spriteData.isSam) return sprite;
      if (characterId === "alaa" && spriteData.isAlaa) return sprite;
      if (characterId === "carlo" && spriteData.isCarlo) return sprite;
      if (characterId === "bnn" && spriteData.isBNN) return sprite;
      // Founder's Corner Zone
      if (characterId === "professorOak" && spriteData.isProfessorOak) return sprite;
      // Mascots
      if (characterId === "citybot" && spriteData.isCityBot) return sprite;
    }

    return null;
  }

  // Public method to get character sprite (for agent bridge)
  getCharacterSprite(characterId: string): Phaser.GameObjects.Sprite | null {
    return this.findCharacterSprite(characterId);
  }

  // Map a character to their behavior system ID
  public getCharacterBehaviorId(character: GameCharacter): string {
    // Core characters
    if (character.isFinn) return "finn";
    if (character.isDev) return "ghost";
    if (character.isScout) return "neo";
    if (character.isAsh) return "ash";
    if (character.isToly) return "toly";
    if (character.isCJ) return "cj";
    if (character.isShaw) return "shaw";
    // Academy Zone - AgenC Team
    if (character.isRamo) return "ramo";
    if (character.isSincara) return "sincara";
    if (character.isStuu) return "stuu";
    if (character.isSam) return "sam";
    if (character.isAlaa) return "alaa";
    if (character.isCarlo) return "carlo";
    if (character.isBNN) return "bnn";
    // Founder's Corner Zone
    if (character.isProfessorOak) return "professorOak";
    // Mascots
    if (character.isCityBot) return "citybot";
    return character.id;
  }

  // Update glow sprite positions when character moves
  private updateCharacterGlow(sprite: Phaser.GameObjects.Sprite, character: GameCharacter): void {
    const spriteData = sprite as any;

    // Update glow position to follow sprite
    if (character.isToly && spriteData.tolyGlow) {
      spriteData.tolyGlow.x = sprite.x;
      spriteData.tolyGlow.y = sprite.y;
    }
    if (character.isAsh && spriteData.ashGlow) {
      spriteData.ashGlow.x = sprite.x;
      spriteData.ashGlow.y = sprite.y;
    }
    if (character.isFinn && spriteData.finnGlow) {
      spriteData.finnGlow.x = sprite.x;
      spriteData.finnGlow.y = sprite.y;
    }
    if (character.isDev && spriteData.devGlow) {
      spriteData.devGlow.x = sprite.x;
      spriteData.devGlow.y = sprite.y;
    }
    if (character.isScout && spriteData.scoutGlow) {
      spriteData.scoutGlow.x = sprite.x;
      spriteData.scoutGlow.y = sprite.y;
    }
    if (character.isCJ && spriteData.cjGlow) {
      spriteData.cjGlow.x = sprite.x;
      spriteData.cjGlow.y = sprite.y;
    }
    if (character.isShaw && spriteData.shawGlow) {
      spriteData.shawGlow.x = sprite.x;
      spriteData.shawGlow.y = sprite.y;
    }
    // Academy Zone - AgenC Team
    if (character.isRamo && spriteData.ramoGlow) {
      spriteData.ramoGlow.x = sprite.x;
      spriteData.ramoGlow.y = sprite.y;
    }
    if (character.isSincara && spriteData.sincaraGlow) {
      spriteData.sincaraGlow.x = sprite.x;
      spriteData.sincaraGlow.y = sprite.y;
    }
    if (character.isStuu && spriteData.stuuGlow) {
      spriteData.stuuGlow.x = sprite.x;
      spriteData.stuuGlow.y = sprite.y;
    }
    if (character.isSam && spriteData.samGlow) {
      spriteData.samGlow.x = sprite.x;
      spriteData.samGlow.y = sprite.y;
    }
    if (character.isAlaa && spriteData.alaaGlow) {
      spriteData.alaaGlow.x = sprite.x;
      spriteData.alaaGlow.y = sprite.y;
    }
    if (character.isCarlo && spriteData.carloGlow) {
      spriteData.carloGlow.x = sprite.x;
      spriteData.carloGlow.y = sprite.y;
    }
    if (character.isBNN && spriteData.bnnGlow) {
      spriteData.bnnGlow.x = sprite.x;
      spriteData.bnnGlow.y = sprite.y;
    }
    // Founder's Corner characters
    if (character.isProfessorOak && spriteData.professorOakGlow) {
      spriteData.professorOakGlow.x = sprite.x;
      spriteData.professorOakGlow.y = sprite.y;
    }
    // Mascots
    if (character.isCityBot && spriteData.citybotGlow) {
      spriteData.citybotGlow.x = sprite.x;
      spriteData.citybotGlow.y = sprite.y;
    }
    // External agents (OpenClaws) and spawned agents (ElizaOS)
    if (
      (character.id.startsWith("external-") || character.id.startsWith("agent-")) &&
      spriteData.openClawGlow
    ) {
      spriteData.openClawGlow.x = sprite.x;
      spriteData.openClawGlow.y = sprite.y;
    }
  }

  // Update mobile label position to follow sprite movement
  // Throttled: only repositions when character has moved >= 8px from last update
  // Also hides label dynamically if it overlaps another visible label
  private updateMobileLabel(sprite: Phaser.GameObjects.Sprite): void {
    const s = sprite as any;
    if (!s._mobileLabel) return;

    // Skip update if sprite hasn't moved enough (8^2 = 64px² threshold)
    const dx = sprite.x - (s._labelLastX ?? -999);
    const dy = sprite.y - (s._labelLastY ?? -999);
    if (dx * dx + dy * dy < 64) return;

    s._labelLastX = sprite.x;
    s._labelLastY = sprite.y;
    const offset = s._mobileLabelOffset || 18;
    const newX = sprite.x;
    const newY = sprite.y + offset;
    s._mobileLabel.setPosition(newX, newY);
    if (s._mobileLabelBg) s._mobileLabelBg.setPosition(newX, newY);

    // Dynamic collision check: hide label if it now overlaps another visible label
    let overlaps = false;
    const myBg = s._mobileLabelBg as Phaser.GameObjects.Rectangle | undefined;
    if (myBg) {
      for (const otherSprite of this.characterSprites.values()) {
        if (otherSprite === sprite) continue;
        const otherBg = (otherSprite as any)._mobileLabelBg as
          | Phaser.GameObjects.Rectangle
          | undefined;
        if (!otherBg || !otherBg.active || !otherBg.visible) continue;
        const odx = Math.abs(newX - otherBg.x);
        const ody = Math.abs(newY - otherBg.y);
        if (odx < myBg.width / 2 + otherBg.width / 2 + 4 && ody < 12) {
          overlaps = true;
          break;
        }
      }
    }
    s._mobileLabel.setVisible(!overlaps);
    if (s._mobileLabelBg) s._mobileLabelBg.setVisible(!overlaps);
  }

  // Update visitor sparkle indicator position
  private updateVisitorSparkle(sprite: Phaser.GameObjects.Sprite): void {
    const sparkle = (sprite as any)._visitorSparkle;
    if (sparkle) sparkle.setPosition(sprite.x, sprite.y - 22);
  }

  // Handle character speak events (from AI behavior)
  // Cleanup method to prevent memory leaks
  // === AGENT SERVER WEBSOCKET ===

  registerZonePopupBuilding(
    id: string,
    sprite: Phaser.GameObjects.Sprite,
    data: GameBuilding,
    zone: ZoneType,
    onInteract: () => void
  ): void {
    this.zonePopupBuildings.set(id, { sprite, data, zone, onInteract });
  }

  unregisterZonePopupBuilding(id: string): void {
    this.zonePopupBuildings.delete(id);
  }

  unregisterZonePopupBuildingsByZone(zone: ZoneType): void {
    for (const [id, entry] of this.zonePopupBuildings) {
      if (entry.zone === zone) {
        this.zonePopupBuildings.delete(id);
      }
    }
  }

  private cleanup(): void {
    // Clean up tutorial
    this.clearTutorialArrows();

    // Tear down audio (context, oscillators, loop timeout, control listeners).
    this.audioSystem.cleanup();

    // Remove window event listeners
    if (this.boundBotEffect) {
      window.removeEventListener("agencity-bot-effect", this.boundBotEffect);
      this.boundBotEffect = null;
    }
    if (this.boundBotAnimal) {
      window.removeEventListener("agencity-bot-animal", this.boundBotAnimal);
      this.boundBotAnimal = null;
    }
    if (this.boundBotPokemon) {
      window.removeEventListener("agencity-bot-pokemon", this.boundBotPokemon);
      this.boundBotPokemon = null;
    }
    if (this.boundZoneChange) {
      window.removeEventListener("agencity-zone-change", this.boundZoneChange);
      this.boundZoneChange = null;
    }
    if (this.boundEnterWorld) {
      window.removeEventListener("agencity-enter-world", this.boundEnterWorld);
      this.boundEnterWorld = null;
    }
    if (this.boundExitWorld) {
      window.removeEventListener("agencity-exit-world", this.boundExitWorld);
      this.boundExitWorld = null;
    }
    if (this.boundEKeyDown) {
      window.removeEventListener("keydown", this.boundEKeyDown);
      this.boundEKeyDown = null;
    }
    if (this.boundTutorialStep) {
      window.removeEventListener("agencity-tutorial-step", this.boundTutorialStep);
      this.boundTutorialStep = null;
    }

    // Clean up local player, drop shadow, and meme textures
    if (this.localPlayer) {
      const nameLabel = (this.localPlayer as any).nameLabel as Phaser.GameObjects.Text | undefined;
      if (nameLabel) nameLabel.destroy();
      const playerShadow = (this.localPlayer as any)._shadow as
        | Phaser.GameObjects.Sprite
        | undefined;
      if (playerShadow) playerShadow.destroy();
      this.localPlayer.destroy();
      this.localPlayer = null;
    }

    // Clean up any remaining NPC drop shadows (sprites destroy themselves
    // via scene shutdown, but shadows are separate game objects)
    this.characterSprites.forEach((sprite) => {
      const shadow = (sprite as any)._shadow as Phaser.GameObjects.Sprite | undefined;
      if (shadow) {
        shadow.destroy();
        (sprite as any)._shadow = null;
      }
    });

    // Clean up persistent tap-to-move marker
    if (this.tapMarker) {
      this.tweens.killTweensOf(this.tapMarker);
      this.tapMarker.destroy();
      this.tapMarker = null;
    }
    for (const key of this.localPlayerTextureKeys) {
      if (this.textures.exists(key)) {
        this.textures.remove(key);
      }
    }
    this.localPlayerTextureKeys = [];
    this.pendingEnterWorld = null;
    if (this.interactPrompt) {
      this.interactPrompt.destroy();
      this.interactPrompt = null;
    }

    // Clean up zone-specific timers
    if (this.tickerTimer) {
      this.tickerTimer.destroy();
      this.tickerTimer = null;
    }
    if (this.billboardTimer) {
      this.billboardTimer.destroy();
      this.billboardTimer = null;
    }
    clearTrafficTimers(this);

    // Tear down sky/weather timers + emitters (lightning, apocalypse, rain).
    this.skySystem.cleanup();

    // Phase 0 memory-leak sweep: encounter/tooltip timers that were stored but
    // not previously torn down on shutdown.
    // Tear down encounter safety-timeout + clear active/stun state.
    this.encounterSystem.cleanup();
    // Tear down any open tooltip + pending hide timer.
    this.tooltipSystem.cleanup();
    // Tear down announcement banner + any lingering effect state.
    this.eventEffectSystem.cleanup();

    // Clean up speech bubble manager
    if (this.speechBubbleManager) {
      this.speechBubbleManager.destroy();
      this.speechBubbleManager = null;
    }

    // Clean up encounter listener
    if (this.boundEncounterEnd) {
      window.removeEventListener("agencity-encounter-end", this.boundEncounterEnd);
      this.boundEncounterEnd = null;
    }

    // Clean up behavior handlers
    if (this.boundBehaviorHandler) {
      window.removeEventListener("agencity-character-behavior", this.boundBehaviorHandler);
      this.boundBehaviorHandler = null;
    }
    if (this.boundSpeakHandler) {
      window.removeEventListener("agencity-character-speak", this.boundSpeakHandler);
      this.boundSpeakHandler = null;
    }
    this.characterTargets.clear();

    // Clean up agent server WebSocket
    // Tear down the agent WebSocket + reconnect/world-state timers.
    this.agentSystem.cleanup();

    // Clean up beach crabs and ambient creatures
    this.beachCrabs = [];
    this.ambientCreatures = [];

    // Phase 0 memory-leak sweep: arena polling timer + replay listener are
    // normally torn down by the arena zone's cleanup, but ensure they're gone
    // if the scene shuts down while the arena zone is active.
    if (this.arenaPollingTimer) {
      this.arenaPollingTimer.destroy();
      this.arenaPollingTimer = null;
    }
    if (this.arenaReplayCleanup) {
      this.arenaReplayCleanup();
      this.arenaReplayCleanup = null;
    }
  }

  private createGround(): void {
    // Main grass layer - positioned to fill bottom portion of screen
    const groundY = Math.round(540 * SCALE); // Moved down slightly
    const groundHeight = Math.round(180 * SCALE); // Taller to ensure full coverage
    this.ground = this.add.tileSprite(GAME_WIDTH / 2, groundY, GAME_WIDTH, groundHeight, "grass");
    this.ground.setDepth(0);

    // Add path in the middle
    const pathY = Math.round(570 * SCALE);
    this.groundPath = this.add.tileSprite(
      GAME_WIDTH / 2,
      pathY,
      GAME_WIDTH,
      Math.round(40 * SCALE),
      "path"
    );
    this.groundPath.setDepth(1);

    // Sky-to-grass transition gradient (updated by time state). Initial night
    // palette is painted by SkySystem.createSky() once it boots.
    this.groundTransition = this.add.graphics();
    this.groundTransition.setDepth(-0.5);
  }

  update(): void {
    // Phase 0 culling: pause ambient work entirely while a popup covers the
    // canvas or the tab is hidden. Local-player input is already gated inside
    // updateLocalPlayer(); the loops below are pure ambient motion that has no
    // visible effect under a modal.
    const modalOpen =
      typeof window !== "undefined" &&
      (window as any).__agencity_modal_open === true;
    const tabHidden =
      typeof document !== "undefined" && document.hidden === true;

    // Update local player movement (WASD/arrow keys + tap-to-move on mobile)
    this.updateLocalPlayer();

    // Update speech bubbles for autonomous dialogue — Phase 0: skip while a
    // popup covers the canvas so off-screen bubbles aren't allocated/pushed.
    if (!modalOpen && !tabHidden) {
      this.dialogueSystem.updateDialogueBubbles();
    }

    // Viewport bounds (plus a margin) used to cull off-screen characters.
    const view = this.cameras.main.worldView;
    const cullMargin = 100;
    const cullLeft = view.x - cullMargin;
    const cullRight = view.right + cullMargin;

    // Update character movements with AI-driven targets
    // Performance: use O(1) map lookup instead of O(n) find()
    // Phase 0 culling: skip sprites whose world bounds are outside the
    // viewport (plus margin). Movement targets are keyed by id in a Map, so an
    // off-screen NPC resumes its target correctly when it re-enters view.
    this.characterSprites.forEach((sprite, id) => {
      const character = this.characterById.get(id);
      if (!character) return;

      // Viewport cull: skip the full movement body for off-screen sprites.
      if (sprite.x < cullLeft || sprite.x > cullRight) return;

      // Get character's behavior ID (special characters map to their IDs)
      const behaviorId = this.getCharacterBehaviorId(character);
      const target = this.characterTargets.get(behaviorId);

      if (target) {
        // AI-driven movement toward target
        const dx = target.x - sprite.x;
        const dy = target.y - sprite.y;
        // Performance: use squared distance to avoid sqrt when possible
        const distSq = dx * dx + dy * dy;

        if (distSq > 25) {
          // 5^2 = 25
          const distance = Math.sqrt(distSq);
          // Performance: cache speed per character instead of random every frame
          let speed = this.characterSpeeds.get(id);
          if (!speed) {
            speed = 1.2 + Math.random() * 0.3;
            this.characterSpeeds.set(id, speed);
          }
          const moveX = (dx / distance) * speed;
          const moveY = (dy / distance) * speed;

          sprite.x += moveX;
          sprite.y += moveY;

          // Face direction of movement
          sprite.setFlipX(dx < 0);

          // Update any glow sprites, visitor sparkles, shadow
          this.updateCharacterGlow(sprite, character);
          this.updateVisitorSparkle(sprite);
          this.syncShadow(sprite);
          if (this.isMobile) this.updateMobileLabel(sprite);
        } else {
          // Reached target, clear it and reset speed for next movement
          this.characterTargets.delete(behaviorId);
          this.characterSpeeds.delete(id);
        }
      } else if (character.isMoving) {
        // Fallback: simple random wandering if no AI target
        // Performance: cache fallback speed too
        let speed = this.characterSpeeds.get(id);
        if (!speed) {
          speed = 0.3 + Math.random() * 0.2;
          this.characterSpeeds.set(id, speed);
        }
        if (character.direction === "left") {
          sprite.x -= speed;
          sprite.setFlipX(true);
          if (sprite.x < 100) {
            character.direction = "right";
            this.characterSpeeds.delete(id); // Reset speed on direction change
          }
        } else {
          sprite.x += speed;
          sprite.setFlipX(false);
          if (sprite.x > 1100) {
            character.direction = "left";
            this.characterSpeeds.delete(id); // Reset speed on direction change
          }
        }
        // Update glow, visitor sparkles, shadow on fallback movement too
        this.updateCharacterGlow(sprite, character);
        this.updateVisitorSparkle(sprite);
        this.syncShadow(sprite);
        if (this.isMobile) this.updateMobileLabel(sprite);
      }
    });

    // Cloud parallax + ambient creature roaming now lives in DecorationSystem
    // (with the Phase 0 culling guards folded in).
    this.decorationSystem.update(modalOpen, tabHidden);
  }

  updateWorldState(state: WorldState): void {
    const previousState = this.worldState;
    this.worldState = state;
    this.worldStateVersion++;

    // IMPORTANT: Update day/night FIRST so weather effects know the time
    // Always update time info to ensure correct celestial bodies
    if (state.timeInfo) {
      this.skySystem.updateDayNightFromEST(state.timeInfo);
    } else {
      console.warn("[AgenCity] No timeInfo in state!");
    }

    // Update weather AFTER time is set (check if weather changed OR if this is first load)
    if (!previousState || previousState.weather !== state.weather) {
      this.skySystem.updateWeather(state.weather);
    }

    // Update characters
    this.updateCharacters(state.population);

    // Update buildings
    this.buildingSystem.updateBuildings(state.buildings);

    // Trigger events
    if (state.events.length > 0 && previousState) {
      const newEvents = state.events.filter(
        (e) => !previousState.events.find((pe) => pe.id === e.id)
      );
      newEvents.forEach((event) => this.eventEffectSystem.triggerEvent(event));
    }
  }

  private updateCharacters(characters: GameCharacter[]): void {
    // Performance: rebuild character lookup map for O(1) access in update()
    this.characterById.clear();
    characters.forEach((c) => this.characterById.set(c.id, c));

    // Filter characters by current zone
    // Characters with matching zone or no zone (undefined) appear in current zone
    // Neo (isScout) and CJ go to Catalog (trending), others to Park (main_city)
    const zoneCharacters = characters.filter((c) => {
      if (!c.zone) return this.currentZone === "main_city"; // Default: Park
      return c.zone === this.currentZone;
    });

    const zoneCharacterIds = new Set(zoneCharacters.map((c) => c.id));

    // Show/hide sprites based on zone
    this.characterSprites.forEach((sprite, id) => {
      const shouldShow = zoneCharacterIds.has(id);
      sprite.setVisible(shouldShow);

      // Toggle mobile labels with sprite
      const s = sprite as any;
      if (s._mobileLabel) s._mobileLabel.setVisible(shouldShow);
      if (s._mobileLabelBg) s._mobileLabelBg.setVisible(shouldShow);

      // Toggle drop shadow with sprite
      if (s._shadow) s._shadow.setVisible(shouldShow);

      // Handle associated glow sprites (including Shaw and Academy characters)
      GLOW_KEYS.forEach((key) => {
        const glow = (sprite as any)[key];
        if (glow) glow.setVisible(shouldShow);
      });
    });

    const currentIds = new Set(characters.map((c) => c.id));

    // Remove old characters and their associated glow sprites
    this.characterSprites.forEach((sprite, id) => {
      if (!currentIds.has(id)) {
        // Clean up associated glow sprites before destroying (including Academy characters)
        GLOW_KEYS.forEach((key) => {
          const glow = (sprite as any)[key];
          if (glow) {
            this.tweens.killTweensOf(glow); // Stop any running tweens
            glow.destroy();
          }
        });
        // Clean up mobile labels before destroying sprite
        const sd = sprite as any;
        if (sd._mobileLabel) sd._mobileLabel.destroy();
        if (sd._mobileLabelBg) sd._mobileLabelBg.destroy();
        // Clean up visitor sparkle
        if (sd._visitorSparkle) sd._visitorSparkle.destroy();
        // Clean up drop shadow
        if (sd._shadow) {
          sd._shadow.destroy();
          sd._shadow = null;
        }
        sprite.destroy();
        this.characterSprites.delete(id);
        this.characterVariants.delete(id);
      }
    });

    // Separate characters into existing (quick update) and new (needs creation)
    // Only create sprites for characters in the current zone
    const existingCharacters: { character: GameCharacter; sprite: Phaser.GameObjects.Sprite }[] =
      [];
    const newCharacters: { character: GameCharacter; index: number }[] = [];

    characters.forEach((character, index) => {
      const sprite = this.characterSprites.get(character.id);
      if (sprite) {
        existingCharacters.push({ character, sprite });
      } else {
        // Only create new sprites for characters in the current zone
        const charZone = character.zone || "main_city"; // Default to Park
        if (charZone === this.currentZone) {
          newCharacters.push({ character, index });
        }
      }
    });

    // Update existing characters immediately (fast path)
    existingCharacters.forEach(({ character, sprite }) => {
      this.updateExistingCharacter(character, sprite);
    });

    // Batch create new characters across frames to prevent frame drops
    const BATCH_SIZE = 4; // Batch character creation across frames
    const createBatch = (startIndex: number) => {
      const endIndex = Math.min(startIndex + BATCH_SIZE, newCharacters.length);
      for (let i = startIndex; i < endIndex; i++) {
        this.createCharacterSprite(newCharacters[i].character, newCharacters[i].index);
      }
      // Schedule next batch if there are more characters
      if (endIndex < newCharacters.length) {
        this.time.delayedCall(0, () => createBatch(endIndex));
      }
    };

    if (newCharacters.length > 0) {
      createBatch(0);
    }
  }

  private updateExistingCharacter(
    character: GameCharacter,
    sprite: Phaser.GameObjects.Sprite
  ): void {
    // Update special character glow positions if they exist (including Academy characters)
    GLOW_KEYS.forEach((key) => {
      const glow = (sprite as any)[key];
      if (glow) {
        glow.x = sprite.x;
        glow.y = sprite.y;
      }
    });

    // Sync mobile labels with current sprite position
    if (this.isMobile) this.updateMobileLabel(sprite);

    // External agents (OpenClaws) and spawned agents (ElizaOS) - don't change their texture
    const isOpenClaw = character.id.startsWith("external-") || character.id.startsWith("agent-");

    // Update texture based on mood (skip for special characters including Academy and OpenClaws)
    const isToly = character.isToly === true;
    const isAsh = character.isAsh === true;
    const isFinn = character.isFinn === true;
    const isDev = character.isDev === true;
    const isScout = character.isScout === true;
    const isCJ = character.isCJ === true;
    const isShaw = character.isShaw === true;
    // Academy characters
    const isRamo = character.isRamo === true;
    const isSincara = character.isSincara === true;
    const isStuu = character.isStuu === true;
    const isSam = character.isSam === true;
    const isAlaa = character.isAlaa === true;
    const isCarlo = character.isCarlo === true;
    const isBNN = character.isBNN === true;
    // Founder's Corner characters
    const isProfessorOak = character.isProfessorOak === true;
    // Mascots
    const isCityBot = character.isCityBot === true;
    const isAcademyChar = isRamo || isSincara || isStuu || isSam || isAlaa || isCarlo || isBNN;
    const isFoundersChar = isProfessorOak;
    const isMascot = isCityBot;
    if (
      !isToly &&
      !isAsh &&
      !isFinn &&
      !isDev &&
      !isScout &&
      !isCJ &&
      !isShaw &&
      !isAcademyChar &&
      !isFoundersChar &&
      !isMascot &&
      !isOpenClaw
    ) {
      const variant = this.characterVariants.get(character.id) ?? 0;
      const expectedTexture = this.getCharacterTexture(character.mood, variant);
      if (sprite.texture?.key !== expectedTexture) {
        sprite.setTexture(expectedTexture);
      }
    }
  }

  private createCharacterSprite(character: GameCharacter, index: number): void {
    // External agents (DB-registered) and spawned agents (ElizaOS) use crab/lobster sprites
    const isExternalAgent = character.id.startsWith("external-");
    const isSpawnedAgent = character.id.startsWith("agent-");
    const isMoltbookAgent =
      (isExternalAgent || isSpawnedAgent) && character.provider === "moltbook";
    const isOpenClaw = isExternalAgent || isSpawnedAgent;

    // Special characters use unique textures, others get random variants
    const isToly = character.isToly === true;
    const isAsh = character.isAsh === true;
    const isFinn = character.isFinn === true;
    const isDev = character.isDev === true;
    const isScout = character.isScout === true;
    const isCJ = character.isCJ === true;
    const isShaw = character.isShaw === true;
    // Academy characters
    const isRamo = character.isRamo === true;
    const isSincara = character.isSincara === true;
    const isStuu = character.isStuu === true;
    const isSam = character.isSam === true;
    const isAlaa = character.isAlaa === true;
    const isCarlo = character.isCarlo === true;
    const isBNN = character.isBNN === true;
    // Founder's Corner characters
    const isProfessorOak = character.isProfessorOak === true;
    // Mascots
    const isCityBot = character.isCityBot === true;
    // Platform visitors
    const isVisitor = character.isVisitor === true;
    const isAcademyChar = isRamo || isSincara || isStuu || isSam || isAlaa || isCarlo || isBNN;
    const isFoundersChar = isProfessorOak;
    const isMascot = isCityBot;
    const isSpecial =
      isToly ||
      isAsh ||
      isFinn ||
      isDev ||
      isScout ||
      isCJ ||
      isShaw ||
      isAcademyChar ||
      isFoundersChar ||
      isMascot ||
      isOpenClaw;
    const variant = index % 9;
    this.characterVariants.set(character.id, variant);

    const textureKey = isOpenClaw
      ? isMoltbookAgent
        ? "agent_lobster"
        : "agent_crab"
      : isToly
        ? "toly"
        : isAsh
          ? "ash"
          : isFinn
            ? "finn"
            : isDev
              ? "dev"
              : isScout
                ? "neo"
                : isCJ
                  ? "cj"
                  : isShaw
                    ? "shaw"
                    : isRamo
                      ? "ramo"
                      : isSincara
                        ? "sincara"
                        : isStuu
                          ? "stuu"
                          : isSam
                            ? "sam"
                            : isAlaa
                              ? "alaa"
                              : isCarlo
                                ? "carlo"
                                : isBNN
                                  ? "bnn"
                                  : isProfessorOak
                                    ? "professorOak"
                                    : isCityBot
                                      ? "citybot"
                                      : this.getCharacterTexture(character.mood, variant);
    const sprite = this.add.sprite(character.x, character.y, textureKey);
    sprite.setDepth(isSpecial ? 11 : 10); // Special characters slightly above others
    if (this.isMobile) {
      sprite.setInteractive(
        new Phaser.Geom.Rectangle(-40, -40, 80, 80),
        Phaser.Geom.Rectangle.Contains
      );
    } else {
      sprite.setInteractive();
    }
    (sprite as any)._characterId = character.id;
    sprite.setScale(isSpecial ? 1.3 : 1.2); // Special characters slightly larger

    // Drop shadow under NPC feet — keeps them grounded and adds depth.
    // Special characters get a slightly wider shadow to match their larger scale.
    this.attachShadow(sprite, isSpecial ? 0.95 : 0.85);

    // Visitor sparkle indicator
    if (isVisitor) {
      const sparkle = this.add.text(character.x, character.y - 22, "✦", {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#fbbf24",
      });
      sparkle.setOrigin(0.5, 0.5);
      sparkle.setDepth(12);
      (sprite as any)._visitorSparkle = sparkle;
    }

    // Persistent name label on mobile (always visible, no hover needed)
    // Max 3 labels on small screens; skip if it would overlap an existing label
    const maxLabels = this.scale.width >= 600 ? 6 : 3;
    if (this.isMobile && index < maxLabels) {
      const charName = character.username || character.id;
      const displayName = charName.length > 8 ? charName.substring(0, 8) : charName;
      const smallScreen = this.scale.width < 430;
      const labelFontSize = smallScreen ? "7px" : "8px";
      const charWidth = smallScreen ? 5 : 5.5;
      const labelW = displayName.length * charWidth + 6;
      const labelH = 12;
      // Stagger labels: even indices below, odd indices above to reduce overlap
      const labelYOffset = index % 2 === 0 ? 18 : -20;
      const lx = character.x;
      const ly = character.y + labelYOffset;

      // Check collision with already-placed labels
      let collides = false;
      this.characterSprites.forEach((otherSprite) => {
        const otherBg = (otherSprite as any)._mobileLabelBg as
          | Phaser.GameObjects.Rectangle
          | undefined;
        if (!otherBg || !otherBg.active) return;
        const dx = Math.abs(lx - otherBg.x);
        const dy = Math.abs(ly - otherBg.y);
        if (dx < labelW / 2 + otherBg.width / 2 + 4 && dy < labelH) {
          collides = true;
        }
      });

      if (!collides) {
        const labelBg = this.add.rectangle(lx, ly, labelW, labelH, 0x000000, 0.75);
        labelBg.setDepth(12);
        const nameLabel = this.add.text(lx, ly, displayName.toUpperCase(), {
          fontFamily: "monospace",
          fontSize: labelFontSize,
          color: "#ffffff",
        });
        nameLabel.setOrigin(0.5, 0.5);
        nameLabel.setDepth(13);
        (sprite as any)._mobileLabel = nameLabel;
        (sprite as any)._mobileLabelBg = labelBg;
        (sprite as any)._mobileLabelOffset = labelYOffset;
      }
    }

    // Hover effects
    sprite.on("pointerover", () => {
      sprite?.setScale(isSpecial ? 1.5 : 1.4);
      if (isOpenClaw) {
        // External agents (Openclaws) show their Moltbook profile tooltip
        this.tooltipSystem.showOpenClawTooltip(character, sprite!, isMoltbookAgent);
      } else if (isToly) {
        this.tooltipSystem.showTolyTooltip(sprite!);
      } else if (isAsh) {
        this.tooltipSystem.showAshTooltip(sprite!);
      } else if (isFinn) {
        this.tooltipSystem.showFinnTooltip(sprite!);
      } else if (isDev) {
        this.tooltipSystem.showDevTooltip(sprite!);
      } else if (isScout) {
        this.tooltipSystem.showScoutTooltip(sprite!);
      } else if (isCJ) {
        this.tooltipSystem.showCJTooltip(sprite!);
      } else if (isShaw) {
        this.tooltipSystem.showShawTooltip(sprite!);
      } else if (isRamo) {
        this.tooltipSystem.showRamoTooltip(sprite!);
      } else if (isSincara) {
        this.tooltipSystem.showSincaraTooltip(sprite!);
      } else if (isStuu) {
        this.tooltipSystem.showStuuTooltip(sprite!);
      } else if (isSam) {
        this.tooltipSystem.showSamTooltip(sprite!);
      } else if (isAlaa) {
        this.tooltipSystem.showAlaaTooltip(sprite!);
      } else if (isCarlo) {
        this.tooltipSystem.showCarloTooltip(sprite!);
      } else if (isBNN) {
        this.tooltipSystem.showBNNTooltip(sprite!);
      } else if (isProfessorOak) {
        this.tooltipSystem.showProfessorOakTooltip(sprite!);
      } else if (isCityBot) {
        this.tooltipSystem.showCityBotTooltip(sprite!);
      } else if (isVisitor) {
        this.tooltipSystem.showVisitorTooltip(character, sprite!);
      } else {
        this.tooltipSystem.showCharacterTooltip(character, sprite!);
      }
      this.input.setDefaultCursor("pointer");
    });
    sprite.on("pointerout", () => {
      sprite?.setScale(isSpecial ? 1.3 : 1.2);
      // Delay tooltip hide so "Visit Profile" button can be clicked
      this.tooltipSystem.scheduleHideTooltip();
      this.input.setDefaultCursor("default");
    });
    sprite.on("pointerup", () => {
      if (this.wasDragGesture) return;
      // On mobile, skip if player is too far — tap-to-move walks there
      if (this.isMobile && this.playerEnabled && this.localPlayer) {
        const dist = Math.abs(this.localPlayer.x - sprite.x);
        if (dist > 150) return;
      }

      if (isOpenClaw) {
        // Show tooltip with "Visit Profile" button instead of navigating directly
        this.tooltipSystem.showCharacterTooltip(character, sprite!);
      } else if (isToly) {
        // Toly opens the Solana wisdom chat
        window.dispatchEvent(new CustomEvent("agencity-toly-click"));
      } else if (isAsh) {
        // Ash opens the ecosystem guide chat
        window.dispatchEvent(new CustomEvent("agencity-ash-click"));
      } else if (isFinn) {
        // Finn opens the AgenC guide chat
        window.dispatchEvent(new CustomEvent("agencity-finn-click"));
      } else if (isDev) {
        // The Dev opens the trading agent chat
        window.dispatchEvent(new CustomEvent("agencity-dev-click"));
      } else if (isScout) {
        // Neo opens the scout panel
        window.dispatchEvent(new CustomEvent("agencity-scout-click"));
      } else if (isCJ) {
        // CJ opens the hood rat chat
        window.dispatchEvent(new CustomEvent("agencity-cj-click"));
      } else if (isShaw) {
        // Shaw opens the ElizaOS creator chat
        window.dispatchEvent(new CustomEvent("agencity-shaw-click"));
      } else if (isRamo) {
        // Ramo opens the CTO chat
        window.dispatchEvent(new CustomEvent("agencity-ramo-click"));
      } else if (isSincara) {
        // Sincara opens the frontend engineer chat
        window.dispatchEvent(new CustomEvent("agencity-sincara-click"));
      } else if (isStuu) {
        // Stuu opens the operations chat
        window.dispatchEvent(new CustomEvent("agencity-stuu-click"));
      } else if (isSam) {
        // Sam opens the growth chat
        window.dispatchEvent(new CustomEvent("agencity-sam-click"));
      } else if (isAlaa) {
        // Alaa opens the skunk works chat
        window.dispatchEvent(new CustomEvent("agencity-alaa-click"));
      } else if (isCarlo) {
        // Carlo opens the community chat
        window.dispatchEvent(new CustomEvent("agencity-carlo-click"));
      } else if (isBNN) {
        // BNN opens the news network chat
        window.dispatchEvent(new CustomEvent("agencity-bnn-click"));
      } else if (isProfessorOak) {
        // Professor Oak opens the token launch guide chat
        window.dispatchEvent(new CustomEvent("agencity-professoroak-click"));
      } else if (isCityBot) {
        // CityBot opens the mascot chat
        window.dispatchEvent(new CustomEvent("agencity-citybot-click"));
      } else if (character.profileUrl) {
        // Show tooltip with "Visit Profile" button instead of navigating directly
        this.tooltipSystem.showCharacterTooltip(character, sprite!);
      }
    });

    // Walking animation - characters randomly walk around the park
    this.characterSystem.startCharacterWalking(sprite, character, isSpecial);

    // Add glow effects for special characters (configuration-driven)
    const glowConfigs: Array<{
      active: boolean;
      key: string;
      tint: number;
      alpha?: number;
      targetAlpha?: number;
      scale?: number;
      duration?: number;
    }> = [
      { active: isToly, key: "tolyGlow", tint: 0x9945ff },
      { active: isAsh, key: "ashGlow", tint: 0xdc2626 },
      { active: isFinn, key: "finnGlow", tint: 0x10b981 },
      { active: isDev, key: "devGlow", tint: 0x8b5cf6 },
      {
        active: isScout,
        key: "scoutGlow",
        tint: 0x00ff41,
        alpha: 0.4,
        targetAlpha: 0.7,
        scale: 1.3,
        duration: 800,
      },
      { active: isCJ, key: "cjGlow", tint: 0xf97316, duration: 1200 },
      { active: isShaw, key: "shawGlow", tint: 0xff5800, duration: 1000 },
      // Academy character glows
      { active: isRamo, key: "ramoGlow", tint: 0x3b82f6, duration: 1100 }, // Blue - technical
      { active: isSincara, key: "sincaraGlow", tint: 0xec4899, duration: 1300 }, // Pink - creative
      { active: isStuu, key: "stuuGlow", tint: 0x22c55e, duration: 1000 }, // Green - support
      { active: isSam, key: "samGlow", tint: 0xfbbf24, duration: 900 }, // Yellow - marketing energy
      {
        active: isAlaa,
        key: "alaaGlow",
        tint: 0x6366f1,
        alpha: 0.5,
        targetAlpha: 0.8,
        duration: 700,
      }, // Indigo - mysterious
      { active: isCarlo, key: "carloGlow", tint: 0xf97316, duration: 1100 }, // Orange - community warmth
      { active: isBNN, key: "bnnGlow", tint: 0x06b6d4, duration: 800 }, // Cyan - news/info
      // Founder's Corner character glows
      { active: isProfessorOak, key: "professorOakGlow", tint: 0xfbbf24, duration: 1000 }, // Amber - wisdom
      // Mascot glows
      { active: isCityBot, key: "citybotGlow", tint: 0x00ff00, duration: 900 }, // Bright green - money bag energy
      // External agent (OpenClaw) glows - lobsters are red, crabs are orange
      {
        active: isOpenClaw,
        key: "openClawGlow",
        tint: isMoltbookAgent ? 0xff4444 : 0xffa500,
        alpha: 0.4,
        targetAlpha: 0.7,
        scale: 1.25,
        duration: 1000,
      },
    ];

    for (const cfg of glowConfigs) {
      if (!cfg.active) continue;
      const glow = this.add.sprite(character.x, character.y, "glow");
      glow.setScale(1.0);
      glow.setAlpha(cfg.alpha ?? 0.3);
      glow.setTint(cfg.tint);
      glow.setDepth(10);
      (sprite as any)[cfg.key] = glow;
      this.tweens.add({
        targets: glow,
        alpha: cfg.targetAlpha ?? 0.5,
        scale: cfg.scale ?? 1.2,
        duration: cfg.duration ?? 1500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Store character type flags on sprite for speech bubble system
    Object.assign(sprite, {
      isToly,
      isAsh,
      isFinn,
      isDev,
      isScout,
      isCJ,
      isShaw,
      isRamo,
      isSincara,
      isStuu,
      isSam,
      isAlaa,
      isCarlo,
      isBNN,
      isProfessorOak,
      isCityBot,
      isOpenClaw,
      isMoltbookAgent,
    });

    // Register external agents (crabs/lobsters) for wandering behavior on MoltBeach
    if (isOpenClaw && character.zone === "moltbook") {
      // Check if already registered
      const existingCrab = this.beachCrabs.find((c) => c.characterId === character.id);
      if (!existingCrab) {
        this.beachCrabs.push({
          characterId: character.id,
          sprite: sprite,
          targetX: character.x + (Math.random() - 0.5) * Math.round(200 * SCALE),
          speed: 0.3 + Math.random() * 0.2, // Slower than animals - crabs are chill
          direction: Math.random() > 0.5 ? "left" : "right",
          idleTimer: Math.floor(Math.random() * 100), // Start at random idle state
          isIdle: Math.random() > 0.5, // Some start idle, some start moving
          baseY: character.y,
          isLobster: isMoltbookAgent,
        });
      }
    }

    this.characterSprites.set(character.id, sprite);
  }

  private getCharacterTexture(mood: GameCharacter["mood"], variant: number): string {
    const moodSuffix = mood === "neutral" ? "" : `_${mood}`;
    return `character_${variant}${moodSuffix}`;
  }



  // Animal control methods for City Bot (scaled positions)

  // Fireworks effect - multiple bursts in the sky (scaled)
  // Character walking system with activity variety

  // === WILD ENCOUNTER SYSTEM ===

}
