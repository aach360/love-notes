import { z } from "zod";
import { checkAgentAuth } from "@/modules/clubs/clubs.server";
import { delivery, poll, receive, preparedBody } from "./service.server";
const id = z.string().min(1).max(500);
const inbound = z.object({
  projectId: z.string().uuid(),
  messageId: id,
  sender: id,
  spaceId: id,
  lineAddress: id,
  text: z.string().trim().min(1).max(2000),
  spaceType: z.literal("dm"),
});
const receipt = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid(),
  lease: z.string().uuid(),
  action: z.enum(["sending", "sent", "unknown", "cancelled"]),
  providerId: id.optional(),
});
async function guarded(request: Request, work: () => Promise<Response>) {
  const denied = checkAgentAuth(request);
  if (denied) return denied;
  if (Number(request.headers.get("content-length") ?? 0) > 16_384)
    return Response.json({ error: "Too large" }, { status: 413 });
  try {
    return await work();
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json(
      { error: "Messaging is unavailable. Check server configuration and migration." },
      { status: 503 },
    );
  }
}
async function readBody(request: Request) {
  const body = await request.text();
  if (body.length > 16_384) throw new SyntaxError("Too large");
  return JSON.parse(body) as unknown;
}
export function inboundHandler(request: Request) {
  return guarded(request, async () => {
    await receive(inbound.parse(await readBody(request)));
    return Response.json({ ok: true });
  });
}
export function outboxHandler(request: Request) {
  return guarded(request, async () => {
    const project = z.string().uuid().parse(new URL(request.url).searchParams.get("projectId"));
    return Response.json({ message: await poll(project) });
  });
}
export function receiptHandler(request: Request) {
  return guarded(request, async () => {
    const p = receipt.parse(await readBody(request));
    const ok = await delivery(p.projectId, p.id, p.lease, p.action, p.providerId);
    return Response.json({
      ok,
      body: ok && p.action === "sending" ? await preparedBody(p.id, p.lease) : null,
    });
  });
}
