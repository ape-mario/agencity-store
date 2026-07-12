// Extracted action types from AgenCity agent-chat API
// Used by chat components; stubbed for the city UI port.

export type AIActionType = "trade" | "launch" | "claim" | "link" | "effect" | "animal" | "data";

export interface AIAction {
  type: AIActionType;
  label: string;
  data: {
    mint?: string;
    symbol?: string;
    name?: string;
    url?: string;
    effectType?: string;
    animalType?: string;
    animalAction?: string;
  };
}
