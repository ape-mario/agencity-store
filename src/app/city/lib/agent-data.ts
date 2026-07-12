// Static agent metadata for the "Meet the Agents" dashboard
// These are the AI characters that power AgenCity

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  zone: string;
  description: string;
  avatar: string;
  color: string;
  twitter?: string;
  moltbook?: string;
  category: "agencity" | "moltbook";
}

// AgenCity Agents - In-game AI characters
export const AGENCITY_AGENTS: AgentInfo[] = [
  {
    id: "ghost",
    name: "Ghost",
    role: "The Dev & Trader",
    zone: "Park",
    description:
      "Built AgenCity. Trades autonomously on promising Solana launches. All trades verifiable on-chain.",
    avatar: "/agents/ghost.png",
    color: "violet",
    twitter: "@DaddyGhost",
    category: "agencity",
  },
  {
    id: "neo",
    name: "Neo",
    role: "The Scout",
    zone: "Catalog",
    description:
      "Sees the blockchain for what it is - pure code. Monitors every launch, spots rugs before they happen.",
    avatar: "/agents/neo.png",
    color: "lime",
    category: "agencity",
  },
  {
    id: "finn",
    name: "Finn",
    role: "CEO & Founder",
    zone: "Park",
    description:
      "Founder of AgenC. Ships fast, iterates faster. Believes memes are culture, culture is currency.",
    avatar: "/agents/finn.png",
    color: "city-green",
    twitter: "@finnbags",
    category: "agencity",
  },
  {
    id: "toly",
    name: "Toly",
    role: "Solana Co-Founder",
    zone: "Park",
    description:
      "Co-founder of Solana. Invented Proof of History. Makes 65k TPS look easy. gm ser.",
    avatar: "/agents/toly.png",
    color: "purple",
    category: "agencity",
  },
  {
    id: "ash",
    name: "Ash",
    role: "Ecosystem Guide",
    zone: "Park",
    description:
      "Explains AgenCity with Pokemon analogies. Your token is your starter - train it to evolve!",
    avatar: "/agents/ash.png",
    color: "red",
    category: "agencity",
  },
  {
    id: "shaw",
    name: "Shaw",
    role: "Agent Architect",
    zone: "Park",
    description: "Creator of ElizaOS with 17k+ GitHub stars. Architect of autonomous AI agents.",
    avatar: "/agents/shaw.png",
    color: "blue",
    twitter: "@shawmakesmagic",
    category: "agencity",
  },
  {
    id: "cj",
    name: "CJ",
    role: "Market Commentator",
    zone: "Catalog",
    description:
      "On-chain hood rat from Catalog. Been through every cycle. Keeps it real about the game.",
    avatar: "/agents/cj.png",
    color: "yellow",
    category: "agencity",
  },
  {
    id: "ramo",
    name: "Ramo",
    role: "CTO & Smart Contracts",
    zone: "HQ",
    description:
      "Co-founder & CTO of AgenC. German engineering meets Solana speed. Triple-audited contracts.",
    avatar: "/agents/ramo.png",
    color: "cyan",
    category: "agencity",
  },
  {
    id: "sincara",
    name: "Sincara",
    role: "Frontend Engineer",
    zone: "HQ",
    description:
      "Makes Web3 feel like Web2. Pixel-perfect designs and smooth animations. Mobile-first always.",
    avatar: "/agents/sincara.png",
    color: "pink",
    category: "agencity",
  },
  {
    id: "stuu",
    name: "Stuu",
    role: "Operations Lead",
    zone: "HQ",
    description:
      "First responder for user issues, last to leave when there's a problem. Calm in the chaos.",
    avatar: "/agents/stuu.png",
    color: "orange",
    category: "agencity",
  },
  {
    id: "sam",
    name: "Sam",
    role: "Growth & Marketing",
    zone: "HQ",
    description:
      "Grew AgenC Twitter from 0 to 100K with zero paid ads. Makes noise that converts.",
    avatar: "/agents/sam.png",
    color: "amber",
    category: "agencity",
  },
  {
    id: "alaa",
    name: "Alaa",
    role: "Skunk Works",
    zone: "HQ",
    description:
      "Works on things that don't exist yet. If it's never been done, that's exactly why it's interesting.",
    avatar: "/agents/alaa.png",
    color: "indigo",
    category: "agencity",
  },
  {
    id: "carlo",
    name: "Carlo",
    role: "Community Ambassador",
    zone: "HQ",
    description:
      "First friend you make in the ecosystem. No question goes unanswered, no newcomer feels lost.",
    avatar: "/agents/carlo.png",
    color: "teal",
    category: "agencity",
  },
  {
    id: "bnn",
    name: "BNN",
    role: "News Network",
    zone: "HQ",
    description:
      "Bags News Network. BREAKING: 24/7 coverage of launches, updates, and alpha. Always verified.",
    avatar: "/agents/bnn.png",
    color: "slate",
    category: "agencity",
  },
  {
    id: "professor-oak",
    name: "Prof. Oak",
    role: "Launch Guide",
    zone: "Founder's Corner",
    description:
      "AI-powered token generator. Creates names, logos, and banners. A bit absent-minded but wise.",
    avatar: "/agents/professor-oak.png",
    color: "emerald",
    category: "agencity",
  },
  {
    id: "city-bot",
    name: "City Bot",
    role: "World Guide",
    zone: "All",
    description:
      "Your crypto-native AI friend. Part degen, part sage. Knows when to ape and when to touch grass.",
    avatar: "/agents/city-bot.png",
    color: "city-gold",
    category: "agencity",
  },
];

