// components/simulator/MembershipPanel.tsx
import type { AgeFS, TempFS, HumFS, AgeKey } from '@/lib/fuzzy-engine';
import { AGE_KEYS, AGE_LABELS, TEMP_LABELS, HUM_LABELS } from '@/lib/fuzzy-engine';
import MembershipBar from './MembershipBar';

interface SetpointInfo {
  temp: number;
  hum: number;
}

interface ErrorInfo {
  es: number;
  ek: number;
}

interface MembershipPanelProps {
  age: AgeFS;
  temp: TempFS;
  hum: HumFS;
  dominantAge: AgeKey;
  setpoint: SetpointInfo;
  error: ErrorInfo;
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

export default function MembershipPanel({ age, temp, hum, dominantAge, setpoint, error }: MembershipPanelProps) {
  const tempKeys = ['NB', 'NK', 'Z', 'PK', 'PB'] as const;
  const isBA = dominantAge === 'BA';
  const tempRange = isBA ? '±2.0°C (Fase BA)' : '±1.0°C (Fase BL–PL)';

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5">
      <p className="text-[11px] font-medium text-neutral-400 tracking-widest uppercase mb-3">
        Derajat Keanggotaan Input
      </p>

      {/* Setpoint & Error Aktif */}
      <div className="mb-4 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg">
        <p className="text-[10px] font-medium text-neutral-400 tracking-wider uppercase mb-2">
          Setpoint & Error Aktif
        </p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-neutral-400">Fase Dominan:</span>
            <span className="ml-1 font-medium text-neutral-700 dark:text-neutral-300">{dominantAge}</span>
          </div>
          <div>
            <span className="text-neutral-400">Setpoint Suhu:</span>
            <span className="ml-1 font-medium text-neutral-700 dark:text-neutral-300">{setpoint.temp.toFixed(1)} °C</span>
          </div>
          <div>
            <span className="text-neutral-400">Setpoint RH:</span>
            <span className="ml-1 font-medium text-neutral-700 dark:text-neutral-300">{setpoint.hum.toFixed(1)} %</span>
          </div>
          <div>
            <span className="text-neutral-400">Error Suhu (e_s):</span>
            <span className={`ml-1 font-medium ${error.es > 0 ? 'text-blue-600' : error.es < 0 ? 'text-orange-600' : 'text-green-600'}`}>
              {error.es.toFixed(2)}
            </span>
            <span className="text-[9px] text-neutral-400 ml-1">
              {error.es > 0 ? '(lebih dingin)' : error.es < 0 ? '(lebih panas)' : ''}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-neutral-400">Error RH (e_k):</span>
            <span className={`ml-1 font-medium ${error.ek > 0 ? 'text-amber-600' : error.ek < 0 ? 'text-cyan-600' : 'text-green-600'}`}>
              {error.ek.toFixed(2)}
            </span>
            <span className="text-[9px] text-neutral-400 ml-1">
              {error.ek > 0 ? '(lebih kering)' : error.ek < 0 ? '(lebih lembap)' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Umur */}
      <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-2">
        Umur Ayam (u)
      </p>
      {AGE_KEYS.map((k, i) => (
        <MembershipBar key={k} name={AGE_LABELS[k]} degree={age[k]} color={AGE_COLORS[i]} />
      ))}

      <hr className="my-3 border-neutral-200 dark:border-neutral-700" />

      {/* Error Suhu */}
      <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
        Error Suhu (e_s)
      </p>
      <p className="text-[9px] text-neutral-400 mb-2">
        {tempRange}
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
