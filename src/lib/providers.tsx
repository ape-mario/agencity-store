/**
 * `<Providers>` — the client boundary that mounts the Solana wallet adapter
 * stack and the AgenC context above the whole app.
 *
 * ## Read transport
 *
 * `AgencProvider` derives its read transport from `config.indexer` (hosted) or
 * `config.queryTransport` (gPA fallback). When `api.baseUrl` is a real hosted
 * indexer we pass `indexer` and let the provider resolve indexer-first.
 *
 * ## Signer (the wallet bridge)
 *
 * A buyer's connected Solana wallet (Phantom-first) is bridged into a kit
 * signer via `signerFromWalletAdapter` and threaded into `AgencProviderConfig`
 * as `signer`. Until a wallet is connected, `signer` is `undefined` and the
 * store is read-only in the browser (browse/SEO/agent-cards work fully; hire
 * buttons prompt to connect). The full hire→activation lifecycle is signed by
 * the buyer's own wallet — the store never holds private keys.
 *
 * ## Referrer
 *
 * The referrer `{ wallet, feeBps }` flows from the validated `storeConfig`
 * (`agenc.config.ts`) into `AgencProviderConfig`, so it is injected into every
 * hire at the provider level and disclosed on `/trust` + checkout. The two
 * surfaces can never drift.
 */
"use client";
import { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { VersionedTransaction } from "@solana/web3.js";
import {
  AgencProvider,
  createReadTransport,
  signerFromWalletAdapter,
  type AgencProviderConfig,
} from "@tetsuo-ai/marketplace-react";
import { createSolanaRpc } from "@solana/kit";
import "@solana/wallet-adapter-react-ui/styles.css";
import "@tetsuo-ai/marketplace-react/theme.css";
import "@tetsuo-ai/marketplace-react/components.css";
import { storeConfig } from "./config";
import { getAgencRpcUrl, indexerBaseUrl } from "./rpc";

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => getAgencRpcUrl(), []);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AgencProviderBridge>{children}</AgencProviderBridge>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

/**
 * Bridges the connected Solana wallet into the AgenC provider's signer. Lives
 * below `WalletProvider` so `useWallet()` reflects the live connection state;
 * rebuilds the signer + provider config whenever connection changes.
 */
function AgencProviderBridge({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const rpcUrl = getAgencRpcUrl();

  // Only build a signer once a wallet with signing capability is connected.
  const signer = useMemo(() => {
    if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) {
      return undefined;
    }
    return signerFromWalletAdapter(
      {
        publicKey: wallet.publicKey,
        signTransaction: async (transaction) => {
          const signed = await wallet.signTransaction!(
            transaction as unknown as VersionedTransaction,
          );
          return signed as unknown as typeof transaction;
        },
      },
      { VersionedTransaction },
    );
  }, [wallet.connected, wallet.publicKey, wallet.signTransaction]);

  const config = useMemo<AgencProviderConfig>(() => {
    // Referrer: validated + stored + disclosed + injected into every hire by
    // the provider (referral settlement is live on-chain). Read from config so
    // it can never drift from agenc.config.ts.
    const referrer = {
      wallet: storeConfig.referrer.wallet,
      feeBps: storeConfig.referrer.feeBps,
    };
    const indexer = indexerBaseUrl();
    if (indexer) {
      return {
        network: storeConfig.network,
        rpcUrl,
        indexer: { baseUrl: indexer, apiKey: storeConfig.api.apiKey },
        referrer,
        signer,
      };
    }
    // gPA / localnet: build the read transport explicitly.
    return {
      network: storeConfig.network,
      rpcUrl,
      queryTransport: createReadTransport({ rpc: createSolanaRpc(rpcUrl) }),
      referrer,
      signer,
    };
  }, [rpcUrl, signer]);

  return <AgencProvider config={config}>{children}</AgencProvider>;
}
