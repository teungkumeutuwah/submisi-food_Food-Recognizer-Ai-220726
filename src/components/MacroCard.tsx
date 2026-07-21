import React from "react";

interface MacroCardProps {
  label: string;
  value: string;
  labelColor: string;
  valueColor: string;
  emoji: string;
}

export const MacroCard: React.FC<MacroCardProps> = ({
  label,
  value,
  labelColor,
  valueColor,
  emoji,
}) => {
  return (
    <div className="flex-1 min-w-[70px] bg-white rounded-2xl border border-gray-100 p-3 shadow-xs flex flex-col items-center justify-center text-center">
      <span className="text-xl mb-1">{emoji}</span>
      <span className={`text-[11px] font-bold tracking-wider ${labelColor}`}>
        {label}
      </span>
      <span className={`text-base font-extrabold mt-1 ${valueColor}`}>
        {value}
      </span>
    </div>
  );
};
