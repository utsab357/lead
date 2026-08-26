"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PhaseShell } from "./PhaseShell";
import { IncompleteState } from "./IncompleteState";
import { Loader2, CheckCircle2, ChevronRight, Copy, Sparkles, Search, ExternalLink, Globe2, Palette } from "lucide-react";
import type { RankedLead, BuildPromptResult, ExtraPage } from "@/lib/types";
import { toast } from "sonner";

const PLATFORMS = [
  { id: "stitch",      label: "Google Stitch",  url: "https://stitch.withgoogle.com" },
  { id: "lovable",     label: "Lovable",         url: "https://lovable.dev" },
  { id: "bolt",        label: "Bolt.new",        url: "https://bolt.new" },
  { id: "claude-code", label: "Claude Code",     url: "https://claude.com/claude-code" },
  { id: "codex",       label: "Codex",           url: "https://chat.openai.com" },
];

const STYLE_PRESETS = [
  { id: "professional", label: "Professional",  desc: "Clean, trustworthy, corporate — ideal for clinics, lawyers, CA firms" },
  { id: "modern",       label: "Modern",         desc: "Sleek dark/light, minimal white space, subtle gradients" },
  { id: "animated",     label: "Animated",       desc: "Scroll animations, hover effects, micro-interactions" },
  { id: "warm",         label: "Warm & Friendly", desc: "Earthy tones, rounded corners, welcoming — great for food/retail" },
  { id: "luxury",       label: "Luxury",          desc: "Dark background, gold accents, premium fonts — salons, boutiques" },
  { id: "bold",         label: "Bold & Vibrant",  desc: "Bright colours, strong CTAs, high energy — gyms, events" },
  { id: "ai-decides",   label: "\u2728 AI Decides",  desc: "AI reads the business category, photos & audience — then picks and builds the perfect style automatically" },
];

