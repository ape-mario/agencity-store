/**
 * RPC-endpoint resolution helpers (shared by the client provider + any
 * server-side SDK read).
 *
 * `api.baseUrl` in a real store is the hosted indexer (`https://api.agenc.ag`),
 * NOT a JSON-RPC endpoint. A hosted mainnet RPC mistakenly used as the indexer
 * base would fire REST paths at a JSON-RPC server (403/404 + an empty catalog),
 * so we classify it explicitly and route accordingly.
 */
import { storeConfig } from "./config";

/** Hosts that are JSON-RPC endpoints, not hosted indexers. */
const RPC_HOST_PATTERN =
  /solana\.com|helius|rpcpool|quiknode|quicknode|alchemy|ankr|triton|syndica/i;

/** Is `url` a hosted indexer (vs a local or hosted bare JSON-RPC)? */
export function isIndexerBaseUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes("127.0.0.1") || url.includes("localhost")) return false;
  return !RPC_HOST_PATTERN.test(url);
}

/**
 * Resolve the gPA/write RPC URL.
 * `NEXT_PUBLIC_AGENC_RPC_URL` wins when set (real deployments should provide a
 * dedicated endpoint — the public default is rate-limited and rejects browser
 * JSON-RPC on mainnet). Otherwise fall back per network.
 */
export function getAgencRpcUrl(): string {
  const override = process.env.NEXT_PUBLIC_AGENC_RPC_URL;
  if (override) return override;

  const base = storeConfig.api.baseUrl;
  const isLocalRpc = base.includes("127.0.0.1") || base.includes("localhost");
  if (isLocalRpc || RPC_HOST_PATTERN.test(base)) return base;

  switch (storeConfig.network) {
    case "localnet":
      return "http://127.0.0.1:8899";
    case "devnet":
      return "https://api.devnet.solana.com";
    case "mainnet":
      return "https://api.mainnet-beta.solana.com";
    default:
      return "https://api.mainnet-beta.solana.com";
  }
}

/** The hosted indexer base URL when configured, else `null` (gPA fallback). */
export function indexerBaseUrl(): string | null {
  return isIndexerBaseUrl(storeConfig.api.baseUrl) ? storeConfig.api.baseUrl : null;
}
