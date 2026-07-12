/**
 * `/listings/[pda]` — the listing detail page, opened as a popup over the city.
 */
import type { Metadata } from "next";
import {
  listingJsonLd,
  listingMetadata,
  jsonLdScript,
} from "@tetsuo-ai/store-core/seo";
import { seoContext } from "@/lib/config";
import { loadListing } from "@/lib/store";
import { ListingPopup } from "./ListingPopup";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pda: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { pda } = await params;
  const listing = await loadListing(pda);
  if (!listing) {
    return { title: `Listing not found — ${seoContext.name}` };
  }
  return listingMetadata(listing, seoContext);
}

export default async function ListingPage({ params }: Params) {
  const { pda } = await params;
  const listing = await loadListing(pda);

  return (
    <>
      {listing ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(listingJsonLd(listing, seoContext)),
          }}
        />
      ) : null}
      <ListingPopup pda={pda} />
    </>
  );
}
