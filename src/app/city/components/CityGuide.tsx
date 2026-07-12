"use client";

import { useEffect, useState } from "react";

const GUIDE_KEY = "agencity-guide-shown";

const DIALOGUE_LINES = [
  "Welcome to AgenCity! I'm CityBot, your guide.",
  "This city is the homepage of the app. Each district maps to a feature:",
  "City — where you are now. Catalog — hire AI agents. My tasks — track deliveries.",
  "Earnings — referral rewards. Proof — live on-chain verification. Trust — buyer protection.",
  "Walk left or right to explore districts. Press E near a building to open it.",
  "Use WASD or arrow keys to move. On mobile, tap where you want to go.",
  "Ready? Start exploring and find the right agent for your job!",
];

export function CityGuide() {
  const [visible, setVisible] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Wait for the player to spawn before showing the guide
    const handleEntered = () => {
      const alreadyShown = window.sessionStorage.getItem(GUIDE_KEY);
      if (!alreadyShown) {
        setVisible(true);
      }
    };

    window.addEventListener("agencity-player-entered", handleEntered);
    return () => window.removeEventListener("agencity-player-entered", handleEntered);
  }, []);

  const handleNext = () => {
    if (lineIndex < DIALOGUE_LINES.length - 1) {
      setLineIndex((i) => i + 1);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    setVisible(false);
    setDismissed(true);
    window.sessionStorage.setItem(GUIDE_KEY, "1");
  };

  if (!visible || dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 sm:bottom-24 z-[60] flex justify-center px-4 pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-2xl bg-black/90 border-4 border-emerald-500 rounded-t-xl sm:rounded-xl shadow-[0_0_40px_rgba(74,222,128,0.2)] p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 sm:gap-4">
          {/* NPC avatar */}
          <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-emerald-900/60 border-2 border-emerald-400 flex items-center justify-center text-2xl sm:text-3xl shadow-[0_0_12px_rgba(74,222,128,0.4)]">
            🤖
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-pixel text-xs sm:text-sm text-emerald-300">CityBot</span>
              <span className="font-pixel text-[8px] text-emerald-500/70">
                {lineIndex + 1}/{DIALOGUE_LINES.length}
              </span>
            </div>

            <p className="font-pixel text-[10px] sm:text-xs text-white leading-relaxed min-h-[3rem]">
              {DIALOGUE_LINES[lineIndex]}
            </p>

            <div className="flex items-center justify-between mt-3">
              <button
                onClick={handleClose}
                className="font-pixel text-[8px] sm:text-[10px] text-emerald-400/70 hover:text-emerald-300 transition-colors"
              >
                SKIP
              </button>
              <button
                onClick={handleNext}
                className="btn-retro text-[8px] sm:text-[10px] px-3 py-1.5"
              >
                {lineIndex < DIALOGUE_LINES.length - 1 ? "NEXT" : "GOT IT"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
