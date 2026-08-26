"use client";

import { useEffect, useRef, useState } from "react";
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
  const [running, setRunning]     = useState(false);
  const [error,   setError]       = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [elapsed,   setElapsed]   = useState(0);   // seconds since rank started
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const duplicates = useDuplicateIndex(sessionId);

  // Start/stop elapsed timer when ranking runs
  useEffect(() => {
    if (running) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  function fmtElapsed(s: number) {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  const auditedCount = leads.filter((l) => audits[l.id]).length;

  async function runRank() {
    setRunning(true);
    setError(null);
    setStatusMsg("AI is analyzing and ranking your leads…");
    try {
      const res = await fetch("/api/rank", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ leads, audits }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Ranking failed (${res.status})`);
      }
      const data = await res.json() as { ranked: RankedLead[] };
      setRanked(data.ranked);
      setStatusMsg("");
      toast.success(`Ranked ${data.ranked.length} prospects`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setStatusMsg("");
      toast.error("Ranking failed");
    } finally {
      setRunning(false);
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
        <div className="text-sm text-muted-foreground">
          {ranked.length > 0
            ? `${ranked.length} prospects ranked`
            : `${auditedCount} audited lead${auditedCount === 1 ? "" : "s"} ready to rank`}
        </div>
        <Button onClick={runRank} disabled={running} className="h-10 px-4">
          {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ranking…</> : ranked.length > 0 ? "Re-rank" : "Rank prospects"}
        </Button>
      </div>

      {running && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <span>AI is scoring {auditedCount} leads — please wait…</span>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">{fmtElapsed(elapsed)}</span>
          </div>
          {/* Animated indeterminate bar */}
          <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-1/3 bg-primary rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ animation: "slide 1.5s ease-in-out infinite" }} />
            <style>{`@keyframes slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }`}</style>
          </div>
          <p className="text-xs text-muted-foreground">This usually takes 15–30 seconds for large lists.</p>
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
              <CardTitle>All ranked</CardTitle>
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
                    {ranked.map((lead, i) => (
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
                          <div className="text-xs text-muted-foreground">{lead.reviewsCount} reviews · {lead.rating}★</div>
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
                          {lead.audit.hasWebsite ? (
                            <Badge variant="secondary" className="text-xs font-normal">{lead.audit.pageSpeedScore} PageSpeed</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs font-normal text-[color:var(--destructive)] border-[color:var(--destructive)]/40 bg-[color:var(--destructive)]/5">None</Badge>
                          )}
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
