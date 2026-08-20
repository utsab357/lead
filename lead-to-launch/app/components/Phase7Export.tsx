"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PhaseShell } from "./PhaseShell";
import { Download, FileSpreadsheet } from "lucide-react";
import type { RankedLead } from "@/lib/types";
import { toast } from "sonner";

export function Phase7Export({
  ranked,
  onPrev,
}: {
  ranked: RankedLead[];
  onPrev?: () => void;
}) {


  function downloadCSV() {
    if (ranked.length === 0) {
      toast.error("No ranked leads to export");
      return;
    }

    const headers = [
      "Rank", "Name", "Category", "Address", "City", "Phone", "WhatsApp",
      "Website", "Maps Link", "Rating", "Reviews", "Score", "Has Website",
    ];

    const rows = ranked.map((lead, i) => [
      String(i + 1),
      lead.name,
      lead.category,
      lead.address,
      lead.city,
      lead.phone || "",
      lead.whatsapp || lead.phone || "",
      lead.website || "",
      lead.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + " " + lead.city)}`,
      String(lead.rating || ""),
      String(lead.reviewsCount || ""),
      String(lead.score),
      lead.website ? "Yes" : "No",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${ranked.length} leads to CSV`);
  }

  function downloadJSON() {
    if (ranked.length === 0) {
      toast.error("No ranked leads to export");
      return;
    }
    const blob = new Blob([JSON.stringify(ranked, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${ranked.length} leads as JSON`);
  }

  return (
    <PhaseShell
      title="Phase 7 — Export"
      subtitle="Download your ranked leads as CSV or JSON. Use the History button in the header to reload past scrapes."
      onPrev={onPrev}
      nextDisabled={true}
      nextLabel="Done"
    >
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Export Leads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            <Stat label="Total Leads" value={ranked.length} />
            <Stat label="With Phone" value={ranked.filter((l) => l.phone).length} />
            <Stat label="No Website" value={ranked.filter((l) => !l.website).length} />
          </div>
          <div className="flex gap-3">
            <Button onClick={downloadCSV} disabled={ranked.length === 0} className="h-10 transition-transform active:scale-[0.98]">
              <Download className="h-4 w-4 mr-2" /> Download CSV
            </Button>
            <Button onClick={downloadJSON} variant="outline" disabled={ranked.length === 0} className="h-10">
              <Download className="h-4 w-4 mr-2" /> Download JSON
            </Button>
          </div>
          {ranked.length === 0 && (
            <p className="text-sm text-muted-foreground mt-3">Complete Phase 3 (Rank) first to export leads.</p>
          )}
        </CardContent>
      </Card>

    </PhaseShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
      <div className="font-display text-2xl tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
