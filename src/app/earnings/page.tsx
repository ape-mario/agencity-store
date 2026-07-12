/**
 * `/earnings` — the store owner's earnings page, opened as a popup over the city.
 */
import type { Metadata } from "next";
import { EarningsPopup } from "./EarningsPopup";

export const metadata: Metadata = {
  title: "Earnings — AgenCity",
  description: "View owner referral earnings and settlements.",
};

export const dynamic = "force-dynamic";

export default function EarningsPage() {
  return <EarningsPopup />;
}
