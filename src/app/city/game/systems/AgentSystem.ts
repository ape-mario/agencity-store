import * as Phaser from "phaser";
import { SCALE } from "../textures/constants";
import type { WorldScene } from "../scenes/WorldScene";

/**
 * AgentSystem — in-scene glue for the bidirectional agent WebSocket.
 *
 * Per PERFORMANCE_PLAN.md this is glue only: the WebSocket transport already
 * lives in lib/agent-websocket-bridge.ts. This system owns:
 *   - connectToAgentServer(): opens the WS, starts the 1s world-state poll,
 *     wires exponential-backoff reconnect.
 *   - sendWorldStateUpdate(): scans characterSprites, maps special-character
 *     flags to agent ids, and sends a world-state-update message (paused while
 *     a popup is open — Phase 0).
 *   - handleAgentCommand(): translates inbound commands into window events
 *     (character-behavior / character-speak / zone-transition).
 *   - handleBehaviorCommand(): resolves a behavior command's target (position /
 *     character / building) and writes a movement target into characterTargets.
 *
 * The agent socket + reconnect/timer state is owned here; the character sprite
 * maps, characterTargets, currentZone, and worldState stay on the scene.
 */
export class AgentSystem {
  private scene: WorldScene;

  private agentSocket: WebSocket | null = null;
  private agentReconnectAttempts = 0;
  private readonly maxAgentReconnectAttempts = 5;
  private worldStateUpdateTimer: Phaser.Time.TimerEvent | null = null;
  private agentReconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(scene: WorldScene) {
    this.scene = scene;
  }

  /** Connect (or reconnect) to the agent server. Safe to call repeatedly. */
  connect(): void {
    this.connectToAgentServer();
  }

  /** Tear down the socket + timers (call on shutdown). */
  cleanup(): void {
    if (this.worldStateUpdateTimer) {
      this.worldStateUpdateTimer.destroy();
      this.worldStateUpdateTimer = null;
    }
    if (this.agentReconnectTimeout) {
      clearTimeout(this.agentReconnectTimeout);
      this.agentReconnectTimeout = null;
    }
    if (this.agentSocket) {
      this.agentSocket.onclose = null; // Prevent reconnect on intentional close
      this.agentSocket.close();
      this.agentSocket = null;
    }
  }

  handleBehaviorCommand(event: CustomEvent): void {
    const command = event.detail;
    if (!command || !command.characterId) return;

    const characterId = command.characterId;
    let targetX: number | undefined;
    let targetY: number | undefined;

    // Determine target position based on command
    if (command.target) {
      if (command.target.type === "position" && command.target.x !== undefined) {
        targetX = command.target.x;
        targetY = command.target.y || Math.round(570 * SCALE);
      } else if (command.target.type === "character" && command.target.id) {
        // Find target character's position
        const targetSprite = this.scene.findCharacterSprite(command.target.id);
        if (targetSprite) {
          // Move near the character, not exactly on top
          const offset = (Math.random() - 0.5) * 100;
          targetX = targetSprite.x + offset;
          targetY = targetSprite.y + (Math.random() - 0.5) * 30;
        }
      } else if (command.target.type === "building" && command.target.id) {
        // Find building position
        const building = this.scene.buildingSprites.get(command.target.id);
        if (building) {
          targetX = building.x + (Math.random() - 0.5) * 80;
          targetY = Math.round(580 * SCALE); // Stay on path
        }
      }
    }

    // If we have a valid target, store it
    if (targetX !== undefined && targetY !== undefined) {
      // Clamp to valid bounds
      targetX = Math.max(100, Math.min(1180, targetX));
      targetY = Math.max(Math.round(450 * SCALE), Math.min(Math.round(620 * SCALE), targetY));

      this.scene.characterTargets.set(characterId, {
        x: targetX,
        y: targetY,
        action: command.action || "moveTo",
      });
    } else if (command.action === "idle" || command.action === "observe") {
      // Clear target for idle/observe
      this.scene.characterTargets.delete(characterId);
    }
  }


