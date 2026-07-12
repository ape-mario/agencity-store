"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useGameStore } from "@/city/lib/store";
import { isPopupClosing, setPopupClosing } from "@/city/lib/popup-state";
import type { ZoneType } from "@/city/lib/types";

export const ZONE_ROUTE_MAP: Partial<Record<ZoneType, string>> = {
  main_city: "/",
  trending: "/catalog",
  labs: "/dashboard",
  founders: "/proof",
  ballers: "/earnings",
  arena: "/trust",
};

const ROUTE_ZONE_MAP: Record<string, ZoneType> = {
  "/": "main_city",
  "/city": "main_city",
  "/catalog": "trending",
  "/dashboard": "labs",
  "/proof": "founders",
  "/earnings": "ballers",
  "/trust": "arena",
};

export function CityZoneBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const setZone = useGameStore((s) => s.setZone);

  // Sync route -> Phaser zone
  useEffect(() => {
    const zone = ROUTE_ZONE_MAP[pathname];
    if (!zone) return;

    // When a popup closes we route back to "/" so the modal unmounts, but the
    // player should remain in the same game zone. Swallow that single route
    // change so Phaser does not teleport them back to the city center.
    if (pathname === "/" && isPopupClosing()) {
      setPopupClosing(false);
      return;
    }

    setZone(zone);
    window.dispatchEvent(
      new CustomEvent("agencity-zone-change", { detail: { zone, source: "route" } })
    );
  }, [pathname, setZone]);

  // Sync Phaser walk -> store only (no popup; walking between zones just changes scenery)
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ zone: ZoneType; source?: string; direction?: string }>)
        .detail;
      if (!detail?.zone) return;
      if (detail.source !== "walk") return;

      setZone(detail.zone);
    };

    window.addEventListener("agencity-zone-change", handler);
    return () => window.removeEventListener("agencity-zone-change", handler);
  }, [setZone]);

  // Track the authoritative zone after Phaser finishes a transition
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ zone: ZoneType }>).detail;
      if (detail?.zone) setZone(detail.zone);
    };
    window.addEventListener("agencity-phaser-zone-change", handler);
    return () => window.removeEventListener("agencity-phaser-zone-change", handler);
  }, [setZone]);

  // Open the zone's route popup only when the player interacts with a building
  useEffect(() => {
    const openZonePopup = () => {
      const zone = useGameStore.getState().currentZone;
      const route = ZONE_ROUTE_MAP[zone];
      if (!route) return;
      // Always push the route so E/click re-opens the popup even if the URL
      // already matches (Next.js will no-op the navigation but the popup renders).
      router.push(route);
    };

    const events = [
      "agencity-building-click",
      "agencity-mansion-click",
      "agencity-treasury-click",
      "agencity-pokecenter-click",
      "agencity-casino-click",
      "agencity-arcade-click",
    ];

    events.forEach((e) => window.addEventListener(e, openZonePopup));
    return () => events.forEach((e) => window.removeEventListener(e, openZonePopup));
  }, [pathname, router]);

  return null;
}
