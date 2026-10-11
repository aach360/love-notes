import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { DateFilter, EventFilters } from "@/shared/types";
import { cn } from "@/lib/utils";
// Tar Heel foot logo (transparent PNG).
import rameses from "@/assets/tarheel-foot.png";

const DATES: { v: DateFilter; l: string }[] = [
  { v: "any", l: "Anytime" },
  { v: "today", l: "Today" },
  { v: "tomorrow", l: "Tomorrow" },
  { v: "weekend", l: "Weekend" },
  { v: "week", l: "7 days" },
];

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-carolina",
        active ? "aero-btn aero-aqua" : "aero-btn aero-pearl",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The Tar Heel foot lives inside the sidebar footer, so he moves with the panel's transform.
 * Closed: shifted right by the panel width so only his horns peek at the screen edge (CSS crop, same image).
 * Open: sits in the footer, non-interactive.
 */
export function RamesesPeek({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls="filter-sidebar-body"
      aria-label={open ? "Close filters" : "Open filters"}
      onClick={onToggle}
      className={cn(
        "rameses-peek absolute bottom-0 left-2 h-28 w-28 overflow-hidden rounded-t-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-carolina",
        open ? "rameses-peek-open pointer-events-none" : "rameses-peek-closed",
      )}
    >
      <img src={rameses} alt="" width={640} height={544} className={cn("rameses-img h-28 w-28 object-contain object-top drop-shadow-lg", open ? "rameses-up" : "rameses-down")} />
    </button>
  );
}

export function FilterSidebar({
  value,
  onChange,
  onClear,
  categories,
}: {
  value: EventFilters;
  onChange: (f: EventFilters) => void;
  onClear: () => void;
  categories: string[];
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const hoverCapable = useRef(false);

  useEffect(() => {
    hoverCapable.current = window.matchMedia("(hover: hover)").matches;
  }, []);

  const enter = () => {
    if (!hoverCapable.current) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const leave = () => {
    if (!hoverCapable.current) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 300);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || (t as Element).closest?.(".rameses-peek")) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const active = (value.date !== "any" ? 1 : 0) + (value.category ? 1 : 0) + (value.confirmedFreeOnly ? 1 : 0);

  return (
    <>
      {/* Thin hover strip on the left edge */}
      <div aria-hidden className="fixed inset-y-0 left-0 z-30 w-3 max-lg:hidden" onMouseEnter={enter} onMouseLeave={leave} />
      <aside
        id="filter-sidebar"
        ref={panelRef}
        aria-label="Event filters"
        onMouseEnter={enter}
        onMouseLeave={leave}
        className={cn(
          "filter-sidebar fixed left-0 top-3 bottom-3 z-40 w-72 max-w-[85vw] max-lg:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]",
          open ? "filter-open" : "filter-closed",
        )}
      >
        <div id="filter-sidebar-body" inert={!open} aria-hidden={!open} className="filter-body aero-panel flex h-full flex-col overflow-hidden rounded-r-3xl">
          <div className="flex shrink-0 items-center justify-between bg-navy px-4 py-3 text-navy-foreground">
            <div>
              <p className="font-display text-base font-extrabold">Filter your pulse</p>
              <p className="text-[11px] opacity-80">{active ? `${active} active` : "Tar Heels have your back"}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close filters" className="rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-carolina">
              <X className="size-4" />
            </button>
          </div>
          <div className="filter-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <section>
              <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-carolina">When</h3>
              <div className="flex flex-wrap gap-2">
                {DATES.map((d) => (
                  <Pill key={d.v} active={value.date === d.v} onClick={() => onChange({ ...value, date: d.v })}>{d.l}</Pill>
                ))}
                <Pill active={value.confirmedFreeOnly} onClick={() => onChange({ ...value, confirmedFreeOnly: !value.confirmedFreeOnly })}>Confirmed free</Pill>
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-carolina">Type</h3>
              <div className="flex flex-wrap gap-2">
                <Pill active={!value.category} onClick={() => onChange({ ...value, category: null })}>All types</Pill>
                {categories.map((c) => (
                  <Pill key={c} active={value.category === c} onClick={() => onChange({ ...value, category: c })}>{c}</Pill>
                ))}
              </div>
            </section>
          </div>
          {/* Footer zone: Rameses (left, positioned by RamesesPeek) + Clear filters (right) */}
          <div className="flex h-32 shrink-0 items-end justify-end border-t border-border/40 py-4 pl-32 pr-4">
            <button type="button" onClick={onClear} disabled={!active} className="aero-btn aero-pearl w-full rounded-full px-3 py-2 text-xs font-bold disabled:opacity-50">
              Clear filters
            </button>
          </div>
        </div>
        <RamesesPeek open={open} onToggle={() => setOpen((o) => !o)} />
      </aside>
    </>
  );
}
