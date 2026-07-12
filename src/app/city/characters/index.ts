// Character registry - all AgenCity AI characters
// All agents run on ElizaOS framework with Claude Sonnet 4 for intelligent, personality-driven responses
// Characters are organized by the zone they primarily appear in

import {
  cityBotCharacter,
  generateCharacterPrompt,
  type CharacterDefinition,
} from "./city-bot.character";

// ============================================================================
// TECH LABS ZONE (labs) - R&D headquarters of AgenC team
// ============================================================================
import { ramoCharacter } from "./ramo.character";
import { sincaraCharacter } from "./sincara.character";
import { stuuCharacter } from "./stuu.character";
import { samCharacter } from "./sam.character";
import { alaaCharacter } from "./alaa.character";
import { carloCharacter } from "./carlo.character";
import { bnnCharacter } from "./bnn.character";

// ============================================================================
// PARK ZONE (main_city) - The heart of AgenCity
// ============================================================================
import { tolyCharacter } from "./toly.character";
import { ashCharacter } from "./ash.character";
import { ghostCharacter } from "./ghost.character";
import { shawCharacter } from "./shaw.character";
import { finnCharacter } from "./finn.character"; // Finn visits Park but works at Labs

// ============================================================================
// BAGSCITY ZONE (trending) - Downtown trading district
// ============================================================================
import { neoCharacter } from "./neo.character";
import { cjCharacter } from "./cj.character";

// ============================================================================
// FOUNDER'S CORNER ZONE (founders) - Token launch education
// ============================================================================
import { professorOakCharacter } from "./professor-oak.character";

// ============================================================================
// MASCOTS - Official AgenC mascots
// ============================================================================
import { citybotCharacter } from "./citybot.character";

// ============================================================================
// EXPORTS - Organized by zone
// ============================================================================

// Global
export { cityBotCharacter } from "./city-bot.character";

// Tech Labs Zone (labs) - AgenC Team
export { finnCharacter } from "./finn.character"; // CEO leads the team
export { ramoCharacter } from "./ramo.character";
export { sincaraCharacter } from "./sincara.character";
export { stuuCharacter } from "./stuu.character";
export { samCharacter } from "./sam.character";
export { alaaCharacter } from "./alaa.character";
export { carloCharacter } from "./carlo.character";
export { bnnCharacter } from "./bnn.character";

// Park Zone (main_city)
export { tolyCharacter } from "./toly.character";
export { ashCharacter } from "./ash.character";
export { ghostCharacter } from "./ghost.character";
export { shawCharacter } from "./shaw.character";

// Catalog Zone (trending)
export { neoCharacter } from "./neo.character";
export { cjCharacter } from "./cj.character";

// Founder's Corner Zone (founders)
export { professorOakCharacter } from "./professor-oak.character";

// Mascots
export { citybotCharacter } from "./citybot.character";

// Export types and utilities
export { generateCharacterPrompt, type CharacterDefinition } from "./city-bot.character";

// ============================================================================
// CHARACTER REGISTRY - Organized by zone
// ============================================================================

// Tech Labs Zone characters (labs) - AgenC Team
export const labsCharacters: Record<string, CharacterDefinition> = {
  finn: finnCharacter, // CEO leads the team
  ramo: ramoCharacter,
  sincara: sincaraCharacter,
  stuu: stuuCharacter,
  sam: samCharacter,
  alaa: alaaCharacter,
  carlo: carloCharacter,
  bnn: bnnCharacter,
};

// Park Zone characters (main_city)
export const parkCharacters: Record<string, CharacterDefinition> = {
  toly: tolyCharacter,
  ash: ashCharacter,
  ghost: ghostCharacter,
  shaw: shawCharacter,
  citybot: citybotCharacter, // Official mascot
};

// Catalog Zone characters (trending)
export const bagsCityCharacters: Record<string, CharacterDefinition> = {
  neo: neoCharacter,
  cj: cjCharacter,
};

// Founder's Corner Zone characters (founders)
export const foundersCharacters: Record<string, CharacterDefinition> = {
  "professor-oak": professorOakCharacter,
};

// Global characters (appear everywhere)
export const globalCharacters: Record<string, CharacterDefinition> = {
  "city-bot": cityBotCharacter,
};

// Combined registry (all characters)
export const characters: Record<string, CharacterDefinition> = {
  ...globalCharacters,
  ...labsCharacters,
  ...parkCharacters,
  ...bagsCityCharacters,
  ...foundersCharacters,
};

// Get character by ID with fallback
export function getCharacter(id: string): CharacterDefinition {
  return characters[id.toLowerCase()] || cityBotCharacter;
}

// Get all character IDs
export function getCharacterIds(): string[] {
  return Object.keys(characters);
}

