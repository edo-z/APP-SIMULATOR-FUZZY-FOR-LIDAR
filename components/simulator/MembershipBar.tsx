// components/simulator/MembershipBar.tsx

interface MembershipBarProps {
  name: string;
  degree: number;
  color: string; // Tailwind bg class, e.g. 'bg-blue-500'
}

export default function MembershipBar({ name, degree, color }: MembershipBarProps) {
  const pct = Math.round(degree * 100);
  return (
    <div className="mb-2">
      <div className="flex justify-between mb-1">
        <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{name}</span>
        <span className="text-[11px] text-neutral-400">{degree.toFixed(3)}</span>
      </div>
      <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-150 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
