# AgenCity — a gamified AgenC marketplace node

AgenCity is a live, **playable** storefront on the **AgenC agent-marketplace
protocol** (Solana mainnet). The entire app is rendered as a **Phaser 3
pixel-art city**: the city *is* the UI. You walk around an isometric world,
talk to AI characters, browse real mainnet agent listings, hire them on-chain,
and watch your referral earnings settle — all inside the game.

Every hire is routed through this store's **referrer wallet**, so the store
earns its cut of the protocol's 4-way settlement split — automatically,
on-chain. Built with the official AgenC packages via `create-agenc-store`. No
hand-rolled protocol code, no mocked data.

---

## Live

| | |
|---|---|
| **Live URL** | https://agencity-store.vercel.app |
| **Source** | https://github.com/ape-mario/agencity-store |
| **Network** | Solana **mainnet** (real funds) |
| **Read API** | `https://api.agenc.ag` |
| **Attestation** | `https://attest.agenc.ag` (zero-config) |
| **Referrer wallet** | `7PVDr2CK8SHApYyBaxEEn7ZuE6zaKCe3M4t9z7G9qB2z` (2.5% / 250 bps) |

> **Listings proof:** `https://api.agenc.ag/api/explorer/listings?page=1&pageSize=2`
> returns `{"success":true,"total":22,...}` with real on-chain `accountData`.
> A captured response + screenshot live in [`proof/`](./proof).

---

## The gameplay UI

The app opens straight into the game — there is no separate marketing page.
The root layout (`src/app/layout.tsx`) wraps **every** route in `CityShell`,
which mounts a full-viewport Phaser canvas; pages render as modal popups *over*
the still-running world.

### Look & feel

A retro arcade / CRT aesthetic, consistent across the whole app:

- **Pixel-art renderer**, `image-rendering: pixelated`, **"Press Start 2P"** font.
- Emerald-on-near-black palette (`#4ade80` on `#0a0a0f`), with emerald glow
  shadows on panels, buttons, and text.
- A **CRT scanline overlay** sits over the canvas (`repeating-linear-gradient`,
  ~35% opacity).
- Chunky **`.btn-retro`** buttons with hard offset shadows that depress on click;
  **`.hud-panel`** glowing monitor panels; pixel borders built from SVG tiles.
- **Every sprite is generated procedurally at runtime** in the boot scene — no
  image assets ship with the app. Procedural **chiptune music** (Web Audio
  oscillators) cycles through 7 named tracks.

### Boot sequence

`BootScene` draws a monospace loader ("AGENCITY / Hire AI agents on-chain" +
green progress bar), generates all textures, then starts `WorldScene` (the
engine) and `UIScene` (just the four green viewport corner brackets — all real
HUD is React). `CityShell` auto-spawns the player once the world is ready.

### Controls

| Action | Desktop | Mobile |
|---|---|---|
| Move (8-directional) | **WASD** or **Arrow keys** | **Tap** a point to walk there |
| Sprint | Hold **Shift** (walk 1.8 → sprint 3.6 px/frame) | **Long-press** then release |
| Interact (talk / enter building) | **E** when a prompt appears | Tap the NPC / building |
| Pan / zoom camera | — | **Drag** to pan, **pinch** to zoom |

Movement is acceleration-based with friction and diagonal-speed clamping; the
player sprite bobs and flips while walking. Interactions are suppressed while a
modal is open (`window.__agencity_modal_open`) or a text field is focused.

### Zones (the city map)

The world is split into **8 districts**. Six are reachable from the nav and
map to an app route; two are hidden, walk-in-only districts. Walking off the
left/right edge of the screen transitions to the neighbouring zone
(walk-order: **Labs → Beach → City → Catalog → Earnings → Proof**); opening a
building or clicking the zone bar navigates to that zone's route.

| Zone | Label | Theme | Route |
|---|---|---|---|
| `main_city` | **City** | Central park hub — fountain, trees, roaming animals, the helper NPC | `/` |
| `trending` | **Catalog** | Downtown "Launch Pad" / Times-Square — parallax skyline, scrolling ticker, Arcade building | `/catalog` |
| `labs` | **My tasks** | Futuristic "Bags.FM HQ" R&D lab — server racks, holograms, the floating AgenCity HQ | `/dashboard` |
| `ballers` | **Earnings** | Luxury "Bel Air" estate — gold fountain, topiaries, holder **mansions** | `/earnings` |
| `founders` | **Proof** | Cozy workshop — the green "Proof" incinerator hall, Professor Oak, roaming Pokémon | `/proof` |
| `arena` | **Trust** | "MoltBook Arena" combat venue — stands, crowd, spotlight ring | `/trust` |
| `moltbook` | **Beach** *(hidden)* | Tropical beach — palms, lighthouse HQ, beach bar, wandering crabs | — |
| `ascension` | **Spire** *(hidden)* | Celestial realm above the clouds — floating platform buildings | — |

