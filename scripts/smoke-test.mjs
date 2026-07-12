/**
 * E2E smoke test for the AgenCity Phaser game.
 *
 * Exercises the behaviors the WorldScene system-extraction could have broken:
 *   1. The game boots — a <canvas> mounts and the React HUD hydrates with no
 *      uncaught runtime errors.
 *   2. The Phaser WorldScene is active and all 11 extracted systems are wired
 *      (reached via window.__agencity_game, exposed by GameCanvas).
 *   3. A zone-popup route (/catalog) re-mounts the game cleanly (canvas
 *      reappears, catalog content renders).
 *   4. No severe console errors fire during boot + navigation.
 *
 * Drives real Chrome via puppeteer-core (no browser download). Point SHOT_URL
 * at a running `next dev` / `next start` server.
 *
 *   SHOT_URL=http://localhost:3000 node scripts/smoke-test.mjs
 *
 * Exits non-zero on any failed assertion so it can gate CI / pre-merge.
 */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const CHROME =
  process.env.SHOT_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = process.env.SHOT_URL ?? "http://localhost:3000/";
const TIMEOUT = parseInt(process.env.SHOT_TIMEOUT ?? "120000", 10);

if (!existsSync(CHROME)) {
  console.error("Chrome not found at", CHROME);
  process.exit(1);
}

/** Collected failures. */
const errors = [];

function check(label, cond) {
  console.log(`${cond ? "  ✓" : "  ✗"} ${label}`);
  if (!cond) errors.push(label);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    // Phaser needs a real WebGL/Canvas2D context even headless.
    "--use-gl=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
  ],
});

async function waitForCanvas(page) {
  await page.waitForFunction(
    () =>
      document.querySelectorAll("canvas").length >= 1 &&
      /AGENCITY/i.test(document.body.innerText || ""),
    { timeout: TIMEOUT },
  );
}

async function probeSystems(page) {
  return page.evaluate(() => {
    const game = window.__agencity_game;
    if (!game) return { gameFound: false };
    const ws = game.scene && game.scene.getScene("WorldScene");
    if (!ws || !ws.scene) return { gameFound: true, sceneFound: false };
    const s = (name) => !!ws[name];
    return {
      gameFound: true,
      sceneFound: true,
      sceneIsActive: ws.scene.isActive(),
      systems: {
        audioSystem: s("audioSystem"),
        tooltipSystem: s("tooltipSystem"),
        eventEffectSystem: s("eventEffectSystem"),
        skySystem: s("skySystem"),
        decorationSystem: s("decorationSystem"),
        characterSystem: s("characterSystem"),
        buildingSystem: s("buildingSystem"),
        encounterSystem: s("encounterSystem"),
        dialogueSystem: s("dialogueSystem"),
        agentSystem: s("agentSystem"),
        cameraSystem: s("cameraSystem"),
      },
      // The scene's own fields the update loop + input read — confirm the
      // extraction didn't orphan any of the core coordination state.
      coreFields: {
        currentZone: typeof ws.currentZone === "string",
        localPlayer: true, // may be null until "Enter World" — just confirm no throw
        characterSprites: ws.characterSprites instanceof Map,
        characterTargets: ws.characterTargets instanceof Map,
      },
    };
  });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });

  // Capture page crashes + severe console errors. Tolerate 3rd-party network
  // noise (wallet adapter, analytics, favicon) but fail on Phaser/React errors.
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${err.message}`);
    console.log(`  ! pageerror: ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Failed to load resource|net::ERR|Preconnect|favicon|ERR_CONNECTION/i.test(text)) return;
    errors.push(`console.error: ${text}`);
    console.log(`  ! console.error: ${text}`);
  });

  // ── 1. Boot the game at the root ───────────────────────────────────────
  console.log(`[smoke] navigating to ${URL}`);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  console.log("[smoke] waiting for game canvas + HUD...");
  await waitForCanvas(page);
  check("Phaser canvas mounted", (await page.$$("canvas")).length >= 1);
  check("HUD text (AGENCITY) present", /AGENCITY/i.test(await page.evaluate(() => document.body.innerText)));

  // ── 2. Scene active + all systems wired ────────────────────────────────
  console.log("[smoke] probing WorldScene + systems...");
  await page.waitForFunction(() => !!window.__agencity_game, { timeout: TIMEOUT });
  // Give the scene's create() time to finish (texture generation + systems).
  await new Promise((r) => setTimeout(r, 6000));
  const probe = await probeSystems(page);

  check("Phaser game exposed on window", probe.gameFound);
  check("WorldScene found in registry", probe.sceneFound);
  if (probe.sceneFound) {
    check("WorldScene is active", probe.sceneIsActive);
    const sys = probe.systems || {};
    const missing = Object.entries(sys).filter(([, v]) => !v).map(([k]) => k);
    check(
      `all 11 systems wired${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`,
      missing.length === 0,
    );
    const core = probe.coreFields || {};
    const coreOk = Object.values(core).every(Boolean);
    check("core coordination state intact (currentZone, characterSprites, characterTargets)", coreOk);
  }

  // ── 3. Navigate to /catalog (full route change → game re-mounts) ───────
  console.log("[smoke] opening /catalog popup...");
  await page.goto(URL.replace(/\/$/, "") + "/catalog", {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT,
  });
  await waitForCanvas(page).catch(() => {});
  await new Promise((r) => setTimeout(r, 4000));
  // The root layout wraps every route in CityShell, so the game re-mounts on
  // each navigation. Assert the canvas reappears (not that it persisted).
  check("canvas re-mounts on /catalog", (await page.$$("canvas")).length >= 1);
  const catalogText = await page.evaluate(() => document.body.innerText || "");
  check("catalog popup rendered", /catalog|agents|hiring/i.test(catalogText));

  // ── 4. Return to root, confirm scene re-mounts cleanly ─────────────────
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await waitForCanvas(page).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));
  check("canvas re-mounts on return to /", (await page.$$("canvas")).length >= 1);

  // Re-probe systems after the round-trip to confirm no init regression.
  const probe2 = await probeSystems(page);
  if (probe2.sceneFound) {
    const sys2 = probe2.systems || {};
    const missing2 = Object.entries(sys2).filter(([, v]) => !v).map(([k]) => k);
    check(
      `systems intact after navigation${missing2.length ? ` (missing: ${missing2.join(", ")})` : ""}`,
      missing2.length === 0,
    );
  }

  console.log(`\n[smoke] ${errors.length === 0 ? "PASSED" : `FAILED (${errors.length} issue(s))`}`);
  if (errors.length) {
    console.log("[smoke] failures:");
    for (const e of errors) console.log("   -", e);
  }
} catch (err) {
  console.error("[smoke] fatal:", err);
  errors.push(`fatal: ${String(err)}`);
} finally {
  await browser.close();
}

process.exit(errors.length === 0 ? 0 : 1);
