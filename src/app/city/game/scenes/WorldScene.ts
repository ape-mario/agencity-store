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
import { CameraSystem } from "../systems/CameraSystem";
import { ZoneSystem } from "../systems/ZoneSystem";
import { PlayerSystem } from "../systems/PlayerSystem";
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

  /** Mobile camera drag/pan/zoom + tap-vs-drag detection. */
  public cameraSystem: CameraSystem = new CameraSystem(this);

  /** Zone transitions, setup/clear, offscreen caching, popup-building registry. */
  public zoneSystem: ZoneSystem = new ZoneSystem(this);

  /** Local player controls, enter/exit world, tap-to-move, helper NPC, tutorial. */
  public playerSystem: PlayerSystem = new PlayerSystem(this);

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

  // ── Zone passthroughs ───────────────────────────────────────────────────
  // Zone setup files call these on the scene; they delegate to ZoneSystem.
  registerZonePopupBuilding(
    id: string,
    sprite: Phaser.GameObjects.Sprite,
    data: GameBuilding,
    zone: ZoneType,
    onInteract: () => void
  ): void {
    this.zoneSystem.registerZonePopupBuilding(id, sprite, data, zone, onInteract);
  }
  unregisterZonePopupBuilding(id: string): void {
    this.zoneSystem.unregisterZonePopupBuilding(id);
  }
  unregisterZonePopupBuildingsByZone(zone: ZoneType): void {
    this.zoneSystem.unregisterZonePopupBuildingsByZone(zone);
  }
  storeZoneElementPositions(elements: Phaser.GameObjects.GameObject[]): void {
    this.zoneSystem.storeZoneElementPositions(elements);
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
  public isTransitioning = false; // Prevent overlapping transitions
  public trendingElements: Phaser.GameObjects.GameObject[] = [];
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
  public localPlayerTextureKeys: string[] = []; // Track meme textures for cleanup
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
  public zoneGround: Phaser.GameObjects.TileSprite | null = null;
  public zonePath: Phaser.GameObjects.TileSprite | null = null;
  public billboardTexts: Phaser.GameObjects.Text[] = [];
  public tickerText: Phaser.GameObjects.Text | null = null;
  public tickerOffset = 0;
  public tickerTimer: Phaser.Time.TimerEvent | null = null;
  public cachedTickerContent: string | null = null;
  public tickerWorldStateVersion = -1;
  public worldStateVersion = 0;
  public skylineSprites: Phaser.GameObjects.Sprite[] = [];
  public distantSkylineGfx: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Rectangle)[] = []; // Persistent background skyline (not animated in transitions)
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
  public characterById: Map<string, GameCharacter> = new Map();
  // Performance: cached movement speeds per character (avoid random() every frame)
  private characterSpeeds: Map<string, number> = new Map();

  // === LOCAL PLAYER CONTROLS ===
  public localPlayer: Phaser.GameObjects.Sprite | null = null;
  public playerEnabled = false; // Disabled by default - enabled via "Enter World" button
  public interactPrompt: Phaser.GameObjects.Container | null = null; // "Press E to talk/enter" UI

  // Helper/guide NPC (created by PlayerSystem; visibility toggled by ZoneSystem)
  public helperNPC: Phaser.GameObjects.Sprite | null = null;

  // NPC Awareness — NPCs greet the player when approached
  public previousNearbyNPC: GameCharacter | null = null;
  public npcGreetCooldowns: Map<string, number> = new Map();
  public readonly NPC_GREET_COOLDOWN_MS = 60000; // 60s per NPC
  public lastNpcGreetTime = 0;
  public readonly GLOBAL_NPC_GREET_COOLDOWN_MS = 12000; // 12s between any greetings
  public npcGreetZoneEntryTime = 0; // suppress greetings for 5s after zone entry
  public readonly NPC_GREET_ZONE_GRACE_MS = 5000;

  // Wild Encounter system state now lives in EncounterSystem; only the window
  // listener binding is tracked here for cleanup.
  private boundEncounterEnd: ((e: Event) => void) | null = null;
  public boundEnterWorld: ((e: Event) => void) | null = null;
  public boundExitWorld: ((e: Event) => void) | null = null;
  public boundTutorialStep: ((e: Event) => void) | null = null;
  public pendingEnterWorld: (() => void) | null = null; // Queued spawn when zone is transitioning

  public isMobile = false;

  // Immersive camera state
  public cameraFollowing = false;

  // Drag detection: prevents accidental taps when scrolling on mobile
  public touchStartPos: { x: number; y: number } | null = null;
  public touchStartTime = 0; // Timestamp of last pointerdown — used to detect long-press sprint
  public wasDragGesture = false; // public: TooltipSystem reads it to suppress profile opens after a drag
  private static readonly TAP_DISTANCE_THRESHOLD = 12; // pixels
  private static readonly LONG_PRESS_SPRINT_MS = 250; // Hold this long to sprint on release

  // Tap-to-move (mobile only). `sprint` is set at release time from press duration.
  public moveTarget: { x: number; sprint: boolean } | null = null;
  public moveTargetBuilding: GameBuilding | null = null;
  public moveTargetNPC: GameCharacter | null = null;
  public tapMarker: Phaser.GameObjects.Container | null = null;

  // Mobile drag-to-pan disabled when player is in world
  public mobileDragPanEnabled = true;

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
    this.zoneSystem.storeOriginalPositions();

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
    this.boundZoneChange = (e: Event) => this.zoneSystem.handleZoneChange(e as CustomEvent);
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
    this.playerSystem.setupLocalPlayer();

    // Setup mobile camera controls (drag to pan, pinch to zoom)
    this.cameraSystem.setupMobileCameraControls();

    // Set up tap-to-move input handler (mobile only)
    this.playerSystem.setupTapToMove();

    // Listen for tutorial step changes from React
    this.playerSystem.initTutorialListener();

    // Connect to agent server for bidirectional communication
    this.agentSystem.connect();

    // Extract Phaser textures to data URLs for React battle overlay
    extractBattleTextures(this);

    // Signal to React that the scene is ready for worldState updates
    window.dispatchEvent(new Event("worldscene-ready"));
  }

  // === LOCAL PLAYER SETUP ===
  public attachShadow(sprite: Phaser.GameObjects.Sprite, scaleX: number): void {
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
  public syncShadow(sprite: Phaser.GameObjects.Sprite): void {
    const shadow = (sprite as any)._shadow as Phaser.GameObjects.Sprite | undefined;
    if (!shadow) return;
    const offsetY = (sprite as any)._shadowFeetOffsetY ?? 0;
    shadow.x = sprite.x;
    shadow.y = sprite.y + offsetY;
  }

  // Velocity kick for responsive tap feel — sprint taps kick at sprint speed,
  // walk taps kick at walk speed. Both at 50% to feel snappy without overshooting.

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

  private cleanup(): void {
    // Tear down player resources (tutorial arrows, E-key listener, interact
    // prompt, tap marker, meme textures, iris overlay).
    this.playerSystem.destroy();

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
    this.playerSystem.updateLocalPlayer();

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

  public updateCharacters(characters: GameCharacter[]): void {
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
