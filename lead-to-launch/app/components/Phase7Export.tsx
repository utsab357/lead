"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhaseShell } from "./PhaseShell";
import { Download, FileSpreadsheet, MessageCircle, Globe2 } from "lucide-react";
import type { RankedLead, OutreachResult, BuildPromptResult } from "@/lib/types";
import { toast } from "sonner";

export function Phase7Export({
  ranked,
  outreachResults = {},
  buildPrompts = {},
  onPrev,
}: {
  ranked: RankedLead[];
  outreachResults?: Record<string, OutreachResult>;
  buildPrompts?: Record<string, BuildPromptResult>;
  onPrev?: () => void;
}) {

  function downloadCSV() {
    if (ranked.length === 0) { toast.error("No ranked leads to export"); return; }

    const headers = [
      "Rank", "Name", "Category", "Address", "City", "Phone", "WhatsApp",
      "Website", "Maps Link", "Rating", "Reviews", "Score", "Has Website",
      "Outreach Drafted", "Site Prompt Ready",
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
      outreachResults[lead.id] ? "Yes" : "No",
      buildPrompts[lead.id] ? "Yes" : "No",
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

  function downloadFullJSON() {
    if (ranked.length === 0) { toast.error("No ranked leads to export"); return; }
    const data = {
      exportedAt: new Date().toISOString(),
      totalLeads: ranked.length,
      outreachDrafted: Object.keys(outreachResults).length,
      sitePromptsGenerated: Object.keys(buildPrompts).length,
      leads: ranked.map((lead) => ({
        ...lead,
        outreach: outreachResults[lead.id] ?? null,
        buildPrompt: buildPrompts[lead.id] ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-full-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${ranked.length} leads with all data as JSON`);
  }

  function downloadOutreachTXT() {
    const entries = Object.entries(outreachResults);
    if (entries.length === 0) { toast.error("No outreach drafts to export"); return; }
    const lines: string[] = [];
    for (const [leadId, result] of entries) {
      const lead = ranked.find((l) => l.id === leadId);
      lines.push(`========================================`);
      lines.push(`Business: ${lead?.name ?? leadId}`);
      lines.push(`Phone: ${lead?.phone ?? "n/a"} | WhatsApp: ${lead?.whatsapp ?? "n/a"}`);
      lines.push(`----------------------------------------`);
      lines.push(`FIRST MESSAGE:`);
      lines.push(result.first);
      lines.push(``);
      lines.push(`DAY-3 FOLLOW-UP:`);
      lines.push(result.followUp);
      lines.push(`Best send time: ${result.bestSendTime}`);
      lines.push(``);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outreach-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${entries.length} outreach drafts`);
  }

  function downloadPromptsTXT() {
    const entries = Object.entries(buildPrompts);
    if (entries.length === 0) { toast.error("No build prompts to export"); return; }
    const lines: string[] = [];
    for (const [leadId, result] of entries) {
      const lead = ranked.find((l) => l.id === leadId);
      lines.push(`========================================`);
      lines.push(`Business: ${lead?.name ?? leadId}`);
      lines.push(`Category: ${lead?.category ?? "n/a"} | City: ${lead?.city ?? "n/a"}`);
      lines.push(`----------------------------------------`);
      lines.push(result.prompt);
      lines.push(``);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `site-prompts-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${entries.length} website prompts`);
  }

  const outreachCount = Object.keys(outreachResults).length;
  const buildCount = Object.keys(buildPrompts).length;

  return (
    <PhaseShell
      title="Phase 7 â€” Export"
      subtitle="Download everything â€” leads, outreach drafts, and website prompts â€” in one click."
      onPrev={onPrev}
      nextDisabled={true}
      nextLabel="Done"
    >
      {/* Stats */}
      <div className="grid sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Total Leads" value={ranked.length} />
        <Stat label="With Phone" value={ranked.filter((l) => l.phone).length} />
        <Stat label="Outreach Drafted" value={outreachCount} />
        <Stat label="Site Prompts" value={buildCount} />
      </div>

      {/* Export options */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-primary" /> Lead Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">All ranked leads with scores, contact info, and status flags.</p>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={downloadCSV} disabled={ranked.length === 0} className="h-9">
                <Download className="h-4 w-4 mr-2" /> CSV
              </Button>
              <Button onClick={downloadFullJSON} variant="outline" disabled={ranked.length === 0} className="h-9">
                <Download className="h-4 w-4 mr-2" /> Full JSON
              </Button>
            </div>
            {ranked.length === 0 && <p className="text-xs text-muted-foreground">Complete Phase 3 first.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4 text-primary" /> Outreach Drafts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              {outreachCount > 0
                ? `${outreachCount} outreach draft${outreachCount !== 1 ? "s" : ""} â€” first messages + day-3 follow-ups.`
                : "Generate outreach in Phase 5 first."}
            </p>
            <Button onClick={downloadOutreachTXT} disabled={outreachCount === 0} className="h-9">
              <Download className="h-4 w-4 mr-2" /> Download ({outreachCount}) TXT
            </Button>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="h-4 w-4 text-primary" /> Website Prompts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">
              {buildCount > 0
                ? `${buildCount} ready-to-paste site prompt${buildCount !== 1 ? "s" : ""} â€” paste into Lovable, Bolt, Claude Code, or Codex.`
                : "Generate site prompts in Phase 6 first."}
            </p>
            <Button onClick={downloadPromptsTXT} disabled={buildCount === 0} className="h-9">
              <Download className="h-4 w-4 mr-2" /> Download ({buildCount}) TXT
            </Button>
          </CardContent>
        </Card>
      </div>
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
