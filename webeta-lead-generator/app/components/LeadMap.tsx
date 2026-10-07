"use client";

import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Lead } from "@/lib/types";

export default function LeadMap({ leads }: { leads: Lead[] }) {
  const validLeads = leads.filter(
    (l) => typeof l.lat === "number" && typeof l.lng === "number" && !isNaN(l.lat) && !isNaN(l.lng) && (l.lat !== 0 || l.lng !== 0)
  );

  if (validLeads.length === 0) {
    return (
      <div className="min-h-[240px] rounded-lg border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground">
        {leads.length === 0 ? "Map appears once leads are scraped" : "Geographic coordinates not available for these leads"}
      </div>
    );
  }

  const center: [number, number] = [
    validLeads.reduce((s, l) => s + l.lat, 0) / validLeads.length,
    validLeads.reduce((s, l) => s + l.lng, 0) / validLeads.length,
  ];

  return (
    <div className="isolate relative z-0 h-full min-h-[240px] rounded-lg overflow-hidden border border-border">
      <MapContainer
        key={`${center[0].toFixed(3)}_${center[1].toFixed(3)}`}
        center={center}
        zoom={14}
        className="h-full w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {validLeads.map((l) => (
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
