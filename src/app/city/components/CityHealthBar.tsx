"use client";

interface CityHealthBarProps {
  health?: number;
}

export function CityHealthBar({ health = 75 }: CityHealthBarProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-pixel text-[9px] text-emerald-400/80">WORLD:</span>
      <div className="w-24 health-bar">
        <div className="health-bar-fill" style={{ width: `${health}%` }} />
      </div>
      <span className="font-pixel text-[9px] text-emerald-400/80">{health}%</span>
    </div>
  );
}
