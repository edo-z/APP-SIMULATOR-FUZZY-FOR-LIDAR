// components/simulator/MetricCard.tsx
interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  /** Opsional: warna aksen (Tailwind class) */
  accent?: 'blue' | 'amber' | 'teal' | 'coral';
}

const accentMap = {
  blue:  'text-blue-600 dark:text-blue-400',
  amber: 'text-amber-600 dark:text-amber-400',
  teal:  'text-teal-600 dark:text-teal-400',
  coral: 'text-orange-600 dark:text-orange-400',
};

export default function MetricCard({ label, value, unit, accent = 'blue' }: MetricCardProps) {
  return (
    <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg px-4 py-3 text-center">
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-1 tracking-wide uppercase">
        {label}
      </p>
      <p className={`text-2xl font-medium ${accentMap[accent]}`}>
        {Number.isInteger(value) ? value : value.toFixed(1)}
      </p>
      <p className="text-[11px] text-neutral-400 mt-0.5">{unit}</p>
    </div>
  );
}
