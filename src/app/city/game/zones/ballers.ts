import type { WorldScene } from "../scenes/WorldScene";
import { SCALE } from "../textures/constants";

const GAME_WIDTH = 1280;

/**
 * Setup Ballers Valley zone - Luxury Bel Air estate environment
 * Mansions placed dynamically from game state; this handles decorations.
 */
export function setupBallersZone(scene: WorldScene): void {
  // Restore normal sky (persistent layer - not modified per-zone)
  scene.restoreNormalSky();

  // Hide default grass - we draw custom luxury ground
  scene.ground.setVisible(false);

  // Always clear and re-register zone popup buildings so E-key stays in sync
  scene.unregisterZonePopupBuildingsByZone("ballers");

  // Check if elements were destroyed (can happen during transitions)
  const elementsValid =
    scene.ballersElements.length > 0 &&
    scene.ballersElements.every((el) => (el as any).active !== false);

  if (!elementsValid && scene.ballersZoneCreated) {
    scene.ballersElements = [];
    scene.ballersZoneCreated = false;
  }

  if (!scene.ballersZoneCreated) {
    createBallersDecorations(scene);
    scene.storeZoneElementPositions(scene.ballersElements);
    scene.ballersZoneCreated = true;
  } else {
    scene.ballersElements.forEach((el) => (el as any).setVisible(true));
  }
}

/**
 * Create Ballers Valley decorations - Luxury Bel Air estate environment
 * Uses proper AgenCity pixel art textures from BootScene
 */
