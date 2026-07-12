"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/city/lib/store";
import { ZONES, type ZoneType } from "@/city/lib/types";

const ZONE_ORDER: ZoneType[] = [
  "main_city",
  "trending",
  "labs",
  "founders",
  "ballers",
  "arena",
];

// Map city zones to the corresponding AgenCity menu route.
const ZONE_ROUTE_MAP: Partial<Record<ZoneType, string>> = {
  main_city: "/",
  trending: "/catalog",
  labs: "/dashboard",
  founders: "/proof",
  ballers: "/earnings",
  arena: "/trust",
};

export function CityHUD() {
  const router = useRouter();
  const currentZone = useGameStore((s) => s.currentZone);
  const [activeZone, setActiveZone] = useState<ZoneType>(currentZone);

  // Keep HUD synced with the authoritative game zone (walk, route, or popup close).
  useEffect(() => {
    setActiveZone(currentZone);
  }, [currentZone]);

  const handleZoneClick = (zone: ZoneType) => {
    const route = ZONE_ROUTE_MAP[zone];
    if (route) {
      router.push(route);
      return;
    }
    // In-city only zones (moltbook, ascension, etc.)
    if (zone === activeZone) return;
    window.dispatchEvent(new CustomEvent("agencity-zone-change", { detail: { zone } }));
  };

  const zoneInfo = ZONES[activeZone];

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col justify-between pt-14 md:pt-16 pb-9 px-2 sm:px-4">
      {/* Top bar */}
      <div className="pointer-events-auto flex items-start justify-between gap-2">
        <div className="hud-panel rounded px-2 py-1.5 sm:px-3 sm:py-2 max-w-[45vw]">
          <div className="text-[9px] sm:text-[10px] uppercase tracking-widest text-emerald-400/80">Zone</div>
          <div className="text-[10px] sm:text-xs leading-tight truncate">
            {zoneInfo.icon} {zoneInfo.name}
          </div>
        </div>

        <div className="hud-panel rounded px-2 py-1.5 sm:px-3 sm:py-2 text-right">
          <div className="text-[9px] sm:text-[10px] uppercase tracking-widest text-emerald-400/80">World Health</div>
          <div className="mt-1 h-2 w-24 overflow-hidden rounded bg-emerald-900/60 sm:w-32 md:w-40">
            <div className="h-full w-3/4 bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
          </div>
        </div>
      </div>

      {/* Bottom zone nav */}
      <div className="pointer-events-auto flex justify-center">
        <div className="hud-panel flex max-w-full flex-wrap items-center justify-center gap-1 rounded-lg p-1.5 sm:gap-2 sm:p-2">
          {ZONE_ORDER.map((zone) => {
            const info = ZONES[zone];
            const isActive = zone === activeZone;
            const route = ZONE_ROUTE_MAP[zone];
            return (
              <button
                key={zone}
                onClick={() => handleZoneClick(zone)}
                className={`btn-retro rounded px-1.5 py-1 text-[8px] leading-none sm:px-2 sm:py-1.5 sm:text-[10px] ${
                  isActive
                    ? "!bg-emerald-300 !text-black"
                    : "!bg-emerald-600/20 !text-emerald-100 hover:!bg-emerald-500/30"
                }`}
                title={`${info.description}${route ? ` → ${route}` : ""}`}
              >
                <span className="sm:hidden">{info.icon}</span>
                <span className="hidden sm:inline">{info.icon} {info.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
