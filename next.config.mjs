/**
 * Next.js config for the AgenC marketplace-store template.
 *
 * `transpilePackages` lists the AgenC workspace packages so Next compiles their
 * ESM + the `"use client"` section components correctly when this template is
 * consumed from a local tarball / linked checkout (a published install needs no
 * change — the list is harmless either way).
 *
 * `outputFileTracingRoot` pins the tracing root to THIS template so Next does
 * not climb to a parent monorepo lockfile (the AgenC workspace has several) and
 * mis-detect the workspace root. A standalone scaffold (via create-agenc-store)
 * has no parent lockfile and is unaffected.
 *
 * ## Bundle analyzer
 *
 * Run `ANALYZE=true npm run build` to generate a treemap of the client bundle
 * at `.next/analyze/`. This is dev-only tooling (no runtime impact); it's how we
 * measure whether the Phaser game chunk, zone lazy-loading, and the Solana SDK
 * graph are well-separated or need further splitting.
 *
 * @type {import('next').NextConfig}
 */
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import bundleAnalyzer from "@next/bundle-analyzer";

const here = dirname(fileURLToPath(import.meta.url));

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: here,
  transpilePackages: [
    "@tetsuo-ai/store-core",
    "@tetsuo-ai/marketplace-react",
    "@tetsuo-ai/marketplace-sdk",
  ],
};

export default withBundleAnalyzer(nextConfig);
