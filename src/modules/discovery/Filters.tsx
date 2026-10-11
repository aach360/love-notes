import type { DateFilter, EventFilters } from "@/shared/types";
import { cn } from "@/lib/utils";
import { AeroButton } from "@/components/aero";

const DATES: { v: DateFilter; l: string }[] = [
  { v: "any", l: "Anytime" },
  { v: "today", l: "Today" },
  { v: "tomorrow", l: "Tomorrow" },
  { v: "weekend", l: "Weekend" },
  { v: "week", l: "7 days" },
];

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <AeroButton
      type="button"
      tone={active ? "aqua" : "pearl"}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold",
      )}
    >
      {children}
    </AeroButton>
  );
}

export function Filters({ value, onChange, categories }: { value: EventFilters; onChange: (f: EventFilters) => void; categories: string[] }) {
  return (
    <div className="space-y-2">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1">
        {DATES.map((d) => (
          <Pill key={d.v} active={value.date === d.v} onClick={() => onChange({ ...value, date: d.v })}>{d.l}</Pill>
        ))}
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1">
        <Pill active={!value.category} onClick={() => onChange({ ...value, category: null })}>All types</Pill>
        {categories.map((c) => (
          <Pill key={c} active={value.category === c} onClick={() => onChange({ ...value, category: c })}>{c}</Pill>
        ))}
      </div>
    </div>
  );
}
