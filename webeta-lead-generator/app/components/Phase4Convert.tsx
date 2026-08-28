"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhaseShell } from "./PhaseShell";
import { Loader2, Target, TrendingUp, Zap, Shield, Clock, ChevronDown, ChevronUp, Phone, MessageSquare, AlertCircle, CheckCircle2 } from "lucide-react";
import type { RankedLead, ConversionPoints, AuditResult } from "@/lib/types";
import { toast } from "sonner";

const BATCH_SIZE = 5;

export function Phase4Convert({
  ranked,
  conversions,
  setConversions,
  onNext,
  onPrev,
  initialExpandedId,
}: {
  ranked: RankedLead[];
  conversions: Record<string, ConversionPoints>;
  setConversions: (c: Record<string, ConversionPoints>) => void;
  onNext: () => void;
  onPrev?: () => void;
  initialExpandedId?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId ?? null);
  const [statusMsg, setStatusMsg] = useState("");
  const [showScriptId, setShowScriptId] = useState<string | null>(null);

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


