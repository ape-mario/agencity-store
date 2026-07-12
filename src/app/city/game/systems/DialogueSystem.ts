import { getCurrentLine, getActiveConversation } from "@/city/lib/autonomous-dialogue";
import type { WorldScene } from "../scenes/WorldScene";

/**
 * DialogueSystem — in-scene glue for character speech bubbles.
 *
 * Per PERFORMANCE_PLAN.md, SpeechBubbleManager is already its own class in
 * lib/. This system owns the two scene-side glue methods that feed it:
 *   - handleCharacterSpeak(): a direct character-speak event (from the agent
 *     bridge or a bot command) -> one sanitized speech bubble.
 *   - updateDialogueBubbles(): per-frame poll of the autonomous-dialogue
 *     current line -> a de-duplicated speech bubble (skipped while a popup is
 *     open -- that gate lives in WorldScene.update).
 *
 * The SpeechBubbleManager instance stays on the scene (constructed in
 * create(), torn down in cleanup()); this system owns only the
 * lastDialogueLine de-dup state.
 */
export class DialogueSystem {
  private scene: WorldScene;
  private lastDialogueLine: string | null = null;

  constructor(scene: WorldScene) {
    this.scene = scene;
  }

  handleCharacterSpeak(event: CustomEvent): void {
    const { characterId, message, emotion } = event.detail;
    if (!characterId || !message || !this.scene.speechBubbleManager) return;

    // Sanitize: skip raw JSON/code strings that leak from AI responses
    const msg = typeof message === "string" ? message : String(message);
    if (
      msg.startsWith("{") ||
      msg.startsWith("[") ||
      msg.startsWith("<") ||
      msg.includes('"type"') ||
      msg.includes("```")
    )
      return;

    // Truncate overly long messages
    const cleanMessage = msg.length > 120 ? msg.slice(0, 117) + "..." : msg;

    // Don't interrupt autonomous dialogue conversations
    const activeConversation = getActiveConversation();
    if (activeConversation?.isActive) return;

    // Create a dialogue line and show bubble
    const line = {
      characterId,
      characterName: characterId,
      message: cleanMessage,
      timestamp: Date.now(),
      emotion: emotion || "neutral",
    };

    this.scene.speechBubbleManager.showBubble(line);
  }

  // Update speech bubbles for autonomous dialogue
  updateDialogueBubbles(): void {
    if (!this.scene.speechBubbleManager) return;

    // Update bubble positions to follow characters
    this.scene.speechBubbleManager.update();

    // Check for current dialogue line
    const currentLine = getCurrentLine();

    if (currentLine) {
      // Skip raw JSON/code that leaks from AI responses
      const msg = currentLine.message;
      if (
        msg.startsWith("{") ||
        msg.startsWith("[") ||
        msg.startsWith("<") ||
        msg.includes('"type"') ||
        msg.includes("```")
      )
        return;

      // Create a unique ID for this line
      const lineId = `${currentLine.characterId}-${currentLine.timestamp}-${msg.slice(0, 20)}`;

      // Only show if it's a new line
      if (lineId !== this.lastDialogueLine) {
        this.lastDialogueLine = lineId;

        // Update character sprites reference (in case they changed)
        this.scene.speechBubbleManager.setCharacterSprites(this.scene.characterSprites);

        // Truncate overly long messages
        const sanitized = {
          ...currentLine,
          message: msg.length > 120 ? msg.slice(0, 117) + "..." : msg,
        };

        // Show the speech bubble
        this.scene.speechBubbleManager.showBubble(sanitized);
      }
    }
  }
}
