"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhaseShell } from "./PhaseShell";
import {
  Loader2,
  Target,
  TrendingUp,
  Zap,
  Shield,
  Clock,
  ChevronDown,
  ChevronUp,
  Phone,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Star,
  ExternalLink,
  Copy,
  Check,
  Search,
  X,
  Sparkles,
  Edit3,
} from "lucide-react";
import type { RankedLead, ConversionPoints, AuditResult, LeadStatus, ClientDetail } from "@/lib/types";
import { estimateBusinessAgeMonths, getAgeBadge } from "@/lib/businessAge";
import { toWhatsAppNumber, cleanPhone, normalizePhone10 } from "@/lib/phoneUtils";
import { toast } from "sonner";

const BATCH_SIZE = 5;

// Status pill config — mirrors Phase 7 STATUS_CONFIG
const STATUS_PILL: Record<string, { label: string; color: string; bg: string }> = {
  new:            { label: "New",            color: "text-sky-700 dark:text-sky-400",     bg: "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800" },
  called:         { label: "Called",         color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800" },
  interested:     { label: "Interested",     color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800" },
  demo_sent:      { label: "Demo Sent",      color: "text-purple-700 dark:text-purple-400",  bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800" },
  meeting_set:    { label: "Meeting Set",    color: "text-indigo-700 dark:text-indigo-400",  bg: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800" },
  completed:      { label: "Completed ✓",   color: "text-green-700 dark:text-green-400",   bg: "bg-green-100 dark:bg-green-950/60 border-green-300 dark:border-green-800" },
  not_interested: { label: "Not Interested", color: "text-red-700 dark:text-red-400",     bg: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800" },
  no_response:    { label: "No Response",    color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800" },
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
  clientDetails = {},
  setClientDetails,
  onNext,
  onPrev,
  initialExpandedId,
  selectedLeadId,
  onSelectLead,
  onGoToPhase,
}: {
  ranked: RankedLead[];
  conversions: Record<string, ConversionPoints>;
  setConversions: (c: Record<string, ConversionPoints>) => void;
  leadStatuses?: Record<string, LeadStatus>;
  setLeadStatuses?: (s: Record<string, LeadStatus>) => void;
  leadNotes?: Record<string, string>;
  setLeadNotes?: (n: Record<string, string>) => void;
  clientDetails?: Record<string, ClientDetail>;
  setClientDetails?: (d: Record<string, ClientDetail>) => void;
  onNext: () => void;
  onPrev?: () => void;
  initialExpandedId?: string | null;
  selectedLeadId?: string | null;
  onSelectLead?: (leadId: string | null) => void;
  onGoToPhase?: (phaseNum: number, leadId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId ?? selectedLeadId ?? null);

  // Sync expanded card with selected lead and scroll into view
  useEffect(() => {
    const targetId = initialExpandedId ?? selectedLeadId;
    if (targetId) {
      setExpandedId(targetId);
      const timer = setTimeout(() => {
        const el = document.getElementById(`convert-card-${targetId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [initialExpandedId, selectedLeadId]);

  function toggleExpand(id: string) {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    onSelectLead?.(next);
  }
  const [statusMsg, setStatusMsg] = useState("");
  const [showScriptId, setShowScriptId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [fNoSite, setFNoSite] = useState(false);
  const [fPhone, setFPhone] = useState(false);
  const [fRating, setFRating] = useState<"" | "3.5" | "4.0" | "4.5">("");
  const [fReviews, setFReviews] = useState<"" | "10" | "50" | "100">("");
  const [fConvDone, setFConvDone] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Client detail drawer
  const [detailDrawer, setDetailDrawer] = useState<{ open: boolean; leadId: string | null }>({
    open: false,
    leadId: null,
  });
  const [draftDetail, setDraftDetail] = useState<ClientDetail>({});

  function openDetailDrawer(leadId: string) {
    setDraftDetail(clientDetails[leadId] ?? {});
    setDetailDrawer({ open: true, leadId });
  }

  function copyPhone(e: React.MouseEvent, phone: string, leadId: string) {
    e.stopPropagation();
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    const clean = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
    navigator.clipboard.writeText(clean);
    setCopiedId(leadId);
    setTimeout(() => setCopiedId(null), 1800);
  }

  function copyText(text: string, id: string, label = "Copied to clipboard") {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(label);
    setTimeout(() => setCopiedId(null), 1800);
  }

  function saveDetailDrawer() {
    if (!detailDrawer.leadId) return;
    const next = { ...clientDetails, [detailDrawer.leadId]: draftDetail };
    setClientDetails?.(next);
    setDetailDrawer({ open: false, leadId: null });
    toast.success("Client details saved ✔");
  }

  function updateDraft(field: keyof ClientDetail, value: string) {
    setDraftDetail((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "priceAgreed" || field === "advanceReceived") {
        const price = parseFloat(field === "priceAgreed" ? value : prev.priceAgreed ?? "0") || 0;
        const adv = parseFloat(field === "advanceReceived" ? value : prev.advanceReceived ?? "0") || 0;
        if (price > 0) next.balanceDue = String(price - adv);
      }
      return next;
    });
  }

  const hasActiveFilter =
    fNoSite || fPhone || fRating || fReviews || fConvDone || statusFilter !== "all" || !!searchQuery;

  function matchesSearch(l: (typeof ranked)[number]): boolean {
    if (!searchQuery) return true;
    const q = searchQuery.trim();
    const isPhoneQuery = /^[\d\s+\-()]+$/.test(q) && q.replace(/\D/g, "").length >= 2;
    if (isPhoneQuery) {
      const digits = q.replace(/\D/g, "");
      const rawPhone = (l.phone ?? l.whatsapp ?? "").replace(/\D/g, "");
      const normPhone = normalizePhone10(l.phone ?? l.whatsapp) || (rawPhone.startsWith("91") && rawPhone.length === 12 ? rawPhone.slice(2) : rawPhone);
      return normPhone.includes(digits) || rawPhone.includes(digits);
    }
    return l.name.toLowerCase().includes(q.toLowerCase()) || l.city.toLowerCase().includes(q.toLowerCase());
  }

  function applyFilters(l: (typeof ranked)[number]) {
    const statusMatch = statusFilter === "all" || ((leadStatuses ?? {})[l.id] ?? "new") === statusFilter;
    const noSiteMatch = !fNoSite || !l.website;
    const phoneMatch = !fPhone || !!(l.phone ?? l.whatsapp);
    const ratingMatch = !fRating || (l.rating ?? 0) >= parseFloat(fRating);
    const reviewMatch = !fReviews || (l.reviewsCount ?? 0) >= parseInt(fReviews);
    const convMatch = !fConvDone || !!conversions[l.id];
    return matchesSearch(l) && statusMatch && noSiteMatch && phoneMatch && ratingMatch && reviewMatch && convMatch;
  }

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setFNoSite(false);
    setFPhone(false);
    setFRating("");
    setFReviews("");
    setFConvDone(false);
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

      const leads = batch.map((l) => ({
        id: l.id,
        name: l.name,
        category: l.category,
        city: l.city,
        address: l.address,
        rating: l.rating,
        reviewsCount: l.reviewsCount,
        website: l.website,
        phone: l.phone,
        whatsapp: l.whatsapp,
        email: l.email,
        hours: l.hours,
        photosCount: l.photosCount,
        services: l.services,
        priceLevel: l.priceLevel,
        socialLinks: l.socialLinks,
        ownerReplies: l.ownerReplies,
        reviews: l.reviews,
        lat: l.lat,
        lng: l.lng,
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

        const data = (await res.json()) as { conversionPoints: Record<string, ConversionPoints> };
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

  const rankedIds = new Set(ranked.map((l) => l.id));
  const doneCount = Object.keys(conversions).filter((id) => rankedIds.has(id)).length;
  const remainingCount = ranked.length - doneCount;
  const filteredLeads = ranked.filter(applyFilters);

  return (
    <PhaseShell
      title="Phase 4 — Conversion Points"
      subtitle="AI generates unique selling hooks for each ranked business — personalized points for calls & messages."
      onPrev={onPrev}
      onNext={onNext}
      nextDisabled={Object.keys(conversions).length === 0}
      nextLabel="Build website"
    >
      {/* ── TOP ACTION & STATS BANNER ── */}
      <div className="bg-card border border-border rounded-xl p-4 sm:p-5 mb-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              onClick={generateAll}
              disabled={loading || ranked.length === 0}
              className="h-10 px-4 font-semibold text-xs sm:text-sm rounded-lg transition-transform active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating hooks…
                </>
              ) : doneCount === 0 ? (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  Generate conversion hooks
                </>
              ) : remainingCount > 0 ? (
                <>
                  <Target className="h-4 w-4 mr-2" />
                  Generate remaining ({remainingCount})
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Re-generate all hooks
                </>
              )}
            </Button>

            <div className="flex flex-col">
              <span className="text-xs font-semibold text-foreground tabular-nums">
                {doneCount} / {ranked.length} hooks ready
              </span>
              {loading && statusMsg && (
                <span className="text-[11px] text-muted-foreground animate-pulse">{statusMsg}</span>
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {doneCount > 0 && remainingCount === 0 && (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs gap-1 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> All leads ready for outreach
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* ── UNIFIED SEARCH & FILTER TRACK (Mobile-optimized) ── */}
      <div className="space-y-2.5 mb-5">
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, city or phone…"
              className="w-full h-9 pl-9 pr-8 text-xs sm:text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "all")}
            className="h-9 px-2.5 text-xs font-medium rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-2xs"
          >
            <option value="all">All Statuses</option>
            {ALL_LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_PILL[s].label}
              </option>
            ))}
          </select>

          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 text-xs px-2.5 text-muted-foreground hover:text-foreground shrink-0"
            >
              Reset
            </Button>
          )}
        </div>

        {/* Scrollable Filter Chips Track */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar text-xs">
          <button
            onClick={() => setFNoSite((v) => !v)}
            className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all shrink-0 ${
              fNoSite
                ? "bg-destructive/10 border-destructive/30 text-destructive font-semibold"
                : "border-border bg-card text-muted-foreground hover:border-primary/40"
            }`}
          >
            No website
          </button>

          <button
            onClick={() => setFPhone((v) => !v)}
            className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all shrink-0 ${
              fPhone
                ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                : "border-border bg-card text-muted-foreground hover:border-primary/40"
            }`}
          >
            Has phone
          </button>

          <select
            value={fRating}
            onChange={(e) => setFRating(e.target.value as typeof fRating)}
            className="text-[11px] font-medium px-2 py-1 rounded-full border border-border bg-card text-muted-foreground focus:outline-none shrink-0 cursor-pointer"
          >
            <option value="">Any rating</option>
            <option value="3.5">★ 3.5+</option>
            <option value="4.0">★ 4.0+</option>
            <option value="4.5">★ 4.5+</option>
          </select>

          <select
            value={fReviews}
            onChange={(e) => setFReviews(e.target.value as typeof fReviews)}
            className="text-[11px] font-medium px-2 py-1 rounded-full border border-border bg-card text-muted-foreground focus:outline-none shrink-0 cursor-pointer"
          >
            <option value="">Any reviews</option>
            <option value="10">10+ reviews</option>
            <option value="50">50+ reviews</option>
            <option value="100">100+ reviews</option>
          </select>

          <button
            onClick={() => setFConvDone((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all shrink-0 ${
              fConvDone
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 font-semibold"
                : "border-border bg-card text-muted-foreground hover:border-primary/40"
            }`}
          >
            <span>✓ Hooks ready</span>
          </button>

          <span className="ml-auto text-[11px] text-muted-foreground shrink-0 pl-2 tabular-nums">
            {filteredLeads.length} of {ranked.length} leads
          </span>
        </div>
      </div>

      {/* ── ALL RANKED LEADS CARDS ── */}
      <div className="grid gap-3">
        <AnimatePresence initial={false}>
          {filteredLeads.map((lead, i) => {
            const conv = conversions[lead.id];
            const isExpanded = expandedId === lead.id;
            const originalIndex = ranked.indexOf(lead) + 1;
            const currentStatus = (leadStatuses ?? {})[lead.id];
            const statusConfig = currentStatus && currentStatus !== "new" ? STATUS_PILL[currentStatus] : null;

            return (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
              >
                <Card
                  id={`convert-card-${lead.id}`}
                  className={`transition-all duration-150 border-border shadow-xs hover:border-primary/40 ${
                    isExpanded ? "border-primary/60 shadow-md ring-1 ring-primary/20" : ""
                  }`}
                >
                  <CardHeader
                    className="p-3.5 sm:p-4 cursor-pointer select-none"
                    onClick={() => toggleExpand(lead.id)}
                  >
                    {/* Tier 1: Rank, Full Business Name (wrap enabled), Score & Expand Chevron */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-muted text-foreground font-bold shrink-0 mt-0.5">
                          #{originalIndex}
                        </span>
                        <h3 className="font-semibold text-sm sm:text-base text-foreground leading-snug break-words">
                          {lead.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-start mt-0.5">
                        <Badge variant="outline" className="font-mono text-[11px] font-semibold tabular-nums shrink-0">
                          Score {lead.score}
                        </Badge>
                        <div className="h-6 w-6 rounded-md bg-muted/60 flex items-center justify-center text-muted-foreground shrink-0 transition-colors">
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </div>
                      </div>
                    </div>

                    {/* Tier 2: Category, City, Star Rating, Status Badges */}
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground flex-wrap">
                      <span className="font-medium px-2 py-0.5 rounded-md bg-muted/60 text-foreground text-[11px]">
                        {lead.category}
                      </span>
                      <span>·</span>
                      <span className="truncate max-w-[200px]">{lead.city}</span>
                      {lead.rating && (
                        <span className="inline-flex items-center gap-0.5 text-amber-500 font-semibold text-[11px]">
                          <Star className="h-3 w-3 fill-amber-400 stroke-amber-400" />
                          {lead.rating}
                          {lead.reviewsCount ? (
                            <span className="text-muted-foreground font-normal">({lead.reviewsCount})</span>
                          ) : null}
                        </span>
                      )}

                      {/* Ready / Pending Hook Badge */}
                      <div className="ml-auto flex items-center gap-1.5">
                        {conv ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] py-0 px-1.5 font-medium">
                            ✓ Ready
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                            Pending
                          </Badge>
                        )}

                        {statusConfig && (
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusConfig.color} ${statusConfig.bg}`}
                          >
                            {statusConfig.label}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tier 3: Dedicated Action Toolbar (Never collides, touch-friendly) */}
                    <div
                      className="mt-3 pt-2.5 border-t border-border/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {lead.phone && (
                        <div className="inline-flex items-center shrink-0">
                          <a
                            href={`tel:${cleanPhone(lead.phone)}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-l-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                            title="Call business"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            <span className="tabular-nums">{lead.phone}</span>
                          </a>
                          <button
                            onClick={(e) => copyPhone(e, lead.phone!, lead.id + "-btn")}
                            className="px-2 py-1.5 text-xs rounded-r-lg border-y border-r border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                            title="Copy number"
                          >
                            {copiedId === lead.id + "-btn" ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      )}

                      {(() => {
                        const targetPhone = lead.whatsapp || lead.phone;
                        if (!targetPhone) return null;
                        const waNum = toWhatsAppNumber(targetPhone);
                        if (!waNum) return null;
                        return (
                          <a
                            href={`https://wa.me/${waNum}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-green-500/30 bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors shrink-0"
                            title="Chat on WhatsApp"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        );
                      })()}

                      {lead.mapUrl && (
                        <a
                          href={lead.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          title="Open in Google Maps"
                        >
                          <MapPin className="h-3.5 w-3.5 text-blue-500" />
                          <span>Map</span>
                        </a>
                      )}

                      <button
                        onClick={() => openDetailDrawer(lead.id)}
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors shrink-0 ${
                          clientDetails[lead.id]
                            ? "bg-violet-500/15 border-violet-400/40 text-violet-600 font-semibold"
                            : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                        title="Client Deal Details"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-violet-500" />
                        <span>Deal</span>
                      </button>

                      {onGoToPhase && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectLead?.(lead.id);
                              onGoToPhase(5, lead.id);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 transition-colors shrink-0"
                            title="Open in Website Architect (Phase 5)"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Website →</span>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectLead?.(lead.id);
                              onGoToPhase(6, lead.id);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                            title="Open in Outreach Studio (Phase 6)"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span>Outreach →</span>
                          </button>
                        </>
                      )}
                    </div>
                  </CardHeader>

                  {/* ── EXPANDED DETAILS ── */}
                  {isExpanded && (
                    <CardContent className="p-4 sm:p-5 pt-0 border-t border-border/60 space-y-4">
                      {/* Business Age Badge */}
                      {(() => {
                        const ageMonths = estimateBusinessAgeMonths(lead.reviews);
                        const badge = getAgeBadge(ageMonths);
                        return (
                          <div
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${badge.bg} ${badge.border}`}
                          >
                            <span className={`font-semibold ${badge.color}`}>{badge.label}</span>
                            <span className="text-muted-foreground text-[11px]">{badge.sublabel}</span>
                          </div>
                        );
                      })()}

                      {conv ? (
                        <>
                          {/* Selling Points Grid */}
                          <div className="grid md:grid-cols-2 gap-4">
                            {/* Left: Bullet Points */}
                            <div className="space-y-2">
                              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Zap className="h-3.5 w-3.5 text-primary" />
                                <span>Key Selling Points</span>
                              </div>
                              <ul className="space-y-2">
                                {conv.points.map((point, j) => (
                                  <li key={j} className="text-xs sm:text-sm flex items-start gap-2 text-foreground">
                                    <span className="text-primary font-bold mt-0.5 shrink-0">→</span>
                                    <span className="leading-snug">{point}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Right: Arguments */}
                            <div className="space-y-3">
                              <div className="bg-muted/30 border border-border rounded-lg p-3">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
                                  <Shield className="h-3 w-3 text-blue-500" />
                                  <span>Competitor Insight</span>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">{conv.competitorInsight}</p>
                              </div>

                              <div className="bg-muted/30 border border-border rounded-lg p-3">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
                                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                                  <span>Revenue Argument</span>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">{conv.revenueArgument}</p>
                              </div>

                              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mb-1">
                                  <Clock className="h-3 w-3" />
                                  <span>Urgency Hook</span>
                                </div>
                                <p className="text-xs font-medium text-amber-700 dark:text-amber-300 leading-relaxed">
                                  {conv.urgencyHook}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Call Script Accordion */}
                          {conv.callScript && (
                            <div className="border border-border rounded-xl overflow-hidden bg-card">
                              <button
                                onClick={() => setShowScriptId(showScriptId === lead.id ? null : lead.id)}
                                className="w-full flex items-center justify-between p-3.5 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-xs sm:text-sm font-semibold text-foreground">
                                    Cold Call Pitch &amp; Script
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                                    {showScriptId === lead.id ? "Hide script" : "Show script"}
                                  </span>
                                  {showScriptId === lead.id ? (
                                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                              </button>

                              <AnimatePresence initial={false}>
                                {showScriptId === lead.id && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="p-4 border-t border-border space-y-4"
                                  >
                                    {/* Opener */}
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                          Step 1 — Opening Line
                                        </span>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 text-[10px] px-2 text-muted-foreground"
                                          onClick={() => copyText(conv.callScript!.opener, `op-${lead.id}`, "Opener copied")}
                                        >
                                          {copiedId === `op-${lead.id}` ? "Copied" : "Copy"}
                                        </Button>
                                      </div>
                                      <p className="text-xs sm:text-sm leading-relaxed p-3 rounded-lg bg-muted/40 border border-border italic font-medium">
                                        &ldquo;{conv.callScript.opener}&rdquo;
                                      </p>
                                    </div>

                                    {/* Ice Breaker */}
                                    {conv.callScript.iceBreaker && (
                                      <div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 block mb-1">
                                          Ice Breaker
                                        </span>
                                        <p className="text-xs sm:text-sm leading-relaxed p-3 rounded-lg bg-muted/40 border border-border italic">
                                          &ldquo;{conv.callScript.iceBreaker}&rdquo;
                                        </p>
                                      </div>
                                    )}

                                    {/* Key Points */}
                                    <div>
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block mb-1.5">
                                        Step 2 — Points to Mention
                                      </span>
                                      <ul className="space-y-1.5">
                                        {conv.callScript.keyPoints.map((kp, ki) => (
                                          <li key={ki} className="text-xs sm:text-sm flex items-start gap-2">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                                            <span>{kp}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>

                                    {/* Objection Handler */}
                                    <div>
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-1">
                                        If They Say &ldquo;Not Interested&rdquo;
                                      </span>
                                      <p className="text-xs sm:text-sm leading-relaxed p-3 rounded-lg bg-muted/40 border border-border italic">
                                        &ldquo;{conv.callScript.objectionHandler}&rdquo;
                                      </p>
                                    </div>

                                    {/* Closer */}
                                    <div>
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 block mb-1">
                                        Step 3 — Closing the Call
                                      </span>
                                      <p className="text-xs sm:text-sm leading-relaxed p-3 rounded-lg bg-muted/40 border border-border italic font-medium">
                                        &ldquo;{conv.callScript.closer}&rdquo;
                                      </p>
                                    </div>

                                    {/* Do Not Say */}
                                    {conv.callScript.doNotSay && (
                                      <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
                                        <div className="font-bold uppercase tracking-wider text-[10px] mb-0.5">
                                          ⚠ Do Not Say This
                                        </div>
                                        <p>{conv.callScript.doNotSay}</p>
                                      </div>
                                    )}

                                    {/* Post-Call WhatsApp */}
                                    {conv.postCallWhatsApp && (
                                      <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                                            💬 WhatsApp to send within 5 minutes
                                          </span>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 text-[10px] px-2"
                                            onClick={() =>
                                              copyText(conv.postCallWhatsApp!, `wa-${lead.id}`, "WhatsApp text copied")
                                            }
                                          >
                                            {copiedId === `wa-${lead.id}` ? "Copied" : "Copy"}
                                          </Button>
                                        </div>
                                        <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap bg-background p-2.5 rounded-md border border-border">
                                          {conv.postCallWhatsApp}
                                        </pre>
                                      </div>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}

                          {/* After Call Status & Note Strip */}
                          <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-foreground">Pipeline Status</span>
                              <span className="text-[11px] text-muted-foreground">Tap to update status</span>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {ALL_LEAD_STATUSES.map((s) => {
                                const cfg = STATUS_PILL[s];
                                const active = ((leadStatuses ?? {})[lead.id] ?? "new") === s;
                                return (
                                  <button
                                    key={s}
                                    onClick={() => handleSetStatus(lead.id, s)}
                                    className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${
                                      active
                                        ? `${cfg.color} ${cfg.bg} ring-2 ring-primary/40 font-semibold shadow-2xs`
                                        : "text-muted-foreground border-border hover:border-primary/40 bg-background"
                                    }`}
                                  >
                                    {cfg.label}
                                  </button>
                                );
                              })}
                            </div>

                            <textarea
                              placeholder="Add call notes: callback time, price discussed, client requirements..."
                              defaultValue={(leadNotes ?? {})[lead.id] ?? ""}
                              onBlur={(e) => handleSetNote(lead.id, e.target.value)}
                              rows={2}
                              className="w-full text-xs sm:text-sm rounded-lg border border-border bg-background p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="py-8 text-center text-xs sm:text-sm text-muted-foreground">
                          <Target className="h-6 w-6 mx-auto mb-2 text-primary opacity-60" />
                          Tap <strong>&ldquo;Generate conversion hooks&rdquo;</strong> above to create personalized sales points and call scripts for this lead.
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

      {filteredLeads.length === 0 && (
        <div className="text-center py-12 text-xs sm:text-sm text-muted-foreground">
          No leads match your active filters.{" "}
          <button onClick={clearFilters} className="text-primary underline">
            Clear all filters
          </button>
        </div>
      )}

      {/* ── CLIENT DETAIL DRAWER ── */}
      {detailDrawer.open && (() => {
        const lead = ranked.find((l) => l.id === detailDrawer.leadId);
        if (!lead) return null;
        const f = (label: string, field: keyof ClientDetail, type = "text", readOnly = false) => (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </label>
            <input
              type={type}
              value={draftDetail[field] ?? ""}
              onChange={(e) => !readOnly && updateDraft(field, e.target.value)}
              readOnly={readOnly}
              className={`h-9 px-3 text-xs sm:text-sm rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary ${
                readOnly ? "bg-muted/40 text-muted-foreground cursor-not-allowed" : "border-border"
              }`}
            />
          </div>
        );

        return (
          <>
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity"
              onClick={() => setDetailDrawer({ open: false, leadId: null })}
            />
            <div className="fixed right-0 top-0 h-full w-full max-w-md bg-background border-l border-border shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20 shrink-0">
                <div>
                  <div className="font-semibold text-sm">💼 Client Deal Details</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                    {lead.name} · {lead.city}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => setDetailDrawer({ open: false, leadId: null })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
                {/* Deal Info */}
                <div className="space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold border-b border-border pb-1">
                    Deal Info
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {f("Client Name", "clientName")}
                    {f("Price Agreed (₹)", "priceAgreed", "number")}
                    {f("Advance Received (₹)", "advanceReceived", "number")}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Balance Due (₹)
                      </label>
                      <input
                        type="number"
                        value={draftDetail.balanceDue ?? ""}
                        onChange={(e) => updateDraft("balanceDue", e.target.value)}
                        placeholder="Auto-calculated"
                        className="h-9 px-3 text-xs sm:text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Website */}
                <div className="space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold border-b border-border pb-1">
                    Website &amp; Domain
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {f("Domain Name", "domainName")}
                    {f("Website Live URL", "websiteUrl")}
                  </div>
                </div>

                {/* Hosting */}
                <div className="space-y-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold border-b border-border pb-1">
                    Hosting Timeline
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {f("Free Start", "freeHostingStart", "date")}
                    {f("Free End", "freeHostingEnd", "date")}
                    {f("Paid Start", "paidHostingStart", "date")}
                    {f("Paid End", "paidHostingEnd", "date")}
                  </div>
                </div>

                {/* Remarks */}
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold border-b border-border pb-1">
                    Remarks &amp; Next Steps
                  </div>
                  <textarea
                    value={draftDetail.remarks ?? ""}
                    onChange={(e) => updateDraft("remarks", e.target.value)}
                    rows={3}
                    placeholder="Any specific client requirements, deliverables, notes..."
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none shadow-2xs"
                  />
                </div>
              </div>

              <div className="px-5 py-4 border-t border-border bg-muted/20 shrink-0 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-9 text-xs"
                  onClick={() => setDetailDrawer({ open: false, leadId: null })}
                >
                  Cancel
                </Button>
                <Button className="flex-1 h-9 text-xs font-semibold" onClick={saveDetailDrawer}>
                  Save Details
                </Button>
              </div>
            </div>
          </>
        );
      })()}
    </PhaseShell>
  );
}
