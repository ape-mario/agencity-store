"use client";

interface CityTab {
  id: string;
  label: string;
}

interface CityTabBarProps {
  tabs: CityTab[];
  active: string;
  onChange: (id: string) => void;
}

export function CityTabBar({ tabs, active, onChange }: CityTabBarProps) {
  return (
    <div className="flex border-b border-emerald-500/30">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 py-2.5 font-pixel text-[9px] sm:text-[10px] transition-colors ${
            active === tab.id
              ? "text-emerald-100 border-b-2 border-emerald-400 bg-emerald-900/20"
              : "text-emerald-400/50 hover:text-emerald-300"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