export function Phase4Build({
  ranked,
  buildPrompts,
  setBuildPrompts,
  onNext,
  onPrev,
  initialLeadId,
}: {
  ranked: RankedLead[];
  buildPrompts: Record<string, BuildPromptResult>;
  setBuildPrompts: (b: Record<string, BuildPromptResult>) => void;
  onNext: () => void;
  onPrev: () => void;
  initialLeadId?: string | null;
}) {
  const [activeLead, setActiveLead] = useState<RankedLead | null>(
    (initialLeadId ? ranked.find(l => l.id === initialLeadId) : null) ?? ranked[0] ?? null
  );
  const [platform, setPlatform] = useState("stitch");
  const [styles, setStyles] = useState<string[]>(["ai-decides"]);
  const [generating, setGenerating] = useState(false);
  const [generatingExtraPages, setGeneratingExtraPages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [extraPagePrompts, setExtraPagePrompts] = useState<Record<string, { prompt: string; generating: boolean }>>({});

  const result = activeLead ? buildPrompts[activeLead.id] : null;
  const prompt = result?.prompt ?? "";
  const displayText = activeLead ? (typed[activeLead.id] ?? prompt) : "";
  const pitchPoints = result?.pitchPoints ?? [];
  const doneCount = Object.keys(buildPrompts).length;

  async function generate() {
    if (!activeLead) return;
    setGenerating(true);
    setError(null);
    const styleParam = styles.length > 0 ? styles.join("+") : "ai-decides";
    try {
      const res = await fetch("/api/build-prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead: activeLead, platform, style: styleParam }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Generation failed (${res.status})`);
      }
      const data = await res.json() as BuildPromptResult;
      setBuildPrompts({ ...buildPrompts, [activeLead.id]: data });

      // Typewriter effect
      let i = 0;
      const id = activeLead.id;
      const full = data.prompt ?? "";
      setTyped((prev) => ({ ...prev, [id]: "" }));
      const interval = setInterval(() => {
        i += 15;
        setTyped((prev) => ({ ...prev, [id]: full.slice(0, i) }));
        if (i >= full.length) clearInterval(interval);
      }, 10);

      toast.success("Website prompt generated");
      // Extra pages are listed below with individual Generate buttons
      // — user clicks only the ones they need (no auto-fire)
    } catch (e) {
      setError((e as Error).message ?? "Unknown error");
      toast.error("Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function copyPrompt() {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt);
    toast.success("Prompt copied — paste into " + PLATFORMS.find((p) => p.id === platform)?.label);
  }

  function openPlatform() {
    const url = PLATFORMS.find((p) => p.id === platform)?.url;
    if (url) window.open(url, "_blank");
  }

  if (ranked.length === 0) {
    return (
      <PhaseShell
        title="Phase 6 — Build Site"
        subtitle="Generate a complete, platform-ready website prompt for each ranked lead."
        onPrev={onPrev}
        onNext={onNext}
        nextDisabled
        nextLabel="Export"
      >
        <IncompleteState
          title="No ranked leads yet"
          description="Run Phases 1–3 first to get ranked leads, then generate website prompts here."
          prevPhaseLabel="Outreach"
          onPrev={onPrev}
        />
      </PhaseShell>
    );
  }

  return (
    <PhaseShell
      title="Phase 6 — Build Site"
      subtitle={`Generate a ready-to-paste website-builder prompt for each lead. ${doneCount}/${ranked.length} done.`}
      onPrev={onPrev}
      onNext={onNext}
      nextLabel="Export"
      nextDisabled={doneCount === 0}
    >
      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        {/* Lead picker sidebar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Select lead</div>
            <div className="text-[10px] text-muted-foreground">{doneCount}/{ranked.length} done</div>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, city…"
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          {/* Scrollable list */}
          <div className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-260px)] pr-0.5">
            {ranked
              .filter(l => {
                const q = sidebarSearch.toLowerCase();
                return !q || l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q) || l.category.toLowerCase().includes(q);
              })
              .map((lead) => {
                const done = !!buildPrompts[lead.id];
                const active = activeLead?.id === lead.id;
                return (
                  <button
                    key={lead.id}
                    onClick={() => { setActiveLead(lead); setError(null); }}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all duration-150 flex items-center gap-2 ${
                      active
                        ? "border-primary/60 bg-primary/5 text-foreground"
                        : "border-border hover:border-primary/30 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="text-xs tabular-nums w-5 shrink-0 text-muted-foreground">#{ranked.indexOf(lead) + 1}</span>
                    <span className="flex-1 text-sm truncate font-medium">{lead.name}</span>
                    <div className="shrink-0">
                      {done
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        : <ChevronRight className="h-3.5 w-3.5 opacity-40" />}
                    </div>
                  </button>
                );
              })}
            {ranked.filter(l => {
              const q = sidebarSearch.toLowerCase();
              return !q || l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q) || l.category.toLowerCase().includes(q);
            }).length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">No leads match "{sidebarSearch}"</div>
            )}
          </div>
        </div>

        {/* Main panel */}
        <div className="min-w-0">
          {activeLead && (
            <>
              {/* Lead info */}
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Generating for</div>
                <div className="font-display text-xl mt-1">{activeLead.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{activeLead.address} · {activeLead.category}</div>
              </div>

              {/* Style preset picker */}
              <div className="mb-4">
                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5" /> Site style <span className="text-muted-foreground/60">(pick 1–3, or let AI decide)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {STYLE_PRESETS.map((s) => {
                    const selected   = styles.includes(s.id);
                    const isAI       = s.id === "ai-decides";
                    const aiSelected = styles.includes("ai-decides");
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          if (isAI) {
                            // AI Decides is exclusive — select only it
                            setStyles(selected ? ["professional"] : ["ai-decides"]);
                          } else {
                            // Selecting a manual style clears AI Decides
                            const base = styles.filter((x) => x !== "ai-decides" && x !== s.id);
                            if (selected) {
                              setStyles(base.length > 0 ? base : ["professional"]);
                            } else if (base.length < 3) {
                              setStyles([...base, s.id]);
                            }
                          }
                        }}
                        className={`rounded-lg border px-3 py-2 text-left transition-all relative ${
                          selected && isAI
                            ? "border-amber-400/70 bg-amber-400/8 ring-1 ring-amber-400/40"
                            : selected
                            ? "border-primary/70 bg-primary/8 ring-1 ring-primary/30"
                            : "border-border hover:border-primary/30 hover:bg-muted/40"
                        }`}
                      >
                        {selected && !isAI && (
                          <span className="absolute top-1.5 right-1.5 h-4 w-4 bg-primary text-primary-foreground rounded-full text-[9px] flex items-center justify-center font-bold">
                            {styles.filter(x => x !== "ai-decides").indexOf(s.id) + 1}
                          </span>
                        )}
                        <div className={`text-sm font-medium pr-4 ${selected && isAI ? "text-amber-500" : ""}`}>{s.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{s.desc}</div>
                      </button>
                    );
                  })}
                </div>
                {styles.includes("ai-decides") ? (
                  <p className="text-[10px] text-amber-600/80 mt-1.5">AI will analyze this business and build the perfect design system automatically.</p>
                ) : styles.length > 1 ? (
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Combined style: <strong>{styles.map((id) => STYLE_PRESETS.find((s) => s.id === id)?.label).join(" + ")}</strong>
                  </p>
                ) : null}
              </div>

              {/* Platform + Generate controls */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <Select value={platform} onValueChange={(v) => v && setPlatform(v)}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={generate} disabled={generating} className="h-10 px-5">
                  {generating
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
                    : <><Sparkles className="h-4 w-4 mr-2" />{result ? "Regenerate" : "Generate prompt"}</>}
                </Button>
                {result && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={openPlatform}>
                      <Globe2 className="h-3.5 w-3.5 mr-1.5" />Open {PLATFORMS.find((p) => p.id === platform)?.label}
                    </Button>
                    <Button size="sm" onClick={copyPrompt}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" />Copy prompt
                    </Button>
                  </div>
                )}
              </div>

              {error && (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                  {error}
                  <Button variant="outline" size="sm" className="ml-3" onClick={generate}>Retry</Button>
                </div>
              )}

              {/* Prompt output */}
              {generating ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Loader2 className="h-6 w-6 mx-auto mb-3 animate-spin text-primary" />
                    <div className="text-sm text-muted-foreground">AI is crafting a {styles.map((id) => STYLE_PRESETS.find((s) => s.id === id)?.label).join(" + ")} prompt for {activeLead.name}…</div>
                  </CardContent>
                </Card>
              ) : result ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-base">Generated prompt</CardTitle>
                      <Badge variant="outline" className="text-[10px]">{styles.map((id) => STYLE_PRESETS.find((s) => s.id === id)?.label).filter(Boolean).join(" + ") || "Custom"}</Badge>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono bg-muted/30 rounded-md p-4 max-h-[480px] overflow-y-auto border border-border">
                        {displayText || prompt}
                        {displayText.length < prompt.length && <span className="animate-pulse">▌</span>}
                      </pre>
                    </CardContent>
                  </Card>

                  {pitchPoints.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Pitch points for the owner</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-1.5">
                          {pitchPoints.map((p, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <ExternalLink className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {/* ── AI-suggested Extra Pages ── */}
                  {result?.extraPages && result.extraPages.length > 0 && (
                    <Card className="border-primary/20">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Palette className="h-4 w-4 text-primary" />
                            More Pages You Can Offer
                          </CardTitle>
                          {generatingExtraPages
                            ? <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400/40 flex items-center gap-1">
                                <Loader2 className="h-2.5 w-2.5 animate-spin" /> Generating all prompts…
                              </Badge>
                            : <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-400/40">
                                <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> All prompts ready
                              </Badge>
                          }
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          AI suggested these for <strong>{activeLead.name}</strong> — all prompts auto-generated, copy and paste into your builder
                        </p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {result.extraPages.map((page: ExtraPage) => {
                          const key = `${activeLead.id}:${page.id}`;
                          const ep = extraPagePrompts[key];
                          return (
                            <div key={page.id} className="rounded-lg border border-border p-3 hover:border-primary/30 hover:bg-muted/30 transition-colors">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 min-w-0">
                                  <span className="text-xl shrink-0">{page.icon}</span>
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium">{page.label}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{page.desc}</div>
                                  </div>
                                </div>
                                <div className="shrink-0">
                                  {ep?.generating
                                    ? <div className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Generating…</div>
                                    : ep?.prompt
                                      ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(ep.prompt); toast.success(`${page.label} prompt copied!`); }}>
                                          <Copy className="h-3 w-3 mr-1" />Copy
                                        </Button>
                                      : <Button size="sm" className="h-7 text-xs" onClick={async () => {
                                          setExtraPagePrompts(prev => ({ ...prev, [key]: { prompt: "", generating: true } }));
                                          try {
                                            const r = await fetch("/api/build-prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead: activeLead, platform, style: styles.join("+"), pageType: page.id, pageLabel: page.label }) });
                                            const d = await r.json();
                                            setExtraPagePrompts(prev => ({ ...prev, [key]: { prompt: d.prompt ?? "", generating: false } }));
                                            toast.success(`${page.label} prompt ready!`);
                                          } catch { setExtraPagePrompts(prev => ({ ...prev, [key]: { prompt: "", generating: false } })); }
                                        }}>
                                          <Sparkles className="h-3 w-3 mr-1" />Generate
                                        </Button>
                                  }
                                </div>
                              </div>
                              {ep?.prompt && (
                                <div className="mt-2">
                                  <pre className="text-[10px] bg-muted/50 rounded p-2 max-h-28 overflow-y-auto whitespace-pre-wrap border border-border font-mono">
                                    {ep.prompt.slice(0, 400)}…
                                  </pre>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  )}

                  {doneCount > 0 && (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {doneCount}/{ranked.length} prompts generated
                      </Badge>
                      <span className="text-xs text-muted-foreground">— all export to Phase 7</span>
                    </div>
                  )}
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <Sparkles className="h-6 w-6 mx-auto mb-3 text-muted-foreground/50" strokeWidth={1.5} />
                    <div className="font-display text-lg mb-1">Pick a style + platform</div>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      Then hit <span className="text-foreground font-medium">Generate prompt</span> — you&apos;ll get a full,
                      personalized builder prompt using real business data.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </PhaseShell>
  );
}
