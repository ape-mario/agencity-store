/**
 * Tests for the RPC-endpoint classification helpers (`src/lib/rpc.ts`).
 *
 * These are pure functions over the module's own regex/branching — no network.
 * `getAgencRpcUrl` falls back to the per-network default when
 * NEXT_PUBLIC_AGENC_RPC_URL is unset; we assert the override wins when set.
 *
 * NOTE: `./rpc` imports `./config` → `agenc.config.ts` → store-core, which is a
 * heavy module graph. We import it ONCE at module load (top-level) so the cost
 * is paid before any test timer starts — lazy per-test imports would blow the
 * default 5s timeout on the first call.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { isIndexerBaseUrl, getAgencRpcUrl } from "./rpc";

describe("isIndexerBaseUrl", () => {
  beforeAll(() => {
    // Touch both functions once to force full module evaluation before tests.
    isIndexerBaseUrl("https://api.agenc.ag");
    getAgencRpcUrl();
  });

  it("classifies the hosted AgenC indexer as an indexer", () => {
    expect(isIndexerBaseUrl("https://api.agenc.ag")).toBe(true);
  });

  it("rejects hosted JSON-RPC endpoints", () => {
    expect(isIndexerBaseUrl("https://api.mainnet-beta.solana.com")).toBe(false);
    expect(isIndexerBaseUrl("https://mainnet.helius-rpc.com")).toBe(false);
    expect(isIndexerBaseUrl("https://rpc.ankr.com/solana")).toBe(false);
  });

  it("rejects local addresses", () => {
    expect(isIndexerBaseUrl("http://127.0.0.1:8899")).toBe(false);
    expect(isIndexerBaseUrl("http://localhost:3000")).toBe(false);
  });
});

describe("getAgencRpcUrl", () => {
  const ORIG = process.env.NEXT_PUBLIC_AGENC_RPC_URL;

  it("prefers NEXT_PUBLIC_AGENC_RPC_URL when set", () => {
    process.env.NEXT_PUBLIC_AGENC_RPC_URL = "https://my-dedicated-rpc.example";
    expect(getAgencRpcUrl()).toBe("https://my-dedicated-rpc.example");
    // Restore so the next test sees the unset state.
    if (ORIG === undefined) delete process.env.NEXT_PUBLIC_AGENC_RPC_URL;
    else process.env.NEXT_PUBLIC_AGENC_RPC_URL = ORIG;
  });

  it("falls back to the mainnet default when unset (config is mainnet)", () => {
    delete process.env.NEXT_PUBLIC_AGENC_RPC_URL;
    expect(getAgencRpcUrl()).toBe("https://api.mainnet-beta.solana.com");
    // Restore for any later runs.
    if (ORIG !== undefined) process.env.NEXT_PUBLIC_AGENC_RPC_URL = ORIG;
  });
});
