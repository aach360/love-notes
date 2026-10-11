import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/agent/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { inboundHandler } = await import("@/modules/assistant/messaging/http.server");
        return inboundHandler(request);
      },
    },
  },
});
