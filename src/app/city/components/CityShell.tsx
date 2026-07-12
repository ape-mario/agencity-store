"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import { useGameStore } from "@/city/lib/store";
import type { ZoneType } from "@/city/lib/types";
import { CityHealthBar } from "./CityHealthBar";
import { CityWalletButton } from "./CityWalletButton";
import { CityHUD } from "./CityHUD";
import { CityZoneBridge } from "./CityZoneBridge";
import { CityGuide } from "./CityGuide";
import { ControlsHint } from "./ControlsHint";

const GameCanvas = dynamic(
  () => import("./GameCanvas").then((m) => m.default),
  { ssr: false }
);

const NAV: { href: string; label: string; zone: ZoneType }[] = [
  { href: "/", label: "City", zone: "main_city" },
  { href: "/catalog", label: "Catalog", zone: "trending" },
  { href: "/dashboard", label: "My tasks", zone: "labs" },
  { href: "/earnings", label: "Earnings", zone: "ballers" },
  { href: "/proof", label: "Proof", zone: "founders" },
  { href: "/trust", label: "Trust", zone: "arena" },
];

export function CityShell({ children }: { children: ReactNode }) {
  const currentZone = useGameStore((s) => s.currentZone);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();

  // Drop the player directly into the city whenever the app loads.
  // Wait for the Phaser scene to be ready so the spawn listener is registered.
  useEffect(() => {
    const handleReady = () => {
      window.dispatchEvent(
        new CustomEvent("agencity-enter-world", { detail: { spriteVariant: 0 } })
      );
    };

    window.addEventListener("worldscene-ready", handleReady, { once: true });
    return () => window.removeEventListener("worldscene-ready", handleReady);
  }, []);

  // Prefetch all popup routes so clicking a building or nav item feels instant.
  useEffect(() => {
    NAV.forEach((item) => router.prefetch(item.href));
  }, [router]);

  return (
    <div className="city-page">
      {/* Keep URL and Phaser zone in sync */}
      <CityZoneBridge />

      {/* Onboarding guide + control hints */}
      <CityGuide />
      <ControlsHint />

      {/* Game canvas fills the entire viewport */}
      <main className="absolute inset-0 overflow-hidden">
        <GameCanvas worldState={null} />
        <div className="scanlines" aria-hidden="true" />
        {/* Persistent HUD sits between header and footer */}
        <CityHUD />
      </main>

      {/* Route popups / page content render above the canvas */}
      {children}

      {/* Header overlay */}
      <header className="city-header absolute top-0 left-0 right-0 h-14 md:h-16 flex items-center justify-between px-3 md:px-4 z-[60] safe-area-top">
        <div className="flex items-center gap-2 md:gap-4">
          <Link
            href="/"
            className="w-8 h-8 bg-emerald-500/20 border border-emerald-500 flex items-center justify-center shadow-[0_0_10px_rgba(74,222,128,0.3)] hover:bg-emerald-500/30 transition-colors"
          >
            <span className="text-emerald-400 font-pixel text-xs">A</span>
          </Link>
          <h1 className="font-pixel text-xs md:text-sm text-emerald-400 hidden sm:block drop-shadow-[0_0_8px_rgba(74,222,128,0.4)]">
            AGENCITY
          </h1>
          <div className="hidden md:block">
            <CityHealthBar />
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-1">
          {NAV.map((item) => {
            const active = currentZone === item.zone;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`font-pixel text-[9px] px-2 py-1.5 border transition-colors ${
                  active
                    ? "bg-emerald-400 text-black border-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.5)]"
                    : "border-emerald-500/40 text-emerald-100 hover:border-emerald-400 hover:bg-emerald-500/10"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="lg:hidden">
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="w-9 h-9 sm:w-10 sm:h-10 border border-emerald-500 text-emerald-400 font-pixel text-xs hover:bg-emerald-500/10 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? "X" : "≡"}
            </button>
            {mobileMenuOpen && (
              <div className="absolute top-14 left-0 right-0 bg-[#0a0a0f] border-b-2 border-emerald-500 p-3 shadow-[0_0_20px_rgba(74,222,128,0.15)] z-[70]">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {NAV.map((item) => {
                    const active = currentZone === item.zone;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`font-pixel text-[10px] px-3 py-2.5 border text-center transition-colors ${
                          active
                            ? "bg-emerald-400 text-black border-emerald-400"
                            : "border-emerald-500/40 text-emerald-100"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <CityWalletButton />
        </div>
      </header>

      {/* Footer overlay */}
      <footer className="city-footer absolute bottom-0 left-0 right-0 h-9 flex items-center justify-between px-3 md:px-4 z-[55] safe-area-bottom font-pixel text-[8px] md:text-[10px] text-emerald-400/70">
        <div className="flex items-center gap-2 md:gap-4">
          <span>[AGENTS: 16]</span>
          <span className="hidden sm:inline">[ZONE: CITY]</span>
          <span className="hidden md:inline">[STATUS: ONLINE]</span>
        </div>
        <div className="truncate">AgenCity — Hire AI agents on-chain</div>
      </footer>
    </div>
  );
}
