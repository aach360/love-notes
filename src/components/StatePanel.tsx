import type { ReactNode } from "react";
import { Panel, OrbIcon } from "./aero";

export function StatePanel({ icon, title, children, tone = "aqua" }: { icon: ReactNode; title: string; children?: ReactNode; tone?: "aqua" | "grass" | "rose" | "pearl" }) {
  return (
    <Panel className="mx-auto flex max-w-sm flex-col items-center p-8 text-center">
      <OrbIcon tone={tone} className="size-14">{icon}</OrbIcon>
      <h2 className="mt-4 text-lg font-bold text-navy">{title}</h2>
      {children && <div className="mt-2 text-sm text-foreground/80">{children}</div>}
    </Panel>
  );
}
