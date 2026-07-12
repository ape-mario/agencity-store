"use client";

import { useEffect, useCallback, type ReactNode } from "react";
import { useSwipeToDismiss } from "@/city/hooks/useSwipeToDismiss";

interface CityModalProps {
  title: string;
  icon?: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl" | "full";
  fullHeight?: boolean;
}

const MAX_WIDTH: Record<string, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  "3xl": "sm:max-w-3xl",
  "4xl": "sm:max-w-4xl",
  "5xl": "sm:max-w-5xl",
  "6xl": "sm:max-w-6xl",
  "7xl": "sm:max-w-7xl",
  full: "sm:max-w-[95vw]",
};

export function CityModal({
  title,
  icon,
  subtitle,
  children,
  onClose,
  maxWidth = "lg",
  fullHeight = false,
}: CityModalProps) {
  const { translateY, isDismissing, handlers } = useSwipeToDismiss(onClose, 120);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    // Tell Phaser to pause game input while this modal is open
    (window as any).__agencity_modal_open = true;
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      (window as any).__agencity_modal_open = false;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      onClick={handleBackdropClick}
    >
      <div
        className={`relative w-full ${MAX_WIDTH[maxWidth]} ${
          fullHeight ? "h-[92vh] sm:h-[95vh]" : "max-h-[92vh] sm:max-h-[95vh]"
        } flex flex-col overflow-hidden rounded-t-xl sm:rounded-xl border-4 border-emerald-500 bg-city-dark shadow-[0_0_40px_rgba(74,222,128,0.15)] ${
          isDismissing ? "opacity-0 translate-y-full transition-all duration-200" : ""
        }`}
        style={{
          transform: translateY > 0 ? `translateY(${translateY}px)` : undefined,
        }}
        {...handlers}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3 border-b-4 border-emerald-500 bg-emerald-900/20 shrink-0">
          <div className="min-w-0">
            <h2 className="font-pixel text-xs sm:text-sm text-emerald-300 truncate flex items-center gap-2">
              {icon && <span>{icon}</span>}
              {title}
            </h2>
            {subtitle && (
              <p className="font-pixel text-[8px] sm:text-[9px] text-emerald-400/60 mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center font-pixel text-sm text-white bg-red-600/90 hover:bg-red-500 border border-red-400 rounded transition-colors"
            aria-label="Close"
          >
            X
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
