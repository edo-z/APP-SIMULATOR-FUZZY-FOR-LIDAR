import { type ThrottleMembership, CENTROIDS, type ThrottleLabel } from '@/lib/fuzzy-engine';

interface OutputPanelProps {
  fuzzy: ThrottleMembership;
}

const LABELS: Record<ThrottleLabel, string> = {
  VL: 'Very Low',
  L:  'Low',
  M:  'Medium',
  H:  'High',
  VH: 'Very High',
};

export function OutputPanel({ fuzzy }: OutputPanelProps) {
  const keys = Object.keys(fuzzy) as ThrottleLabel[];
  return (
    <div className="space-y-2">
      {keys.map((k) => {
        const pct = Math.round(fuzzy[k] * 100);
        return (
          <div key={k} className="flex items-center gap-3">
            <span className="text-[11px] text-neutral-400 w-44 shrink-0">
              {k} — {LABELS[k]} ({CENTROIDS[k]}%)
            </span>
            <div className="flex-1 h-3 bg-neutral-800 rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-200 bg-sky-500"
                style={{
                  width: `${pct}%`,
                  opacity: 0.35 + fuzzy[k] * 0.65,
                }}
              />
            </div>
            <span className="text-[11px] text-neutral-500 w-8 text-right">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
