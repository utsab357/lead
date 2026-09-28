"use client";

import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Lead } from "@/lib/types";

export default function LeadMap({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) {
    return <div className="min-h-[240px] rounded-lg border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground">Map appears once leads are scraped</div>;
  }
  const center: [number, number] = [
    leads.reduce((s, l) => s + l.lat, 0) / leads.length,
    leads.reduce((s, l) => s + l.lng, 0) / leads.length,
  ];
  return (
    <div className="isolate relative z-0 h-full min-h-[240px] rounded-lg overflow-hidden border border-border">
      <MapContainer center={center} zoom={14} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {leads.map((l) => (
          <CircleMarker
            key={l.id}
            center={[l.lat, l.lng]}
            radius={7}
            pathOptions={{ color: "#1d4ed8", fillColor: "#3b82f6", fillOpacity: 0.85, weight: 2 }}
          >
            <Tooltip>{l.name}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
