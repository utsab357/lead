"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PhaseShell } from "./PhaseShell";
import { IncompleteState } from "./IncompleteState";
import { Copy, ExternalLink, Sparkles, CheckCircle2, ChevronRight, Loader2, Globe2, Palette } from "lucide-react";
import type { RankedLead, BuildPromptResult } from "@/lib/types";
import { toast } from "sonner";

const PLATFORMS = [
  { id: "stitch",     label: "Google Stitch", url: "https://stitch.withgoogle.com" },
  { id: "lovable",    label: "Lovable",       url: "https://lovable.dev" },
  { id: "bolt",       label: "Bolt.new",      url: "https://bolt.new" },
  { id: "claude-code",label: "Claude Code",   url: "https://claude.com/claude-code" },
  { id: "codex",      label: "Codex",         url: "https://chat.openai.com" },
];

const STYLE_PRESETS = [
  { id: "professional", label: "Professional",  desc: "Clean, trustworthy, corporate — ideal for clinics, lawyers, CA firms" },
  { id: "modern",       label: "Modern",         desc: "Sleek dark/light, minimal white space, subtle gradients" },
  { id: "animated",     label: "Animated",       desc: "Scroll animations, hover effects, micro-interactions" },
  { id: "warm",         label: "Warm & Friendly", desc: "Earthy tones, rounded corners, welcoming — great for food/retail" },
  { id: "luxury",       label: "Luxury",          desc: "Dark background, gold accents, premium fonts — salons, boutiques" },
  { id: "bold",         label: "Bold & Vibrant",  desc: "Bright colours, strong CTAs, high energy — gyms, events" },
];

export function Phase4Build({
  ranked,
  buildPrompts,
  setBuildPrompts,
  onNext,
  onPrev,
}: {
  ranked: RankedLead[];
  buildPrompts: Record<string, BuildPromptResult>;
  setBuildPrompts: (b: Record<string, BuildPromptResult>) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const [activeLead, setActiveLead] = useState<RankedLead | null>(ranked[0] ?? null);
  const [platform, setPlatform] = useState("stitch");
  const [styles, setStyles] = useState<string[]>(["professional"]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});

  const result = activeLead ? buildPrompts[activeLead.id] : null;
  const prompt = result?.prompt ?? "";
  const displayText = activeLead ? (typed[activeLead.id] ?? prompt) : "";
  const pitchPoints = result?.pitchPoints ?? [];
  const doneCount = Object.keys(buildPrompts).length;

  async function generate() {
    if (!activeLead) return;
    setGenerating(true);
    setError(null);
    const styleParam = styles.length > 0 ? styles.join("+") : "professional";
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
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground px-1 mb-2">Select lead</div>
          {ranked.map((lead, i) => {
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
                <span className="text-xs tabular-nums w-5 shrink-0 text-muted-foreground">#{i + 1}</span>
                <span className="flex-1 text-sm truncate font-medium">{lead.name}</span>
                <div className="shrink-0">
                  {done
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    : <ChevronRight className="h-3.5 w-3.5 opacity-40" />}
                </div>
              </button>
            );
          })}
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

              {/* Style preset picker — multi-select */}
              <div className="mb-4">
                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5" /> Site style <span className="text-muted-foreground/60">(pick 1–3)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {STYLE_PRESETS.map((s) => {
                    const selected = styles.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          if (selected) {
                            // Prevent deselecting all
                            if (styles.length > 1) setStyles(styles.filter((x) => x !== s.id));
                          } else if (styles.length < 3) {
                            setStyles([...styles, s.id]);
                          }
                        }}
                        className={`rounded-lg border px-3 py-2 text-left transition-all relative ${
                          selected
                            ? "border-primary/70 bg-primary/8 ring-1 ring-primary/30"
                            : "border-border hover:border-primary/30 hover:bg-muted/40"
                        }`}
                      >
                        {selected && (
                          <span className="absolute top-1.5 right-1.5 h-4 w-4 bg-primary text-primary-foreground rounded-full text-[9px] flex items-center justify-center font-bold">
                            {styles.indexOf(s.id) + 1}
                          </span>
                        )}
                        <div className="text-sm font-medium pr-4">{s.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{s.desc}</div>
                      </button>
                    );
                  })}
                </div>
                {styles.length > 1 && (
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Combined style: <strong>{styles.map((id) => STYLE_PRESETS.find((s) => s.id === id)?.label).join(" + ")}</strong>
                  </p>
                )}
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
