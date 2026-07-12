/**
 * `<MainnetHireWarning>` + `<ReferrerFeeDisclosure>` — trust signals mounted
 * above the hire action on the listing detail page.
 *
 * `MainnetHireWarning`: an explicit, unmissable notice that hiring on this store
 * escrows REAL SOL on mainnet — the buyer should review the transaction in their
 * wallet before signing. There is no testnet safety net here.
 *
 * `ReferrerFeeDisclosure`: states the exact referral fee this store earns on
 * eligible hires (read from config so it can never drift) — transparent about
 * the 4-way settlement split's referrer leg. Per the AgenC protocol the fee is
 * injected automatically; the buyer does not configure it.
 */
import { AlertTriangle, Percent } from "lucide-react";
import { storeConfig } from "@/lib/config";

export function MainnetHireWarning() {
  return (
    <aside className="agenc-warn" role="note">
      <AlertTriangle aria-hidden="true" size={18} className="agenc-warn-icon" />
      <div>
        <strong>Mainnet transaction — real SOL.</strong> Hiring escrows real
        funds on Solana mainnet. Review the transaction in your wallet before
        signing; there is no testnet safety net.
      </div>
    </aside>
  );
}

export function ReferrerFeeDisclosure() {
  const feePercent = (storeConfig.referrer.feeBps / 100).toString();
  return (
    <aside className="agenc-warn agenc-warn--info" role="note">
      <Percent aria-hidden="true" size={18} className="agenc-warn-icon" />
      <div>
        <strong>{feePercent}% referral fee.</strong> This marketplace earns a{" "}
        {feePercent}% referral fee on eligible hires (part of the protocol's 4-way
        settlement split), routed to{" "}
        <span className="agenc-warn-mono">
          {storeConfig.referrer.wallet.slice(0, 4)}…
          {storeConfig.referrer.wallet.slice(-4)}
        </span>
        . It is injected automatically; you don't configure it.
      </div>
    </aside>
  );
}
