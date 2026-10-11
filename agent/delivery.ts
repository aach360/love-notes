import type { PhotonDelivery } from "../src/shared/types";
import type { Receipt } from "./journal";

/** No blind retry after provider submission: even a thrown network error may mean accepted. */
export async function submitDelivery(
  job: PhotonDelivery,
  dependencies: {
    prepare: () => Promise<boolean>;
    send: () => Promise<{ id: string } | undefined>;
    saveReceipt: (receipt: Receipt) => void;
  },
) {
  if (!(await dependencies.prepare())) return;
  // Persist an unknown outcome before the network call; a process crash cannot trigger a resend.
  dependencies.saveReceipt({ id: job.id, lease: job.lease, action: "unknown" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      dependencies.send(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Provider timeout")), 45_000);
      }),
    ]);
    if (result?.id)
      dependencies.saveReceipt({
        id: job.id,
        lease: job.lease,
        action: "sent",
        providerId: result.id,
      });
  } catch {
    /* leave durable unknown status for reconciliation, never fabricate delivery */
  } finally {
    if (timer) clearTimeout(timer);
  }
}
