/**
 * Vitest setup — replaces the `phaser` module with a lightweight stub for the
 * systems test suite.
 *
 * Phaser's module-load device detection (device/OS.js, CanvasFeatures.js, …)
 * needs a near-complete browser environment (window, navigator, Image,
 * canvas 2d/webgl contexts, …). Rather than reconstruct the DOM, the systems
 * tests never exercise real Phaser rendering — they pass in mock scenes — so
 * we alias `phaser` to this stub. Runtime constants the extracted systems
 * touch (e.g. `Phaser.BlendModes.ADD`) are provided here; type-only usages
 * (`Phaser.Scene`, `Phaser.GameObjects.*`) are erased by tsc and need nothing.
 *
 * Wired via `test.setupFiles` in vitest.config.ts.
 */
import { vi } from "vitest";

vi.mock("phaser", () => ({
  // Namespace re-export pattern: `import * as Phaser from "phaser"`.
  BlendModes: { ADD: "ADD", NORMAL: "NORMAL" } as const,
  default: undefined,
}));
