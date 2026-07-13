/**
 * Wrapper to run `next build` with ANALYZE=true for the bundle analyzer.
 * Cross-platform (avoids needing cross-env for a one-liner env var).
 *   npm run analyze
 * Generates treemaps HTML at .next/analyze/.
 */
process.env.ANALYZE = "true";
const { execSync } = await import("node:child_process");
execSync("npx next build", { stdio: "inherit" });
