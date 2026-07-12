/**
 * Tests for the buyer-task tracker (`src/lib/buyer-tasks.ts`).
 *
 * The lib guards `typeof window === "undefined"` and uses `window.localStorage`,
 * so this test installs a minimal in-memory localStorage stub on globalThis
 * before each case (no jsdom/happy-dom dependency needed).
 */
import { beforeEach, describe, expect, it } from "vitest";

type Store = Record<string, string>;

function installLocalStorage() {
  const store: Store = {};
  const ls = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: ls },
    writable: true,
    configurable: true,
  });
  return () => ls.clear();
}

describe("buyer-tasks", () => {
  let clear: () => void;

  beforeEach(() => {
    clear = installLocalStorage();
  });

  it("round-trips a full task record and reads it back", async () => {
    const { addBuyerTask, getBuyerTaskRecords } = await import("./buyer-tasks");
    addBuyerTask({
      taskPda: "TaskPda111",
      listing: "ListingPda111",
      taskIdHex: "deadbeef",
      activated: false,
      referrerInjected: true,
    });
    const records = getBuyerTaskRecords();
    expect(records).toHaveLength(1);
    expect(records[0].taskPda).toBe("TaskPda111");
    expect(records[0].activated).toBe(false);
    expect(records[0].referrerInjected).toBe(true);
  });

  it("dedupes by task PDA, keeping the newest entry first", async () => {
    const { addBuyerTask, getBuyerTaskRecords } = await import("./buyer-tasks");
    addBuyerTask({ taskPda: "Dup", activated: false });
    addBuyerTask({ taskPda: "Other", activated: false });
    addBuyerTask({ taskPda: "Dup", activated: true });
    const records = getBuyerTaskRecords();
    expect(records.map((r) => r.taskPda)).toEqual(["Dup", "Other"]);
    expect(records[0].activated).toBe(true);
  });

  it("flips activation state via markBuyerTaskActivated", async () => {
    const { addBuyerTask, markBuyerTaskActivated, getBuyerTaskRecords } =
      await import("./buyer-tasks");
    addBuyerTask({ taskPda: "T1", activated: false });
    markBuyerTaskActivated("T1", {
      jobSpecHashHex: "abc",
      jobSpecUri: "https://example/spec.json",
    });
    const [first] = getBuyerTaskRecords();
    expect(first.activated).toBe(true);
    expect(first.jobSpecHashHex).toBe("abc");
    expect(first.jobSpecUri).toBe("https://example/spec.json");
  });

  it("normalizes legacy plain-string entries into records", async () => {
    const { getBuyerTaskRecords, addBuyerTask } = await import("./buyer-tasks");
    // Simulate the legacy shape directly in storage.
    window.localStorage.setItem(
      "agenc-store:buyer-tasks",
      JSON.stringify(["LegacyPda"]),
    );
    const records = getBuyerTaskRecords();
    expect(records).toHaveLength(1);
    expect(records[0].taskPda).toBe("LegacyPda");
    expect(records[0].activated).toBeUndefined();
    // Adding a new task preserves the legacy one.
    addBuyerTask({ taskPda: "New", activated: false });
    expect(getBuyerTaskRecords()).toHaveLength(2);
  });

  it("returns [] when storage is empty or unset (SSR-safe)", async () => {
    const { getBuyerTaskRecords } = await import("./buyer-tasks");
    expect(getBuyerTaskRecords()).toEqual([]);
  });
});
