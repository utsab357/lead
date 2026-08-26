"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { PhaseShell } from "./PhaseShell";
import { IncompleteState } from "./IncompleteState";
import { AlertTriangle, IndianRupee, Gauge, Star, Phone, MessageCircle, Globe, CheckCircle2, XCircle, Loader2, Clock, Filter } from "lucide-react";
import type { Lead, AuditResult } from "@/lib/types";
import { toast } from "sonner";

const BATCH_SIZE = 5;

interface Progress {
  done:          number;
  total:         number;
  batchNum:      number;
  totalBatches:  number;
  status:        "running" | "waiting" | "done" | "error";
  statusMsg:     string;
  errors:        string[];
}

export function Phase2Audit({
  leads,
  audits,
  setAudits,
  onNext,
  onPrev,
}: {
  leads:     Lead[];
  audits:    Record<string, AuditResult>;
  setAudits: (a: Record<string, AuditResult>) => void;
  onNext:    () => void;
  onPrev:    () => void;
}) {
  const [running,     setRunning]     = useState(false);
  const [progress,    setProgress]    = useState<Progress | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter,      setFilter]      = useState<"all" | "no-site" | "has-site">("all");

  useEffect(() => { setSelectedIds(new Set(leads.map((l) => l.id))); }, [leads]);

  // Filter leads based on website status
  const filteredLeads = leads.filter((l) => {
    if (filter === "no-site")  return !l.website;
    if (filter === "has-site") return !!l.website;
    return true;
  });

  const allSelected  = filteredLeads.length > 0 && filteredLeads.every(l => selectedIds.has(l.id));
  const someSelected = filteredLeads.some(l => selectedIds.has(l.id)) && !allSelected;

  function toggleOne(id: string) {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (allSelected) {
        filteredLeads.forEach(l => n.delete(l.id));
      } else {
        filteredLeads.forEach(l => n.add(l.id));
      }
      return n;
    });
  }

  function selectFilter(f: "all" | "no-site" | "has-site") {
    setFilter(f);
    // Auto-select all in the new filter group
    setSelectedIds((prev) => {
      const n = new Set(prev);
      const group = leads.filter((l) => {
        if (f === "no-site")  return !l.website;
        if (f === "has-site") return !!l.website;
        return true;
      });
      // Clear previous, select all in this group
      n.clear();
      group.forEach(l => n.add(l.id));
      return n;
    });
  }

  async function runAudit() {
    const targets = leads.filter((l) => selectedIds.has(l.id));
    if (targets.length === 0) { toast.error("Select at least one lead to audit"); return; }

    // Split into client-side batches
    const batches: Lead[][] = [];
    for (let i = 0; i < targets.length; i += BATCH_SIZE) batches.push(targets.slice(i, i + BATCH_SIZE));

    setRunning(true);
    const errors: string[] = [];
    let localAudits = { ...audits };

    setProgress({ done: 0, total: targets.length, batchNum: 0, totalBatches: batches.length, status: "running", statusMsg: "Starting…", errors: [] });

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      const batchNum = bi + 1;

      setProgress(p => ({
        ...p!,
        batchNum,
        status:    "running",
        statusMsg: `Auditing leads ${bi * BATCH_SIZE + 1}–${Math.min((bi + 1) * BATCH_SIZE, targets.length)} of ${targets.length}…`,
        errors,
      }));

      try {
        const res = await fetch("/api/audit", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ leads: batch }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          const errMsg = body.error ?? `Batch ${batchNum} failed`;

          // Check if it's a rate-limit / wait message — show in UI, don't abort
          if (errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("wait")) {
            errors.push(`Batch ${batchNum}: rate limited — auto-retrying…`);
            setProgress(p => ({ ...p!, status: "waiting", statusMsg: "Rate limited — waiting 65s for reset…", errors: [...errors] }));
            await new Promise(r => setTimeout(r, 65000));
            bi--; // retry this batch
            continue;
          }

          errors.push(`Batch ${batchNum}: ${errMsg.slice(0, 120)}`);
          setProgress(p => ({ ...p!, errors: [...errors] }));
          continue; // skip this batch, continue with others
        }

        const data = await res.json() as { audits: Record<string, AuditResult> };
        localAudits = { ...localAudits, ...data.audits };
        setAudits(localAudits); // update UI immediately — cards light up

        const done = Math.min((bi + 1) * BATCH_SIZE, targets.length);
        setProgress(p => ({ ...p!, done, status: "running", statusMsg: `✓ ${done} of ${targets.length} audited`, errors }));

      } catch (e) {
        const errMsg = (e as Error).message?.slice(0, 120) ?? "Network error";
        errors.push(`Batch ${batchNum}: ${errMsg}`);
        setProgress(p => ({ ...p!, errors: [...errors] }));
      }

      // Small pause between batches to respect rate limits
      if (bi < batches.length - 1) await new Promise(r => setTimeout(r, 1500));
    }

    const finalDone = Object.keys(localAudits).length;
    setProgress(p => ({
      ...p!,
      done:      targets.length,
      status:    errors.length > 0 ? "error" : "done",
      statusMsg: errors.length > 0
        ? `Finished with ${errors.length} error${errors.length > 1 ? "s" : ""} — ${finalDone} leads audited`
        : `All ${targets.length} leads audited successfully`,
      errors,
    }));
    setRunning(false);

    if (errors.length === 0) toast.success(`Audited ${targets.length} leads`);
    else toast.warning(`Audited with ${errors.length} error${errors.length > 1 ? "s" : ""} — check details below`);
  }

  const auditedCount = Object.keys(audits).length;
  const totalLost    = Object.values(audits).reduce((s, a) => s + (a?.estLostRevenuePerMonth ?? 0), 0);
  const pct          = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  if (leads.length === 0) {
    return (
      <PhaseShell title="Phase 2 — Business audit" subtitle="PageSpeed, mobile readiness, schema, gaps + AI-summarized biggest opportunity." onPrev={onPrev} onNext={onNext} nextDisabled nextLabel="Rank prospects">
        <IncompleteState title="No leads to audit yet" description="Phase 1 hasn't been run. Go back, run the scraper, and we'll audit each business here." prevPhaseLabel="Scrape" onPrev={onPrev} />
      </PhaseShell>
    );
  }

  return (
    <PhaseShell title="Phase 2 — Business audit" subtitle="PageSpeed, mobile readiness, schema, gaps + AI-summarized biggest opportunity. Estimated revenue left on the table." onPrev={onPrev} onNext={onNext} nextDisabled={auditedCount === 0} nextLabel="Rank prospects">

      {/* Stats row */}
      <div className="grid md:grid-cols-4 gap-3 mb-6">
        <Card><CardContent className="pt-6">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Audited</div>
          <div className="font-display text-3xl tabular-nums mt-2">{auditedCount}<span className="text-muted-foreground/50 text-2xl"> / {leads.length}</span></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">No site at all</div>
          <div className="font-display text-3xl tabular-nums text-[color:var(--destructive)] mt-2">{Object.values(audits).filter((a) => !a.hasWebsite).length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Avg PageSpeed <span className="normal-case tracking-normal text-[10px] opacity-60">(est.)</span></div>
          <div className="font-display text-3xl tabular-nums mt-2">{auditedCount ? Math.round(Object.values(audits).reduce((s, a) => s + a.pageSpeedScore, 0) / auditedCount) : 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Est. ₹ lost / month</div>
          <div className="font-display text-3xl tabular-nums flex items-center mt-2"><IndianRupee className="h-6 w-6" strokeWidth={1.5} />{totalLost.toLocaleString("en-IN")}</div>
        </CardContent></Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label={allSelected ? "Deselect all" : "Select all"} />
            <span className="text-sm">
              {selectedIds.size === 0 ? "Select leads" : someSelected ? `${selectedIds.size} of ${filteredLeads.length} selected` : `All ${filteredLeads.length} selected`}
            </span>
          </label>

          {/* Filter chips */}
          <div className="flex items-center gap-1 ml-2 border-l border-border pl-3">
            <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" strokeWidth={1.5} />
            {(["all", "no-site", "has-site"] as const).map((f) => {
              const count = f === "all" ? leads.length : f === "no-site" ? leads.filter(l => !l.website).length : leads.filter(l => !!l.website).length;
              const label = f === "all" ? "All" : f === "no-site" ? "No site" : "Has site";
              return (
                <button
                  key={f}
                  onClick={() => selectFilter(f)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    filter === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
        </div>
        <Button onClick={runAudit} disabled={running || selectedIds.size === 0} className="h-10 px-4">
          {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Auditing…</> : `Run audit on ${selectedIds.size} selected`}
        </Button>
      </div>

      {/* Live progress panel */}
      <AnimatePresence>
        {progress && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-6 rounded-lg border border-border bg-card p-4 space-y-3">

            {/* Header row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                {progress.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {progress.status === "waiting" && <Clock className="h-4 w-4 text-[color:var(--chart-4)]" />}
                {progress.status === "done"    && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {progress.status === "error"   && <XCircle className="h-4 w-4 text-[color:var(--destructive)]" />}
                <span>{progress.statusMsg}</span>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                Batch {progress.batchNum} / {progress.totalBatches}
              </span>
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <Progress value={pct} className="h-2" />
              <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                <span>{progress.done} leads done</span>
                <span>{pct}%</span>
              </div>
            </div>

            {/* Per-batch status dots */}
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: progress.totalBatches }).map((_, i) => {
                const batchDone     = i < progress.batchNum - 1;
                const batchCurrent  = i === progress.batchNum - 1 && progress.status === "running";
                const batchWaiting  = i === progress.batchNum - 1 && progress.status === "waiting";
                const batchPending  = i >= progress.batchNum;
                const startLead     = i * BATCH_SIZE + 1;
                const endLead       = Math.min((i + 1) * BATCH_SIZE, progress.total);
                return (
                  <div
                    key={i}
                    title={`Batch ${i + 1}: leads ${startLead}–${endLead}`}
                    className={`h-6 rounded text-[10px] font-mono flex items-center justify-center px-2 transition-all duration-300 ${
                      batchDone    ? "bg-green-500/15 text-green-600 border border-green-500/30" :
                      batchCurrent ? "bg-primary/15 text-primary border border-primary/40 animate-pulse" :
                      batchWaiting ? "bg-yellow-500/15 text-yellow-600 border border-yellow-500/30" :
                      batchPending ? "bg-muted text-muted-foreground border border-border" : ""
                    }`}
                  >
                    {startLead}–{endLead}
                  </div>
                );
              })}
            </div>

            {/* Errors (if any) */}
            {progress.errors.length > 0 && (
              <div className="rounded-md border border-[color:var(--destructive)]/30 bg-[color:var(--destructive)]/5 p-3 space-y-1">
                <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--destructive)] font-medium mb-1">Errors</div>
                {progress.errors.map((e, i) => (
                  <div key={i} className="text-xs text-[color:var(--destructive)]/80 font-mono">{e}</div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lead cards grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredLeads.map((lead, i) => {
          const a          = audits[lead.id];
          const isSelected = selectedIds.has(lead.id);
          const isRunning  = running && selectedIds.has(lead.id) && !a;
          return (
            <motion.div key={lead.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
              <Card className={`h-full transition-all duration-300 ${a ? "border-green-500/20 bg-green-500/[0.02]" : isRunning ? "border-primary/40 animate-pulse" : isSelected ? "border-primary/30" : "hover:border-primary/20"}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(lead.id)} aria-label={`Select ${lead.name} for audit`} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-medium leading-snug">{lead.name}</CardTitle>
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mt-0.5">{lead.category}</p>
                    </div>
                    {a && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />}
                    {isRunning && <Loader2 className="h-4 w-4 text-primary shrink-0 mt-0.5 animate-spin" />}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-[color:var(--chart-4)] text-[color:var(--chart-4)]" strokeWidth={1.5} />
                      <span className="font-mono tabular-nums">{lead.rating?.toFixed(1) ?? "—"}</span>
                      <span className="text-muted-foreground/70">({lead.reviewsCount ?? 0})</span>
                    </span>
                    {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" strokeWidth={1.5} /><span className="font-mono text-[11px]">{lead.phone.replace(/^\+91 /, "")}</span></span>}
                    {lead.whatsapp && <span className="flex items-center gap-1 text-[color:var(--accent-foreground)]"><MessageCircle className="h-3 w-3" strokeWidth={1.5} /> WA</span>}
                    {lead.website
                      ? <Badge variant="secondary" className="text-[10px] font-normal h-5"><Globe className="h-2.5 w-2.5 mr-1" strokeWidth={1.5} />Has site</Badge>
                      : <Badge variant="outline" className="text-[10px] font-normal h-5 text-[color:var(--destructive)] border-[color:var(--destructive)]/40 bg-[color:var(--destructive)]/5">No site</Badge>
                    }
                  </div>

                  {a ? (
                    <>
                      <div className="flex items-center gap-3 pt-1 border-t border-border/60">
                        <PageSpeedGauge score={a.pageSpeedScore} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">PageSpeed <span className="normal-case tracking-normal opacity-60">(estimated)</span></div>
                          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-2">Est. lost / mo</div>
                          <div className="font-display text-lg tabular-nums flex items-center mt-0.5"><IndianRupee className="h-3.5 w-3.5" strokeWidth={1.5} />{a.estLostRevenuePerMonth.toLocaleString("en-IN")}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {a.gaps.slice(0, 3).map((g) => (
                          <Badge key={g} variant="outline" className="text-[10px] font-normal text-[color:var(--destructive)] border-[color:var(--destructive)]/30 bg-[color:var(--destructive)]/5">{g}</Badge>
                        ))}
                      </div>
                      <div className="rounded-md bg-muted/60 p-2.5 text-xs border border-border">
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--chart-4)] mt-0.5 shrink-0" strokeWidth={1.75} />
                          <span className="text-muted-foreground italic leading-relaxed">{a.biggestGap}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 justify-center border-t border-border/60 pt-3">
                      {isRunning
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…</>
                        : <><Gauge className="h-3.5 w-3.5" strokeWidth={1.5} /> Awaiting audit</>
                      }
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </PhaseShell>
  );
}

function PageSpeedGauge({ score }: { score: number }) {
  const color = score === 0 ? "text-[color:var(--destructive)]" : score < 50 ? "text-[color:var(--destructive)]" : score < 70 ? "text-[color:var(--chart-4)]" : "text-[color:var(--accent-foreground)]";
  const ring  = score === 0 ? "stroke-[color:var(--destructive)]" : score < 50 ? "stroke-[color:var(--destructive)]" : score < 70 ? "stroke-[color:var(--chart-4)]" : "stroke-[color:var(--accent-foreground)]";
  const circumference = 2 * Math.PI * 22;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
        <circle cx="28" cy="28" r="22" className="stroke-muted fill-none" strokeWidth="5" />
        <motion.circle cx="28" cy="28" r="22" fill="none" strokeWidth="5" strokeLinecap="round" className={ring} strokeDasharray={circumference} initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset: offset }} transition={{ duration: 0.8, ease: "easeOut" }} />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums ${color}`}>{score || "—"}</div>
    </div>
  );
}
