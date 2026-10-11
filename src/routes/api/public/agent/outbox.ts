import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/agent/outbox")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { outboxHandler } = await import("@/modules/assistant/messaging/http.server");
        return outboxHandler(request);
      },
      POST: async ({ request }) => {
        const { receiptHandler } = await import("@/modules/assistant/messaging/http.server");
        return receiptHandler(request);
      },
    },
  },
});
