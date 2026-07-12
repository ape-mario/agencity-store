#!/usr/bin/env node
/**
 * proof-listings.mjs — CLI mirror of the `/proof` page.
 *
 * Fetches the live AgenC read API and prints { endpoint, success, total,
 * returned, firstListing }. Exits non-zero on failure so it can gate CI.
 *
 *   npm run proof:listings
 */
const ENDPOINT =
  "https://api.agenc.ag/api/explorer/listings?page=1&pageSize=10";

try {
  const res = await fetch(ENDPOINT, { cache: "no-store" });
  if (!res.ok) {
    console.error(
      JSON.stringify(
        { endpoint: ENDPOINT, success: false, error: `HTTP ${res.status}` },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  const json = await res.json();
  const items = json.items ?? [];
  const out = {
    endpoint: ENDPOINT,
    success: Boolean(json.success),
    total: json.total ?? items.length,
    returned: items.length,
    firstListing: items[0]?.pda ?? null,
  };
  console.log(JSON.stringify(out, null, 2));
  if (!out.success) process.exit(1);
} catch (err) {
  console.error(
    JSON.stringify(
      { endpoint: ENDPOINT, success: false, error: String(err) },
      null,
      2,
    ),
  );
  process.exit(1);
}
