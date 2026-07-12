/**
 * `<Catalog>` — the AgenCity storefront catalog: hero + live market panel,
 * featured-agents rail, search + category filters, and a premium grid of
 * listing cards. Reads live mainnet data through `useListings` (indexer-first
 * via the provider) — no mock supply.
 *
 * The honest edge states (indexer unreachable, no listings, no matches) reuse
 * the template's `IndexerUnreachableSection` / `EmptyCatalogSection` /
 * `ZeroMatchSection` from store-core — these are protocol-aware and we do NOT
 * drop them.
 */
"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, TrendingUp, ArrowRight } from "lucide-react";
import { useListings } from "@tetsuo-ai/marketplace-react/hooks";
import {
  EmptyCatalogSection,
  IndexerUnreachableSection,
  ZeroMatchSection,
} from "@/lib/sections";
import type { StoreNetwork } from "@tetsuo-ai/store-core/config";
import type { Curation } from "@tetsuo-ai/store-core/config";
import { ListingThumbnail } from "@/components/listing-thumbnail";
import {
  CATEGORY_FACETS,
  featuredListings,
  formatLamportsAsSol,
  getListingBadges,
  listingName,
  searchListings,
  shortAddress,
  type ListingView,
} from "@/lib/listings";

/**
 * Adapt a raw `ListingRow` (a `DecodedProgramAccount<ServiceListing>`) into the
 * narrow `ListingView` the UI consumes. Reads defensively — the decoded account
 * exposes the fields used below, but we tolerate missing values so a schema
 * addition never breaks the grid.
 */
function asView(row: unknown): ListingView {
  const r = row as {
    address?: string;
    account?: Record<string, unknown>;
    name?: string;
  };
  const acc = (r.account ?? {}) as Record<string, unknown>;
  return {
    address: r.address ?? "",
    name: typeof r.name === "string" ? r.name : undefined,
    account: {
      price: (acc.price as bigint | number | undefined) ?? 0,
      version: (acc.version as bigint | number | undefined) ?? 0,
      specHash: (acc.specHash as Uint8Array | string | undefined) ?? "",
      category: typeof acc.category === "string" ? acc.category : undefined,
      provider:
        typeof acc.provider === "string"
          ? acc.provider
          : typeof acc.providerAddress === "string"
            ? acc.providerAddress
            : undefined,
      hiresCompleted:
        typeof acc.hiresCompleted === "number" ? acc.hiresCompleted : undefined,
    },
  };
}

export function Catalog({
  network,
  curation,
}: {
  network: StoreNetwork;
  curation?: Curation;
}) {
  const router = useRouter();
  const { listings, total, isLoading, error } = useListings();

  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");

  const views = useMemo(() => listings.map(asView), [listings]);

  const filtered = useMemo(() => {
    let out = views;
    // The store's base curation (e.g. requireModeration) is applied on top of
    // the live fetch; the category facet + free-text search narrow further.
    if (category) out = out.filter((v) => v.account.category === category);
    out = searchListings(out, query);
    return out;
  }, [views, category, query]);

  const featured = useMemo(() => featuredListings(views, 3), [views]);

  // Honest edge states (protocol-aware template sections) — do not drop these.
  if (error && !isLoading) {
    return <IndexerUnreachableSection />;
  }
  if (!isLoading && views.length === 0) {
    return <EmptyCatalogSection network={network} />;
  }

  return (
    <section className="agenc-catalog">
      {/* Live market panel */}
      <header className="agenc-hero">
        <aside className="agenc-market-panel" aria-label="Live market">
          <span className="agenc-market-dot" aria-hidden="true" />
          <div>
            <strong>{isLoading ? "…" : total}</strong>
            <span>live listings</span>
          </div>
          <p className="agenc-market-foot">Verified marketplace data · api.agenc.ag</p>
        </aside>
      </header>

      {/* Featured rail (top by hires) */}
      {featured.length > 0 && !query && !category && (
        <div className="agenc-featured">
          <h2>
            <TrendingUp size={16} aria-hidden="true" /> Featured agents
          </h2>
          <div className="agenc-featured-rail">
            {featured.map((v) => (
              <button
                key={v.address}
                type="button"
                className="agenc-featured-card"
                onClick={() => router.push(`/listings/${v.address}`)}
              >
                <ListingThumbnail
                  category={v.account.category}
                  name={listingName(v)}
                />
                <div>
                  <strong>{listingName(v)}</strong>
                  <span>{formatLamportsAsSol(v.account.price)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search + category filters */}
      <div className="agenc-controls">
        <div className="agenc-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents by name…"
            aria-label="Search agents"
          />
        </div>
        <div className="agenc-chips" role="group" aria-label="Filter by category">
          {CATEGORY_FACETS.map((facet) => {
            const active = facet.value === category;
            return (
              <button
                key={facet.value || "all"}
                type="button"
                aria-pressed={active}
                className={`agenc-chip${active ? " agenc-chip--active" : ""}`}
                onClick={() => setCategory(facet.value)}
              >
                {facet.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="agenc-result-count">
        {isLoading
          ? "Loading live listings…"
          : `${filtered.length} agent${filtered.length === 1 ? "" : "s"}${curation?.requireModeration ? " · moderated supply" : ""}`}
      </p>

      {/* Grid or zero-match */}
      {!isLoading && filtered.length === 0 ? (
        <ZeroMatchSection
          onClearFilters={() => {
            setCategory("");
            setQuery("");
          }}
        />
      ) : (
        <div className="agenc-grid">
          {filtered.map((v) => (
            <ListingCard key={v.address} view={v} onOpen={() => router.push(`/listings/${v.address}`)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ListingCard({
  view,
  onOpen,
}: {
  view: ListingView;
  onOpen: () => void;
}) {
  const badges = getListingBadges(view);
  return (
    <article className="agenc-card">
      <ListingThumbnail
        category={view.account.category}
        name={listingName(view)}
      />
      <div className="agenc-card-body">
        <div className="agenc-card-badges">
          {badges.map((b) => (
            <span key={b.label} className={`agenc-tag agenc-tag--${b.tone}`}>
              {b.label}
            </span>
          ))}
        </div>
        <h3>{listingName(view)}</h3>
        <p className="agenc-card-provider">
          by {shortAddress(view.account.provider)}
        </p>
        <div className="agenc-card-meta">
          <span className="agenc-card-price">
            {formatLamportsAsSol(view.account.price)}
          </span>
          <span className="agenc-card-hires">
            {view.account.hiresCompleted ?? 0} hires
          </span>
        </div>
      </div>
      <button type="button" className="agenc-card-cta" onClick={onOpen}>
        View listing <ArrowRight size={14} aria-hidden="true" />
      </button>
    </article>
  );
}
