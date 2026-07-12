/**
 * `<WalletConnectButton>` — a Phantom-first connect control for the header.
 *
 * Disconnected: shows "Connect Phantom" (opens the wallet modal).
 * Connecting: shows a spinner.
 * Connected: green status dot + truncated address + "Connected"; clicking
 * disconnects.
 *
 * The modal is re-themed via globals.css so Phantom is clearly recommended and
 * the "no private keys" assurance is visible. This component only reads the
 * public connection state — it never touches private keys.
 */
"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Loader2 } from "lucide-react";

/** Truncate a base58 address to `ABC1…xY2z`. */
function shortAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletConnectButton() {
  const { connected, connecting, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    return (
      <button
        type="button"
        className="agenc-wallet-btn agenc-wallet-btn--connected"
        onClick={() => disconnect()}
        title="Click to disconnect"
      >
        <span className="agenc-wallet-dot" aria-hidden="true" />
        <span className="agenc-wallet-addr">
          {shortAddress(publicKey.toBase58())}
        </span>
        <span className="agenc-wallet-state">Connected</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="agenc-wallet-btn"
      disabled={connecting}
      onClick={() => setVisible(true)}
    >
      {connecting ? (
        <>
          <Loader2 size={16} aria-hidden="true" className="agenc-spin" />
          Connecting…
        </>
      ) : (
        <>
          <span className="agenc-wallet-phantom-glyph" aria-hidden="true">
            ◎
          </span>
          Connect wallet
        </>
      )}
    </button>
  );
}
