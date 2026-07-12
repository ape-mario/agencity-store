// Stubbed autonomous dialogue system for the city UI port.
// Preserves the API surface used by WorldScene and dialogue-event-bridge.

import type { WorldState, GameCharacter } from "./types";

export interface ConversationLine {
  characterId: string;
  text: string;
  message: string;
  timestamp: number;
}

export interface DialogueLine {
  characterId: string;
  text?: string;
  message: string;
  timestamp: number;
  characterName?: string;
  emotion?: string;
}

export interface ActiveConversation {
  id: string;
  participants: string[];
  lines: ConversationLine[];
  startedAt: number;
  isActive: boolean;
}

const conversations = new Map<string, ActiveConversation>();

export function getActiveConversation(conversationId?: string): ActiveConversation | null {
  if (conversationId) return conversations.get(conversationId) || null;
  // Return the most recent conversation if no id is provided.
  let latest: ActiveConversation | null = null;
  for (const conv of conversations.values()) {
    if (!latest || conv.startedAt > latest.startedAt) latest = conv;
  }
  return latest;
}

export function getCurrentLine(conversationId?: string): ConversationLine | null {
  const conv = conversationId ? conversations.get(conversationId) : getActiveConversation();
  return conv?.lines[conv.lines.length - 1] || null;
}

export function startConversation(
  conversationId: string,
  participants: string[],
  initialLine?: string,
): ActiveConversation {
  const conv: ActiveConversation = {
    id: conversationId,
    participants,
    lines: initialLine
      ? [{ characterId: participants[0] || "unknown", text: initialLine, message: initialLine, timestamp: Date.now() }]
      : [],
    startedAt: Date.now(),
    isActive: true,
  };
  conversations.set(conversationId, conv);
  return conv;
}

export async function handleAgentEvent(event: unknown): Promise<void> {
  // No-op in city view stub.
  void event;
}

export async function handleWorldStateChange(
  worldState: WorldState,
  previousWorldState?: WorldState,
): Promise<void> {
  // No-op in city view stub.
  void worldState;
  void previousWorldState;
}

export function maybeStartCharacterConversation(
  character: GameCharacter,
  _worldState: WorldState,
): boolean {
  // No-op in city view stub.
  void character;
  return false;
}
