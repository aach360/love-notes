import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Upload, X } from "lucide-react";
import { scanPoster } from "./scanner.functions";
import { useUserState } from "@/modules/recommendations/UserStateProvider";
import { EventDetail } from "@/modules/discovery/EventDetail";
import type { PulseEvent } from "@/shared/types";
import { formatEventDate } from "@/shared/time";

async function preparePhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 20000000) throw new Error("Choose a photo smaller than 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser couldn’t prepare this photo.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.78).split(",")[1]!;
    if (data.length > 2000000) throw new Error("This photo is too large. Try a smaller image.");
    return data;
  } finally {
    bitmap.close();
  }
}
export function PosterScanner() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof scanPoster>> | null>(null);
  const [detail, setDetail] = useState<PulseEvent | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const scan = useServerFn(scanPoster);
  const { state, saveEvent, togglePlan } = useUserState();
  async function select(file?: File) {
    if (!file || busy) return;
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const image = await preparePhoto(file);
      const response = await scan({ data: { image } });
      setResult(response);
      if (!response.ok) setError(response.error);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Couldn’t open this photo. Try JPEG or PNG.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        aria-label="Scan or upload an event poster"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
        className="aero-btn aero-pearl flex size-11 shrink-0 items-center justify-center rounded-full"
      >
        <Camera className="size-4" />
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby="poster-title"
        className="aero-panel m-auto max-h-[85dvh] w-[min(32rem,calc(100vw-1.5rem))] overflow-y-auto rounded-3xl p-4 text-navy backdrop:bg-navy/30"
      >
        {open && (
          <>
            <header className="flex items-center justify-between">
              <h2 id="poster-title" className="text-lg font-bold">
                Find it from a poster
              </h2>
              <button
                aria-label="Close poster scanner"
                onClick={() => dialog.current?.close()}
                className="flex size-11 items-center justify-center rounded-full"
              >
                <X className="size-4" />
              </button>
            </header>
            <p className="mb-3 text-sm text-muted-foreground">
              Take a photo or upload a poster to find similar campus events and clubs.
            </p>
            <div className="flex flex-wrap gap-2">
              {[true, false].map((camera) => (
                <label
                  key={String(camera)}
                  className={`aero-btn ${camera ? "aero-aqua" : "aero-pearl"} inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-bold ${busy ? "opacity-50" : ""}`}
                >
                  {camera ? <Camera className="size-4" /> : <Upload className="size-4" />}
                  {camera ? "Take photo" : "Upload image"}
                  <input
                    aria-label={camera ? "Take poster photo" : "Upload poster image"}
                    type="file"
                    accept="image/*"
                    capture={camera ? "environment" : undefined}
                    disabled={busy}
                    className="sr-only"
                    onChange={(event) => {
                      void select(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Photo processed by Google Gemini. We don’t store it. Avoid including people or private
              details.
            </p>
            {busy && (
              <p role="status" className="my-4 text-sm font-bold">
                Reading your poster…
              </p>
            )}
            {error && (
              <p role="alert" className="my-3 text-sm text-destructive">
                {error}
              </p>
            )}
            {result?.ok && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-bold">
                  Possible matches · check the details before saving
                </p>
                {!result.events.length && !result.clubs.length && (
                  <p className="text-sm">
                    No matching listings yet. Try a clearer photo or search for the organizer in
                    Clubs.
                  </p>
                )}
                {result.events.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-border p-3">
                    <button
                      onClick={() => {
                        setDetail(event);
                        dialog.current?.close();
                      }}
                      className="text-left"
                    >
                      <h3 className="font-bold">{event.title}</h3>
                      <p className="text-xs text-muted-foreground">{formatEventDate(event)}</p>
                    </button>
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={state.saved.some((item) => item.eventId === event.id)}
                        onClick={() => saveEvent(event)}
                        className="aero-control min-h-11 rounded-full px-3 text-xs"
                      >
                        {state.saved.some((item) => item.eventId === event.id) ? "Saved ✓" : "Save"}
                      </button>
                      <button
                        onClick={() => togglePlan(event)}
                        className="aero-control min-h-11 rounded-full px-3 text-xs"
                      >
                        {state.plan.some((item) => item.eventId === event.id)
                          ? "In calendar ✓"
                          : "Add to calendar"}
                      </button>
                    </div>
                  </div>
                ))}
                {result.clubs.map((club) => (
                  <Link
                    key={club.id}
                    to="/clubs/$clubId"
                    params={{ clubId: club.id }}
                    onClick={() => dialog.current?.close()}
                    className="block rounded-2xl border border-border p-3"
                  >
                    <p className="font-bold">{club.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Club · open details or join with an invite code
                    </p>
                  </Link>
                ))}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer py-2">Text read from poster</summary>
                  <p className="whitespace-pre-wrap">{result.text}</p>
                </details>
              </div>
            )}
          </>
        )}
      </dialog>
      <EventDetail event={detail} onClose={() => setDetail(null)} />
    </>
  );
}
