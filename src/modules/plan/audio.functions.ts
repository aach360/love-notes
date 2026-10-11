import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * generatePlanAudio({ text }) → { status: "ok", audioBase64, mime } | { status: "unconfigured" | "error" }
 * Server-side ElevenLabs adapter. Text must come from planNarration() (stored fields only).
 */
export const generatePlanAudio = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ text: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["ELEVENLABS_API_KEY"];
    if (!key) return { status: "unconfigured" as const };
    const voice = process.env["ELEVENLABS_VOICE_ID"] || "JBFqnCBsd6RMkjVDRZzb";
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "xi-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ text: data.text, model_id: "eleven_multilingual_v2" }),
      });
      if (!res.ok) return { status: "error" as const, message: `ElevenLabs HTTP ${res.status}` };
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { status: "ok" as const, audioBase64: btoa(bin), mime: "audio/mpeg" };
    } catch (e) {
      return { status: "error" as const, message: (e as Error).message };
    }
  });

/** Reminder delivery boundary. No provider is wired yet — never fake success. */
export interface ReminderProvider {
  name: string;
  schedule(input: { eventId: string; sendAt: string; to: string }): Promise<{ delivered: boolean; providerId?: string }>;
}
export const reminderProvider: ReminderProvider | null = null;
