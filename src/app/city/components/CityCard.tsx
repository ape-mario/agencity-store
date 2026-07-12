"use client";

import type { ReactNode } from "react";

interface CityCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function CityCard({ children, className = "", onClick }: CityCardProps) {
  return (
    <div
      onClick={onClick}
      className={`border border-emerald-500/40 bg-city-darker/80 p-3 rounded transition-colors ${
        onClick
          ? "cursor-pointer hover:border-emerald-400 hover:bg-emerald-900/20"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
