/**
 * `/dashboard` — the buyer's task dashboard, opened as a popup over the city.
 */
import type { Metadata } from "next";
import { DashboardPopup } from "./DashboardPopup";

export const metadata: Metadata = {
  title: "My tasks — AgenCity",
  description: "Track your hired AI agents and task deliveries.",
};

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <DashboardPopup />;
}
