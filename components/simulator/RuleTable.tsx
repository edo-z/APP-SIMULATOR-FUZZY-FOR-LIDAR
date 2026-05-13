// components/simulator/RuleTable.tsx
import type { RuleWeight } from '@/lib/fuzzy-engine';
import { ES_KEYS_ORDERED, EK_KEYS_ORDERED } from '@/lib/fuzzy-engine';

interface RuleTableProps {
  ruleWeights: RuleWeight[];
}

export default function RuleTable({ ruleWeights }: RuleTableProps) {
  // Build lookup map: "esKey|ekKey" → RuleWeight
  const lookup = new Map<string, RuleWeight>();
  for (const r of ruleWeights) {
    lookup.set(`${r.esKey}|${r.ekKey}`, r);
  }

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5">
      <p className="text-[11px] font-medium text-neutral-400 tracking-widest uppercase mb-3">
        Rule Base
      </p>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3 text-[10px] text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-100 dark:bg-blue-900/40" />
          VFD aktif
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-100 dark:bg-amber-900/40" />
          Dimmer aktif
        </span>
        <span className="text-neutral-300 dark:text-neutral-600">nilai = bobot AND</span>
        <span className="text-neutral-400 italic">
          Umum moderator bobot, bukan mengubah output
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="text-[10px] w-full border-collapse">
          <thead>
            <tr>
              <th className="text-neutral-400 font-medium text-left py-1 pr-2 min-w-[56px]">
                e_s \ e_k
              </th>
              {EK_KEYS_ORDERED.map((ek) => (
                <th
                  key={ek}
                  className="text-neutral-500 dark:text-neutral-400 font-medium text-center py-1 px-1 min-w-[90px]"
                >
                  {ek}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ES_KEYS_ORDERED.map((es) => (
              <tr key={es}>
                <td className="text-neutral-500 dark:text-neutral-400 font-medium py-1 pr-2">
                  {es}
                </td>
                {EK_KEYS_ORDERED.map((ek) => {
                  const rule = lookup.get(`${es}|${ek}`);
                  const w = rule?.w ?? 0;
                  const isActive = w > 0;
                  const intensity = Math.min(w, 1);

                  return (
                    <td key={ek} className="px-1 py-0.5">
                      <div
                        className="rounded px-1 py-0.5 text-center transition-colors"
                        style={{
                          backgroundColor: isActive
                            ? `rgba(59, 130, 246, ${0.1 + intensity * 0.2})`
                            : undefined,
                        }}
                      >
                        <div
                          className={`text-[10px] font-medium ${
                            isActive
                              ? 'text-blue-700 dark:text-blue-300'
                              : 'text-neutral-400'
                          }`}
                        >
                          V: {rule?.vCodes[0] ?? '—'}
                        </div>
                        <div
                          className={`text-[10px] font-medium ${
                            isActive
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-neutral-400'
                          }`}
                        >
                          D: {rule?.dCodes[0] ?? '—'}
                        </div>
                        <div className="text-[9px] text-neutral-400 mt-0.5">
                          w={w.toFixed(2)}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-neutral-400 mt-3">
        S=SR · R=Rendah · N=Normal · T=Tinggi · X=ST &nbsp;|&nbsp;
        Output SERAGAM untuk semua fase umur — umur berperan sebagai moderator bobot (AND), bukan mengubah output rule
      </p>
    </div>
  );
}
