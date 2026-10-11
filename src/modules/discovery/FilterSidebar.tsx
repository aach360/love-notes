import { useEffect, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { DateFilter, EventFilters } from "@/shared/types";

const DATES: { v: DateFilter; l: string }[] = [
  { v: "any", l: "Anytime" },
  { v: "today", l: "Today" },
  { v: "tomorrow", l: "Tomorrow" },
  { v: "weekend", l: "This weekend" },
  { v: "week", l: "Next 7 days" },
];

export function FilterSidebar({
  value,
  onChange,
  onClear,
  categories,
}: {
  value: EventFilters;
  onChange: (filters: EventFilters) => void;
  onClear: () => void;
  categories: string[];
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const active = Number(value.date !== "any") + Number(Boolean(value.category));

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={container}
      className="relative z-20"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls="event-filter-dropdown"
        onClick={() => setOpen(!open)}
        className="aero-btn aero-pearl inline-flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-4 py-2 text-xs font-bold"
      >
        <SlidersHorizontal className="size-4" /> Filters
        {active > 0 && (
          <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">
            {active}
          </span>
        )}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <section
          id="event-filter-dropdown"
          aria-label="Event filters"
          className="aero-panel absolute left-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-4 rounded-3xl p-4 shadow-xl"
        >
          <label className="grid gap-2 text-sm font-bold text-navy">
            When
            <select
              value={value.date}
              onChange={(event) => onChange({ ...value, date: event.target.value as DateFilter })}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              {DATES.map((date) => (
                <option key={date.v} value={date.v}>
                  {date.l}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold text-navy">
            Event type
            <select
              value={value.category ?? ""}
              onChange={(event) => onChange({ ...value, category: event.target.value || null })}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">All types</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClear}
              disabled={!active}
              className="min-h-11 px-2 text-sm font-bold text-primary disabled:opacity-50"
            >
              Clear filters
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
              className="aero-btn aero-aqua min-h-11 rounded-full px-4 text-sm font-bold"
            >
              Done
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