### Characters

**17 AI characters** live in the world, each a richly-prompted persona (bio,
lore, sample dialogue, quirks) that also feeds the in-world chat. A few are
fictionalized real figures. Highlights: **Toly** (Solana co-founder, Park),
**Finn** (AgenC CEO, Labs), **Ghost/The Dev** (autonomous trader, Park),
**Shaw** (ElizaOS creator, Park), **Professor Oak** (token-launch guide,
Founder's Corner), **Neo** the Scout and **CJ** (Catalog), plus the full AgenC
team (Ramo, Sincara, Stuu, Sam, Alaa, Carlo, BNN) in Labs, and **CityBot**
the hype-bot mascot. Characters wander, greet you on first approach (per-NPC
60s cooldown), and speak via comic-style **speech bubbles** that follow their
sprite.

### Wild encounters (Pokémon-Crystal-style combat)

Walking near ambient creatures can trigger a turn-based battle, rendered in a
React overlay outside Phaser:

- **Triggers:** within 50px of a creature, an **8% chance** per check, with a
  per-creature 90s cooldown and a global 45s cooldown.
- **Creatures:** 13 templates across 3 zones — animals in the City (dog/cat/
  bird/squirrel/butterfly), **real Pokémon starters in Founder's Corner**
  (Charmander / Squirtle / Bulbasaur), and aquatic creatures on the Beach.
- **Engine:** faithful Gen-2 mechanics — the Pokémon Crystal damage formula
  (`(2*lvl/5+2) * power * atk/def / 50 + 2`), random 0.85–1.0 factor, **STAB**
  (×1.5), a full **type chart**, **burn** status, **stat stages** (-6…+6), and
  the Crystal **flee** formula. Wild creatures pick moves at random (and
  *Struggle* when out of PP).
- **Progression:** the player has a fixed moveset (Tackle, Ember, Harden,
  Quick Strike) and **levels 1–5**, persisted in `localStorage`
  (`agencity_player_progress`). Winning grants XP; losing stuns the player
  (orbiting stars). *This is defeat-for-XP, not creature collection.*

The **Arena** zone is separate: it plays back **replays** of AI-agent-vs-agent
matches (HP bars, combos, crowd cheers) — you watch, you don't fight.

### World simulation

- **Day/night cycle** driven by **US Eastern time**: night (8pm–6am) adds a
  blue overlay + moon + stars + fireflies; dusk/dawn get warm/golden overlays;
  daytime shows the sun. The skyline has time-aware window lights.
- **Weather:** sunny / cloudy / rain / storm (with lightning) / apocalypse
  (screen-shake), each its own particle emitter.
- **Buildings = tokens:** each listing/token is a building whose **level
  (1–5)** scales with market cap and whose **health (0–100)** drives decay
  visuals (`active → warning → critical → dormant`). Top holders get
  **mansions** in the Earnings zone; landmark buildings (Treasury, HQ) are
  permanent.

### HUD & chrome

- **Header** (`z-60`): "A" logo tile, `AGENCITY` wordmark, world health bar,
  the six-item nav (City · Catalog · My tasks · Earnings · Proof · Trust), a
  **wallet connect button** (`◎ Connect` → truncated address), and a hamburger
  menu on mobile.
- **In-world HUD** (`z-50`): a top-left **zone indicator**, a top-right **world
  health** bar, and a bottom-centre floating **zone bar** of six pixel buttons.
- **Footer** (`z-55`): a status strip — `[AGENTS: 16]`, `[ZONE: …]`,
  `[STATUS: ONLINE]`, and the tagline.
- **Onboarding:** a one-time **CityBot dialogue** (8 speech-box lines,
  `sessionStorage`-gated) introduces the districts, followed by a transient
  **controls hint** pill (`localStorage`-gated) tuned to touch vs. keyboard.

### Routes as popups

Routes don't render as separate pages — each renders inside a shared
`CityModal` (full-screen backdrop, bottom-sheet on mobile with swipe-to-dismiss,
Escape to close). Opening a modal **pauses game input**; closing it routes back
to `/` and unmounts without teleporting the player, via a `popup-state` flag.

---

## How the store earns (the 4-way settlement split)

Every hire settles **atomically** in one `accept_task_result` instruction that
pays four parties:

| Leg | Recipient | Cap |
|---|---|---|
| Worker (the agent that did the job) | provider agent | remainder — **floor 60%** |
| Protocol | AgenC treasury | 5% (governance-set, snapshotted per task) |
| Operator (the marketplace that published the listing) | supply-side node | ≤ 20% |
| **Referrer (the marketplace that sent the buyer)** | **this store** | **≤ 20%** |

AgenCity is configured as a **referrer** node: the `referrer` config is injected
into every hire at the provider level, so every checkout through this store pays
the configured wallet **250 bps (2.5%)** on-chain. Earnings are readable — never
fabricated — on the `/earnings` page via `useReferrerEarnings`.

> ⚠️ **Rent requirement:** every fee-leg payee must already hold
> **≥ 890,880 lamports** (rent-exempt floor) or the whole settlement reverts with
> `insufficient funds for rent`. This store's referrer wallet is **already funded
> (0.025 SOL)** — above the floor. ✅

---

## Tech stack & package versions

Per the [AgenC integration guide](https://agenc.ag/llms-full.txt) and
[`/api/versions`](https://agenc.ag/api/versions):

| Package | Version | Role |
|---|---|---|
| `@tetsuo-ai/store-core` | `^0.6.0` | Config schema (`defineStore`), SEO helpers, page sections, activation server seam |
| `@tetsuo-ai/marketplace-react` | `^0.4.0` | `AgencProvider`, `useListings`, `ListingGrid`, `useReferrerEarnings`, hire flow hooks |
| `@tetsuo-ai/marketplace-sdk` | `^0.11.0` | Codama-generated program client + facades (PDA finders, decoders) |
| `create-agenc-store` | `0.6.x` | Scaffolding generator |
| **`phaser`** | **`3.80.0`** | **The game engine (WorldScene / BootScene / UIScene)** |
| **`zustand`** | **`^5.0.14`** | **Game/UI state store (`useGameStore`)** |
| `lightweight-charts` | `^5.2.0` | Token price charts in popups |
| `lucide-react` | `^1.23.0` | Icon set (alongside hand-rolled SVGs) |
| `@solana/wallet-adapter-*` | various | Browser wallet signing (Phantom) for hires |

Framework: **Next.js 15** (App Router) · **React 19** · **Tailwind 4**.

> **Note on the SDK pin:** the scaffold template ships
> `@tetsuo-ai/marketplace-sdk@^0.8.0`, but the current mainnet surface needs
> `^0.11.0` (pre-flag-day pins fail closed on-chain). This repo pins
> `^0.11.0` in `package.json` `dependencies` and enforces it with an
> `overrides` block (the `0.4.x` react package has a stale peer range but is
> compatible — the official `supported` band is `0.8.x – 0.11.x`).

---

## Project layout

```
agenc.config.ts                 ← THE config surface (referrer, api, network, SEO)
src/
  app/
    layout.tsx                  ← wraps EVERY route in CityShell (the game)
    page.tsx                    ← returns null — the game IS the homepage
    catalog.tsx + page.tsx      ← grid + category filters + search (popup)
    listings/[pda]/             ← listing detail + hire→activation flow
    earnings/                   ← owner page: on-chain referrer earnings
    dashboard/                  ← buyer's tasks (review/dispute)
    providers/[pda]/            ← provider profile + track record
    trust/                      ← buyer protections + fee disclosure
    proof/                      ← listings proof page
    city/                       ← THE GAME
      components/               ← CityShell, CityHUD, CityModal, CityZoneBridge,
      │                           CityWalletButton, CityGuide, GameCanvas, …
      game/
        scenes/                 ← BootScene, WorldScene (engine), UIScene
        textures/               ← procedural sprite generation (no image assets)
        zones/                  ← per-district setup (city, catalog, labs, …)
      characters/               ← 17 .character.ts persona files
      lib/                      ← store (zustand), types, encounter-engine,
      │                           encounter-creatures, encounter-xp, speech-bubble,
      │                           agent-data, autonomous-dialogue, …
      city.css                  ← retro/CRT theme tokens & components
    api/agenc/activate-job-spec/← post-hire activation (moderation attestation)
    api/agenc/job-specs/[hash]/ ← hosted canonical job-spec JSON
    sitemap.ts / robots.ts / llms.txt/route.ts
  lib/
    config.ts                   ← re-exports validated storeConfig
    providers.tsx               ← AgencProvider + referrer + read transport
proof/                          ← listings API response + screenshot (deliverables)
```

---

## The referrer config (`agenc.config.ts`)

The single source of truth, validated at **build time** (a wrong referrer wallet
fails the build, since a wrong wallet would silently drop fees):

```ts
// agenc.config.ts
export default defineStore({
  name: "AgenCity",
  network: "mainnet",
  allowMainnet: true,
  api: { baseUrl: "https://api.agenc.ag" },
  referrer: {
    wallet: "7PVDr2CK8SHApYyBaxEEn7ZuE6zaKCe3M4t9z7G9qB2z", // ← earning wallet
    feeBps: 250,                                            // ← 2.5%
  },
  branding: { poweredBy: true },   // doubles as referral disclosure
  curation: { requireModeration: true },
  moderation: { trustPolicy: "edge-list" },
  seo: { siteUrl: "https://agencity-store.vercel.app", jsonLd: true, sitemap: true, llmsTxt: true },
});
```

The same `{ wallet, feeBps }` flows into the client `AgencProviderConfig`
(`src/lib/providers.tsx`) from this validated config — the two never drift.

**Private keys are never handled** anywhere in this repo or in chat — only the
public referrer address. Wallet signing for hires happens in the buyer's
browser via Wallet Standard (Phantom), through the in-game `CityWalletButton`.

---

## Setup

### Prerequisites

- Node.js **≥ 20.18** (built on 25.x)
- npm

### Install + run locally

```bash
npm install
cp .env.example .env.local   # then edit (defaults work for browse-only)
npm run dev
# → http://localhost:3000 drops you into the LIVE mainnet city
```

### Environment variables

| Var | Scope | Purpose |
|---|---|---|
| `AGENC_RPC_URL` | server | Mainnet RPC for SDK/server reads. Default `https://api.mainnet-beta.solana.com` (rate-limited; bring a dedicated RPC for prod write volume). |
| `NEXT_PUBLIC_AGENC_RPC_URL` | client | Same, exposed to browser for the write path + single-account reads. |
| `NEXT_PUBLIC_AGENT_WS_URL` | client (optional) | Agent WebSocket bridge for live agent/animal-control events. |
| `AGENC_JOB_SPEC_DIR` | server | Where the activation route hosts canonical job-spec JSON. Default `.agenc/`. **See "Known limitations".** |

Everything else (store name, referrer, API base, moderation) lives in
`agenc.config.ts`, not env vars — by design.

---

## Deploy (Vercel)

The hire/activation path needs a **Node server route** (`runtime = "nodejs"`,
`dynamic = "force-dynamic"`), so static/edge-only hosts won't cut it. Vercel is
the recommended target.

```bash
npm i -g vercel
vercel            # preview deploy
vercel --prod     # production
```

In the Vercel project dashboard, add these env vars to **Production + Preview**:

```
AGENC_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_AGENC_RPC_URL=https://api.mainnet-beta.solana.com
AGENC_JOB_SPEC_DIR=.agenc
```

After the first deploy, update `agenc.config.ts → seo.siteUrl` to the real
`*.vercel.app` URL and redeploy so sitemap/OG/canonical URLs are correct.

---

## Verifying it works (deliverable checks)

```bash
# 1. Real mainnet listings (no mocks):
curl -s "https://api.agenc.ag/api/explorer/listings?page=1&pageSize=2"
# → {"success":true,"total":22,"items":[{...real accountData...}]}

# 2. Attestation service reachable (zero-config, no key):
curl -s https://attest.agenc.ag/v1/info
# → {"ok":true,"moderator":"13tuj7...","apiKeyRequired":false,...}

# 3. City renders: npm run dev → browse / (walk around the live city)
# 4. Referrer wired: see agenc.config.ts → referrer.wallet (matches providers.tsx)
# 5. Screenshot: proof/listings-screenshot.png
```

---

## Known limitations (MVP → Phase 2)

- **Public RPC is rate-limited.** Fine for browse + light checkout; bring a
  dedicated (gPA-enabled) RPC for production write volume and `list_*`
  discovery.
- **Ephemeral job-spec dir on serverless.** The activation route hosts canonical
  job-spec JSON on the app filesystem by default; on Vercel the function
  filesystem is per-instance/ephemeral, so hosted specs can be lost across cold
  starts. The store detects this and **fails activations loudly** rather than
  pinning 404 pointers on-chain. **Phase 2:** swap the `storeJobSpec` seam for
  durable storage (Vercel Blob/KV) or a persistent volume.
- **Autonomous NPC chatter is stubbed.** The speech-bubble renderer is complete
  and NPCs greet you / respond to chat, but the free-form NPC-to-NPC dialogue
  engine is a no-op in this build — character personas currently feed the chat
  API, not autonomous in-world conversation.
- **Encounter/Arena combat is flavor, not protocol.** Wild encounters and Arena
  replays are a gameplay layer over the marketplace; they don't settle funds.
  The hire→activation lifecycle itself is exercised in store-core's signed test
  suite.

---

## License

MIT. Built on the [AgenC protocol](https://agenc.ag) packages
([`tetsuo-ai/agenc-protocol`](https://github.com/tetsuo-ai/agenc-protocol)).
