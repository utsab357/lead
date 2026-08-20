"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhaseShell } from "./PhaseShell";
import { Download, FileSpreadsheet, MessageCircle, Globe2, Target } from "lucide-react";
import type { RankedLead, ConversionPoints, OutreachResult, BuildPromptResult } from "@/lib/types";
import { toast } from "sonner";

export function Phase7Export({
  ranked,
  conversions = {},
  outreachResults = {},
  buildPrompts = {},
  onPrev,
}: {
  ranked: RankedLead[];
  conversions?: Record<string, ConversionPoints>;
  outreachResults?: Record<string, OutreachResult>;
  buildPrompts?: Record<string, BuildPromptResult>;
  onPrev?: () => void;
}) {

  // ── CSV ──────────────────────────────────────────────────────────────
  function downloadCSV() {
    if (ranked.length === 0) { toast.error("No ranked leads to export"); return; }

    const headers = [
      "Rank", "Name", "Category", "Address", "City", "Phone", "WhatsApp",
      "Website", "Maps Link", "Rating", "Reviews", "Score", "Has Website",
      "Biggest Gap", "Est. Lost ₹/mo",
      "Conversion Points", "Revenue Argument",
      "Outreach Drafted", "Site Prompt Ready",
    ];

    const rows = ranked.map((lead, i) => {
      const conv = conversions[lead.id];
      return [
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
        lead.audit?.biggestGap || "",
        lead.audit?.estLostRevenuePerMonth || "",
        conv ? conv.points.join("; ") : "",
        conv?.revenueArgument || "",
        outreachResults[lead.id] ? "Yes" : "No",
        buildPrompts[lead.id] ? "Yes" : "No",
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    trigger(csv, `leads-${today()}.csv`, "text/csv;charset=utf-8;");
    toast.success(`Exported ${ranked.length} leads to CSV`);
  }

  // ── Full JSON ────────────────────────────────────────────────────────
  function downloadFullJSON() {
    if (ranked.length === 0) { toast.error("No ranked leads to export"); return; }
    const data = {
      exportedAt: new Date().toISOString(),
      totalLeads: ranked.length,
      conversionPointsGenerated: Object.keys(conversions).length,
      outreachDrafted: Object.keys(outreachResults).length,
      sitePromptsGenerated: Object.keys(buildPrompts).length,
      leads: ranked.map((lead) => ({
        ...lead,
        conversionPoints: conversions[lead.id] ?? null,
        outreach: outreachResults[lead.id] ?? null,
        buildPrompt: buildPrompts[lead.id] ?? null,
      })),
    };
    trigger(JSON.stringify(data, null, 2), `leads-full-${today()}.json`, "application/json");
    toast.success(`Exported ${ranked.length} leads with all data`);
  }

  // ── Conversions TXT ──────────────────────────────────────────────────
  function downloadConversionsTXT() {
    const entries = Object.entries(conversions);
    if (entries.length === 0) { toast.error("No conversion points to export"); return; }
    const lines: string[] = [];
    for (const [leadId, conv] of entries) {
      const lead = ranked.find((l) => l.id === leadId);
      lines.push("========================================");
      lines.push(`Business: ${lead?.name ?? leadId}`);
      lines.push(`Category: ${lead?.category ?? "n/a"} | City: ${lead?.city ?? "n/a"}`);
      lines.push("----------------------------------------");
      lines.push("CONVERSION POINTS:");
      conv.points.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
      lines.push(`\nCOMPETITOR INSIGHT:\n  ${conv.competitorInsight}`);
      lines.push(`\nREVENUE ARGUMENT:\n  ${conv.revenueArgument}`);
      lines.push(`\nURGENCY HOOK:\n  ${conv.urgencyHook}`);
      lines.push("");
    }
    trigger(lines.join("\n"), `conversion-points-${today()}.txt`, "text/plain;charset=utf-8;");
    toast.success(`Exported ${entries.length} conversion point sets`);
  }

  // ── Outreach TXT ─────────────────────────────────────────────────────
  function downloadOutreachTXT() {
    const entries = Object.entries(outreachResults);
    if (entries.length === 0) { toast.error("No outreach drafts to export"); return; }
    const lines: string[] = [];
    for (const [leadId, result] of entries) {
      const lead = ranked.find((l) => l.id === leadId);
      lines.push("========================================");
      lines.push(`Business: ${lead?.name ?? leadId}`);
      lines.push(`Phone: ${lead?.phone ?? "n/a"} | WhatsApp: ${lead?.whatsapp ?? "n/a"}`);
      lines.push("----------------------------------------");
      lines.push("FIRST MESSAGE:");
      lines.push(result.first);
      lines.push("");
      lines.push("DAY-3 FOLLOW-UP:");
      lines.push(result.followUp);
      lines.push(`Best send time: ${result.bestSendTime}`);
      lines.push("");
    }
    trigger(lines.join("\n"), `outreach-${today()}.txt`, "text/plain;charset=utf-8;");
    toast.success(`Exported ${entries.length} outreach drafts`);
  }

  // ── Site Prompts TXT ─────────────────────────────────────────────────
  function downloadPromptsTXT() {
    const entries = Object.entries(buildPrompts);
    if (entries.length === 0) { toast.error("No build prompts to export"); return; }
    const lines: string[] = [];
    for (const [leadId, result] of entries) {
      const lead = ranked.find((l) => l.id === leadId);
      lines.push("========================================");
      lines.push(`Business: ${lead?.name ?? leadId}`);
      lines.push(`Category: ${lead?.category ?? "n/a"} | City: ${lead?.city ?? "n/a"}`);
      lines.push("----------------------------------------");
      lines.push(result.prompt);
      if (result.pitchPoints?.length) {
        lines.push("\nPITCH POINTS:");
        result.pitchPoints.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
      }
      lines.push("");
    }
    trigger(lines.join("\n"), `site-prompts-${today()}.txt`, "text/plain;charset=utf-8;");
    toast.success(`Exported ${entries.length} website prompts`);
  }

  // ── helpers ───────────────────────────────────────────────────────────
  function trigger(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  function today() { return new Date().toISOString().split("T")[0]; }

  const convCount     = Object.keys(conversions).length;
  const outreachCount = Object.keys(outreachResults).length;
  const buildCount    = Object.keys(buildPrompts).length;

  return (
    <PhaseShell
      title="Phase 7 — Export"
      subtitle="Download everything — leads, conversion points, outreach drafts, and website prompts."
      onPrev={onPrev}
      nextDisabled={true}
      nextLabel="Done"
    >
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Stat label="Total Leads"    value={ranked.length} />
        <Stat label="With Phone"     value={ranked.filter((l) => l.phone).length} />
        <Stat label="Conv. Points"   value={convCount} />
        <Stat label="Outreach"       value={outreachCount} />
        <Stat label="Site Prompts"   value={buildCount} />
      </div>

      {/* Export cards */}
      <div className="grid sm:grid-cols-2 gap-4">

        {/* Lead data */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-primary" /> Lead Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              All leads with scores, contact info, biggest gap, conversion points summary, and phase completion flags.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={downloadCSV} disabled={ranked.length === 0} className="h-9">
                <Download className="h-4 w-4 mr-2" /> CSV
              </Button>
              <Button onClick={downloadFullJSON} variant="outline" disabled={ranked.length === 0} className="h-9">
                <Download className="h-4 w-4 mr-2" /> Full JSON
              </Button>
            </div>
            {ranked.length === 0 && <p className="text-xs text-muted-foreground mt-2">Complete Phase 3 first.</p>}
          </CardContent>
        </Card>

        {/* Conversion points */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" /> Conversion Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {convCount > 0
                ? `${convCount} set${convCount !== 1 ? "s" : ""} — pitch points, competitor insight, revenue argument & urgency hook.`
                : "Generate conversion points in Phase 4 first."}
            </p>
            <Button onClick={downloadConversionsTXT} disabled={convCount === 0} className="h-9">
              <Download className="h-4 w-4 mr-2" /> Download ({convCount}) TXT
            </Button>
          </CardContent>
        </Card>

        {/* Outreach */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4 text-primary" /> Outreach Drafts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {outreachCount > 0
                ? `${outreachCount} draft${outreachCount !== 1 ? "s" : ""} — first messages + day-3 follow-ups.`
                : "Generate outreach in Phase 5 first."}
            </p>
            <Button onClick={downloadOutreachTXT} disabled={outreachCount === 0} className="h-9">
              <Download className="h-4 w-4 mr-2" /> Download ({outreachCount}) TXT
            </Button>
          </CardContent>
        </Card>

        {/* Site prompts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="h-4 w-4 text-primary" /> Website Prompts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              {buildCount > 0
                ? `${buildCount} prompt${buildCount !== 1 ? "s" : ""} — paste into Google Stitch, Lovable, Bolt, or Claude Code.`
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
