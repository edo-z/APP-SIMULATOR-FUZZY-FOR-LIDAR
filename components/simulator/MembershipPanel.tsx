interface MembershipItem {
  label: string;
  value: number;
  color: string;
}

interface MembershipPanelProps {
  items: MembershipItem[];
}

export function MembershipPanel({ items }: MembershipPanelProps) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const pct = Math.round(item.value * 100);
        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-[11px] text-neutral-400 w-44 shrink-0">
              {item.label}
            </span>
            <div className="flex-1 h-3 bg-neutral-800 rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-200"
                style={{ width: `${pct}%`, backgroundColor: item.color }}
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