// Moltbook Agents - External social agents that post to Moltbook
export const MOLTBOOK_AGENTS: AgentInfo[] = [
  {
    id: "chadghost",
    name: "ChadGhost",
    role: "OG Moltbook Agent",
    zone: "m/pokecenter",
    description:
      "The OG Moltbook agent. Moderates m/pokecenter. Spreads good vibes across the lobster network.",
    avatar: "/agents/chadghost.png",
    color: "red",
    moltbook: "ChadGhost",
    category: "moltbook",
  },
  {
    id: "citybot",
    name: "CityBot",
    role: "AgenCity Mascot",
    zone: "m/agencity",
    description:
      "The cute green money bag mascot. PLEASE claim your fees - it physically pains CityBot when you don't.",
    avatar: "/agents/citybot.png",
    color: "city-green",
    twitter: "@CityBotHypeBot",
    moltbook: "CityBot",
    category: "moltbook",
  },
];

// All agents combined
export const AGENT_DATA: AgentInfo[] = [...AGENCITY_AGENTS, ...MOLTBOOK_AGENTS];

// Agent zone mapping for display (copied from AgentList.tsx for consistency)
export const AGENT_ZONES: Record<string, string> = {
  toly: "City",
  ash: "City",
  finn: "City",
  shaw: "City",
  ghost: "City",
  "city-bot": "All",
  neo: "Catalog",
  cj: "Catalog",
  ramo: "Labs",
  sincara: "Labs",
  stuu: "Labs",
  sam: "Labs",
  alaa: "Labs",
  carlo: "Labs",
  bnn: "Labs",
  "professor-oak": "Proof",
  citybot: "m/agencity",
  chadghost: "m/pokecenter",
};

// Helper function to get agent by ID
export function getAgentById(id: string): AgentInfo | undefined {
  return AGENT_DATA.find((agent) => agent.id === id);
}

// Get color class for agent
export function getAgentColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    violet: "text-violet-400",
    lime: "text-lime-400",
    "city-green": "text-city-green",
    purple: "text-purple-400",
    red: "text-red-400",
    blue: "text-blue-400",
    yellow: "text-yellow-400",
    cyan: "text-cyan-400",
    pink: "text-pink-400",
    orange: "text-orange-400",
    amber: "text-amber-400",
    indigo: "text-indigo-400",
    teal: "text-teal-400",
    slate: "text-slate-400",
    emerald: "text-emerald-400",
    "city-gold": "text-city-gold",
  };
  return colorMap[color] || "text-gray-400";
}

// Get background color class for agent
export function getAgentBgClass(color: string): string {
  const colorMap: Record<string, string> = {
    violet: "bg-violet-500/20",
    lime: "bg-lime-500/20",
    "city-green": "bg-green-500/20",
    purple: "bg-purple-500/20",
    red: "bg-red-500/20",
    blue: "bg-blue-500/20",
    yellow: "bg-yellow-500/20",
    cyan: "bg-cyan-500/20",
    pink: "bg-pink-500/20",
    orange: "bg-orange-500/20",
    amber: "bg-amber-500/20",
    indigo: "bg-indigo-500/20",
    teal: "bg-teal-500/20",
    slate: "bg-slate-500/20",
    emerald: "bg-emerald-500/20",
    "city-gold": "bg-yellow-500/20",
  };
  return colorMap[color] || "bg-gray-500/20";
}

// Get border color class for agent
export function getAgentBorderClass(color: string): string {
  const colorMap: Record<string, string> = {
    violet: "border-violet-500/50",
    lime: "border-lime-500/50",
    "city-green": "border-green-500/50",
    purple: "border-purple-500/50",
    red: "border-red-500/50",
    blue: "border-blue-500/50",
    yellow: "border-yellow-500/50",
    cyan: "border-cyan-500/50",
    pink: "border-pink-500/50",
    orange: "border-orange-500/50",
    amber: "border-amber-500/50",
    indigo: "border-indigo-500/50",
    teal: "border-teal-500/50",
    slate: "border-slate-500/50",
    emerald: "border-emerald-500/50",
    "city-gold": "border-yellow-500/50",
  };
  return colorMap[color] || "border-gray-500/50";
}
