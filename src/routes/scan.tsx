import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useRef, useState } from "react";
import { Camera, ExternalLink, ImageUp, Loader2, Users } from "lucide-react";
import { AeroButton, Chip, PageTitle, Panel } from "@/components/aero";
import { scanPoster, type ScanResult } from "@/modules/scan/scan.functions";
import { formatEventDate } from "@/shared/time";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Scan a poster — PulseMatch" },
      { name: "description", content: "Snap a flyer or club photo and see the club's details and matching UNC events." },
      { property: "og:title", content: "Scan a poster — PulseMatch" },
      { property: "og:description", content: "Photo of a flyer in, club info and events out." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScanPage,
});

/** Shrink to ≤1600px JPEG in the browser so uploads stay small. */
async function toDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

function ScanPage() {
  const scan = useServerFn(scanPoster);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setResult(null);
    setBusy(true);
    try {
      const url = await toDataUrl(f);
      setPreview(url);
      setResult(await scan({ data: { image: url } }));
    } catch (e) {
      setResult({ status: "error", message: e instanceof Error ? e.message : "Couldn't read that photo." });
    } finally {
      setBusy(false);
    }
  }

  const info = result?.status === "ok" ? result.info : null;
  const rows: [string, string | null][] = info
    ? [["Club", info.clubName], ["Event", info.eventTitle], ["Date", info.dateText], ["Time", info.timeText], ["Where", info.location]]
    : [];

  return (
    <div className="space-y-4">
      <PageTitle title="Scan a poster" subtitle="Take or upload a photo of a flyer or club table. We'll read it and find the club and its events." />
      <div className="flex flex-wrap gap-2">
        <AeroButton disabled={busy} onClick={() => camRef.current?.click()}><Camera className="size-4" /> Take photo</AeroButton>
        <AeroButton tone="pearl" disabled={busy} onClick={() => fileRef.current?.click()}><ImageUp className="size-4" /> Upload photo</AeroButton>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {preview && (
        <Panel className="p-3">
          <img src={preview} alt="Your photo" className="mx-auto max-h-72 rounded-2xl object-contain" />
          {busy && <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reading your photo…</p>}
        </Panel>
      )}

      {result && result.status !== "ok" && <Panel className="p-4 text-sm text-destructive">{result.message}</Panel>}

      {info && result?.status === "ok" && (
        <>
          <Panel className="space-y-2 p-4">
            <h2 className="font-display text-lg font-extrabold text-navy">What's on the photo</h2>
            {info.kind === "other" && !info.clubName && !info.eventTitle && <p className="text-sm text-muted-foreground">This doesn't look like a club poster or photo.</p>}
            {info.summary && <p className="text-sm">{info.summary}</p>}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {rows.filter(([, v]) => v).map(([k, v]) => (<Fragment key={k}><dt className="font-bold text-navy">{k}</dt><dd>{v}</dd></Fragment>))}
            </dl>
            {[...info.socials, ...info.emails, ...info.links].length > 0 && (
              <div className="flex flex-wrap gap-1.5">{[...info.socials, ...info.emails, ...info.links].map((s) => <Chip key={s}>{s}</Chip>)}</div>
            )}
            <p className="text-[11px] text-muted-foreground">Read by AI from your photo — double-check details on the poster or the club's page.</p>
          </Panel>

          <Panel className="space-y-2 p-4">
            <h3 className="font-bold text-navy">Clubs on PulseMatch</h3>
            {result.clubs.length ? result.clubs.map((c) => (
              <Link key={c.id} to="/clubs/$clubId" params={{ clubId: c.id }} className="flex items-center gap-3 rounded-2xl bg-card/60 p-3">
                <Users className="size-4 text-primary" />
                <span className="flex-1 font-bold text-navy">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.memberCount} members</span>
              </Link>
            )) : (
              <p className="text-sm text-muted-foreground">No matching club chat yet. <Link to="/clubs" className="font-bold text-primary underline">Start one on Clubs</Link>.</p>
            )}
          </Panel>

          <Panel className="space-y-2 p-4">
            <h3 className="font-bold text-navy">Matching upcoming events</h3>
            {result.events.length ? result.events.map((e) => (
              <a key={e.id} href={e.sourceUrl ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-card/60 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-navy">{e.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{formatEventDate(e)}{e.location ? ` · ${e.location}` : ""}</p>
                </div>
                {e.sourceUrl && <ExternalLink className="size-4 shrink-0 text-primary" />}
              </a>
            )) : <p className="text-sm text-muted-foreground">No listed events match this photo right now.</p>}
          </Panel>
        </>
      )}
    </div>
  );
}
