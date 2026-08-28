"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PhaseShell } from "./PhaseShell";
import {
  Download, FileSpreadsheet, MessageCircle, Globe2, Target,
  ChevronDown, ChevronUp, Copy, ExternalLink, StickyNote,
  Phone, PhoneOff, ThumbsUp, Presentation, Calendar, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import type { RankedLead, ConversionPoints, OutreachResult, BuildPromptResult, LeadStatus } from "@/lib/types";
import { toast } from "sonner";
import { LeadHistoryDrawer } from "./LeadHistoryDrawer";
import type { LeadHistoryEntry } from "./LeadHistoryDrawer";

// ─── Status config ──────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string; icon: typeof Phone }> = {
  new:             { label: "New",           color: "text-blue-600",   bg: "bg-blue-50 border-blue-200",    icon: AlertCircle },
  called:          { label: "Called",        color: "text-amber-600",  bg: "bg-amber-50 border-amber-200",  icon: Phone },
  interested:      { label: "Interested",    color: "text-emerald-600",bg: "bg-emerald-50 border-emerald-200", icon: ThumbsUp },
  demo_sent:       { label: "Demo Sent",     color: "text-purple-600", bg: "bg-purple-50 border-purple-200",icon: Presentation },
  meeting_set:     { label: "Meeting Set",   color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200",icon: Calendar },
  closed:          { label: "Closed ✓",      color: "text-green-700",  bg: "bg-green-50 border-green-200",  icon: CheckCircle2 },
  not_interested:  { label: "Not Interested",color: "text-red-600",    bg: "bg-red-50 border-red-200",      icon: XCircle },
  no_response:     { label: "No Response",   color: "text-gray-500",   bg: "bg-gray-50 border-gray-200",    icon: PhoneOff },
};

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as LeadStatus[];

// ─── Props ───────────────────────────────────────────────────────────────────
export function Phase7Export({
  ranked,
  conversions = {},
  outreachResults = {},
  buildPrompts = {},
  leadStatuses = {},
  leadNotes = {},
  setLeadStatuses,
  setLeadNotes,
  onGoToPhase,
  onPrev,
  sessionId,
}: {
  ranked: RankedLead[];
  conversions?: Record<string, ConversionPoints>;
  outreachResults?: Record<string, OutreachResult>;
  buildPrompts?: Record<string, BuildPromptResult>;
  leadStatuses?: Record<string, LeadStatus>;
  leadNotes?: Record<string, string>;
  setLeadStatuses?: (s: Record<string, LeadStatus>) => void;
  setLeadNotes?: (n: Record<string, string>) => void;
  onGoToPhase?: (phase: number, leadId: string) => void;
  onPrev?: () => void;
  sessionId?: string | null;
}) {
  const [tab, setTab] = useState<"pipeline" | "export">("pipeline");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Set<LeadStatus>>(new Set());
  // Lead quality filters
  const [fNoSite,  setFNoSite]  = useState(false);
  const [fPhone,   setFPhone]   = useState(false);
  const [fRating,  setFRating]  = useState<"" | "3.5" | "4.0" | "4.5">("" );
  const [fReviews, setFReviews] = useState<"" | "10" | "50" | "100">("" );

  // Cross-session duplicate index
  const [phoneIndex, setPhoneIndex] = useState<Map<string, { niche: string; city: string; timestamp: string; status?: string; notes?: string }>>(new Map());
  const [historyEntry, setHistoryEntry] = useState<LeadHistoryEntry | null>(null);

  useEffect(() => {
    const excl = sessionId ? `?exclude=${sessionId}` : "";
    fetch(`/api/sessions/phone-index${excl}`)
      .then(r => r.json())
      .then(({ index = [] }) => {
        const map = new Map<string, { niche: string; city: string; timestamp: string; status?: string; notes?: string }>();
        for (const e of index) {
          if (e.phone) map.set(e.phone, { niche: e.niche, city: e.city, timestamp: e.timestamp, status: e.status, notes: e.notes });
        }
        setPhoneIndex(map);
      })
      .catch(() => {});
  }, [sessionId]);

  function normPhone(raw: string): string {
    const d = raw.replace(/\D/g, "");
    let n = d;
    if (n.startsWith("910") && n.length === 12) n = n.slice(3);
    else if (n.startsWith("91") && n.length === 12) n = n.slice(2);
    else if (n.startsWith("0") && n.length === 11) n = n.slice(1);
    return n.length === 10 ? n : "";
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  function setStatus(leadId: string, status: LeadStatus) {
    const next = { ...leadStatuses, [leadId]: status };
    setLeadStatuses?.(next);
  }

  function setNote(leadId: string, note: string) {
    const next = { ...leadNotes, [leadId]: note };
    setLeadNotes?.(next);
  }

  function copy(text: string, label = "Copied") {
    navigator.clipboard.writeText(text);
    toast.success(label);
  }

  function today() { return new Date().toISOString().split("T")[0]; }

  function toggleStatusFilter(s: LeadStatus) {
    setStatusFilter(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  // Leads visible in pipeline after status filter + quality filters
  const filteredRanked = ranked.filter(l => {
    if (statusFilter.size > 0 && !statusFilter.has(leadStatuses[l.id] ?? "new")) return false;
    if (fNoSite  && l.website)                               return false;
    if (fPhone   && !l.phone)                                return false;
    if (fRating  && (l.rating        ?? 0) < parseFloat(fRating))  return false;
    if (fReviews && (l.reviewsCount  ?? 0) < parseInt(fReviews))   return false;
    return true;
  });
  const anyQualityFilter = fNoSite || fPhone || !!fRating || !!fReviews;

  function trigger(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Export functions ───────────────────────────────────────────────────────
  function downloadCSV() {
    const exportList = statusFilter.size > 0
      ? ranked.filter(l => statusFilter.has(leadStatuses[l.id] ?? "new"))
      : ranked;
    if (!exportList.length) { toast.error("No leads to export"); return; }
    const headers = [
      "Rank","Name","Category","Address","City","Phone","WhatsApp","Website",
      "Maps Link","Rating","Reviews","Score","Has Website","Status","Notes",
      "Biggest Gap","Est. Lost ₹/mo","Conv. Points","Outreach Drafted","Site Prompt Ready",
    ];
    const rows = exportList.map((lead, i) => {
      const conv = conversions[lead.id];
      const status = leadStatuses[lead.id] ?? "new";
      return [
        String(i + 1), lead.name, lead.category, lead.address, lead.city,
        lead.phone || "", lead.whatsapp || lead.phone || "", lead.website || "",
        lead.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name+" "+lead.city)}`,
        String(lead.rating || ""), String(lead.reviewsCount || ""), String(lead.score),
        lead.website ? "Yes" : "No",
        STATUS_CONFIG[status]?.label ?? status,
        leadNotes[lead.id] || "",
        lead.audit?.biggestGap || "", lead.audit?.estLostRevenuePerMonth || "",
        conv ? conv.points.join("; ") : "",
        outreachResults[lead.id] ? "Yes" : "No",
        buildPrompts[lead.id] ? "Yes" : "No",
      ];
    });
    const csv = [headers, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(","))
      .join("\n");
    trigger(csv, `leads-${today()}.csv`, "text/csv;charset=utf-8;");
    toast.success(`Exported ${exportList.length} leads to CSV`);
  }

  function downloadFullJSON() {
    if (!ranked.length) { toast.error("No leads to export"); return; }
    const data = {
      exportedAt: new Date().toISOString(),
      totalLeads: ranked.length,
      leads: ranked.map(lead => ({
        ...lead,
        status: leadStatuses[lead.id] ?? "new",
        notes: leadNotes[lead.id] ?? "",
        conversionPoints: conversions[lead.id] ?? null,
        outreach: outreachResults[lead.id] ?? null,
        buildPrompt: buildPrompts[lead.id] ?? null,
      })),
    };
    trigger(JSON.stringify(data, null, 2), `leads-full-${today()}.json`, "application/json");
    toast.success(`Exported ${ranked.length} leads with all data`);
  }

  function downloadOutreachTXT() {
    const entries = Object.entries(outreachResults);
    if (!entries.length) { toast.error("No outreach drafts to export"); return; }
    const lines: string[] = [];
    for (const [id, r] of entries) {
      const lead = ranked.find(l => l.id === id);
      lines.push("========================================", `Business: ${lead?.name ?? id}`,
        `Phone: ${lead?.phone ?? "n/a"} | WhatsApp: ${lead?.whatsapp ?? "n/a"}`,
        "----------------------------------------", "FIRST MESSAGE:", r.first, "",
        "DAY-3 FOLLOW-UP:", r.followUp, `Best send time: ${r.bestSendTime}`, "");
    }
    trigger(lines.join("\n"), `outreach-${today()}.txt`, "text/plain;charset=utf-8;");
    toast.success(`Exported ${entries.length} outreach drafts`);
  }

  function downloadPromptsTXT() {
    const entries = Object.entries(buildPrompts);
    if (!entries.length) { toast.error("No site prompts to export"); return; }
    const lines: string[] = [];
    for (const [id, r] of entries) {
      const lead = ranked.find(l => l.id === id);
      lines.push("========================================", `Business: ${lead?.name ?? id}`,
        `Category: ${lead?.category ?? "n/a"} | City: ${lead?.city ?? "n/a"}`,
        "----------------------------------------", r.prompt, "");
    }
    trigger(lines.join("\n"), `site-prompts-${today()}.txt`, "text/plain;charset=utf-8;");
    toast.success(`Exported ${entries.length} site prompts`);
  }

  const convCount     = Object.keys(conversions).length;
  const outreachCount = Object.keys(outreachResults).length;
  const buildCount    = Object.keys(buildPrompts).length;

  // ── status summary counts ──────────────────────────────────────────────────
  const closedCount    = ranked.filter(l => leadStatuses[l.id] === "closed").length;
  const interestedCount= ranked.filter(l => leadStatuses[l.id] === "interested").length;
  const calledCount    = ranked.filter(l => leadStatuses[l.id] === "called" || leadStatuses[l.id] === "demo_sent" || leadStatuses[l.id] === "meeting_set").length;

  return (
    <>
    <PhaseShell
      title="Phase 7 — Pipeline & Export"
      subtitle="Track lead status, view all phase data, and download your full campaign."
      onPrev={onPrev}
      nextDisabled
      nextLabel="Done"
    >
      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 bg-muted/40 rounded-lg p-1 w-fit">
        {(["pipeline", "export"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              tab === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "pipeline" ? "📋 Pipeline View" : "📥 Export"}
          </button>
        ))}
      </div>

      {/* ── PIPELINE TAB ─────────────────────────────────────────────────────── */}
      {tab === "pipeline" && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Stat label="Total Leads"  value={ranked.length} />
            <Stat label="Called / Demo" value={calledCount} />
            <Stat label="Interested"   value={interestedCount} />
            <Stat label="Closed"       value={closedCount} accent />
          </div>

          {ranked.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No ranked leads yet — complete Phases 1–3 first.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Status filter bar */}
              <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-muted/40 border border-border items-center">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mr-1">Status:</span>
                {ALL_STATUSES.map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const active = statusFilter.has(s);
                  const count = ranked.filter(l => (leadStatuses[l.id] ?? "new") === s).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={s}
                      id={`pipeline-filter-${s}`}
                      onClick={() => toggleStatusFilter(s)}
                      className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                        active ? `${cfg.bg} ${cfg.color} ring-1 ring-current/30` : "bg-background border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {cfg.label} <span className="tabular-nums opacity-70">({count})</span>
                    </button>
                  );
                })}
                {statusFilter.size > 0 && (
                  <button
                    onClick={() => setStatusFilter(new Set())}
                    className="text-[11px] text-muted-foreground underline hover:text-foreground ml-auto"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Lead quality filter bar */}
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mr-1">Lead:</span>

                <button
                  id="p7-filter-nosite"
                  onClick={() => setFNoSite(v => !v)}
                  className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                    fNoSite ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-background border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  No website
                </button>

                <button
                  id="p7-filter-phone"
                  onClick={() => setFPhone(v => !v)}
                  className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                    fPhone ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  Has phone
                </button>

                <select
                  id="p7-filter-rating"
                  value={fRating}
                  onChange={e => setFRating(e.target.value as typeof fRating)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-background text-muted-foreground hover:border-primary/40 focus:outline-none cursor-pointer"
                >
                  <option value="">Any rating</option>
                  <option value="3.5">★ 3.5+</option>
                  <option value="4.0">★ 4.0+</option>
                  <option value="4.5">★ 4.5+</option>
                </select>

                <select
                  id="p7-filter-reviews"
                  value={fReviews}
                  onChange={e => setFReviews(e.target.value as typeof fReviews)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-background text-muted-foreground hover:border-primary/40 focus:outline-none cursor-pointer"
                >
                  <option value="">Any reviews</option>
                  <option value="10">10+ reviews</option>
                  <option value="50">50+ reviews</option>
                  <option value="100">100+ reviews</option>
                </select>

                {anyQualityFilter && (
                  <button
                    onClick={() => { setFNoSite(false); setFPhone(false); setFRating(""); setFReviews(""); }}
                    className="text-[11px] text-muted-foreground underline hover:text-foreground ml-auto"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Lead count after filter */}
              {statusFilter.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  Showing {filteredRanked.length} of {ranked.length} leads
                </p>
              )}

              <div className="space-y-2">
              {filteredRanked.map((lead, i) => {
                const status: LeadStatus = leadStatuses[lead.id] ?? "new";
                const cfg = STATUS_CONFIG[status];
                const StatusIcon = cfg.icon;
                const isOpen = expanded === lead.id;
                const conv = conversions[lead.id];
                const outreach = outreachResults[lead.id];
                const buildPrompt = buildPrompts[lead.id];
                const note = leadNotes[lead.id] ?? "";

                return (
                  <div key={lead.id} className={`rounded-xl border transition-all duration-200 ${isOpen ? "border-primary/30 shadow-sm" : "border-border"}`}>
                    {/* ── Row header ── */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Rank */}
                      <span className="text-xs tabular-nums text-muted-foreground w-6 shrink-0">#{i+1}</span>

                      {/* Status badge — visible before expanding */}
                      <div className="shrink-0">
                        <select
                          value={status}
                          onChange={e => setStatus(lead.id, e.target.value as LeadStatus)}
                          onClick={e => e.stopPropagation()}
                          className={`text-[10px] font-semibold border rounded-full px-2.5 py-1 cursor-pointer appearance-none ${cfg.color} ${cfg.bg} focus:outline-none`}
                          title="Pipeline status"
                        >
                          {ALL_STATUSES.map(s => (
                            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0" onClick={() => setExpanded(isOpen ? null : lead.id)}>
                        <div className="font-medium text-sm truncate cursor-pointer flex items-center gap-1.5 flex-wrap">
                          {lead.name}
                          {(() => {
                            const np = normPhone(lead.phone ?? lead.whatsapp ?? "");
                            const prev = np ? phoneIndex.get(np) : undefined;
                            if (!prev) return null;
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHistoryEntry({
                                    leadName: lead.name,
                                    niche: prev.niche,
                                    city: prev.city,
                                    timestamp: prev.timestamp,
                                    status: prev.status,
                                    notes: prev.notes,
                                  });
                                }}
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20 transition-colors cursor-pointer shrink-0"
                              >
                                Seen before{prev.status ? ` · ${prev.status}` : ""}
                              </button>
                            );
                          })()}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {lead.category} · {lead.city}
                          {lead.rating ? ` · ★${lead.rating} (${lead.reviewsCount})` : ""}
                        </div>
                      </div>

                      {/* Phase data indicators */}
                      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                        {conv     && <span title="Conversion points" className="h-5 w-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-[9px] font-bold">P4</span>}
                        {outreach && <span title="Outreach drafted"  className="h-5 w-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-bold">P5</span>}
                        {buildPrompt && <span title="Site prompt ready" className="h-5 w-5 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-[9px] font-bold">P6</span>}
                      </div>

                      {/* Score */}
                      <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums hidden sm:flex">
                        Score {lead.score}
                      </Badge>

                      {/* Expand toggle */}
                      <button
                        onClick={() => setExpanded(isOpen ? null : lead.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        aria-label={isOpen ? "Collapse" : "Expand"}
                      >
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* ── Expanded accordion ── */}
                    {isOpen && (
                      <div className="border-t border-border px-4 pb-4 pt-4 space-y-4">

                        {/* Contact quick-actions */}
                        <div className="flex flex-wrap gap-2">
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 text-xs border border-border rounded-full px-3 py-1.5 hover:bg-muted/50 transition-colors">
                              <Phone className="h-3 w-3" /> {lead.phone}
                            </a>
                          )}
                          {(lead.whatsapp || lead.phone) && (
                            <a
                              href={`https://wa.me/${(lead.whatsapp ?? lead.phone ?? "").replace(/\D/g,"")}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 text-green-700 rounded-full px-3 py-1.5 hover:bg-green-100 transition-colors"
                            >
                              💬 WhatsApp
                            </a>
                          )}
                          {lead.mapUrl && (
                            <a href={lead.mapUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs border border-border rounded-full px-3 py-1.5 hover:bg-muted/50 transition-colors">
                              <ExternalLink className="h-3 w-3" /> Maps
                            </a>
                          )}
                        </div>

                        {/* Phase 4 — compact redirect card */}
                        {conv ? (
                          <div className="rounded-lg bg-orange-50/60 border border-orange-100 p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase tracking-widest text-orange-600 font-semibold mb-1.5">Phase 4 — Conversion Points</div>
                              <div className="text-xs text-gray-700 font-medium line-clamp-2">
                                {conv.points[0]}
                              </div>
                              {conv.urgencyHook && (
                                <div className="text-[11px] text-orange-700 mt-1.5 italic">⚡ {conv.urgencyHook}</div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs shrink-0 border-orange-200 text-orange-700 hover:bg-orange-50"
                              onClick={() => onGoToPhase?.(4, lead.id)}
                            >
                              Open P4 →
                            </Button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-orange-200 px-3 py-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">No conversion points yet.</span>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-orange-600" onClick={() => onGoToPhase?.(4, lead.id)}>
                              Generate in Phase 4 →
                            </Button>
                          </div>
                        )}

                        {/* Phase 5 — compact redirect */}
                        {outreach ? (
                          <div className="rounded-lg bg-blue-50/60 border border-blue-100 p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase tracking-widest text-blue-600 font-semibold mb-1">Phase 5 — Outreach</div>
                              <div className="text-xs text-gray-600 truncate">{outreach.bestSendTime}</div>
                            </div>
                            <Button size="sm" variant="outline" className="h-8 text-xs shrink-0 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => onGoToPhase?.(5, lead.id)}>
                              Open P5 →
                            </Button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-blue-200 px-3 py-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">No outreach draft yet.</span>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600" onClick={() => onGoToPhase?.(5, lead.id)}>
                              Generate in Phase 5 →
                            </Button>
                          </div>
                        )}

                        {/* Phase 6 — compact redirect */}
                        {buildPrompt ? (
                          <div className="rounded-lg bg-purple-50/60 border border-purple-100 p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase tracking-widest text-purple-600 font-semibold mb-1">Phase 6 — Site Prompt</div>
                              <div className="text-xs text-gray-600 truncate">{buildPrompt.prompt.slice(0, 60)}…</div>
                            </div>
                            <Button size="sm" variant="outline" className="h-8 text-xs shrink-0 border-purple-200 text-purple-700 hover:bg-purple-50" onClick={() => onGoToPhase?.(6, lead.id)}>
                              Open P6 →
                            </Button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-purple-200 px-3 py-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">No site prompt yet.</span>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-purple-600" onClick={() => onGoToPhase?.(6, lead.id)}>
                              Generate in Phase 6 →
                            </Button>
                          </div>
                        )}

                        {/* Notes */}
                        <div className="space-y-1.5">
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
                            <StickyNote className="h-3 w-3" /> Notes
                          </div>
                          <Textarea
                            value={note}
                            onChange={e => setNote(lead.id, e.target.value)}
                            placeholder="Write call notes, what they said, next steps…"
                            className="text-xs min-h-[70px] resize-none font-mono"
                          />
                          <p className="text-[10px] text-muted-foreground">Notes auto-save to session history.</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          )}
        </>
      )}

      {/* ── EXPORT TAB ───────────────────────────────────────────────────────── */}
      {tab === "export" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            <Stat label="Total Leads"  value={ranked.length} />
            <Stat label="With Phone"   value={ranked.filter(l => l.phone).length} />
            <Stat label="Conv. Points" value={convCount} />
            <Stat label="Outreach"     value={outreachCount} />
            <Stat label="Site Prompts" value={buildCount} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSpreadsheet className="h-4 w-4 text-primary" /> Lead Data
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  All leads with status, notes, scores, contact info, and all phase data.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={downloadCSV} disabled={!ranked.length} className="h-9">
                    <Download className="h-4 w-4 mr-2" /> CSV
                  </Button>
                  <Button onClick={downloadFullJSON} variant="outline" disabled={!ranked.length} className="h-9">
                    <Download className="h-4 w-4 mr-2" /> Full JSON
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-primary" /> Conversion Points
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  {convCount > 0 ? `${convCount} set${convCount !== 1 ? "s" : ""} — pitch points, revenue argument & urgency.` : "Generate in Phase 4 first."}
                </p>
                <Button disabled={!convCount} className="h-9" onClick={() => {
                  const lines: string[] = [];
                  for (const [id, c] of Object.entries(conversions)) {
                    const lead = ranked.find(l => l.id === id);
                    lines.push("========================================", `Business: ${lead?.name ?? id}`, "----------------------------------------");
                    c.points.forEach((p, i) => lines.push(`  ${i+1}. ${p}`));
                    lines.push(`\nRevenue: ${c.revenueArgument}\nUrgency: ${c.urgencyHook}`, "");
                  }
                  trigger(lines.join("\n"), `conversion-points-${today()}.txt`, "text/plain;charset=utf-8;");
                  toast.success(`Exported ${Object.keys(conversions).length} conversion sets`);
                }}>
                  <Download className="h-4 w-4 mr-2" /> Download ({convCount}) TXT
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageCircle className="h-4 w-4 text-primary" /> Outreach Drafts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  {outreachCount > 0 ? `${outreachCount} draft${outreachCount !== 1 ? "s" : ""} — first messages + day-3 follow-ups.` : "Generate in Phase 5 first."}
                </p>
                <Button onClick={downloadOutreachTXT} disabled={!outreachCount} className="h-9">
                  <Download className="h-4 w-4 mr-2" /> Download ({outreachCount}) TXT
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe2 className="h-4 w-4 text-primary" /> Website Prompts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  {buildCount > 0 ? `${buildCount} prompt${buildCount !== 1 ? "s" : ""} — paste into Google Stitch, Lovable, or Bolt.` : "Generate in Phase 6 first."}
                </p>
                <Button onClick={downloadPromptsTXT} disabled={!buildCount} className="h-9">
                  <Download className="h-4 w-4 mr-2" /> Download ({buildCount}) TXT
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </PhaseShell>

    <LeadHistoryDrawer
      entry={historyEntry}
      onClose={() => setHistoryEntry(null)}
    />
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2.5 ${accent && value > 0 ? "border-emerald-300 bg-emerald-50" : "border-border"}`}>
      <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl tabular-nums mt-0.5 ${accent && value > 0 ? "text-emerald-700" : ""}`}>{value}</div>
    </div>
  );
}
