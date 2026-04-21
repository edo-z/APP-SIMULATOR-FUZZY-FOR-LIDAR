interface MetricCardProps {
  label: string;
  value: number | string;
  sub: string;
  pct: number;
  barColor: string;
}

export function MetricCard({ label, value, sub, pct, barColor }: MetricCardProps) {
  return (
    <div className="border border-neutral-800 rounded-lg p-4 bg-neutral-900">
      <p className="text-[11px] text-neutral-500 mb-1">{label}</p>
      <p className="text-3xl font-medium tracking-tight">{value}</p>
      <p className="text-[11px] text-neutral-600 mt-0.5">{sub}</p>
      <div className="mt-3 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
