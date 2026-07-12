"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Loader2 } from "lucide-react";

function shortAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function CityWalletButton() {
  const { connected, connecting, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    return (
      <button
        type="button"
        className="btn-retro !bg-emerald-400 !text-black min-w-[2.5rem]"
        onClick={() => disconnect()}
        title="Click to disconnect"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-green-700 mr-1" />
        <span className="hidden sm:inline">{shortAddress(publicKey.toBase58())}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn-retro min-w-[2.5rem]"
      disabled={connecting}
      onClick={() => setVisible(true)}
    >
      {connecting ? (
        <>
          <Loader2 size={14} aria-hidden="true" className="animate-spin mr-1" />
          <span className="hidden sm:inline">Connect…</span>
        </>
      ) : (
        <>
          <span className="sm:mr-1">◎</span>
          <span className="hidden sm:inline">Connect</span>
        </>
      )}
    </button>
  );
}
