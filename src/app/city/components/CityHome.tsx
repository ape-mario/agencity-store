"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";

const GameCanvas = dynamic(
  () => import("./GameCanvas").then((m) => m.default),
  { ssr: false }
);

export function CityHome() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="city-loader">
        <div className="city-loader-text">Loading city...</div>
      </div>
    );
  }

  return (
    <div className="city-container">
      <div className="relative h-full w-full">
        <GameCanvas worldState={null} />
      </div>
    </div>
  );
}
