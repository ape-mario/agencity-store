import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AudioSystem } from "./AudioSystem";

/**
 * Minimal Phaser.Scene stub. Systems receive the scene and reach for a small
 * surface (add.particles, time.delayedCall). We stub only what AudioSystem
 * touches so the harness stays focused; extend per-system as needed.
 */
function makeSceneStub() {
  return {
    add: {
      particles: vi.fn(() => ({
        setDepth: vi.fn(),
        explode: vi.fn(),
        destroy: vi.fn(),
      })),
    },
    time: {
      delayedCall: vi.fn((_ms: number, _cb: () => void) => ({ remove: vi.fn() })),
    },
  } as unknown as import("phaser").Scene;
}

/**
 * Stub Web Audio nodes. We only need the methods AudioSystem calls:
 * createOscillator/createGain/createBiquadFilter/createBufferSource/createBuffer.
 */
function makeAudioNodeStub() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    Q: { value: 0 },
    type: "",
    buffer: null,
    onended: null,
  };
}

function makeAudioContextStub(): AudioContext {
  return {
    currentTime: 100,
    sampleRate: 44100,
    destination: {},
    createGain: vi.fn(() => makeAudioNodeStub()),
    createOscillator: vi.fn(() => makeAudioNodeStub()),
    createBiquadFilter: vi.fn(() => makeAudioNodeStub()),
    createBufferSource: vi.fn(() => makeAudioNodeStub()),
    createBuffer: vi.fn((_ch: number, len: number, _rate: number) => ({
      length: len,
      getChannelData: () => new Float32Array(len),
    })),
    close: vi.fn(),
  } as unknown as AudioContext;
}

/**
 * The vitest config uses environment: "node", so window/document are absent.
 * AudioSystem.init() calls window.AudioContext + window.addEventListener +
 * window.dispatchEvent + window.setTimeout, so we install a minimal window
 * shim for the duration of these tests and tear it down afterward.
 */
type WindowShim = Record<string, unknown> & {
  AudioContext?: unknown;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
  setTimeout: (...args: any[]) => number;
  CustomEvent: typeof CustomEvent;
  Event: typeof Event;
};

function installWindowShim(): WindowShim {
  const shim: WindowShim = {
    AudioContext: vi.fn(() => makeAudioContextStub()),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    setTimeout: ((...args: any[]) =>
      setTimeout(...(args as [any, ...any[]])) as unknown as number) as any,
    CustomEvent,
    Event,
  };
  (globalThis as any).window = shim;
  return shim;
}

function removeWindowShim() {
  delete (globalThis as any).window;
}

describe("AudioSystem", () => {
  let shim: WindowShim;

  beforeEach(() => {
    shim = installWindowShim();
  });

  afterEach(() => {
    removeWindowShim();
  });

  it("exposes null context/gain before init", () => {
    const sys = new AudioSystem(makeSceneStub());
    expect(sys.context).toBeNull();
    expect(sys.masterGain).toBeNull();
  });

  it("init() creates the context, starts track 0, and registers control listeners", () => {
    const sys = new AudioSystem(makeSceneStub());
    sys.init();

    expect(sys.context).not.toBeNull();
    expect(sys.masterGain).not.toBeNull();
    // Track-change event dispatched on init (track 0 = "Adventure").
    expect(shim.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agencity-track-changed" })
    );
    // Three control listeners registered.
    expect(shim.addEventListener).toHaveBeenCalledWith(
      "agencity-toggle-music",
      expect.any(Function)
    );
    expect(shim.addEventListener).toHaveBeenCalledWith(
      "agencity-skip-track",
      expect.any(Function)
    );
    expect(shim.addEventListener).toHaveBeenCalledWith(
      "agencity-prev-track",
      expect.any(Function)
    );
  });

  it("cleanup() removes control listeners and nulls the context", () => {
    const sys = new AudioSystem(makeSceneStub());
    sys.init();
    const ctx = sys.context;
    sys.cleanup();

    expect(shim.removeEventListener).toHaveBeenCalledWith(
      "agencity-toggle-music",
      expect.any(Function)
    );
    expect(shim.removeEventListener).toHaveBeenCalledWith(
      "agencity-skip-track",
      expect.any(Function)
    );
    expect(shim.removeEventListener).toHaveBeenCalledWith(
      "agencity-prev-track",
      expect.any(Function)
    );
    expect(sys.context).toBeNull();
    expect(sys.masterGain).toBeNull();
    expect((ctx as any).close).toHaveBeenCalled();
  });

  it("ensureContext() creates a context lazily and returns it on subsequent calls", () => {
    const sys = new AudioSystem(makeSceneStub());
    const first = sys.ensureContext();
    expect(first).not.toBeNull();
    const second = sys.ensureContext();
    // Should reuse, not recreate.
    expect(second).toBe(first);
  });

  it("ensureContext() returns null when AudioContext throws", () => {
    shim.AudioContext = vi.fn(() => {
      throw new Error("blocked");
    });
    const sys = new AudioSystem(makeSceneStub());
    expect(sys.ensureContext()).toBeNull();
  });

  it("toggle handler mutes and unmutes the master gain", () => {
    const sys = new AudioSystem(makeSceneStub());
    sys.init();
    const gain = sys.masterGain!;
    const before = gain.gain.value;

    // Capture the toggle handler registered via addEventListener and invoke it
    // directly to simulate the window event firing.
    const calls = (shim.addEventListener as ReturnType<typeof vi.fn>).mock.calls;
    const toggleCall = calls.find((c) => c[0] === "agencity-toggle-music");
    const toggle = toggleCall![1] as (e: Event) => void;

    toggle(new Event("agencity-toggle-music"));
    expect(gain.gain.value).toBe(0); // muted
    toggle(new Event("agencity-toggle-music"));
    expect(gain.gain.value).toBe(before); // restored
  });
});
