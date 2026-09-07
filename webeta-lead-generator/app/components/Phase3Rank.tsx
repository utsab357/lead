"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PhaseShell } from "./PhaseShell";
import { IncompleteState } from "./IncompleteState";
import { Crown, IndianRupee, MessageCircle, Phone, Mail, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import type { Lead, AuditResult, RankedLead } from "@/lib/types";
import { toast } from "sonner";
import { useDuplicateIndex, normalizePhone } from "@/hooks/useDuplicateIndex";

export function Phase3Rank({
  leads,
  audits,
  ranked,
  setRanked,
  selectedId,
  setSelectedId,
  onNext,
  onPrev,
  sessionId,
}: {
  leads: Lead[];
  audits: Record<string, AuditResult>;
  ranked: RankedLead[];
  setRanked: (r: RankedLead[]) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onNext: () => void;
  onPrev: () => void;
  sessionId?: string | null;
}) {
  const BATCH_SIZE = 5;
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancelRef = useRef(false);
  const duplicates = useDuplicateIndex(sessionId);

  // Filter state
  const [search,      setSearch]      = useState("");
  const [scoreRange,  setScoreRange]  = useState<"all" | "high" | "mid" | "low">("all");
  const [siteFilter,  setSiteFilter]  = useState<"all" | "none" | "poor" | "ok">("all");
  const [fPhone,      setFPhone]      = useState(false);

  const hasFilter = search || scoreRange !== "all" || siteFilter !== "all" || fPhone;

  function applyFilters(lead: RankedLead) {
    if (search && !lead.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (scoreRange === "high" && lead.score < 60)  return false;
    if (scoreRange === "mid"  && (lead.score < 30 || lead.score >= 60)) return false;
    if (scoreRange === "low"  && lead.score >= 30) return false;
    if (siteFilter === "none" && lead.audit.hasWebsite) return false;
    if (siteFilter === "poor" && (!lead.audit.hasWebsite || lead.audit.pageSpeedScore >= 50)) return false;
    if (siteFilter === "ok"   && (!lead.audit.hasWebsite || lead.audit.pageSpeedScore < 50)) return false;
    if (fPhone && !lead.phone && !lead.whatsapp) return false;
    return true;
  }

  const auditedCount = leads.filter((l) => audits[l.id]).length;

  async function runRank() {
    const auditable = leads.filter((l) => audits[l.id]);
    if (auditable.length === 0) return;

    setRunning(true);
    setError(null);
    cancelRef.current = false;

    // Split into batches of BATCH_SIZE
    const batches: typeof auditable[] = [];
    for (let i = 0; i < auditable.length; i += BATCH_SIZE)
      batches.push(auditable.slice(i, i + BATCH_SIZE));

    setProgress({ done: 0, total: auditable.length });

    const allScored: RankedLead[] = [];
    const scoreMap: Record<string, { score: number; scoreReasoning: string }> = {};

    try {
      for (let bi = 0; bi < batches.length; bi++) {
        if (cancelRef.current) break;
        const batch = batches[bi];

        const res = await fetch("/api/rank", {
          method:  "POST",
          headers: { "content-type": "application/json" },
          body:    JSON.stringify({ leads: batch, audits }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Ranking failed (${res.status})`);
        }
        const data = await res.json() as { scores: Array<{ leadId: string; score: number; scoreReasoning: string }> };
        for (const s of data.scores ?? []) scoreMap[s.leadId] = s;

        setProgress({ done: Math.min((bi + 1) * BATCH_SIZE, auditable.length), total: auditable.length });

        if (bi < batches.length - 1) await new Promise(r => setTimeout(r, 1200));
      }

      // Build final ranked list
      for (const lead of auditable) {
        const s = scoreMap[lead.id];
        allScored.push({
          ...lead,
          audit: audits[lead.id],
          score: Math.max(0, Math.min(100, Number(s?.score ?? 50))),
          scoreReasoning: s?.scoreReasoning ?? "",
        });
      }
      allScored.sort((a, b) => b.score - a.score);
      setRanked(allScored);
      toast.success(`Ranked ${allScored.length} prospects`);
    } catch (e) {
      setError((e as Error).message);
      toast.error("Ranking failed");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  // No audits yet → nothing to rank
  if (auditedCount === 0) {
    return (
      <PhaseShell
        title="Phase 3 — Ranked prospects"
        subtitle="AI scores each lead on conversion potential — site quality, review volume, reachability, and category fit — then ranks them."
        onPrev={onPrev}
        onNext={onNext}
        nextDisabled
        nextLabel="Build website"
      >
        <IncompleteState
          title={leads.length === 0 ? "No leads scraped yet" : "No audits yet"}
          description={
            leads.length === 0
              ? "Run Phases 1 and 2 first. Once leads are scraped and audited, Claude ranks them by conversion potential here."
              : "Run an audit in Phase 2 first. Then AI ranks the audited leads by how likely they are to convert and how much a website would help them."
          }
          prevPhaseLabel={leads.length === 0 ? "Scrape" : "Audit"}
          onPrev={onPrev}
        />
      </PhaseShell>
    );
  }

  return (
    <PhaseShell
      title="Phase 3 — Ranked prospects"
      subtitle="AI scores each lead on conversion potential and explains why. Head to Phase 4 to prepare your pitch."
      onPrev={onPrev}
      onNext={onNext}
      nextLabel="Prepare pitch"
    >
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {ranked.length > 0
              ? `${ranked.length} prospects ranked`
              : `${auditedCount} audited lead${auditedCount === 1 ? "" : "s"} ready to rank`}
          </div>
          {/* Show if there are newly audited leads not yet in ranking */}
          {(() => {
            const rankedIds = new Set(ranked.map(r => r.id));
            const newlyAudited = leads.filter(l => audits[l.id] && !rankedIds.has(l.id)).length;
            if (newlyAudited === 0) return null;
            return (
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                {newlyAudited} newly audited lead{newlyAudited > 1 ? "s" : ""} not yet ranked — re-rank to include
              </span>
            );
          })()}
        </div>
        <Button onClick={runRank} disabled={running} className="h-10 px-4">
          {running
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ranking…</>
            : (() => {
                const rankedIds = new Set(ranked.map(r => r.id));
                const newlyAudited = leads.filter(l => audits[l.id] && !rankedIds.has(l.id)).length;
                if (ranked.length === 0) return "Rank prospects";
                if (newlyAudited > 0) return `Re-rank (include ${newlyAudited} new)`;
                return "Re-rank";
              })()}
        </Button>
      </div>

      {running && progress && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <span>Ranking leads… <span className="tabular-nums font-semibold">{progress.done} / {progress.total}</span> done</span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Processing in batches of {BATCH_SIZE} — please wait…</p>
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-md border border-[color:var(--destructive)]/40 bg-[color:var(--destructive)]/5 p-3 text-sm text-[color:var(--destructive)]" role="alert">
          {error}
          <Button variant="outline" size="sm" className="ml-3" onClick={runRank}>Retry</Button>
        </div>
      )}

      {ranked.length === 0 && !running && !error && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 mx-auto flex items-center justify-center mb-4">
              <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <div className="font-display text-xl mb-1">Ready to rank</div>
            <p className="text-sm text-muted-foreground">Hit &ldquo;Rank prospects with Claude&rdquo; above to score and sort your leads.</p>
          </CardContent>
        </Card>
      )}

      {ranked.length > 0 && (
        <>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border mb-4">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mr-1">Filter:</span>
            <div className="relative">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name…"
                className="h-7 pl-6 pr-2 text-[11px] rounded-full border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
              />
              <svg className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
            <select value={scoreRange} onChange={e => setScoreRange(e.target.value as typeof scoreRange)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-background text-muted-foreground focus:outline-none cursor-pointer">
              <option value="all">Any score</option>
              <option value="high">🔥 High (60+)</option>
              <option value="mid">🟡 Mid (30–59)</option>
              <option value="low">⬇️ Low (&lt;30)</option>
            </select>
            <select value={siteFilter} onChange={e => setSiteFilter(e.target.value as typeof siteFilter)}
              className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-background text-muted-foreground focus:outline-none cursor-pointer">
              <option value="all">Any site</option>
              <option value="none">No site</option>
              <option value="poor">Poor site</option>
              <option value="ok">Decent/Good site</option>
            </select>
            <button
              onClick={() => setFPhone(v => !v)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                fPhone ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"
              }`}
            >Has phone</button>
            {hasFilter && (
              <button onClick={() => { setSearch(""); setScoreRange("all"); setSiteFilter("all"); setFPhone(false); }}
                className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 hover:bg-muted/50 transition-colors">Clear</button>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{ranked.filter(applyFilters).length} / {ranked.length}</span>
          </div>
          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            {ranked.slice(0, 3).map((lead, i) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedId === lead.id}
                  aria-label={`Select rank ${i + 1}: ${lead.name}`}
                  onClick={() => setSelectedId(lead.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(lead.id);
                    }
                  }}
                  className={`h-full cursor-pointer transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:-translate-y-0.5 ${
                    selectedId === lead.id ? "ring-1 ring-primary border-primary/30" : "hover:border-primary/30"
                  }`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm flex items-center gap-2 font-medium tracking-wide uppercase text-muted-foreground">
                        <Crown className="h-3.5 w-3.5 text-[color:var(--chart-4)]" strokeWidth={1.5} />
                        Rank · {String(i + 1).padStart(2, "0")}
                      </CardTitle>
                      <div className="font-display text-3xl tabular-nums leading-none">{lead.score}</div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="font-medium text-base leading-snug">{lead.name}</div>
                    {/* Duplicate badge */}
                    {(() => {
                      const dup = duplicates[normalizePhone(lead.phone ?? lead.whatsapp)];
                      return dup ? (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-600">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          Already seen in: {dup.niche} · {dup.city}
                        </div>
                      ) : null;
                    })()}
                    <div className="text-xs text-muted-foreground mt-1">{lead.address}</div>
                    {lead.scoreReasoning && (
                      <div className="mt-3 rounded-md bg-muted/50 border border-border p-2.5 text-xs text-muted-foreground italic leading-relaxed">
                        {lead.scoreReasoning}
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3 text-muted-foreground" />{lead.audit.estLostRevenuePerMonth.toLocaleString("en-IN")}/mo</span>
                      <span className="text-border">·</span>
                      <span className="text-muted-foreground">{lead.reviewsCount} reviews</span>
                      <span className="text-border">·</span>
                      <span className="text-muted-foreground">📷 {lead.photosCount ?? 0}</span>
                    </div>
                    <div className="mt-3 flex gap-1.5">
                      {lead.phone && <Phone className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />}
                      {lead.whatsapp && <MessageCircle className="h-3.5 w-3.5 text-[color:var(--accent-foreground)]" strokeWidth={1.5} />}
                      {lead.email && <Mail className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All ranked {hasFilter && <span className="text-sm font-normal text-muted-foreground">({ranked.filter(applyFilters).length} shown)</span>}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead className="w-[220px]">Score</TableHead>
                      <TableHead>₹ Lost / mo</TableHead>
                      <TableHead>Site</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ranked.filter(applyFilters).map((lead, i) => (
                      <motion.tr
                        key={lead.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className="border-b border-border"
                      >
                        <TableCell className="font-medium tabular-nums align-top pt-3">{i + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium">{lead.name}</div>
                          {/* Duplicate badge in table */}
                          {(() => {
                            const dup = duplicates[normalizePhone(lead.phone ?? lead.whatsapp)];
                            return dup ? (
                              <div className="flex items-center gap-1 text-[10px] text-amber-600 mt-0.5">
                                <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                Seen in: {dup.niche} · {dup.city}
                              </div>
                            ) : null;
                          })()}
                          <div className="text-xs text-muted-foreground">{lead.reviewsCount} reviews · {lead.rating != null ? `${lead.rating}★` : "—"}</div>
                          {lead.scoreReasoning && (
                            <div className="text-xs text-muted-foreground/80 italic mt-1 max-w-md">{lead.scoreReasoning}</div>
                          )}
                        </TableCell>
                        <TableCell className="align-top pt-3.5">
                          <div className="flex items-center gap-2">
                            <div className="relative h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${lead.score}%` }}
                                transition={{ duration: 0.8, delay: i * 0.05, ease: "easeOut" }}
                                className="h-full bg-primary"
                              />
                            </div>
                            <span className="font-mono text-sm tabular-nums w-9 text-right">{lead.score}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono tabular-nums text-sm align-top pt-3">₹{lead.audit.estLostRevenuePerMonth.toLocaleString("en-IN")}</TableCell>
                        <TableCell className="align-top pt-3">
                          {(() => {
                            const ps = lead.audit.pageSpeedScore;
                            const has = lead.audit.hasWebsite;
                            if (!has) return <Badge variant="outline" className="text-xs font-normal text-destructive border-destructive/40 bg-destructive/5">No site</Badge>;
                            if (ps >= 70 && lead.audit.mobileFriendly && lead.audit.https) return <Badge variant="secondary" className="text-xs font-normal text-green-700 bg-green-50 border-green-200">Good · {ps}</Badge>;
                            if (ps >= 50 && lead.audit.mobileFriendly) return <Badge variant="secondary" className="text-xs font-normal text-blue-700 bg-blue-50 border-blue-200">Decent · {ps}</Badge>;
                            if (ps >= 30) return <Badge variant="secondary" className="text-xs font-normal text-amber-700 bg-amber-50 border-amber-200">Mediocre · {ps}</Badge>;
                            return <Badge variant="secondary" className="text-xs font-normal text-red-700 bg-red-50 border-red-200">Poor · {ps}</Badge>;
                          })()}
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </PhaseShell>
  );
}
