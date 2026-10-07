"use client";

import { useEffect } from "react";
import { X, Clock, MapPin, Tag, StickyNote, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  new:            { bg: "bg-blue-50",    text: "text-blue-600",   label: "New" },
  called:         { bg: "bg-amber-50",   text: "text-amber-600",  label: "Called" },
  interested:     { bg: "bg-emerald-50", text: "text-emerald-600",label: "Interested" },
  demo_sent:      { bg: "bg-purple-50",  text: "text-purple-600", label: "Demo Sent" },
  meeting_set:    { bg: "bg-indigo-50",  text: "text-indigo-600", label: "Meeting Set" },
  closed:         { bg: "bg-green-50",   text: "text-green-700",  label: "Closed ✓" },
  completed:      { bg: "bg-green-50",   text: "text-green-700",  label: "Completed ✓" },
  not_interested: { bg: "bg-red-50",     text: "text-red-600",    label: "Not Interested" },
  no_response:    { bg: "bg-gray-50",    text: "text-gray-500",   label: "No Response" },
};

export type LeadHistoryEntry = {
  leadName: string;
  niche: string;
  city: string;
  timestamp: string;
  status?: string;
  notes?: string;
};

export function LeadHistoryDrawer({
  entry,
  onClose,
}: {
  entry: LeadHistoryEntry | null;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    if (!entry) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, onClose]);

  if (!entry) return null;

  const statusCfg = entry.status ? (STATUS_COLORS[entry.status] ?? STATUS_COLORS.new) : null;
  const date = new Date(entry.timestamp).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[340px] max-w-[95vw] bg-background border-l border-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">
              Previous contact history
            </p>
            <h2 className="font-semibold text-base leading-tight">{entry.leadName}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Status */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
              <PhoneCall className="h-3 w-3" /> Status
            </p>
            {statusCfg ? (
              <span className={`inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
                {statusCfg.label}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">No status recorded</span>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
              <StickyNote className="h-3 w-3" /> Notes
            </p>
            {entry.notes ? (
              <div className="text-sm bg-muted/40 border border-border rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
                {entry.notes}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No notes written</p>
            )}
          </div>

          {/* Session info */}
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Session info
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Tag className="h-3.5 w-3.5 shrink-0" />
                <span className="capitalize">{entry.niche}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span>{entry.city}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{date}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <Button variant="outline" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
