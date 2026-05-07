// components/simulator/MembershipPanel.tsx
import type { AgeFS, TempFS, HumFS } from '@/lib/fuzzy-engine';
import { AGE_KEYS, AGE_LABELS, TEMP_LABELS, HUM_LABELS } from '@/lib/fuzzy-engine';
import MembershipBar from './MembershipBar';

interface MembershipPanelProps {
  age: AgeFS;
  temp: TempFS;
  hum: HumFS;
}

const AGE_COLORS = [
  'bg-blue-500',
  'bg-teal-500',
  'bg-green-500',
  'bg-amber-500',
  'bg-orange-500',
];

const TEMP_COLORS = [
  'bg-red-500',
  'bg-orange-400',
  'bg-green-500',
  'bg-teal-500',
  'bg-blue-500',
];

const HUM_COLORS = [
  'bg-blue-600',
  'bg-blue-400',
  'bg-green-500',
  'bg-amber-400',
  'bg-orange-500',
];

export default function MembershipPanel({ age, temp, hum }: MembershipPanelProps) {
  const tempKeys = ['NB', 'NK', 'Z', 'PK', 'PB'] as const;

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5">
      <p className="text-[11px] font-medium text-neutral-400 tracking-widest uppercase mb-3">
        Derajat Keanggotaan Input
      </p>

      {/* Umur */}
      <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-2">
        Umur Ayam (u)
      </p>
      {AGE_KEYS.map((k, i) => (
        <MembershipBar key={k} name={AGE_LABELS[k]} degree={age[k]} color={AGE_COLORS[i]} />
      ))}

      <hr className="my-3 border-neutral-200 dark:border-neutral-700" />

      {/* Error Suhu */}
      <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-2">
        Error Suhu (e_s)
      </p>
      {tempKeys.map((k, i) => (
        <MembershipBar key={k} name={TEMP_LABELS[k]} degree={temp[k]} color={TEMP_COLORS[i]} />
      ))}

      <hr className="my-3 border-neutral-200 dark:border-neutral-700" />

      {/* Error Kelembaban */}
      <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-2">
        Error Kelembaban (e_k)
      </p>
      {tempKeys.map((k, i) => (
        <MembershipBar key={k} name={HUM_LABELS[k]} degree={hum[k]} color={HUM_COLORS[i]} />
      ))}
    </div>
  );
}
