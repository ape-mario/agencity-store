"use client";

import { useEffect, useState } from "react";

const HINT_KEY = "agencity-controls-hint-shown";

export function ControlsHint() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const alreadyShown = window.localStorage.getItem(HINT_KEY);
    if (alreadyShown) return;

    // Show after the player has spawned and the guide has had a moment
    const timer = setTimeout(() => {
      setVisible(true);
      window.localStorage.setItem(HINT_KEY, "1");
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!mounted || !visible) return null;

  const isMobile =
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    window.matchMedia("(pointer: coarse)").matches;

  return (
    <div className="fixed bottom-8 sm:bottom-10 left-1/2 -translate-x-1/2 z-[55] pointer-events-none">
      <div className="bg-black/70 border border-emerald-500/50 backdrop-blur-sm px-4 py-2 rounded shadow-[0_0_20px_rgba(74,222,128,0.15)]">
        <p className="font-pixel text-[9px] sm:text-[10px] text-emerald-100 text-center whitespace-nowrap">
          {isMobile
            ? "Tap anywhere to walk • tap a building to open it"
            : "WASD / arrows to move • E to interact • click a building to open it"}
        </p>
      </div>
    </div>
  );
}
