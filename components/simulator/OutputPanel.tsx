// components/simulator/OutputPanel.tsx
import type { OutputFS } from '@/lib/fuzzy-engine';
import { OUTPUT_KEYS, OUTPUT_LABELS, OUTPUT_CENTROIDS } from '@/lib/fuzzy-engine';
import MembershipBar from './MembershipBar';

interface OutputPanelProps {
  vfd: OutputFS;
  dim: OutputFS;
  rawVfd: number;
  rawDim: number;
  pwmVfd: number;
  pwmDim: number;
}

const OUTPUT_COLORS = [
  'bg-blue-400',
  'bg-teal-500',
  'bg-green-500',
  'bg-amber-500',
  'bg-red-500',
];

function OutputSection({
  label,
  fs,
  raw,
  pwm,
  accentClass,
}: {
  label: string;
  fs: OutputFS;
  raw: number;
  pwm: number;
  accentClass: string;
}) {
  return (
    <div>
      <p className="text-[12px] font-medium text-neutral-700 dark:text-neutral-300 mb-3">{label}</p>
      {OUTPUT_KEYS.map((k, i) => (
        <MembershipBar
          key={k}
          name={`${OUTPUT_LABELS[k]}  (centroid ${OUTPUT_CENTROIDS[k]})`}
          degree={fs[k]}
          color={OUTPUT_COLORS[i]}
        />
      ))}
      <div className="flex items-baseline gap-2 mt-3">
        <span className="text-[11px] text-neutral-400">Centroid:</span>
        <span className={`text-lg font-medium ${accentClass}`}>{raw.toFixed(1)}</span>
        <span className="text-[11px] text-neutral-400">→ PWM</span>
        <span className={`text-lg font-medium ${accentClass}`}>{pwm}</span>
        <span className="text-[11px] text-neutral-400">/ 255</span>
      </div>
    </div>
  );
}

export default function OutputPanel({ vfd, dim, rawVfd, rawDim, pwmVfd, pwmDim }: OutputPanelProps) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5">
      <p className="text-[11px] font-medium text-neutral-400 tracking-widest uppercase mb-4">
        Output Fuzzy (Agregasi MAX)
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <OutputSection
          label="VFD / Kipas"
          fs={vfd}
          raw={rawVfd}
          pwm={pwmVfd}
          accentClass="text-blue-600 dark:text-blue-400"
        />
        <OutputSection
          label="AC Dimmer / Pemanas"
          fs={dim}
          raw={rawDim}
          pwm={pwmDim}
          accentClass="text-amber-600 dark:text-amber-400"
        />
      </div>
    </div>
  );
}
