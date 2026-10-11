import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { PhotonContact, PhotonJob, PhotonReminder } from "@/shared/types";
import { admin } from "@/modules/clubs/clubs.server";

// Schema extension for the checked-in migration. Keep generated existing types intact.
// This is the sole cast boundary until deployment regenerates Supabase's types.
type Table<R> = {
  Row: { [K in keyof R]: R[K] };
  Insert: Partial<R>;
  Update: Partial<R>;
  Relationships: [];
};
type MessagingDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      photon_contacts: Table<PhotonContact>;
      photon_reminders: Table<PhotonReminder>;
      photon_outbox: Table<PhotonJob>;
      photon_health: Table<{ project_id: string; heartbeat_at: string }>;
      photon_inbox: Table<{
        project_id: string;
        message_id: string;
        contact_id: string;
        created_at: string;
      }>;
    };
    Functions: {
      photon_club_link: {
        Args: { p_user: string; p_club: string; p_device_hash: string; p_enabled: boolean };
        Returns: boolean;
      };
      photon_receive: { Args: { p: Json }; Returns: boolean };
      photon_account: {
        Args: { p_user: string; p_action: string; p_value?: Json };
        Returns: undefined;
      };
      photon_claim: { Args: { p_project: string }; Returns: PhotonJob[] };
      photon_delivery: {
        Args: { p_id: string; p_lease: string; p_action: string; p_provider?: string };
        Returns: boolean;
      };
    };
  };
};
export async function messagingDb() {
  return (await admin()) as unknown as SupabaseClient<MessagingDatabase>;
}
export function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error)
    throw new Error(
      "Messaging storage is unavailable. Check the migration and server configuration.",
    );
  return result.data;
}
