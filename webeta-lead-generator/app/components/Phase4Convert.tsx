"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhaseShell } from "./PhaseShell";
import { Loader2, Target, TrendingUp, Zap, Shield, Clock, ChevronDown, ChevronUp, Phone, MessageSquare, AlertCircle, CheckCircle2, MapPin, Star, ExternalLink } from "lucide-react";
import type { RankedLead, ConversionPoints, AuditResult, LeadStatus } from "@/lib/types";
import { toast } from "sonner";

const BATCH_SIZE = 5;

// Status pill config — mirrors Phase 7 STATUS_CONFIG
const STATUS_PILL: Record<string, { label: string; color: string; bg: string }> = {
  new:            { label: "New",            color: "text-sky-700",     bg: "bg-sky-50 border-sky-200" },
  called:         { label: "Called",         color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  interested:     { label: "Interested",     color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  demo_sent:      { label: "Demo Sent",      color: "text-purple-700",  bg: "bg-purple-50 border-purple-200" },
  meeting_set:    { label: "Meeting Set",    color: "text-indigo-700",  bg: "bg-indigo-50 border-indigo-200" },
  completed:      { label: "Completed ✓",   color: "text-green-700",   bg: "bg-green-100 border-green-300" },
  not_interested: { label: "Not Interested", color: "text-red-700",     bg: "bg-red-50 border-red-200" },
  no_response:    { label: "No Response",    color: "text-slate-500",   bg: "bg-slate-50 border-slate-200" },
};
const ALL_LEAD_STATUSES = Object.keys(STATUS_PILL) as LeadStatus[];

export function Phase4Convert({
  ranked,
  conversions,
  setConversions,
  leadStatuses,
  setLeadStatuses,
  leadNotes,
  setLeadNotes,
  onNext,
  onPrev,
  initialExpandedId,
}: {
  ranked: RankedLead[];
  conversions: Record<string, ConversionPoints>;
  setConversions: (c: Record<string, ConversionPoints>) => void;
  leadStatuses?: Record<string, LeadStatus>;
  setLeadStatuses?: (s: Record<string, LeadStatus>) => void;
  leadNotes?: Record<string, string>;
  setLeadNotes?: (n: Record<string, string>) => void;
  onNext: () => void;
  onPrev?: () => void;
  initialExpandedId?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId ?? null);
  const [statusMsg, setStatusMsg] = useState("");
  const [showScriptId, setShowScriptId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  // Lead quality filters (same as Phase 7)
  const [fNoSite,  setFNoSite]  = useState(false);
  const [fPhone,   setFPhone]   = useState(false);
  const [fRating,  setFRating]  = useState<"" | "3.5" | "4.0" | "4.5">("");
  const [fReviews, setFReviews] = useState<"" | "10" | "50" | "100">("");
  const [fConvDone, setFConvDone] = useState(false);

  const hasActiveFilter = fNoSite || fPhone || fRating || fReviews || fConvDone || statusFilter !== "all" || !!searchQuery;

  function applyFilters(l: (typeof ranked)[number]) {
    const nameMatch   = !searchQuery || l.name.toLowerCase().includes(searchQuery.toLowerCase());
    const statusMatch = statusFilter === "all" || ((leadStatuses ?? {})[l.id] ?? "new") === statusFilter;
    const noSiteMatch = !fNoSite  || !l.website;
    const phoneMatch  = !fPhone   || !!(l.phone ?? l.whatsapp);
    const ratingMatch = !fRating  || (l.rating ?? 0) >= parseFloat(fRating);
    const reviewMatch = !fReviews || (l.reviewsCount ?? 0) >= parseInt(fReviews);
    const convMatch   = !fConvDone || !!conversions[l.id];
    return nameMatch && statusMatch && noSiteMatch && phoneMatch && ratingMatch && reviewMatch && convMatch;
  }

  function clearFilters() {
    setSearchQuery(""); setStatusFilter("all");
    setFNoSite(false); setFPhone(false); setFRating(""); setFReviews(""); setFConvDone(false);
  }

  function handleSetStatus(leadId: string, status: LeadStatus) {
    const next = { ...(leadStatuses ?? {}), [leadId]: status };
    setLeadStatuses?.(next);
  }

  function handleSetNote(leadId: string, note: string) {
    const next = { ...(leadNotes ?? {}), [leadId]: note };
    setLeadNotes?.(next);
  }

  async function generateAll() {
    if (ranked.length === 0) return;
    setLoading(true);
    const newConversions = { ...conversions };
    let count = Object.keys(newConversions).length;

    // Only process leads not yet done
    const pending = ranked.filter((l) => !newConversions[l.id]);
    const batches: RankedLead[][] = [];
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      batches.push(pending.slice(i, i + BATCH_SIZE));
    }

    if (batches.length === 0) {
      setLoading(false);
      toast.success("All leads already processed!");
      return;
    }

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      setStatusMsg(`Batch ${bi + 1} of ${batches.length} (${batch.length} leads)…`);

      // Build the payload the API expects: leads array + audits map
      // RankedLead has audit embedded, so we extract it here
      const leads = batch.map((l) => ({
        id: l.id, name: l.name, category: l.category, city: l.city,
        address: l.address, rating: l.rating, reviewsCount: l.reviewsCount,
        website: l.website, phone: l.phone, whatsapp: l.whatsapp, email: l.email,
        hours: l.hours, photosCount: l.photosCount, services: l.services,
        priceLevel: l.priceLevel, socialLinks: l.socialLinks,
        ownerReplies: l.ownerReplies, reviews: l.reviews,
        lat: l.lat, lng: l.lng,
      }));
      const audits: Record<string, AuditResult> = {};
      for (const l of batch) audits[l.id] = l.audit;

      try {
        const res = await fetch("/api/conversion-points", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leads, audits }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const data = await res.json() as { conversionPoints: Record<string, ConversionPoints> };
        if (data.conversionPoints) {
          Object.assign(newConversions, data.conversionPoints);
          count += Object.keys(data.conversionPoints).length;
          setConversions({ ...newConversions });
        }

        if (bi < batches.length - 1) await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        const msg = (e as Error).message ?? "Unknown error";
        toast.error(`Batch ${bi + 1} failed: ${msg}`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    setLoading(false);
    setStatusMsg("");
    toast.success(`Conversion hooks ready for ${count} leads`);
  }

  return (
    <PhaseShell
      title="Phase 4 — Conversion Points"
      subtitle="AI generates unique selling hooks for each ranked business — personalized points for calls & messages."
      onPrev={onPrev}
      onNext={onNext}
      nextDisabled={Object.keys(conversions).length === 0}
      nextLabel="Write outreach"
    >
      {/* Controls */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <Button onClick={generateAll} disabled={loading || ranked.length === 0} className="h-11 transition-transform active:scale-[0.98]">
          {loading
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
            : (() => {
                const done = Object.keys(conversions).length;
                const remaining = ranked.length - done;
                if (done === 0) return <><Target className="h-4 w-4 mr-2" />Generate conversion hooks</>;
                if (remaining > 0) return <><Target className="h-4 w-4 mr-2" />Generate remaining ({remaining})</>;
                return <><Target className="h-4 w-4 mr-2" />Re-generate all</>;
              })()}
        </Button>
        <div className="text-sm text-muted-foreground">
          {Object.keys(conversions).length} / {ranked.length} leads processed
        </div>
        {loading && statusMsg && (
          <span className="text-xs text-muted-foreground/70 italic">{statusMsg}</span>
        )}
      </div>

      {/* Search + status filter bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by business name..."
            className="w-full h-9 pl-8 pr-8 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
          />
          <svg className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded">
              ✕
            </button>
          )}
        </div>
        {/* Status filter dropdown */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "all")}
          className="h-9 px-2 pr-7 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
        >
          <option value="all">All Statuses</option>
          {ALL_LEAD_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_PILL[s].label}</option>
          ))}
        </select>
        {hasActiveFilter && (
          <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 hover:bg-muted/50 transition-colors">
            Clear all
          </button>
        )}
      </div>

      {/* Lead quality filter bar */}
      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border mb-4">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mr-1">Filter:</span>

        <button
          onClick={() => setFNoSite(v => !v)}
          className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
            fNoSite ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-background border-border text-muted-foreground hover:border-primary/40"
          }`}
        >
          No website
        </button>

        <button
          onClick={() => setFPhone(v => !v)}
          className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
            fPhone ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"
          }`}
        >
          Has phone
        </button>

        <select
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
          value={fReviews}
          onChange={e => setFReviews(e.target.value as typeof fReviews)}
          className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-background text-muted-foreground hover:border-primary/40 focus:outline-none cursor-pointer"
        >
          <option value="">Any reviews</option>
          <option value="10">10+ reviews</option>
          <option value="50">50+ reviews</option>
          <option value="100">100+ reviews</option>
        </select>

        <button
          onClick={() => setFConvDone(v => !v)}
          className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
            fConvDone ? "bg-orange-500/10 border-orange-500/30 text-orange-600" : "bg-background border-border text-muted-foreground hover:border-primary/40"
          }`}
        >
          🎯 Conv. done
        </button>

        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {ranked.filter(applyFilters).length} / {ranked.length} leads
        </span>
      </div>

      {/* All ranked leads */}
      <div className="grid gap-3">
        <AnimatePresence initial={false}>
          {ranked
          .filter(applyFilters)
            .map((lead, i) => {
            const conv = conversions[lead.id];
            const isExpanded = expandedId === lead.id;
            return (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.4) }}
              >
                <Card className={`transition-all duration-200 hover:border-primary/40 ${isExpanded ? "border-primary/60 shadow-md" : ""}`}>
                  <CardHeader
                    className="pb-3 cursor-pointer select-none"
                    onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base flex items-center gap-2 min-w-0">
                        <span className="text-muted-foreground tabular-nums text-sm shrink-0">#{i + 1}</span>
                        <span className="truncate">{lead.name}</span>
                      </CardTitle>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px] tabular-nums">Score {lead.score}</Badge>
                        {conv
                          ? <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">✓ Ready</Badge>
                          : <Badge variant="secondary" className="text-[10px]">Pending</Badge>}
                        {/* Status pill — visible in collapsed view */}
                        {(() => {
                          const s = (leadStatuses ?? {})[lead.id];
                          if (!s || s === "new") return null;
                          const cfg = STATUS_PILL[s];
                          return cfg ? (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.color} ${cfg.bg}`}>
                              {cfg.label}
                            </span>
                          ) : null;
                        })()}
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                    {/* Always-visible contact row */}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{lead.category}</span>
                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors"
                        >
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </a>
                      )}
                      {lead.mapUrl && (
                        <a
                          href={lead.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors"
                        >
                          <MapPin className="h-3 w-3" />
                          Maps
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                      {lead.rating && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-500">
                          <Star className="h-3 w-3 fill-amber-400 stroke-amber-400" />
                          {lead.rating}
                          {lead.reviewsCount ? <span className="text-muted-foreground ml-0.5">({lead.reviewsCount})</span> : null}
                        </span>
                      )}
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="pt-0 border-t border-border/60">
                      {/* ── Contact strip — always shown when expanded ── */}
                      <div className="flex flex-wrap items-center gap-2 py-3 border-b border-border/40 mb-1">
                        {lead.phone ? (
                          <a
                            href={`tel:${lead.phone}`}
                            className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-1.5 hover:bg-emerald-500/20 transition-colors"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {lead.phone}
                          </a>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-1.5">
                            <Phone className="h-3.5 w-3.5" /> No phone
                          </span>
                        )}
                        {lead.whatsapp && (
                          <a
                            href={`https://wa.me/${lead.whatsapp.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 rounded-md px-3 py-1.5 hover:bg-green-500/20 transition-colors"
                          >
                            💬 WhatsApp
                          </a>
                        )}
                        {lead.mapUrl && (
                          <a
                            href={lead.mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-3 py-1.5 hover:bg-blue-500/20 transition-colors"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            Open in Maps
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {lead.address && (
                          <span className="text-xs text-muted-foreground ml-auto hidden md:block truncate max-w-[260px]">{lead.address}</span>
                        )}
                      </div>

                      {conv ? (
                        <>
                          <div className="grid md:grid-cols-2 gap-4 pt-4">
                            <div className="space-y-2">
                            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1">
                              <Zap className="h-3 w-3 text-primary" /> Selling Points
                            </div>
                            <ul className="space-y-2">
                              {conv.points.map((point, j) => (
                                <li key={j} className="text-sm flex items-start gap-2">
                                  <span className="text-primary mt-0.5 shrink-0">→</span>
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1 mb-1">
                                <Shield className="h-3 w-3" /> Competitor Insight
                              </div>
                              <p className="text-sm text-muted-foreground">{conv.competitorInsight}</p>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1 mb-1">
                                <TrendingUp className="h-3 w-3" /> Revenue Argument
                              </div>
                              <p className="text-sm text-muted-foreground">{conv.revenueArgument}</p>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1 mb-1">
                                <Clock className="h-3 w-3" /> Urgency Hook
                              </div>
                              <p className="text-sm font-medium text-[color:var(--chart-4)]">{conv.urgencyHook}</p>
                            </div>
                          </div>
                        </div>

                        {/* Call Script Section */}
                        {conv.callScript && (
                          <div className="mt-4 border-t border-border/60 pt-4">
                            <button
                              onClick={() => setShowScriptId(showScriptId === lead.id ? null : lead.id)}
                              className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors w-full"
                            >
                              <Phone className="h-3.5 w-3.5" />
                              Call Script
                              {showScriptId === lead.id
                                ? <ChevronUp className="h-3.5 w-3.5 ml-auto" />
                                : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
                            </button>

                            <AnimatePresence initial={false}>
                              {showScriptId === lead.id && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-4">
                                    {/* Step 1: Opener */}
                                    <div>
                                      <div className="text-[10px] uppercase tracking-widest text-emerald-600/70 dark:text-emerald-400/70 font-semibold mb-1 flex items-center gap-1">
                                        <Phone className="h-3 w-3" /> Step 1 — Opening Line
                                      </div>
                                      <p className="text-sm leading-relaxed rounded bg-background/60 border border-border/50 px-3 py-2 font-medium italic">
                                        "{conv.callScript.opener}"
                                      </p>
                                    </div>

                                    {/* Ice Breaker */}
                                    {conv.callScript.iceBreaker && (
                                      <div>
                                        <div className="text-[10px] uppercase tracking-widest text-teal-600/70 font-semibold mb-1 flex items-center gap-1">
                                          <MessageSquare className="h-3 w-3" /> Ice Breaker — Get Them Talking
                                        </div>
                                        <p className="text-sm leading-relaxed rounded bg-background/60 border border-border/50 px-3 py-2 italic">
                                          "{conv.callScript.iceBreaker}"
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-1">Ask this after the opener. Listen — don't pitch yet.</p>
                                      </div>
                                    )}

                                    {/* Step 2: Key Points */}
                                    <div>
                                      <div className="text-[10px] uppercase tracking-widest text-blue-600/70 dark:text-blue-400/70 font-semibold mb-1 flex items-center gap-1">
                                        <MessageSquare className="h-3 w-3" /> Step 2 — Key Points to Mention
                                      </div>
                                      <ul className="space-y-1.5">
                                        {conv.callScript.keyPoints.map((kp, ki) => (
                                          <li key={ki} className="text-sm flex items-start gap-2">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                                            <span>{kp}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>

                                    {/* Step 3: If they say no */}
                                    <div>
                                      <div className="text-[10px] uppercase tracking-widest text-amber-600/70 dark:text-amber-400/70 font-semibold mb-1 flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" /> If They Say "Not Interested"
                                      </div>
                                      <p className="text-sm leading-relaxed rounded bg-background/60 border border-border/50 px-3 py-2 italic">
                                        "{conv.callScript.objectionHandler}"
                                      </p>
                                    </div>

                                    {/* Step 4: Closer */}
                                    <div>
                                      <div className="text-[10px] uppercase tracking-widest text-purple-600/70 dark:text-purple-400/70 font-semibold mb-1 flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3" /> Step 3 — Close the Call
                                      </div>
                                      <p className="text-sm leading-relaxed rounded bg-background/60 border border-border/50 px-3 py-2 italic">
                                        "{conv.callScript.closer}"
                                      </p>
                                    </div>

                                    {/* Do NOT say */}
                                    {conv.callScript.doNotSay && (
                                      <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                                        <div className="text-[10px] uppercase tracking-widest text-red-600 font-semibold mb-1">⚠ Don't Say This</div>
                                        <p className="text-xs text-red-700">{conv.callScript.doNotSay}</p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Post-call WhatsApp message */}
                                  {conv.postCallWhatsApp && (
                                    <div className="mt-3 rounded-lg border border-green-200 bg-green-50/60 p-3">
                                      <div className="text-[10px] uppercase tracking-widest text-green-700 font-semibold mb-1.5 flex items-center gap-1">
                                        💬 Send This WhatsApp Within 5 Min After Call
                                      </div>
                                      <p className="text-sm text-gray-700 font-mono leading-relaxed whitespace-pre-wrap">{conv.postCallWhatsApp}</p>
                                      <button
                                        onClick={() => { navigator.clipboard.writeText(conv.postCallWhatsApp!); }}
                                        className="mt-2 text-[10px] text-green-700 underline hover:no-underline"
                                      >
                                        Copy message
                                      </button>
                                    </div>
                                  )}

                                  {/* Best time to call */}
                                  {conv.bestTimeToCall && (
                                    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                                      <div className="text-[10px] uppercase tracking-widest text-blue-600 font-semibold mb-0.5">🕐 Best Time to Call</div>
                                      <p className="text-xs text-blue-800">{conv.bestTimeToCall}</p>
                                    </div>
                                  )}

                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                        {/* ── After Call section ── */}
                        <div className="mt-4 pt-4 border-t border-border/60 space-y-3">
                          <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">After Call</div>
                          <div className="flex flex-wrap gap-2">
                            {ALL_LEAD_STATUSES.map((s) => {
                              const cfg = STATUS_PILL[s];
                              const active = ((leadStatuses ?? {})[lead.id] ?? "new") === s;
                              return (
                                <button
                                  key={s}
                                  onClick={() => handleSetStatus(lead.id, s)}
                                  className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${
                                    active
                                      ? `${cfg.color} ${cfg.bg} ring-2 ring-offset-1 ring-current scale-105`
                                      : "text-muted-foreground border-border hover:border-primary/40"
                                  }`}
                                >
                                  {cfg.label}
                                </button>
                              );
                            })}
                          </div>
                          <textarea
                            placeholder="Note: what did they say? call back time? anything useful..."
                            defaultValue={(leadNotes ?? {})[lead.id] ?? ""}
                            onBlur={(e) => handleSetNote(lead.id, e.target.value)}
                            rows={2}
                            className="w-full text-sm rounded-md border border-border bg-muted/30 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                          />
                        </div>
                        </>
                      ) : (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          <Target className="h-6 w-6 mx-auto mb-2 opacity-30" />
                          Hit <strong>Generate conversion hooks</strong> above to create personalized selling points for this lead.
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {ranked.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Go to Phase 3 first to rank your leads
        </div>
      )}
    </PhaseShell>
  );
}


