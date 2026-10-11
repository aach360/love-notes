import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { UNC_CENTER, type ResolvedPlace } from "./venues";

export interface VenueGroup {
  place: ResolvedPlace;
  count: number;
}
export interface Bounds { n: number; s: number; e: number; w: number }

interface Props {
  groups: VenueGroup[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onMoved: (b: Bounds) => void;
  onFail: () => void;
  focus: { lat: number; lng: number; zoom?: number; nonce: number } | null;
  me: { lat: number; lng: number } | null;
}

const toBounds = (m: L.Map): Bounds => {
  const b = m.getBounds();
  return { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest() };
};

/** Browser-only. Venue groups merge into clusters when markers would overlap on screen. */
export default function LeafletMap({ groups, selectedKey, onSelect, onMoved, onFail, focus, me }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const meLayer = useRef<L.LayerGroup | null>(null);
  const cb = useRef({ onSelect, onMoved, onFail });
  cb.current = { onSelect, onMoved, onFail };
  const draw = useRef<() => void>(() => {});
  const prog = useRef(false);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { center: UNC_CENTER, zoom: 16, zoomControl: false, attributionControl: true });
    L.control.zoom({ position: "bottomright" }).addTo(m);
    let errors = 0;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
      .on("tileerror", () => { if (++errors === 8) cb.current.onFail(); })
      .addTo(m);
    layer.current = L.layerGroup().addTo(m);
    meLayer.current = L.layerGroup().addTo(m);
    // Programmatic flights (marker focus, Near me) shouldn't offer "Search this area".
    m.on("moveend", () => { draw.current(); if (prog.current) prog.current = false; else cb.current.onMoved(toBounds(m)); });
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  draw.current = () => {
    const m = map.current, lg = layer.current;
    if (!m || !lg) return;
    lg.clearLayers();
    const clusters: { pt: L.Point; items: VenueGroup[] }[] = [];
    for (const g of groups) {
      const pt = m.latLngToLayerPoint([g.place.lat, g.place.lng]);
      const near = clusters.find((c) => c.pt.distanceTo(pt) < 44);
      if (near) near.items.push(g); else clusters.push({ pt, items: [g] });
    }
    for (const c of clusters) {
      const total = c.items.reduce((s, g) => s + g.count, 0);
      const single = c.items.length === 1 ? c.items[0]! : null;
      const lat = c.items.reduce((s, g) => s + g.place.lat, 0) / c.items.length;
      const lng = c.items.reduce((s, g) => s + g.place.lng, 0) / c.items.length;
      const sel = c.items.some((g) => g.place.key === selectedKey);
      const icon = L.divIcon({
        className: "",
        html: `<button type="button" class="map-pin${single ? "" : " map-pin-cluster"}${sel ? " is-selected" : ""}" aria-label="${single ? `${single.place.name}: ${total} event${total === 1 ? "" : "s"}` : `${total} events in ${c.items.length} venues — zoom in`}"><span>${total}</span></button>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      L.marker([lat, lng], { icon, keyboard: true, zIndexOffset: sel ? 1000 : 0 })
        .on("click", () => {
          if (single) cb.current.onSelect(single.place.key);
          else { prog.current = true; m.flyTo([lat, lng], Math.min(19, m.getZoom() + 2), { duration: 0.4 }); }
        })
        .addTo(lg);
    }
  };

  useEffect(() => { draw.current(); }, [groups, selectedKey]);

  useEffect(() => {
    if (focus && map.current) { prog.current = true; map.current.flyTo([focus.lat, focus.lng], focus.zoom ?? Math.max(17, map.current.getZoom()), { duration: 0.45 }); }
  }, [focus]);

  useEffect(() => {
    const lg = meLayer.current;
    if (!lg) return;
    lg.clearLayers();
    if (me) L.circleMarker([me.lat, me.lng], { radius: 8, className: "map-me" }).addTo(lg);
  }, [me]);

  return <div ref={el} className="size-full" role="application" aria-label="Map of UNC events" />;
}
