/**
 * `<ListingThumbnail>` — a deterministic, generated category visual for a
 * listing card. NOT a real listing image (AgenC listings carry no image media)
 * — it's a UI placeholder derived from the category + name so cards are
 * visually distinct at a glance.
 *
 * The accent color + icon are chosen by category; a decorative pattern + an
 * initials watermark (from the listing name) add per-listing variation. All
 * honestly labeled as a generated visual.
 */
import {
  Code2,
  Database,
  PenTool,
  Search,
  Sparkles,
  Image as ImageIcon,
  Bot,
  type LucideIcon,
} from "lucide-react";

interface CategoryVisual {
  gradient: string;
  icon: LucideIcon;
  pattern: "grid" | "orbit" | "rays" | "stack";
}

const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  "code-generation": {
    gradient: "linear-gradient(135deg, #6D28D9 0%, #4C1D95 100%)",
    icon: Code2,
    pattern: "grid",
  },
  "data-analysis": {
    gradient: "linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)",
    icon: Database,
    pattern: "stack",
  },
  design: {
    gradient: "linear-gradient(135deg, #BE185D 0%, #831843 100%)",
    icon: PenTool,
    pattern: "rays",
  },
  writing: {
    gradient: "linear-gradient(135deg, #B45309 0%, #78350F 100%)",
    icon: PenTool,
    pattern: "orbit",
  },
  research: {
    gradient: "linear-gradient(135deg, #047857 0%, #064E3B 100%)",
    icon: Search,
    pattern: "orbit",
  },
  automation: {
    gradient: "linear-gradient(135deg, #6D28D9 0%, #5B21B6 100%)",
    icon: Bot,
    pattern: "grid",
  },
  "image-gen": {
    gradient: "linear-gradient(135deg, #9333EA 0%, #6B21A8 100%)",
    icon: ImageIcon,
    pattern: "rays",
  },
};

const DEFAULT_VISUAL: CategoryVisual = {
  gradient: "linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)",
  icon: Sparkles,
  pattern: "grid",
};

/** Deterministic 2-letter watermark from a name. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function ListingThumbnail({
  category,
  name,
}: {
  category?: string;
  name: string;
}) {
  const visual = CATEGORY_VISUALS[category ?? ""] ?? DEFAULT_VISUAL;
  const Icon = visual.icon;
  return (
    <div
      className="agenc-thumb"
      style={{ background: visual.gradient }}
      aria-hidden="true"
    >
      <div className={`agenc-thumb-pattern agenc-thumb-pattern--${visual.pattern}`} />
      <Icon className="agenc-thumb-icon" size={26} />
      <span className="agenc-thumb-initials">{initials(name)}</span>
    </div>
  );
}
