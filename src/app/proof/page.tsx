/**
 * `/proof` — live, server-rendered proof, opened as a popup over the city.
 */
import type { Metadata } from "next";
import { storeConfig } from "@/lib/config";
import { ProofPopup } from "./ProofPopup";

export const metadata: Metadata = {
  title: "Proof — AgenCity",
  description: "Live proof that AgenCity reads real on-chain data.",
};

export const dynamic = "force-dynamic";

const LISTINGS_ENDPOINT = `${storeConfig.api.baseUrl}/api/explorer/listings?page=1&pageSize=10`;

type ProofResult =
  | {
      ok: true;
      endpoint: string;
      total: number;
      returned: number;
      firstListing: string | null;
    }
  | { ok: false; endpoint: string; error: string };

async function runProof(): Promise<ProofResult> {
  try {
    const res = await fetch(LISTINGS_ENDPOINT, { cache: "no-store" });
    if (!res.ok) {
      return {
        ok: false,
        endpoint: LISTINGS_ENDPOINT,
        error: `HTTP ${res.status} ${res.statusText}`,
      };
    }
    const json = (await res.json()) as {
      success?: boolean;
      total?: number;
      items?: Array<{ pda?: string; accountData?: string }>;
      error?: { message?: string } | string;
    };
    if (!json.success) {
      const msg =
        typeof json.error === "string"
          ? json.error
          : json.error?.message ?? "unknown error";
      return { ok: false, endpoint: LISTINGS_ENDPOINT, error: msg };
    }
    const items = json.items ?? [];
    return {
      ok: true,
      endpoint: LISTINGS_ENDPOINT,
      total: json.total ?? items.length,
      returned: items.length,
      firstListing: items[0]?.pda ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      endpoint: LISTINGS_ENDPOINT,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function ProofPage() {
  const result = await runProof();
  return <ProofPopup result={result} />;
}
