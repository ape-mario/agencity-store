/**
 * Listing presentation helpers.
 *
 * These are PURE client-side utilities over the decoded `ListingRow` shape
 * returned by `useListings` (a `DecodedProgramAccount<ServiceListing>`). They
 * do NOT re-fetch or re-implement the SDK read path — the catalog reads through
 * `marketplace-react`'s `useListings`, and these helpers only format/filter what
 * that hook already returned. (Avoids the dual-read-path drift seen in some
 * forks.)
 *
 * The structural type below mirrors the subset of the decoded on-chain account
 * the UI needs; it is intentionally narrower than the full Codama type so the
 * presentation layer stays decoupled from SDK internals.
 */

/** A lamports value as a bigint (the on-chain wire format). */
export type Lamports = bigint | number;

/** The decoded ServiceListing subset the UI consumes. */
export interface ListingAccountView {
  price: Lamports;
  version: bigint | number;
  specHash: Uint8Array | string;
  /** Free-text or category bucket from the on-chain listing. */
  category?: string;
  /** Provider agent PDA (the seller). */
  provider?: string;
  /** Hires served, when surfaced by the decoded account. */
  hiresCompleted?: number;
}

/** A `ListingRow`-shaped value the helpers operate on. */
export interface ListingView {
  address: string;
  account: ListingAccountView;
  /** A human label, when the decoded account exposes one. */
  name?: string;
}

/**
 * Format lamports as a human SOL string (BigInt-safe). Trims trailing zeros but
 * keeps at least 2 decimals for readability.
 */
export function formatLamportsAsSol(lamports: Lamports): string {
  const n = BigInt(lamports);
  const sol = Number(n) / 1_000_000_000;
  if (sol === 0) return "0 SOL";
  // Up to 4 significant decimals, then trim trailing zeros.
  const fixed = sol.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return `${fixed || "0"} SOL`;
}

/** Map a raw category token to a UI label. */
export function categoryLabel(category?: string): string {
  if (!category) return "General";
  const known: Record<string, string> = {
    "code-generation": "Code",
    "data-analysis": "Data",
    design: "Design",
    writing: "Writing",
    research: "Research",
    automation: "Automation",
    "image-gen": "Image",
  };
  return known[category] ?? category;
}

/** The category facets shown as filter chips. `""` = all. */
export const CATEGORY_FACETS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "code-generation", label: "Code" },
  { value: "data-analysis", label: "Data" },
  { value: "design", label: "Design" },
  { value: "writing", label: "Writing" },
  { value: "research", label: "Research" },
  { value: "automation", label: "Automation" },
  { value: "image-gen", label: "Image" },
];

export interface ListingBadge {
  label: string;
  tone: "available" | "verified" | "popular";
}

/**
 * Derive display badges from a listing view. Pure + deterministic from data:
 * "Available" (always, for active listings), "Popular" (≥2 hires), "Verified"
 * (placeholder for future verification flag — derived conservatively).
 */
export function getListingBadges(view: ListingView): ListingBadge[] {
  const badges: ListingBadge[] = [{ label: "Available", tone: "available" }];
  if ((view.account.hiresCompleted ?? 0) >= 2) {
    badges.push({ label: "Popular", tone: "popular" });
  }
  return badges;
}

/** Short-form provider address `ABCD…Wxyz`. */
export function shortAddress(address?: string): string {
  if (!address) return "—";
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** A human name for a listing (falls back to a short PDA). */
export function listingName(view: ListingView): string {
  return view.name?.trim() || `Agent ${shortAddress(view.address)}`;
}

/**
 * Case-insensitive name search over a list. Returns the filtered list (does not
 * mutate). An empty query returns the full list.
 */
export function searchListings(
  views: ListingView[],
  query: string,
): ListingView[] {
  const q = query.trim().toLowerCase();
  if (!q) return views;
  return views.filter((v) => listingName(v).toLowerCase().includes(q));
}

/** Sort by hires desc (featured rail), ties broken by name. */
export function byHiresDesc(a: ListingView, b: ListingView): number {
  const diff = (b.account.hiresCompleted ?? 0) - (a.account.hiresCompleted ?? 0);
  if (diff !== 0) return diff;
  return listingName(a).localeCompare(listingName(b));
}

/** The top N listings by hires (for the featured rail). */
export function featuredListings(views: ListingView[], n = 3): ListingView[] {
  return [...views].sort(byHiresDesc).slice(0, n);
}
