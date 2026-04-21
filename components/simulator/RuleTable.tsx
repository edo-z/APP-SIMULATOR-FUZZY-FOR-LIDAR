import { useMemo } from 'react';
import { type FiredRule, type ThrottleLabel } from '@/lib/fuzzy-engine';

interface RuleTableProps {
  rules: FiredRule[];
}

const BADGE_STYLE: Record<ThrottleLabel, string> = {
  VL: 'bg-sky-950 text-sky-300 border-sky-800',
  L:  'bg-emerald-950 text-emerald-300 border-emerald-800',
  M:  'bg-neutral-800 text-neutral-300 border-neutral-600',
  H:  'bg-amber-950 text-amber-300 border-amber-800',
  VH: 'bg-red-950 text-red-300 border-red-800',
};

export function RuleTable({ rules }: RuleTableProps) {
  // Urutkan: rule aktif di atas (diurutkan berdasarkan bobot tertinggi), lalu rule tidak aktif
  const sortedRules = useMemo(() => {
    const active = rules
      .filter(r => r.active)
      .sort((a, b) => b.weight - a.weight); // bobot tertinggi di atas

    const inactive = rules.filter(r => !r.active);

    return [...active, ...inactive];
  }, [rules]);

  const activeCount = sortedRules.filter(r => r.active).length;

  return (
    <div className="border border-neutral-800 rounded-lg overflow-hidden">
      {/* Summary badge */}
      <div className="px-3 py-2 bg-neutral-900 border-b border-neutral-800 flex items-center gap-2">
        <span className="text-[10px] text-neutral-500 uppercase tracking-wide">
          Rule Aktif:
        </span>
        <span className="text-[10px] font-medium text-emerald-400">
          {activeCount} / {rules.length}
        </span>
      </div>

      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead className="sticky top-0 bg-neutral-900 z-10">
            <tr>
              {['No', 'LIDAR', 'Kemiringan', 'Err Kec', 'Bobot', 'Throttle'].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-center text-neutral-500 font-medium border-b border-neutral-800"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRules.map((rule, i) => (
              <RuleRow key={i} index={i + 1} rule={rule} isActive={rule.active} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Komponen terpisah untuk setiap baris agar lebih clean
interface RuleRowProps {
  index: number;
  rule: FiredRule;
  isActive: boolean;
}

function RuleRow({ index, rule, isActive }: RuleRowProps) {
  return (
    <tr
      className={[
        'border-b border-neutral-800/50 transition-all duration-200',
        isActive
          ? 'bg-emerald-950/30 text-neutral-100'
          : 'text-neutral-600',
      ].join(' ')}
    >
      <td className="px-3 py-1.5 text-center">
        {isActive ? (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px]">
            {index}
          </span>
        ) : (
          <span className="text-neutral-600">{index}</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-center">
        <span className={isActive ? 'text-neutral-100' : ''}>{rule.lidar}</span>
      </td>
      <td className="px-3 py-1.5 text-center">
        <span className={isActive ? 'text-neutral-100' : ''}>{rule.slope}</span>
      </td>
      <td className="px-3 py-1.5 text-center">
        <span className={isActive ? 'text-neutral-100' : ''}>{rule.ev}</span>
      </td>
      <td className="px-3 py-1.5 text-center">
        {isActive ? (
          <span className="text-emerald-400 font-medium">
            {(rule.weight * 100).toFixed(0)}%
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-1.5 text-center">
        <span
          className={[
            'inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium',
            BADGE_STYLE[rule.output],
            isActive ? 'ring-1 ring-emerald-500/50' : '',
          ].join(' ')}
        >
          {rule.output}
        </span>
      </td>
    </tr>
  );
}
