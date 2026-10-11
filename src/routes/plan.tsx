import { createFileRoute } from "@tanstack/react-router";
import { CalendarView } from "@/modules/plan/CalendarView";
import { PhotonPanel } from "@/modules/assistant/messaging/PhotonPanel";

export const Route = createFileRoute("/plan")({
  head: () => ({ meta: [{ title: "My calendar — UNCitall" }] }),
  component: Plan,
});

function Plan() {
  return (
    <div className="space-y-4">
      <CalendarView />
      <details className="aero-panel rounded-3xl p-4">
        <summary className="cursor-pointer font-bold text-navy">iMessage &amp; reminders</summary>
        <PhotonPanel />
      </details>
    </div>
  );
}
