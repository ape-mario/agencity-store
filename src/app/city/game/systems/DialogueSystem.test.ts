import { describe, it, expect, vi } from "vitest";
import { DialogueSystem } from "./DialogueSystem";
import type { WorldScene } from "../scenes/WorldScene";

function makeSceneStub(): WorldScene {
  return {
    speechBubbleManager: {
      update: vi.fn(),
      showBubble: vi.fn(),
      setCharacterSprites: vi.fn(),
    } as any,
    characterSprites: new Map() as any,
  } as unknown as WorldScene;
}

describe("DialogueSystem", () => {
  it("handleCharacterSpeak shows a bubble for a clean message", () => {
    const scene = makeSceneStub();
    const sys = new DialogueSystem(scene);
    sys.handleCharacterSpeak({
      detail: { characterId: "finn", message: "Hello world!", emotion: "happy" },
    } as any);
    expect(scene.speechBubbleManager!.showBubble).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: "finn", message: "Hello world!" })
    );
  });

  it("handleCharacterSpeak drops raw JSON / code that leaks from AI", () => {
    const scene = makeSceneStub();
    const sys = new DialogueSystem(scene);
    for (const bad of ['{"type":"x"}', "<tag>", '```code```', 'has "type" in it']) {
      sys.handleCharacterSpeak({
        detail: { characterId: "finn", message: bad },
      } as any);
    }
    expect(scene.speechBubbleManager!.showBubble).not.toHaveBeenCalled();
  });

  it("handleCharacterSpeak truncates messages over 120 chars", () => {
    const scene = makeSceneStub();
    const sys = new DialogueSystem(scene);
    const long = "x".repeat(200);
    sys.handleCharacterSpeak({
      detail: { characterId: "finn", message: long },
    } as any);
    const arg = (scene.speechBubbleManager!.showBubble as any).mock.calls[0][0];
    expect(arg.message.length).toBe(120);
    expect(arg.message.endsWith("...")).toBe(true);
  });

  it("handleCharacterSpeak is a no-op when speechBubbleManager is absent", () => {
    const scene = makeSceneStub();
    scene.speechBubbleManager = null;
    const sys = new DialogueSystem(scene);
    expect(() =>
      sys.handleCharacterSpeak({
        detail: { characterId: "finn", message: "hi" },
      } as any)
    ).not.toThrow();
  });

  it("updateDialogueBubbles is a no-op when speechBubbleManager is absent", () => {
    const scene = makeSceneStub();
    scene.speechBubbleManager = null;
    const sys = new DialogueSystem(scene);
    expect(() => sys.updateDialogueBubbles()).not.toThrow();
  });
});
