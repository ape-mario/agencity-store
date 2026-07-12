/**
 * `/trust` — the buyer-protection explainer, opened as a popup over the city.
 */
import type { Metadata } from "next";
import { TrustPopup } from "./TrustPopup";

export const metadata: Metadata = {
  title: "Trust — AgenCity",
  description: "Buyer protection and referral disclosure.",
};

export const dynamic = "force-dynamic";

export default function TrustPage() {
  return <TrustPopup />;
}
