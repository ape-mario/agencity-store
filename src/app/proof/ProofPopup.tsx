"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Terminal } from "lucide-react";
import { CityModal } from "@/app/city/components/CityModal";
import { setPopupClosing } from "@/app/city/lib/popup-state";
import { storeConfig } from "@/lib/config";

type ProofResult =
  | {
      ok: true;
      endpoint: string;
      total: number;
      returned: number;
      firstListing: string | null;
    }
  | { ok: false; endpoint: string; error: string };

interface ProofPopupProps {
  result: ProofResult;
}

export function ProofPopup({ result }: ProofPopupProps) {
  const router = useRouter();

  const handleClose = () => {
    setPopupClosing(true);
    router.push("/");
  };

  return (
    <CityModal
      title="Proof"
      icon="✓"
      subtitle="Live proof that AgenCity reads real on-chain data"
      onClose={handleClose}
      maxWidth="5xl"
    >
      <main className="info-page">
        <section className="info-hero">
          <span className="eyebrow">Live API proof</span>
          <h1>Real AgenC mainnet data, verified at request time.</h1>
          <p>
            This popup fetches the same read API the catalog uses and shows the
            live result. Nothing here is hardcoded.
          </p>
        </section>

        <section className="proof-status" aria-live="polite">
          {result.ok ? (
            <div className="proof-pill proof-pill--ok">
              <CheckCircle2 aria-hidden="true" size={20} />
              API reachable
            </div>
          ) : (
            <div className="proof-pill proof-pill--err">
              <XCircle aria-hidden="true" size={20} />
              API error
            </div>
          )}
        </section>

        <section className="info-grid" aria-label="Proof metrics">
          <article className="info-card">
            <h2>Endpoint</h2>
            <p className="proof-mono">{result.endpoint}</p>
          </article>
          <article className="info-card">
            <h2>Live API status</h2>
            <p>{result.ok ? "Reachable (200 OK)" : "Unreachable"}</p>
          </article>
          <article className="info-card">
            <h2>Total listings</h2>
            <p>{result.ok ? result.total : "—"}</p>
          </article>
          <article className="info-card">
            <h2>First listing PDA</h2>
            <p className="proof-mono">
              {result.ok ? result.firstListing ?? "—" : "—"}
            </p>
          </article>
        </section>

        {!result.ok && (
          <section className="info-card proof-error">
            <h2>Error detail</h2>
            <pre className="proof-mono">{result.error}</pre>
          </section>
        )}

        <section className="info-card proof-cli">
          <h2>
            <Terminal aria-hidden="true" size={18} /> Run the same proof locally
          </h2>
          <pre className="proof-mono">{`# Hit the live read API directly
curl -s "${result.endpoint}"

# Or run the bundled proof script
npm run proof:listings`}</pre>
        </section>

        <section className="info-grid" aria-label="About this proof">
          <article className="info-card">
            <h2>Source</h2>
            <p>
              The official hosted AgenC read API at{" "}
              <span className="proof-mono">{storeConfig.api.baseUrl}</span>.
            </p>
          </article>
          <article className="info-card">
            <h2>Failure behavior</h2>
            <p>
              On API failure this page shows the real error state — the store
              never substitutes mock or fallback listings.
            </p>
          </article>
        </section>
      </main>
    </CityModal>
  );
}
