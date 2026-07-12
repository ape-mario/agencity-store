import * as Phaser from "phaser";
import type { WorldScene } from "../scenes/WorldScene";

/**
 * EncounterSystem — in-scene glue for wild-creature encounters.
 *
 * Per PERFORMANCE_PLAN.md this is glue only: the battle engine itself already
 * lives in lib/encounter-engine.ts / encounter-creatures.ts / encounter-xp.ts.
 * This system owns just the trigger + cooldown + stun state:
 *   - checkCreatureEncounters(): per-frame proximity check against the current
 *     zone's creature set, with global + per-creature cooldowns and a random
 *     roll. On a hit it plays the encounter SFX, sets encounterActive, arms a
 *     safety timeout, and dispatches agencity-encounter-start.
 *   - handleEncounterEnd(): clears encounterActive + timeout; on a loss shows
 *     the orbiting-star stun effect.
 *   - showPlayerStunEffect(): 3-second orbiting star emojis + playerStunned.
 *
 * encounterActive / playerStunned are exposed as public fields so the scene's
 * input handlers can suppress movement/interaction during a battle.
 */
export class EncounterSystem {
  private scene: WorldScene;

  // Trigger + cooldown state (owned here; read by input handlers via getters).
  public encounterActive = false;
  public playerStunned = false;
  private encounterCooldowns: Map<string, number> = new Map();
  private readonly ENCOUNTER_COOLDOWN_MS = 90000;
  private readonly ENCOUNTER_RADIUS = 50;
  private readonly ENCOUNTER_CHANCE = 0.08;
  private lastGlobalEncounter = Date.now(); // Grace period: no encounters on first load
  private readonly GLOBAL_ENCOUNTER_COOLDOWN_MS = 45000;
  private encounterActiveTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly ENCOUNTER_MAX_DURATION_MS = 300000; // 5 min safety timeout
  private stunStars: Phaser.GameObjects.Text[] = [];

  constructor(scene: WorldScene) {
    this.scene = scene;
  }

  /** Tear down the safety timeout + clear active state (call on shutdown). */
  cleanup(): void {
    if (this.encounterActiveTimeout) {
      clearTimeout(this.encounterActiveTimeout);
      this.encounterActiveTimeout = null;
    }
    this.encounterActive = false;
    this.playerStunned = false;
    this.stunStars = [];
  }

  checkCreatureEncounters(): void {
    if (!this.scene.localPlayer || this.encounterActive) return;

    const now = Date.now();

    // Global cooldown — no encounters too close together regardless of creature
    if (now - this.lastGlobalEncounter < this.GLOBAL_ENCOUNTER_COOLDOWN_MS) return;

    const px = this.scene.localPlayer.x;
    const py = this.scene.localPlayer.y;

    // Determine which creature arrays to check based on current zone
    type EncounterTarget = {
      sprite: Phaser.GameObjects.Sprite;
      id: string;
      zone: "main_city" | "founders" | "moltbook";
    };
    const targets: EncounterTarget[] = [];

    if (this.scene.currentZone === "main_city") {
      this.scene.animals.forEach((a, i) => {
        targets.push({ sprite: a.sprite, id: `animal_${i}`, zone: "main_city" });
      });
    } else if (this.scene.currentZone === "founders") {
      this.scene.pokemon.forEach((p, i) => {
        targets.push({ sprite: p.sprite, id: `pokemon_${i}`, zone: "founders" });
      });
    } else if (this.scene.currentZone === "moltbook") {
      this.scene.ambientCreatures.forEach((c, i) => {
        targets.push({ sprite: c.sprite, id: `ambient_${i}`, zone: "moltbook" });
      });
    }

    for (const target of targets) {
      if (!target.sprite.active || !target.sprite.visible) continue;

      const dist = Phaser.Math.Distance.Between(px, py, target.sprite.x, target.sprite.y);
      if (dist > this.ENCOUNTER_RADIUS) continue;

      // Check cooldown
      const lastEncounter = this.encounterCooldowns.get(target.id) ?? 0;
      if (now - lastEncounter < this.ENCOUNTER_COOLDOWN_MS) continue;

      // Roll for encounter
      if (Math.random() > this.ENCOUNTER_CHANCE) {
        // Short-circuit cooldown on failed roll (15s) to avoid per-frame re-rolling
        this.encounterCooldowns.set(target.id, now - this.ENCOUNTER_COOLDOWN_MS + 15000);
        continue;
      }

      // Encounter triggered!
      this.scene.audioSystem.playEncounterSfx();
      this.encounterCooldowns.set(target.id, now);
      this.lastGlobalEncounter = now;
      this.encounterActive = true;

      // Safety timeout: if overlay crashes without dispatching encounter-end,
      // reset encounterActive so future encounters aren't permanently blocked
      if (this.encounterActiveTimeout) clearTimeout(this.encounterActiveTimeout);
      this.encounterActiveTimeout = setTimeout(() => {
        if (this.encounterActive) {
          this.encounterActive = false;
        }
      }, this.ENCOUNTER_MAX_DURATION_MS);

      window.dispatchEvent(
        new CustomEvent("agencity-encounter-start", {
          detail: { zone: target.zone },
        })
      );
      break; // Only one encounter at a time
    }
  }

  handleEncounterEnd(event: CustomEvent): void {
    this.encounterActive = false;
    if (this.encounterActiveTimeout) {
      clearTimeout(this.encounterActiveTimeout);
      this.encounterActiveTimeout = null;
    }
    const result = event.detail?.result as string;

    if (result === "lose") {
      this.showPlayerStunEffect();
    }
  }

  showPlayerStunEffect(): void {
    if (!this.scene.localPlayer) return;

    this.playerStunned = true;

    // Create 3 orbiting star emojis above the player
    const starOffsets = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
    const starTexts: Phaser.GameObjects.Text[] = [];

    for (const offset of starOffsets) {
      const star = this.scene.add.text(this.scene.localPlayer.x, this.scene.localPlayer.y - 40, "*", {
        fontSize: "16px",
        color: "#FFD700",
        fontFamily: "monospace",
      });
      star.setOrigin(0.5);
      star.setDepth(20);
      starTexts.push(star);
    }

    this.stunStars = starTexts;

    // Animate stars orbiting
    let angle = 0;
    const orbitRadius = 15;
    const orbitTimer = this.scene.time.addEvent({
      delay: 30,
      loop: true,
      callback: () => {
        if (!this.scene.localPlayer) return;
        angle += 0.08;
        starTexts.forEach((star, i) => {
          const a = angle + starOffsets[i];
          star.setPosition(
            this.scene.localPlayer!.x + Math.cos(a) * orbitRadius,
            this.scene.localPlayer!.y - 40 + Math.sin(a) * 5
          );
        });
      },
    });

    // Remove stun after 3s
    this.scene.time.delayedCall(3000, () => {
      this.playerStunned = false;
      orbitTimer.destroy();
      starTexts.forEach((s) => s.destroy());
      this.stunStars = [];
    });
  }
}
