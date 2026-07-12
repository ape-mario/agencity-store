import { describe, it, expect, vi } from "vitest";
import { AgentSystem } from "./AgentSystem";
import type { WorldScene } from "../scenes/WorldScene";

function makeSceneStub(): WorldScene {
  return {
    time: { addEvent: vi.fn(() => ({ destroy: vi.fn() })) },
    characterSprites: new Map() as any,
    characterTargets: new Map() as any,
    buildingSprites: new Map() as any,
    characterById: new Map() as any,
    currentZone: "main_city" as any,
    worldState: null as any,
    findCharacterSprite: vi.fn(() => null),
  } as unknown as WorldScene;
}

describe("AgentSystem", () => {
  it("handleAgentCommand dispatches known command types as window events", () => {
    const sys = new AgentSystem(makeSceneStub());
    const dispatched: any[] = [];
    const origDispatch = (globalThis as any).window?.dispatchEvent;
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.dispatchEvent = (e: any) => dispatched.push(e);
    (globalThis as any).window.CustomEvent = (globalThis as any).window.CustomEvent || CustomEvent;
    try {
      sys.handleAgentCommand({ type: "character-speak", characterId: "finn", message: "hi" });
    } finally {
      if (origDispatch) (globalThis as any).window.dispatchEvent = origDispatch;
    }
    expect(dispatched.some((e) => e.type === "agencity-character-speak")).toBe(true);
  });

  it("handleAgentCommand ignores malformed commands", () => {
    const sys = new AgentSystem(makeSceneStub());
    expect(() => sys.handleAgentCommand(null as any)).not.toThrow();
    expect(() => sys.handleAgentCommand({} as any)).not.toThrow();
  });

  it("handleBehaviorCommand sets a movement target for a position command", () => {
    const scene = makeSceneStub();
    const sys = new AgentSystem(scene);
    sys.handleBehaviorCommand({
      detail: { characterId: "finn", target: { type: "position", x: 500, y: 570 } },
    } as any);
    expect(scene.characterTargets.has("finn")).toBe(true);
    const target = scene.characterTargets.get("finn")!;
    expect(target.x).toBe(500);
  });

  it("handleBehaviorCommand clears the target for idle/observe actions", () => {
    const scene = makeSceneStub();
    scene.characterTargets.set("finn", { x: 100, y: 100, action: "moveTo" });
    const sys = new AgentSystem(scene);
    sys.handleBehaviorCommand({
      detail: { characterId: "finn", action: "idle" },
    } as any);
    expect(scene.characterTargets.has("finn")).toBe(false);
  });

  it("handleBehaviorCommand ignores events with no characterId", () => {
    const scene = makeSceneStub();
    const sys = new AgentSystem(scene);
    sys.handleBehaviorCommand({ detail: {} } as any);
    expect(scene.characterTargets.size).toBe(0);
  });

  it("cleanup() is safe when never connected", () => {
    const sys = new AgentSystem(makeSceneStub());
    expect(() => sys.cleanup()).not.toThrow();
  });
});
