import { useState } from "react";
import type { PhotonAccountAction } from "@/shared/types";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { AeroButton, Panel } from "@/components/aero";
import {
  getPhotonAvailability,
  getPhotonConnection,
  createPhotonLink,
  updatePhotonConnection,
} from "./messaging.functions";

export function PhotonPanel() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();
  const availability = useServerFn(getPhotonAvailability);
  const connection = useServerFn(getPhotonConnection);
  const createLink = useServerFn(createPhotonLink);
  const update = useServerFn(updatePhotonConnection);
  const [code, setCode] = useState<{ code: string; expiresAt: string; userId: string } | null>(
    null,
  );
  const key = ["photon", user?.id ?? "anonymous"];
  const query = useQuery({
    queryKey: key,
    queryFn: () => (user ? connection() : availability()),
    enabled: ready,
    refetchInterval: 10_000,
    staleTime: 0,
  });
  const makeCode = useMutation({
    mutationFn: () => createLink(),
    onSuccess: async (r) => {
      setCode({ ...r, userId: user!.id });
      await qc.invalidateQueries({ queryKey: ["photon"] });
    },
  });
  const change = useMutation({
    mutationFn: (data: PhotonAccountAction) => update({ data }),
    onSuccess: async () => {
      setCode(null);
      await qc.invalidateQueries({ queryKey: ["photon"] });
    },
  });
  const status = query.data;
  const link = status?.link;
  const busy = makeCode.isPending || change.isPending;
  const activeCode =
    code && code.userId === user?.id && Date.parse(code.expiresAt) > Date.now() ? code : null;
  const error = makeCode.error || change.error || query.error;
  const usable = status && ["online", "offline"].includes(status.status);
  return (
    <Panel className="mt-5 space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-bold text-navy">
        <MessageCircle className="size-4" /> iMessage with Rameses
      </h2>
      <p className="text-sm text-muted-foreground">
        Text questions about UNC events and get reminders for your plan, even with the app closed.
      </p>
      <div role="status" className="text-sm font-semibold text-navy">
        {!ready || query.isPending
          ? "Checking connection…"
          : status?.status === "unconfigured"
            ? "iMessage is not set up yet."
            : status?.status === "unavailable"
              ? "Messaging is temporarily unavailable."
              : status?.status === "offline"
                ? "The messaging agent is offline. Delivery is paused."
                : "Messaging agent connected."}
      </div>
      {!user && (
        <Link
          to="/auth"
          className="aero-btn aero-pearl inline-flex rounded-full px-4 py-2 text-sm font-bold"
        >
          Sign in to connect your plan
        </Link>
      )}
      {user && usable && (
        <>
          {status.botAddress && (
            <p className="text-sm">
              Bot address: <span className="select-all font-bold">{status.botAddress}</span>
            </p>
          )}
          {!link && (
            <>
              <AeroButton disabled={busy || !status.botAddress} onClick={() => makeCode.mutate()}>
                Connect iMessage
              </AeroButton>
              {!status.botAddress && (
                <p className="text-xs text-muted-foreground">
                  The bot address has not been configured yet.
                </p>
              )}
              {activeCode && (
                <div className="aero-solid rounded-2xl p-3 text-sm">
                  <p>Text this command to the bot, then return here to confirm:</p>
                  <p className="my-2 select-all font-mono font-bold">link {activeCode.code}</p>
                  <p>
                    Expires at {new Date(activeCode.expiresAt).toLocaleTimeString()}. Do not share
                    this code.
                  </p>
                </div>
              )}
            </>
          )}
          {link?.pending && (
            <div className="space-y-2">
              <p className="text-sm">
                Confirm that <strong>{link.sender}</strong> is your iMessage address. This connects
                your personal plan.
              </p>
              <AeroButton
                disabled={busy}
                onClick={() => change.mutate({ action: "confirm", contactId: link.id })}
              >
                Confirm my connection
              </AeroButton>
            </div>
          )}
          {link && !link.pending && (
            <>
              <p className="text-sm">
                Connected as <strong>{link.sender}</strong>.
              </p>
              {link.suppressed ? (
                <p className="text-sm">
                  Texts are stopped. Text START to the bot to allow replies again. Then enable
                  reminders separately.
                </p>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={link.remindersEnabled}
                      disabled={busy}
                      onChange={(e) =>
                        change.mutate({
                          action: "preferences",
                          enabled: e.target.checked,
                          leadMinutes: link.leadMinutes as 15 | 30 | 60,
                        })
                      }
                    />{" "}
                    Remind me before timed events in my cloud plan
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    Remind me{" "}
                    <select
                      aria-label="Reminder lead time"
                      className="aero-solid rounded-xl p-2"
                      value={link.leadMinutes}
                      disabled={busy}
                      onChange={(e) =>
                        change.mutate({
                          action: "preferences",
                          enabled: link.remindersEnabled,
                          leadMinutes: Number(e.target.value) as 15 | 30 | 60,
                        })
                      }
                    >
                      <option value={15}>15 minutes before</option>
                      <option value={30}>30 minutes before</option>
                      <option value={60}>1 hour before</option>
                    </select>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Uses your last saved cloud plan and the latest imported event times. All-day
                    events do not receive timed reminders. Text STOP to stop all messages.
                  </p>
                </>
              )}
            </>
          )}
          {link && (
            <AeroButton
              tone="pearl"
              disabled={busy}
              onClick={() => change.mutate({ action: "disconnect" })}
            >
              {link.pending ? "Cancel connection" : "Disconnect iMessage"}
            </AeroButton>
          )}
          {!!status.unknownDeliveries && (
            <p className="text-xs text-muted-foreground">
              Some recent messages have an unconfirmed send result. They will not be resent
              automatically.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Could not update messaging. Try again, or check the server setup if this continues.
        </p>
      )}
    </Panel>
  );
}
