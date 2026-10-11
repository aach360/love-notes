import { createFileRoute } from "@tanstack/react-router";
import { CalendarView } from "@/modules/plan/CalendarView";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendar — UNCitall" }] }),
  component: CalendarView,
});
