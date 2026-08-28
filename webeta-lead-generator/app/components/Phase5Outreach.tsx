"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PhaseShell } from "./PhaseShell";
import { IncompleteState } from "./IncompleteState";
import { MessageCircle, Mail, Camera, Copy, ExternalLink, Clock, Sparkles, Loader2, CheckCircle2, ChevronRight, Search } from "lucide-react";
import type { RankedLead, OutreachChannel, OutreachLanguage, OutreachResult } from "@/lib/types";
import { toast } from "sonner";

export function Phase5Outreach({
  ranked,
  outreachResults,
  setOutreachResults,
  onNext,
  onPrev,
  initialLeadId,
}: {
  ranked: RankedLead[];
  outreachResults: Record<string, OutreachResult>;
  setOutreachResults: (r: Record<string, OutreachResult>) => void;
  onNext?: () => void;
  onPrev: () => void;
  initialLeadId?: string | null;
}) {
  const [activeLead, setActiveLead] = useState<RankedLead | null>(
    (initialLeadId ? ranked.find(l => l.id === initialLeadId) : null) ?? ranked[0] ?? null
  );
  const [channel, setChannel] = useState<OutreachChannel>("whatsapp");
  const [lang, setLang] = useState<OutreachLanguage>("hinglish");
  const [generating, setGenerating] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{done:number;total:number} | null>(null);
  const batchCancelRef = { current: false };
  const [error, setError] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");

  // Local edits to message and followup (keyed by leadId)
  const [localEdits, setLocalEdits] = useState<Record<string, { message: string; followUp: string }>>({});

  const result = activeLead ? outreachResults[activeLead.id] : null;
  const localEdit = activeLead ? localEdits[activeLead.id] : null;
  const message = localEdit?.message ?? result?.first ?? "";
  const followUp = localEdit?.followUp ?? result?.followUp ?? "";
  const bestSendTime = result?.bestSendTime ?? "";

  if (ranked.length === 0) {
    return (
      <PhaseShell
        title="Phase 5 — Outreach"
        subtitle="AI writes personalized first message + day-3 follow-up for each lead."
        onPrev={onPrev}
        onNext={onNext}
        nextLabel="Build site"
      >
        <IncompleteState
          title="No ranked leads yet"
          description="Run Phases 1–3 first to get ranked leads, then generate personalized outreach here."
          prevPhaseLabel="Rank"
          onPrev={onPrev}
        />
      </PhaseShell>
    );
  }

  async function generate() {
    if (!activeLead) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lead: activeLead, channel, language: lang }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Draft failed (${res.status})`);
      }
      const data = await res.json() as OutreachResult;
      setOutreachResults({ ...outreachResults, [activeLead.id]: data });
      setLocalEdits((prev) => { const n = { ...prev }; delete n[activeLead.id]; return n; });
      toast.success("AI drafted your outreach");
    } catch (e) {
      setError((e as Error).message);
      toast.error("Draft failed");
    } finally {
      setGenerating(false);
    }
  }

  async function generateAllRemaining() {
    const remaining = ranked.filter(l => !outreachResults[l.id]);
    if (remaining.length === 0) { toast.info("All leads already drafted!"); return; }
    setBatchRunning(true);
    batchCancelRef.current = false;
    setBatchProgress({ done: 0, total: remaining.length });
    let localResults = { ...outreachResults };
    for (let i = 0; i < remaining.length; i++) {
      if (batchCancelRef.current) break;
      const lead = remaining[i];
      try {
        const res = await fetch("/api/outreach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lead, channel, language: lang }),
        });
        if (res.ok) {
          const data = await res.json() as OutreachResult;
          localResults = { ...localResults, [lead.id]: data };
          setOutreachResults(localResults);
        }
      } catch { /* skip failed lead, continue */ }
      setBatchProgress({ done: i + 1, total: remaining.length });
    }
    setBatchRunning(false);
    setBatchProgress(null);
    toast.success("Done generating remaining outreach!");
  }

  function stopBatch() { batchCancelRef.current = true; }

  function updateMessage(val: string) {
    if (!activeLead) return;
    setLocalEdits((prev) => ({ ...prev, [activeLead.id]: { ...prev[activeLead.id], message: val, followUp: prev[activeLead.id]?.followUp ?? followUp } }));
  }

  function updateFollowUp(val: string) {
    if (!activeLead) return;
    setLocalEdits((prev) => ({ ...prev, [activeLead.id]: { ...prev[activeLead.id], followUp: val, message: prev[activeLead.id]?.message ?? message } }));
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  function openChannel() {
    if (!activeLead) return;
    if (channel === "whatsapp" && activeLead.whatsapp) {
      const num = activeLead.whatsapp.replace(/\D/g, "");
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(message)}`, "_blank");
    } else if (channel === "email" && activeLead.email) {
      const subject = lang === "hinglish" ? "Aapke business ke liye ek website demo banayi hai" : "Built a website demo for your business";
      window.open(`mailto:${activeLead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`, "_blank");
    } else if (channel === "instagram") {
      window.open(`https://instagram.com/`, "_blank");
    } else {
      toast.error("No contact for this channel");
    }
  }

  const channels: { id: OutreachChannel; label: string; icon: typeof MessageCircle; enabled: boolean }[] = activeLead ? [
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, enabled: !!activeLead.whatsapp },
    { id: "email", label: "Email", icon: Mail, enabled: !!activeLead.email },
    { id: "instagram", label: "Instagram", icon: Camera, enabled: true },
  ] : [];

  const doneCount = Object.keys(outreachResults).length;

  return (
    <PhaseShell
      title="Phase 5 — Outreach"
      subtitle={`AI writes a personalized first touch + day-3 follow-up for each lead. ${doneCount}/${ranked.length} drafted.`}
      onPrev={onPrev}
      onNext={onNext}
      nextLabel="Build site"
      nextDisabled={doneCount === 0}
    >
      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        {/* Lead picker sidebar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Select lead</div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] text-muted-foreground">{doneCount}/{ranked.length} drafted</div>
              {!batchRunning && ranked.filter(l => !outreachResults[l.id]).length > 0 && (
                <button
                  onClick={generateAllRemaining}
                  disabled={generating}
                  className="text-[10px] px-2 py-0.5 rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                >
                  Generate remaining ({ranked.filter(l => !outreachResults[l.id]).length})
                </button>
              )}
              {batchRunning && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{batchProgress?.done}/{batchProgress?.total}</span>
                  <button onClick={stopBatch} className="text-[10px] px-2 py-0.5 rounded border border-destructive/30 text-destructive hover:bg-destructive/5 transition-colors">Stop</button>
                </div>
              )}
            </div>
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
              .map((lead, i) => {
                const done = !!outreachResults[lead.id];
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
                    <div className="shrink-0 flex items-center gap-1">
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
              {/* Lead info + controls */}
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Drafting for</div>
                  <div className="font-display text-xl mt-1">{activeLead.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {activeLead.phone}{activeLead.email ? ` · ${activeLead.email}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="lang" className="text-sm text-muted-foreground">English</Label>
                  <Switch id="lang" checked={lang === "hinglish"} onCheckedChange={(c) => setLang(c ? "hinglish" : "english")} />
                  <Label htmlFor="lang" className="text-sm">Hinglish</Label>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex gap-2">
                  {channels.map(({ id, label, icon: Icon, enabled }) => (
                    <Button key={id} variant={channel === id ? "default" : "outline"} size="sm" disabled={!enabled} onClick={() => setChannel(id)}>
                      <Icon className="h-4 w-4 mr-2" /> {label}
                    </Button>
                  ))}
                </div>
                <Button onClick={generate} disabled={generating} className="h-10 px-4">
                  {generating
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Writing…</>
                    : result ? "Regenerate" : "Draft outreach"}
                </Button>
              </div>

              {generating && (
                <div className="mb-4 rounded-lg border border-border bg-card p-4 flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <span className="text-sm">AI is writing outreach for {activeLead.name}…</span>
                </div>
              )}
              {error && (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                  {error}
                  <Button variant="outline" size="sm" className="ml-3" onClick={generate}>Retry</Button>
                </div>
              )}

              {!result && !generating && !error && (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <div className="h-10 w-10 rounded-full bg-primary/10 mx-auto flex items-center justify-center mb-3">
                      <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.5} />
                    </div>
                    <div className="font-display text-lg mb-1">Pick a channel + language</div>
                    <p className="text-sm text-muted-foreground">Then hit &ldquo;Draft outreach&rdquo; — you&apos;ll get a first message and a day-3 follow-up.</p>
                  </CardContent>
                </Card>
              )}

              {(result || localEdit) && !generating && (
                <>
                  <div className="grid lg:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-base">First message</CardTitle>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => copy(message)}><Copy className="h-3.5 w-3.5 mr-1.5" />Copy</Button>
                          <Button size="sm" onClick={openChannel}><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Send</Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Textarea value={message} onChange={(e) => updateMessage(e.target.value)} className="font-mono text-sm min-h-[260px]" />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-base">Day-3 follow-up</CardTitle>
                        <Button size="sm" variant="outline" onClick={() => copy(followUp)}><Copy className="h-3.5 w-3.5 mr-1.5" />Copy</Button>
                      </CardHeader>
                      <CardContent>
                        <Textarea value={followUp} onChange={(e) => updateFollowUp(e.target.value)} className="font-mono text-sm min-h-[260px]" />
                      </CardContent>
                    </Card>
                  </div>
                  {bestSendTime && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" strokeWidth={1.5} /> {bestSendTime}
                    </div>
                  )}
                  {doneCount > 0 && (
                    <div className="mt-4 flex items-center gap-2">
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {doneCount}/{ranked.length} leads drafted
                      </Badge>
                      <span className="text-xs text-muted-foreground">— all drafts export to Phase 7</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </PhaseShell>
  );
}