function createBallersDecorations(scene: WorldScene): void {
  const centerX = GAME_WIDTH / 2;
  const groundY = Math.round(550 * SCALE);
  const pathY = Math.round(565 * SCALE);

  // === LUXURY LAWN (tileSprite using generated texture) ===
  const lawnTile = scene.add.tileSprite(
    GAME_WIDTH / 2,
    Math.round(500 * SCALE),
    GAME_WIDTH,
    Math.round(140 * SCALE),
    "luxury_lawn"
  );
  lawnTile.setDepth(-1);
  scene.ballersElements.push(lawnTile);

  // === MARBLE PATHWAY (tileSprite using generated texture) ===
  const marbleTile = scene.add.tileSprite(
    GAME_WIDTH / 2,
    pathY,
    GAME_WIDTH,
    Math.round(55 * SCALE),
    "marble_path"
  );
  marbleTile.setDepth(0);
  scene.ballersElements.push(marbleTile);

  // Gold trim borders on pathway
  const goldTrimTop = scene.add.rectangle(
    GAME_WIDTH / 2,
    pathY - Math.round(27 * SCALE),
    GAME_WIDTH,
    Math.round(4 * SCALE),
    0xd4a017
  );
  goldTrimTop.setDepth(1);
  scene.ballersElements.push(goldTrimTop);

  const goldTrimBottom = scene.add.rectangle(
    GAME_WIDTH / 2,
    pathY + Math.round(27 * SCALE),
    GAME_WIDTH,
    Math.round(4 * SCALE),
    0xd4a017
  );
  goldTrimBottom.setDepth(1);
  scene.ballersElements.push(goldTrimBottom);

  // === ORNATE GOLDEN FOUNTAIN (sprite texture) ===
  const fountain = scene.add.sprite(centerX, groundY - Math.round(5 * SCALE), "gold_fountain");
  fountain.setOrigin(0.5, 1);
  fountain.setDepth(2);
  scene.ballersElements.push(fountain);

  // === TOPIARIES (sprite textures) ===
  const topiaryPositions = [
    { x: Math.round(100 * SCALE), scale: 1.0 },
    { x: Math.round(260 * SCALE), scale: 0.85 },
    { x: Math.round(540 * SCALE), scale: 0.85 },
    { x: Math.round(700 * SCALE), scale: 1.0 },
  ];

  topiaryPositions.forEach(({ x, scale }) => {
    const topiary = scene.add.sprite(x, groundY, "topiary");
    topiary.setOrigin(0.5, 1);
    topiary.setScale(scale);
    topiary.setDepth(2);
    scene.ballersElements.push(topiary);
  });

  // === GOLD LAMP POSTS (sprite textures) ===
  const lampPositions = [
    Math.round(50 * SCALE),
    Math.round(180 * SCALE),
    Math.round(620 * SCALE),
    Math.round(750 * SCALE),
  ];

  lampPositions.forEach((lx) => {
    const lamp = scene.add.sprite(lx, groundY, "gold_lamp");
    lamp.setOrigin(0.5, 1);
    lamp.setDepth(3);
    scene.ballersElements.push(lamp);
  });

  // === IRON GATES (sprite textures) ===
  // Left gate
  const leftGate = scene.add.sprite(Math.round(30 * SCALE), groundY, "iron_gate");
  leftGate.setOrigin(0.5, 1);
  leftGate.setDepth(4);
  scene.ballersElements.push(leftGate);

  // Right gate (flipped)
  const rightGate = scene.add.sprite(GAME_WIDTH - Math.round(30 * SCALE), groundY, "iron_gate");
  rightGate.setOrigin(0.5, 1);
  rightGate.setFlipX(true);
  rightGate.setDepth(4);
  scene.ballersElements.push(rightGate);

  // === GOLD URNS/STATUES (sprite textures) ===
  const urnPositions = [Math.round(340 * SCALE), Math.round(460 * SCALE)];

  urnPositions.forEach((ux) => {
    const urn = scene.add.sprite(ux, groundY, "gold_urn");
    urn.setOrigin(0.5, 1);
    urn.setDepth(2);
    scene.ballersElements.push(urn);
  });

  // === RED CARPET (sprite texture) ===
  const carpet = scene.add.sprite(centerX, groundY + Math.round(15 * SCALE), "red_carpet");
  carpet.setOrigin(0.5, 1);
  carpet.setDepth(1);
  scene.ballersElements.push(carpet);

  // === ADDITIONAL DECORATIVE HEDGES (using existing bush texture with tint) ===
  const hedgePositions = [Math.round(150 * SCALE), Math.round(650 * SCALE)];

  hedgePositions.forEach((hx) => {
    const hedge = scene.add.sprite(hx, groundY - Math.round(5 * SCALE), "bush");
    hedge.setOrigin(0.5, 1);
    hedge.setScale(1.3);
    hedge.setTint(0x145214); // Darker green for manicured look
    hedge.setDepth(2);
    scene.ballersElements.push(hedge);
  });

  // === DECORATIVE FLOWERS along pathway ===
  const flowerPositions = [
    Math.round(120 * SCALE),
    Math.round(220 * SCALE),
    Math.round(580 * SCALE),
    Math.round(680 * SCALE),
  ];

  flowerPositions.forEach((fx) => {
    const flower = scene.add.sprite(fx, groundY - Math.round(3 * SCALE), "flower");
    flower.setOrigin(0.5, 1);
    flower.setTint(0xffd700); // Gold flowers for luxury feel
    flower.setDepth(2);
    scene.ballersElements.push(flower);
  });

  // === EARNINGS HALL (brown workshop moved from Proof zone) - Opens Earnings popup ===
  const earningsHall = scene.add.sprite(centerX, pathY, "founders_0");
  earningsHall.setOrigin(0.5, 1);
  earningsHall.setDepth(5);
  earningsHall.setInteractive({ useHandCursor: true });
  const openEarnings = () => {
    window.dispatchEvent(
      new CustomEvent("agencity-building-click", {
        detail: {
          mint: "earnings",
          symbol: "EARNINGS",
          name: "Earnings",
          tokenUrl: "/earnings",
          isPlatform: true,
          platformTheme: "palace",
        },
      })
    );
  };

  earningsHall.on("pointerup", () => {
    if ((scene as any).wasDragGesture) return;
    openEarnings();
  });

  // Register for E-key / proximity interaction
  scene.registerZonePopupBuilding(
    "earnings-hall",
    earningsHall,
    {
      id: "earnings-hall",
      tokenMint: "earnings",
      name: "Earnings",
      symbol: "EARNINGS",
      x: centerX,
      y: pathY,
      level: 1,
      health: 100,
      glowing: false,
      ownerId: "",
      isPlatform: true,
      platformTheme: "palace",
      zone: "ballers",
    },
    "ballers",
    openEarnings
  );

  earningsHall.on("pointerover", () => {
    earningsHall.setTint(0xdddddd);
    scene.tweens.add({
      targets: earningsHall,
      scaleX: 1.02,
      scaleY: 1.02,
      duration: 100,
      ease: "Power2",
    });
  });
  earningsHall.on("pointerout", () => {
    earningsHall.clearTint();
    scene.tweens.add({
      targets: earningsHall,
      scaleX: 1,
      scaleY: 1,
      duration: 100,
      ease: "Power2",
    });
  });
  scene.ballersElements.push(earningsHall);

  // Popup marker above the Earnings Hall
  const earningsMarker = scene.add.text(centerX, pathY - Math.round(110 * SCALE), "\u25BC", {
    fontSize: "18px",
    color: "#ef4444",
    fontFamily: "monospace",
  });
  earningsMarker.setOrigin(0.5, 1);
  earningsMarker.setDepth(100);
  scene.tweens.add({
    targets: earningsMarker,
    y: pathY - Math.round(122 * SCALE),
    duration: 600,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });
  scene.ballersElements.push(earningsMarker);

  // Earnings Hall label
  const earningsLabelBg = scene.add.rectangle(
    centerX,
    pathY + Math.round(18 * SCALE),
    Math.round(78 * SCALE),
    Math.round(24 * SCALE),
    0x000000,
    0.7
  );
  earningsLabelBg.setDepth(6);
  earningsLabelBg.setStrokeStyle(1, 0xfbbf24);
  scene.ballersElements.push(earningsLabelBg);

  const earningsLabel = scene.add.text(centerX, pathY + Math.round(18 * SCALE), "EARNINGS", {
    fontFamily: "monospace",
    fontSize: `${Math.round(8 * SCALE)}px`,
    color: "#fbbf24",
    align: "center",
  });
  earningsLabel.setOrigin(0.5, 0.5);
  earningsLabel.setDepth(7);
  scene.ballersElements.push(earningsLabel);

  // === LUXURY SUPERCAR parked outside #1 WHALE mansion ===
  // Position slightly right of center, on the pathway
  const supercar = scene.add.sprite(
    centerX + Math.round(80 * SCALE),
    pathY + Math.round(5 * SCALE),
    "supercar"
  );
  supercar.setOrigin(0.5, 1);
  supercar.setDepth(3);
  supercar.setFlipX(true); // Face toward the mansion
  scene.ballersElements.push(supercar);

  // Add a subtle glow/reflection under the car for extra luxury feel
  const carGlow = scene.add.ellipse(
    centerX + Math.round(80 * SCALE),
    pathY + Math.round(12 * SCALE),
    Math.round(70 * SCALE),
    Math.round(12 * SCALE),
    0xffd700,
    0.15
  );
  carGlow.setDepth(2);
  scene.ballersElements.push(carGlow);
}