  connectToAgentServer(): void {
    try {
      // Allow configurable URL via window global or default to localhost:3001
      const wsUrl =
        (typeof window !== "undefined" && (window as any).__AGENTS_WS_URL) ||
        "ws://localhost:3001/ws";

      this.agentSocket = new WebSocket(wsUrl);

      this.agentSocket.onopen = () => {
        console.log("[WorldScene] Connected to agent server");
        this.agentReconnectAttempts = 0;

        // Start sending world state updates every 1 second
        if (this.worldStateUpdateTimer) {
          this.worldStateUpdateTimer.destroy();
        }
        this.worldStateUpdateTimer = this.scene.time.addEvent({
          delay: 1000,
          callback: () => this.sendWorldStateUpdate(),
          loop: true,
        });
      };

      this.agentSocket.onmessage = (event: MessageEvent) => {
        try {
          const command = JSON.parse(event.data);
          this.handleAgentCommand(command);
        } catch (err) {
          console.error("[WorldScene] Failed to parse agent message:", err);
        }
      };

      this.agentSocket.onclose = () => {
        console.log("[WorldScene] Agent server connection closed");
        this.agentSocket = null;

        // Stop the world state update timer when disconnected
        if (this.worldStateUpdateTimer) {
          this.worldStateUpdateTimer.destroy();
          this.worldStateUpdateTimer = null;
        }

        this.scheduleAgentReconnect();
      };

      this.agentSocket.onerror = (err: Event) => {
        // Log at debug level - agent server is optional
        console.debug("[WorldScene] Agent server connection error:", err);
      };
    } catch (err) {
      // Game works fine without the agent server
      console.debug("[WorldScene] Could not connect to agent server:", err);
      this.scheduleAgentReconnect();
    }
  }

  sendWorldStateUpdate(): void {
    if (!this.agentSocket || this.agentSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    // Phase 0: pause outbound world-state updates while a popup is open — no
    // visible motion to report, and skipping saves a full sprite-scan + WS send.
    if (typeof window !== "undefined" && (window as any).__agencity_modal_open === true) {
      return;
    }

    try {
      // Build character states from current sprites
      const characters: Record<string, { x: number; y: number; isMoving: boolean }> = {};

      for (const [, sprite] of this.scene.characterSprites) {
        const spriteData = sprite as any;
        let agentId: string | null = null;

        // Map sprite flags to agent IDs (same pattern as findCharacterSprite)
        if (spriteData.isFinn) agentId = "finn";
        else if (spriteData.isDev) agentId = "ghost";
        else if (spriteData.isScout) agentId = "neo";
        else if (spriteData.isAsh) agentId = "ash";
        else if (spriteData.isToly) agentId = "toly";
        else if (spriteData.isCJ) agentId = "cj";
        else if (spriteData.isShaw) agentId = "shaw";
        else if (spriteData.isRamo) agentId = "ramo";
        else if (spriteData.isSincara) agentId = "sincara";
        else if (spriteData.isStuu) agentId = "stuu";
        else if (spriteData.isSam) agentId = "sam";
        else if (spriteData.isAlaa) agentId = "alaa";
        else if (spriteData.isCarlo) agentId = "carlo";
        else if (spriteData.isBNN) agentId = "bnn";
        else if (spriteData.isProfessorOak) agentId = "professorOak";
        else if (spriteData.isCityBot) agentId = "citybot";

        if (agentId) {
          characters[agentId] = {
            x: sprite.x,
            y: sprite.y,
            isMoving: this.scene.characterTargets.has(agentId),
          };
        }
      }

      const update = {
        type: "world-state-update",
        timestamp: Date.now(),
        zone: this.scene.currentZone,
        characters,
        weather: this.scene.worldState?.weather || "cloudy",
        health: this.scene.worldState?.health || 50,
      };

      this.agentSocket.send(JSON.stringify(update));
    } catch (err) {
      console.error("[WorldScene] Failed to send world state update:", err);
    }
  }

  handleAgentCommand(command: any): void {
    if (!command || !command.type) return;

    try {
      switch (command.type) {
        case "character-behavior":
          window.dispatchEvent(
            new CustomEvent("agencity-character-behavior", {
              detail: command,
            })
          );
          break;

        case "character-speak":
          window.dispatchEvent(
            new CustomEvent("agencity-character-speak", {
              detail: {
                characterId: command.characterId,
                message: command.message,
                emotion: command.emotion,
              },
            })
          );
          break;

        case "zone-transition":
          // Agent requested a zone change
          if (command.target?.id) {
            window.dispatchEvent(
              new CustomEvent("agencity-zone-change", {
                detail: { zone: command.target.id },
              })
            );
          }
          break;

        case "pong":
          // Heartbeat response, no action needed
          break;

        default:
          console.debug("[WorldScene] Unknown agent command type:", command.type);
      }
    } catch (err) {
      console.error("[WorldScene] Error handling agent command:", err);
    }
  }

  scheduleAgentReconnect(): void {
    if (this.agentReconnectAttempts >= this.maxAgentReconnectAttempts) {
      console.debug("[WorldScene] Max agent reconnect attempts reached, giving up");
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.agentReconnectAttempts), 30000);
    this.agentReconnectAttempts++;

    console.debug(
      `[WorldScene] Scheduling agent reconnect in ${delay}ms (attempt ${this.agentReconnectAttempts}/${this.maxAgentReconnectAttempts})`
    );

    this.agentReconnectTimeout = setTimeout(() => {
      this.agentReconnectTimeout = null;
      this.connectToAgentServer();
    }, delay);
  }
}