// Get characters for a specific zone
export function getCharactersByZone(
  zone: "labs" | "main_city" | "trending" | "founders" | "ballers"
): CharacterDefinition[] {
  switch (zone) {
    case "labs":
      return Object.values(labsCharacters);
    case "main_city":
      return Object.values(parkCharacters);
    case "trending":
      return Object.values(bagsCityCharacters);
    case "founders":
      return Object.values(foundersCharacters);
    case "ballers":
      return []; // No special characters in Ballers Valley (just mansions)
    default:
      return [];
  }
}

// Get character IDs for a specific zone
export function getCharacterIdsByZone(
  zone: "labs" | "main_city" | "trending" | "founders" | "ballers"
): string[] {
  switch (zone) {
    case "labs":
      return Object.keys(labsCharacters);
    case "main_city":
      return Object.keys(parkCharacters);
    case "trending":
      return Object.keys(bagsCityCharacters);
    case "founders":
      return Object.keys(foundersCharacters);
    case "ballers":
      return [];
    default:
      return [];
  }
}

// ============================================================================
// CHARACTER METADATA - For UI display, organized by zone
// ============================================================================

export type ZoneType =
  | "labs"
  | "moltbook"
  | "main_city"
  | "trending"
  | "ballers"
  | "founders"
  | "arena";

export interface CharacterMeta {
  displayName: string;
  role: string;
  color: string;
  icon: string;
  zone: ZoneType;
}

export const characterMeta: Record<string, CharacterMeta> = {
  // Global
  "city-bot": {
    displayName: "City Bot",
    role: "World Guide",
    color: "#f59e0b",
    icon: "🤖",
    zone: "main_city",
  },

  // ========== TECH LABS ZONE (labs) - AgenC Team ==========
  ramo: {
    displayName: "Ramo",
    role: "Co-Founder & CTO",
    color: "#3b82f6",
    icon: "⚙️",
    zone: "labs",
  },
  sincara: {
    displayName: "Sincara",
    role: "Frontend Engineer",
    color: "#ec4899",
    icon: "🎨",
    zone: "labs",
  },
  stuu: {
    displayName: "Stuu",
    role: "Operations",
    color: "#22c55e",
    icon: "📋",
    zone: "labs",
  },
  sam: {
    displayName: "Sam",
    role: "Growth",
    color: "#fbbf24",
    icon: "📢",
    zone: "labs",
  },
  alaa: {
    displayName: "Alaa",
    role: "Skunk Works",
    color: "#6366f1",
    icon: "🔬",
    zone: "labs",
  },
  carlo: {
    displayName: "Carlo",
    role: "Ambassador",
    color: "#f97316",
    icon: "🎒",
    zone: "labs",
  },
  bnn: {
    displayName: "BNN",
    role: "News Network",
    color: "#06b6d4",
    icon: "📺",
    zone: "labs",
  },

  // ========== PARK ZONE (main_city) ==========
  toly: {
    displayName: "Toly",
    role: "Solana Co-Founder",
    color: "#14f195",
    icon: "☀️",
    zone: "main_city",
  },
  ash: {
    displayName: "Ash",
    role: "Ecosystem Guide",
    color: "#ef4444",
    icon: "⚡",
    zone: "main_city",
  },
  finn: {
    displayName: "Finn",
    role: "Founder & CEO",
    color: "#10b981",
    icon: "🎩",
    zone: "labs", // CEO at Tech Labs HQ
  },
  ghost: {
    displayName: "Ghost",
    role: "The Dev",
    color: "#8b5cf6",
    icon: "👻",
    zone: "main_city",
  },
  shaw: {
    displayName: "Shaw",
    role: "ElizaOS Creator",
    color: "#FF5800",
    icon: "🔶",
    zone: "main_city",
  },

  // ========== BAGSCITY ZONE (trending) ==========
  neo: {
    displayName: "Neo",
    role: "The Scout",
    color: "#22c55e",
    icon: "👁️",
    zone: "trending",
  },
  cj: {
    displayName: "CJ",
    role: "Hood Legend",
    color: "#f97316",
    icon: "🔫",
    zone: "trending",
  },

  // ========== FOUNDER'S CORNER ZONE (founders) ==========
  "professor-oak": {
    displayName: "Professor Oak",
    role: "Launch Wizard",
    color: "#a16207",
    icon: "🧪",
    zone: "founders",
  },

  // ========== MASCOTS ==========
  citybot: {
    displayName: "CityBot",
    role: "Hype Bot",
    color: "#00ff00",
    icon: "💰",
    zone: "main_city",
  },
};

// Get metadata for characters in a specific zone
export function getCharacterMetaByZone(zone: ZoneType): Record<string, CharacterMeta> {
  return Object.fromEntries(Object.entries(characterMeta).filter(([, meta]) => meta.zone === zone));
}
