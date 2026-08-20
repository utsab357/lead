"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhaseShell } from "./PhaseShell";
import { Loader2, Target, TrendingUp, Zap, Shield, Clock, ChevronDown, ChevronUp } from "lucide-react";
import type { RankedLead, ConversionPoints, AuditResult } from "@/lib/types";
import { toast } from "sonner";

const BATCH_SIZE = 5;

export function Phase4Convert({
  ranked,
  conversions,
  setConversions,
  onNext,
  onPrev,
}: {
  ranked: RankedLead[];
  conversions: Record<string, ConversionPoints>;
  setConversions: (c: Record<string, ConversionPoints>) => void;
  onNext: () => void;
  onPrev?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

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
            : <><Target className="h-4 w-4 mr-2" />{Object.keys(conversions).length > 0 ? "Re-generate all" : "Generate conversion hooks"}</>}
        </Button>
        <div className="text-sm text-muted-foreground">
          {Object.keys(conversions).length} / {ranked.length} leads processed
        </div>
        {loading && statusMsg && (
          <span className="text-xs text-muted-foreground/70 italic">{statusMsg}</span>
        )}
      </div>

      {/* All ranked leads */}
      <div className="grid gap-3">
        <AnimatePresence initial={false}>
          {ranked.map((lead, i) => {
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
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{lead.address} · {lead.category}</div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="pt-0 border-t border-border/60">
                      {conv ? (
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


