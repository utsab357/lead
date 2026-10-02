"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhaseShell } from "./PhaseShell";
import { IncompleteState } from "./IncompleteState";
import {
  Loader2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Copy,
  Sparkles,
  Search,
  ExternalLink,
  Palette,
  Check,
  ListFilter,
  X,
  Star,
  SlidersHorizontal,
} from "lucide-react";
import type { RankedLead, BuildPromptResult, ExtraPage } from "@/lib/types";
import { toast } from "sonner";
import { PreviewPanel } from "./PreviewPanel";


const STYLE_PRESETS = [
  { id: "professional", label: "Professional",    desc: "Clean, trustworthy, corporate" },
  { id: "modern",       label: "Modern",          desc: "Sleek dark/light, subtle gradients" },
  { id: "animated",     label: "Animated",        desc: "Scroll animations, micro-interactions" },
  { id: "warm",         label: "Warm & Friendly", desc: "Earthy tones, welcoming vibe" },
  { id: "luxury",       label: "Luxury",          desc: "Dark background, gold accents" },
  { id: "bold",         label: "Bold & Vibrant",  desc: "High energy, punchy CTAs" },
];

export function Phase4Build({
  ranked,
  buildPrompts,
  setBuildPrompts,
  visualPreviews,
  setVisualPreviews,
  sessionId,
  onNext,
  onPrev,
  initialLeadId,
  onSelectLead,
}: {
  ranked: RankedLead[];
  buildPrompts: Record<string, BuildPromptResult>;
  setBuildPrompts: (b: Record<string, BuildPromptResult>) => void;
  visualPreviews?: Record<string, import("@/lib/types").LeadVisualPreviewSet>;
  setVisualPreviews?: (p: Record<string, import("@/lib/types").LeadVisualPreviewSet>) => void;
  sessionId?: string | null;
  onNext: () => void;
  onPrev: () => void;
  initialLeadId?: string | null;
  onSelectLead?: (leadId: string) => void;
}) {
  const [activeLead, setActiveLead] = useState<RankedLead | null>(
    (initialLeadId ? ranked.find((l) => l.id === initialLeadId) : null) ?? ranked[0] ?? null
  );

  function selectLead(lead: RankedLead) {
    setActiveLead(lead);
    setError(null);
    onSelectLead?.(lead.id);
  }

  // Sync activeLead if initialLeadId changes from parent
  useEffect(() => {
    if (initialLeadId) {
      const match = ranked.find((l) => l.id === initialLeadId);
      if (match) setActiveLead(match);
    }
  }, [initialLeadId, ranked]);
  const [styles, setStyles] = useState<string[]>(["ai-decides"]);
  const [generating, setGenerating] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const batchCancelRef = { current: false };
  const [error, setError] = useState<string | null>(null);


  const [typed, setTyped] = useState<Record<string, string>>({});
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [extraPagePrompts, setExtraPagePrompts] = useState<Record<string, { prompt: string; generating: boolean }>>({});
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set());
  const [subPageCompiling, setSubPageCompiling] = useState<Record<string, boolean>>({});
  const [subPageUrls, setSubPageUrls] = useState<Record<string, string>>({});

  // Track which leads have generated AI website preview images
  const [imagePreviews, setImagePreviews] = useState<Record<string, { exists: boolean }>>({});

  // Check preview images once in batch (single fast request instead of 100+ separate GETs)
  useEffect(() => {
    fetch("/api/generate-preview?list=true")
      .then((r) => r.json())
      .then((d) => {
        if (d.files && Array.isArray(d.files)) {
          const map: Record<string, { exists: boolean }> = {};
          ranked.forEach((l) => {
            const cleanName = l.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15);
            const hasMatch = d.files.some((f: string) => f.includes(l.id) || (cleanName && f.toLowerCase().includes(cleanName)));
            if (hasMatch) map[l.id] = { exists: true };
          });
          setImagePreviews(map);
        }
      })
      .catch(() => {});
  }, [ranked]);

  function clearAllPromptsAndPreviews() {
    setBuildPrompts({});
    setVisualPreviews?.({});
    setImagePreviews({});
    toast.success("Cleared all generated prompts and image preview data.");
  }

  const result = activeLead ? buildPrompts[activeLead.id] : null;
  const prompt = result?.prompt ?? "";
  const displayText = activeLead ? (typed[activeLead.id] ?? prompt) : "";
  const pitchPoints = result?.pitchPoints ?? [];
  const doneCount = Object.keys(buildPrompts).length;
  const activeIndex = activeLead ? ranked.findIndex((l) => l.id === activeLead.id) : -1;

  if (ranked.length === 0) {
    return (
      <PhaseShell
        title="Phase 5 — Architect & Preview"
        subtitle="Synthesize 2027 visual mockups & complete website prompts for each ranked lead."
        onPrev={onPrev}
        onNext={onNext}
        nextDisabled
        nextLabel="Studio"
      >
        <IncompleteState
          title="No ranked leads yet"
          description="Run Phases 1–3 first to get ranked leads, then generate website mockups here."
          prevPhaseLabel="Hooks"
          onPrev={onPrev}
        />
      </PhaseShell>
    );
  }

  function goToIndex(idx: number) {
    if (idx >= 0 && idx < ranked.length) {
      selectLead(ranked[idx]);
    }
  }

  async function generate() {
    if (!activeLead) return;
    setGenerating(true);
    setError(null);
    const styleParam = styles.length > 0 ? styles.join("+") : "ai-decides";
    const validPhotos = (activeLead.photoUrls ?? []).filter((u) => !brokenPhotos.has(u));
    const cleanLead = {
      ...activeLead,
      photoUrls: validPhotos,
    };

    try {
      const res = await fetch("/api/build-prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead: cleanLead, style: styleParam }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Generation failed (${res.status})`);
      }
      const data = (await res.json()) as BuildPromptResult;
      setBuildPrompts({ ...buildPrompts, [activeLead.id]: data });

      // Typewriter effect
      let i = 0;
      const id = activeLead.id;
      const full = data.prompt ?? "";
      setTyped((prev) => ({ ...prev, [id]: "" }));
      const interval = setInterval(() => {
        i += 20;
        setTyped((prev) => ({ ...prev, [id]: full.slice(0, i) }));
        if (i >= full.length) clearInterval(interval);
      }, 10);

      toast.success("Website prompt generated");
    } catch (e) {
      setError((e as Error).message ?? "Unknown error");
      toast.error("Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function generateAllRemaining() {
    const styleParam = styles.length > 0 ? styles.join("+") : "ai-decides";
    const remaining = ranked.filter((l) => !buildPrompts[l.id]);
    if (remaining.length === 0) {
      toast.info("All leads already generated!");
      return;
    }
    setBatchRunning(true);
    batchCancelRef.current = false;
    setBatchProgress({ done: 0, total: remaining.length });
    let localPrompts = { ...buildPrompts };
    for (let i = 0; i < remaining.length; i++) {
      if (batchCancelRef.current) break;
      const lead = remaining[i];
      try {
        const res = await fetch("/api/build-prompt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lead, style: styleParam }),
        });
        if (res.ok) {
          const data = (await res.json()) as BuildPromptResult;
          localPrompts = { ...localPrompts, [lead.id]: data };
          setBuildPrompts(localPrompts);
        }
      } catch {
        /* skip failed lead */
      }
      setBatchProgress({ done: i + 1, total: remaining.length });
    }
    setBatchRunning(false);
    setBatchProgress(null);
    toast.success("Done generating remaining prompts!");
  }

  function stopBatch() {
    batchCancelRef.current = true;
  }

  function copyPrompt() {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    toast.success("Website prompt copied — ready for Groq/Gemini compiler");
    setTimeout(() => setCopiedPrompt(false), 2000);
  }

  const isAIDecides = styles.includes("ai-decides");

  const filteredLeads = ranked.filter((l) => {
    const q = sidebarSearch.toLowerCase();
    return (
      !q ||
      l.name.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q) ||
      l.category.toLowerCase().includes(q)
    );
  });

  return (
    <PhaseShell
      title="Phase 5 — Architect & Preview"
      subtitle={`Synthesize 2027 visual mockups & complete website prompts for each lead. ${doneCount}/${ranked.length} prompts built.`}
      onPrev={onPrev}
      onNext={onNext}
      nextLabel="Studio"
      nextDisabled={doneCount === 0}
    >
      {/* ── MOBILE LEAD SELECTOR STRIP (< lg) ── */}
      <div className="lg:hidden mb-4">
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg shrink-0"
                onClick={() => goToIndex(activeIndex - 1)}
                disabled={activeIndex <= 0}
                aria-label="Previous lead"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg shrink-0"
                onClick={() => goToIndex(activeIndex + 1)}
                disabled={activeIndex >= ranked.length - 1}
                aria-label="Next lead"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground ml-1">
                {activeIndex + 1} of {ranked.length}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setMobilePickerOpen(true)}
              className="h-8 text-xs font-medium gap-1.5 px-2.5 rounded-lg"
            >
              <ListFilter className="h-3.5 w-3.5 text-primary" />
              <span>All Leads ({ranked.length})</span>
            </Button>
          </div>

          {activeLead && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-foreground truncate">{activeLead.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {activeLead.category} · {activeLead.city}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                {imagePreviews[activeLead.id]?.exists && (
                  <span
                    title="AI Website Preview Image Ready"
                    className="h-4 w-4 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 flex items-center justify-center font-bold text-[9px] shadow-xs"
                  >
                    I
                  </span>
                )}
                {result ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Ready
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    Pending
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MOBILE LEADS DRAWER MODAL ── */}
      {mobilePickerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs lg:hidden animate-in fade-in-0 duration-150">
          <div className="fixed inset-0" onClick={() => setMobilePickerOpen(false)} aria-hidden="true" />
          <div className="relative bg-background border-t border-border rounded-t-2xl max-h-[80vh] flex flex-col shadow-2xl z-10">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Select Lead ({ranked.length})</h3>
                <p className="text-[11px] text-muted-foreground">{doneCount} of {ranked.length} prompts built</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={() => setMobilePickerOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-3 border-b border-border bg-muted/20">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name, city or category…"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-[55vh]">
              {filteredLeads.map((lead) => {
                const isSelected = activeLead?.id === lead.id;
                const isDone = !!buildPrompts[lead.id];
                const originalIndex = ranked.indexOf(lead) + 1;
                return (
                  <button
                    key={lead.id}
                    onClick={() => {
                      selectLead(lead);
                      setMobilePickerOpen(false);
                    }}
                    className={`w-full text-left rounded-xl border p-2.5 transition-colors flex items-center gap-2.5 ${
                      isSelected
                        ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/40 font-medium"
                        : "border-border hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="text-xs tabular-nums text-muted-foreground w-6 shrink-0 font-mono">
                      #{originalIndex}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">{lead.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {lead.category} · {lead.city}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {imagePreviews[lead.id]?.exists && (
                        <span
                          title="AI Website Preview Image Ready"
                          className="h-4 w-4 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 flex items-center justify-center font-bold text-[9px] shadow-xs"
                        >
                          I
                        </span>
                      )}
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-border" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-3 border-t border-border bg-muted/30 flex justify-between items-center">
              {!batchRunning && ranked.filter((l) => !buildPrompts[l.id]).length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMobilePickerOpen(false);
                    generateAllRemaining();
                  }}
                  className="text-xs h-8 text-primary border-primary/30"
                >
                  Generate remaining ({ranked.filter((l) => !buildPrompts[l.id]).length})
                </Button>
              )}
              <Button size="sm" className="text-xs h-8 ml-auto" onClick={() => setMobilePickerOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── DESKTOP & WORKSPACE GRID ── */}
      <div className="grid lg:grid-cols-[280px_1fr] gap-6 items-start">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden lg:flex flex-col gap-3 sticky top-6 bg-card border border-border rounded-xl p-3 shadow-xs">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-foreground">Ranked Leads</span>
            <span className="text-[11px] text-muted-foreground font-medium">
              {doneCount}/{ranked.length} prompts built
            </span>
          </div>

          {!batchRunning && ranked.filter((l) => !buildPrompts[l.id]).length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={generateAllRemaining}
              disabled={generating}
              className="w-full text-xs h-8 font-medium border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
            >
              Generate remaining prompts ({ranked.filter((l) => !buildPrompts[l.id]).length})
            </Button>
          )}

          {doneCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={clearAllPromptsAndPreviews}
              className="w-full text-xs h-7 text-muted-foreground hover:text-destructive"
              title="Reset all generated prompts and image preview data for this session"
            >
              Clear Prompts & Previews
            </Button>
          )}

          {batchRunning && (
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="text-xs text-foreground font-medium">
                  {batchProgress?.done}/{batchProgress?.total}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={stopBatch}
                className="h-6 text-[10px] text-destructive hover:bg-destructive/10 px-2"
              >
                Stop
              </Button>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search leads…"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
            {filteredLeads.map((lead) => {
              const done = !!buildPrompts[lead.id];
              const active = activeLead?.id === lead.id;
              const originalIndex = ranked.indexOf(lead) + 1;
              return (
                <button
                  key={lead.id}
                  onClick={() => {
                    selectLead(lead);
                  }}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-all flex items-center gap-2.5 cursor-pointer ${
                    active
                      ? "border-primary bg-primary/8 text-foreground shadow-2xs font-medium ring-1 ring-primary/30"
                      : "border-border hover:border-primary/40 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-xs tabular-nums w-5 shrink-0 font-mono text-muted-foreground">
                    #{originalIndex}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">{lead.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{lead.category}</div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    {/* Circle with 'I' for AI Image (Point 7) */}
                    {imagePreviews[lead.id]?.exists && (
                      <span
                        title="AI Website Preview Image Ready"
                        className="h-4 w-4 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 flex items-center justify-center font-bold text-[9px] shadow-xs"
                      >
                        I
                      </span>
                    )}
                    {/* Green check for Prompt */}
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 opacity-30" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── MAIN WORKSPACE ── */}
        <main className="min-w-0 space-y-4">
          {activeLead && (
            <>
              {/* Lead & Style Config Header */}
              <Card className="border-border shadow-xs">
                <CardContent className="p-4 sm:p-5 space-y-4">
                  {/* Lead Info Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-border/70">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold font-mono px-2 py-0.5 rounded-md bg-muted text-foreground">
                          #{activeIndex + 1}
                        </span>
                        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
                          {activeLead.name}
                        </h2>
                        {activeLead.rating && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-semibold">
                            <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
                            {activeLead.rating}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {activeLead.category} · {activeLead.address || activeLead.city}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <Badge variant="outline" className="text-xs">
                        {activeLead.website ? "Has website" : "No website"}
                      </Badge>
                    </div>
                  </div>

                  {/* Design Direction (Single Mode: AI Smart Design) */}
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span>Design Direction</span>
                    </div>

                    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 flex items-start justify-between gap-3 shadow-xs">
                      <div className="flex items-start gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">✨ AI Smart Design</span>
                            <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] py-0 px-1.5 font-semibold">
                              Recommended
                            </Badge>
                            <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-mono text-muted-foreground">
                              Auto
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            AI analyzes {activeLead.name}&apos;s niche, reviews, and customer intent to auto-generate the optimal layout, color palette, and conversion funnel.
                          </p>
                        </div>
                      </div>
                      <div className="h-4 w-4 rounded-full border border-primary bg-primary text-primary-foreground flex items-center justify-center shrink-0 mt-1">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </div>
                    </div>
                  </div>

                  {/* Verified business photos showcase (auto-mapped to menu/offerings, not hero) */}
                  {(() => {
                    const allUrls = activeLead.photoUrls ?? [];
                    const loadableUrls = allUrls.slice(0, 6).filter((url) => !brokenPhotos.has(url));
                    if (loadableUrls.length === 0) return null;
                    return (
                      <div className="pt-2.5 pb-1 border-t border-border/60">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Verified Business Offerings ({loadableUrls.length} items detected)
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            Auto-mapped to Menu &amp; Offerings
                          </span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {loadableUrls.map((url, idx) => (
                            <div
                              key={url}
                              className="relative rounded-lg overflow-hidden border border-border shrink-0 group"
                              title={`Item #${idx + 1} — Curated for offerings & gallery showcase`}
                            >
                              <img
                                src={url}
                                alt={`Offering item ${idx + 1}`}
                                className="w-14 h-11 object-cover transition-transform group-hover:scale-105"
                                loading="lazy"
                                onError={() => setBrokenPhotos((prev) => new Set([...prev, url]))}
                              />
                              <span className="absolute bottom-0 inset-x-0 bg-background/90 text-muted-foreground text-[8px] text-center font-medium py-0.5 border-t border-border/40">
                                ITEM {idx + 1}
                              </span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Hero section uses high-res atmospheric visuals &amp; 2027 AI generated mockups. Food &amp; product photos are dedicated to Menu &amp; Showcase sections.
                        </p>
                      </div>
                    );
                  })()}

                  {/* Generation Target & Action Bar */}
                  <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs py-1 px-2.5 bg-muted/40 font-mono text-muted-foreground border-border">
                        HTML5 + Tailwind CSS 2026
                      </Badge>
                      <span className="text-[11px] text-muted-foreground hidden sm:inline">
                        Strict Blueprint for Groq Compiler & Live Preview
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={generate}
                        disabled={generating}
                        className="h-9 px-4 font-semibold text-xs rounded-lg transition-transform active:scale-[0.98] w-full sm:w-auto"
                      >
                        {generating ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Building prompt…
                          </>
                        ) : result ? (
                          <>
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            Regenerate prompt
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            Generate website prompt
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Status / Errors */}
              {generating && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <span className="text-xs sm:text-sm font-medium text-foreground">
                    AI is structuring custom website architecture, copy, and components for {activeLead.name}…
                  </span>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center justify-between text-xs sm:text-sm text-destructive">
                  <span>{error}</span>
                  <Button variant="outline" size="sm" onClick={generate} className="h-7 text-xs">
                    Retry
                  </Button>
                </div>
              )}

              {/* Prompt Output View */}
              {result && !generating && (
                <div className="space-y-4">
                  {/* Generated Prompt Card */}
                  <Card className="border-border shadow-xs">
                    <CardHeader className="p-4 pb-2 border-b border-border/60 flex flex-row items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-semibold">Website Blueprint & Specification</CardTitle>
                        <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-500/10 border-emerald-500/20">
                          Ready for Compiler
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={copyPrompt}
                          className="h-8 text-xs px-3 font-semibold"
                        >
                          {copiedPrompt ? (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 mr-1" />
                              Copy Prompt
                            </>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4">
                      <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono bg-muted/40 rounded-xl p-4 max-h-[460px] overflow-y-auto border border-border">
                        {displayText || prompt}
                        {displayText.length < prompt.length && <span className="animate-pulse">▌</span>}
                      </pre>
                      <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                        <span>{prompt.length} characters</span>
                        <span>Compiled directly into live preview below</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Pitch Points */}
                  {pitchPoints.length > 0 && (
                    <Card className="border-border shadow-xs">
                      <CardHeader className="p-4 pb-2 border-b border-border/60">
                        <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
                          <span>💡</span> Pitch Points for the Business Owner
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4">
                        <ul className="space-y-2">
                          {pitchPoints.map((p, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {/* Extra Pages */}
                  {result?.extraPages && result.extraPages.length > 0 && (
                    <Card className="border-border shadow-xs">
                      <CardHeader className="p-4 pb-2 border-b border-border/60">
                        <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
                          <Palette className="h-3.5 w-3.5 text-primary" />
                          <span>Upsell Pages for {activeLead.name}</span>
                        </CardTitle>
                        <p className="text-[11px] text-muted-foreground">
                          Additional pages you can build to increase the deal value.
                        </p>
                      </CardHeader>
                      <CardContent className="p-4 space-y-2.5">
                        {result.extraPages.map((page: ExtraPage) => {
                          const key = `${activeLead.id}:${page.id}`;
                          const ep = extraPagePrompts[key];
                          return (
                            <div
                              key={page.id}
                              className="rounded-xl border border-border p-3 hover:border-primary/30 transition-colors bg-muted/20"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="text-lg">{page.icon}</span>
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-foreground">{page.label}</div>
                                    <div className="text-[10px] text-muted-foreground truncate">{page.desc}</div>
                                  </div>
                                </div>
                                <div className="shrink-0">
                                  {ep?.generating ? (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Loader2 className="h-3 w-3 animate-spin" /> Generating…
                                    </div>
                                  ) : ep?.prompt ? (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs px-2"
                                      onClick={() => {
                                        navigator.clipboard.writeText(ep.prompt);
                                        toast.success(`${page.label} prompt copied!`);
                                      }}
                                    >
                                      <Copy className="h-3 w-3 mr-1" />
                                      Copy
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant={subPageUrls[key] ? "default" : "secondary"}
                                      className="h-7 text-xs px-2.5 font-medium"
                                      disabled={subPageCompiling[key]}
                                      onClick={async () => {
                                        if (subPageUrls[key]) {
                                          window.open(subPageUrls[key], "_blank");
                                          return;
                                        }
                                        setSubPageCompiling((prev) => ({ ...prev, [key]: true }));
                                        try {
                                          const res = await fetch("/api/generate-preview", {
                                            method: "POST",
                                            headers: { "content-type": "application/json" },
                                            body: JSON.stringify({
                                              lead: activeLead,
                                              buildPrompt: ep.prompt,
                                              pageType: page.id,
                                              mode: "desktop",
                                              force: true,
                                            }),
                                          });
                                          const data = await res.json();
                                          const previewLink = data.previewUrl || data.desktopUrl || data.htmlUrl;
                                          if (data.ok && previewLink) {
                                            setSubPageUrls((prev) => ({ ...prev, [key]: previewLink }));
                                            toast.success(`${page.label} mockup generated! Opening now...`);
                                            window.open(previewLink, "_blank");
                                          } else {
                                            toast.error(data.error ?? "Failed to generate sub-page mockup");
                                          }
                                        } catch {
                                          toast.error("Generation error");
                                        } finally {
                                          setSubPageCompiling((prev) => ({ ...prev, [key]: false }));
                                        }
                                      }}
                                    >
                                      {subPageCompiling[key] ? (
                                        <>
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          Generating…
                                        </>
                                      ) : subPageUrls[key] ? (
                                        <>
                                          <ExternalLink className="h-3 w-3 mr-1 text-emerald-400" />
                                          View Mockup
                                        </>
                                      ) : (
                                        <>
                                          <ExternalLink className="h-3 w-3 mr-1" />
                                          Generate Mockup
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs px-2.5"
                                      onClick={async () => {
                                        setExtraPagePrompts((prev) => ({
                                          ...prev,
                                          [key]: { prompt: "", generating: true },
                                        }));
                                        try {
                                          const r = await fetch("/api/build-prompt", {
                                            method: "POST",
                                            headers: { "content-type": "application/json" },
                                            body: JSON.stringify({
                                              lead: activeLead,
                                              style: styles.join("+"),
                                              pageType: page.id,
                                              pageLabel: page.label,
                                            }),
                                          });
                                          const d = await r.json();
                                          setExtraPagePrompts((prev) => ({
                                            ...prev,
                                            [key]: { prompt: d.prompt ?? "", generating: false },
                                          }));
                                          toast.success(`${page.label} prompt ready!`);
                                        } catch {
                                          setExtraPagePrompts((prev) => ({
                                            ...prev,
                                            [key]: { prompt: "", generating: false },
                                          }));
                                        }
                                      }}
                                    >
                                      <Sparkles className="h-3 w-3 mr-1" />
                                      Generate
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {ep?.prompt && (
                                <div className="mt-2">
                                  <pre className="text-[10px] bg-background rounded-lg p-2.5 max-h-24 overflow-y-auto whitespace-pre-wrap border border-border font-mono">
                                    {ep.prompt.slice(0, 300)}…
                                  </pre>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  )}

                  {/* Navigation footer */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-card">
                    <div className="text-xs text-muted-foreground">
                      Prompts are saved automatically for final export in Phase 7.
                    </div>
                    {activeIndex < ranked.length - 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => goToIndex(activeIndex + 1)}
                        className="text-xs font-semibold gap-1 h-8 sm:ml-auto"
                      >
                        Next Lead (#{activeIndex + 2}) <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!result && !generating && !error && (
                <Card className="border-dashed border-2 border-border/80">
                  <CardContent className="py-12 px-4 text-center">
                    <div className="h-11 w-11 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center mb-3">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold text-foreground">Ready to generate website prompt</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                      AI will analyze <strong>{activeLead.name}</strong>, their category ({activeLead.category}),
                      and customer reviews to generate a complete 2026 website prompt.
                    </p>
                    <Button onClick={generate} className="mt-4 h-9 px-5 text-xs font-semibold">
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate prompt now
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Website Preview Generator */}
              <PreviewPanel
                ranked={ranked}
                activeLead={activeLead}
                buildPrompts={buildPrompts}
                sessionId={sessionId}
                onPreviewUpdated={(leadId, status) => {
                  if (status.state === "done") {
                    setImagePreviews((prev) => ({ ...prev, [leadId]: { exists: true } }));
                  }
                }}
              />
            </>
          )}
        </main>
      </div>
    </PhaseShell>
  );
}
