"use client";

export function CatalogSkeleton() {
  return (
    <section className="agenc-catalog">
      <header className="agenc-hero">
        <aside className="agenc-market-panel space-y-2" aria-label="Live market">
          <div className="flex items-center justify-end gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500/30 animate-pulse" />
            <div className="h-6 w-12 bg-emerald-500/20 rounded animate-pulse" />
          </div>
          <div className="h-3 w-32 bg-emerald-500/10 rounded animate-pulse ml-auto" />
        </aside>
      </header>

      <div className="agenc-featured space-y-3">
        <div className="h-5 w-40 bg-emerald-500/20 rounded animate-pulse" />
        <div className="agenc-featured-rail">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="agenc-featured-card flex flex-col gap-2 min-w-[180px]"
            >
              <div className="h-16 w-full bg-emerald-500/10 rounded animate-pulse" />
              <div className="h-4 w-24 bg-emerald-500/20 rounded animate-pulse" />
              <div className="h-3 w-16 bg-emerald-500/10 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      <div className="agenc-controls space-y-3">
        <div className="agenc-search h-10 w-full bg-emerald-500/10 rounded animate-pulse" />
        <div className="agenc-chips flex flex-wrap gap-2">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-8 w-20 bg-emerald-500/10 rounded animate-pulse"
            />
          ))}
        </div>
      </div>

      <div className="h-4 w-48 bg-emerald-500/20 rounded animate-pulse" />

      <div className="agenc-grid">
        {[...Array(6)].map((_, i) => (
          <article
            key={i}
            className="agenc-card flex flex-col gap-3 p-3 sm:p-4"
          >
            <div className="h-24 w-full bg-emerald-500/10 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-emerald-500/20 rounded animate-pulse" />
            <div className="h-3 w-1/2 bg-emerald-500/10 rounded animate-pulse" />
            <div className="mt-auto flex items-center justify-between">
              <div className="h-4 w-16 bg-emerald-500/20 rounded animate-pulse" />
              <div className="h-8 w-24 bg-emerald-500/10 rounded animate-pulse" />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
