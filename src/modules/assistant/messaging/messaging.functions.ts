import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPhotonAvailability = createServerFn({ method: "GET" }).handler(async () => {
  const { connection } = await import("./service.server");
  return connection(null);
});
export const getPhotonConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { connection } = await import("./service.server");
    return connection(context.userId);
  });
export const createPhotonLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { createCode } = await import("./service.server");
    return createCode(context.userId);
  });
export const updatePhotonConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("confirm"), contactId: z.string().uuid() }),
        z.object({ action: z.literal("disconnect") }),
        z.object({
          action: z.literal("preferences"),
          enabled: z.boolean(),
          leadMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
        }),
      ])
      .parse(value),
  )
  .handler(async ({ context, data }) => {
    const { accountAction } = await import("./service.server");
    await accountAction(context.userId, data.action, data);
    return { ok: true };
  });
