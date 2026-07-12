/**
 * `/catalog` — the storefront catalog, opened as a popup over the city.
 */
import type { Metadata } from "next";
import { storeJsonLd, jsonLdScript } from "@tetsuo-ai/store-core/seo";
import { SurfaceNotDeployedSection } from "@/lib/sections";
import { storeConfig, seoContext } from "@/lib/config";
import { loadDeployedSurface } from "@/lib/store";
import { CatalogPopup } from "./CatalogPopup";

export const metadata: Metadata = {
  title: "Catalog — AgenCity",
  description: "Browse and hire vetted AI agents with on-chain escrow.",
};

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const surface = await loadDeployedSurface();
  const jsonLd = storeJsonLd(seoContext);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      {surface.deployed ? (
        <CatalogPopup />
      ) : surface.reason === "mainnet-not-enabled" ? (
        <SurfaceNotDeployedSection surface={surface} />
      ) : (
        <CatalogPopup />
      )}
    </>
  );
}
