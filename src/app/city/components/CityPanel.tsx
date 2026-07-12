"use client";

import type { ReactNode } from "react";

interface CityPanelProps {
  title?: string;
  icon?: string;
  children: ReactNode;
  className?: string;
}

export function CityPanel({ title, icon, children, className = "" }: CityPanelProps) {
  return (
    <div
      className={`border-2 border-emerald-500/60 bg-city-dark/95 p-3 sm:p-4 shadow-[0_0_16px_rgba(74,222,128,0.12)] ${className}`}
    >
      {title && (
        <h3 className="font-pixel text-[10px] sm:text-xs text-emerald-300 mb-2 flex items-center gap-2">
          {icon && <span>{icon}</span>}
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
