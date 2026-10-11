import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/modules/auth/AuthProvider";
import { PhotonPanel } from "@/modules/assistant/messaging/PhotonPanel";
import { connectClubIMessage } from "@/modules/assistant/messaging/messaging.functions";
import { clubIMessageStatus } from "./clubs.functions";
import { AeroButton, Panel } from "@/components/aero";

export function ClubIMessage({
  clubId,
  deviceToken,
  joinCode,
}: {
  clubId: string;
  deviceToken: string;
  joinCode: string;
}) {
  const { user } = useAuth();
  const status = useServerFn(clubIMessageStatus);
  const connect = useServerFn(connectClubIMessage);
  const query = useQuery({
    queryKey: ["club-imessage", clubId, deviceToken],
    queryFn: () => status({ data: { clubId, deviceToken } }),
  });
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => connect({ data: { clubId, deviceToken, enabled } }),
    onSuccess: () => query.refetch(),
  });
  return (
    <div className="mb-4">
      <PhotonPanel />
      <Panel className="mt-3 space-y-2 p-4">
        <h2 className="font-bold text-navy">This club on iMessage</h2>
        <p className="text-sm text-muted-foreground">
          First link and confirm your iMessage above. Then enable this club to receive new club
          messages through Photon and reply from Messages. Your address stays private.
        </p>
        {user && (
          <AeroButton
            disabled={query.isPending || query.isError || mutation.isPending}
            onClick={() => mutation.mutate(!query.data?.enabled)}
          >
            {query.data?.enabled ? "Turn off club texts" : "Enable this club on iMessage"}
          </AeroButton>
        )}
        {query.data?.enabled && (
          <p className="text-sm">
            Reply with{" "}
            <span className="select-all font-mono font-bold">{joinCode} your message</span>. Text
            STOP to stop all texts.
          </p>
        )}
        {(mutation.isError || query.isError) && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.isError
              ? "Could not connect this club. Confirm your iMessage connection first, then try again."
              : "Could not load this club’s iMessage status."}
          </p>
        )}
      </Panel>
    </div>
  );
}
