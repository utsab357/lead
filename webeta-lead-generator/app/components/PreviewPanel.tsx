"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Smartphone,
  Monitor,
  ExternalLink,
  Play,
  Pause,
  Clock,
  Zap,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import type { RankedLead } from "@/lib/types";
import { toast } from "sonner";

type PreviewStatus =
  | { state: "idle" }
  | { state: "queued"; position: number }
  | { state: "generating" }
  | { state: "done"; desktopUrl: string; mobileUrl?: string; htmlUrl?: string; cached?: boolean }
  | { state: "error"; message: string };

interface LeadPreviewState {
  [leadId: string]: PreviewStatus;
}

interface PreviewPanelProps {
  /** All ranked leads in session */
  ranked: RankedLead[];
  /** The currently active lead in Phase 6 */
  activeLead: RankedLead | null;
}

const BATCH_SIZE = 3; // generate N at a time
const BETWEEN_DELAY_MS = 8000; // 8s between batches to respect rate limits

export function PreviewPanel({ ranked, activeLead }: PreviewPanelProps) {
  const [previews, setPreviews] = useState<LeadPreviewState>({});
  const [queue, setQueue] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [expanded, setExpanded] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // On mount: check which leads already have cached previews
  useEffect(() => {
    const checkAll = async () => {
      const checks = ranked.map((lead) =>
        fetch(`/api/generate-preview?leadId=${lead.id}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.exists && d.desktopUrl) {
              setPreviews((prev) => ({
                ...prev,
                [lead.id]: {
                  state: "done",
                  desktopUrl: d.desktopUrl,
                  mobileUrl: d.mobileUrl ?? undefined,
                  htmlUrl: d.htmlUrl ?? undefined,
                  cached: true,
                },
              }));
            }
          })
          .catch(() => {})
      );
      await Promise.allSettled(checks);
    };
    if (ranked.length > 0) checkAll();
  }, [ranked]);

  const generateOne = useCallback(
    async (lead: RankedLead): Promise<boolean> => {
      setPreviews((prev) => ({ ...prev, [lead.id]: { state: "generating" } }));
      try {
        const res = await fetch("/api/generate-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lead }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setPreviews((prev) => ({
            ...prev,
            [lead.id]: { state: "error", message: data.error ?? "Generation failed" },
          }));
          return false;
        }
        setPreviews((prev) => ({
          ...prev,
          [lead.id]: {
            state: "done",
            desktopUrl: data.desktopUrl,
            mobileUrl: data.mobileUrl ?? undefined,
            htmlUrl: data.htmlUrl ?? undefined,
            cached: data.cached ?? false,
          },
        }));
        return true;
      } catch (e) {
        setPreviews((prev) => ({
          ...prev,
          [lead.id]: { state: "error", message: (e as Error).message },
        }));
        return false;
      }
    },
    []
  );

  const runQueue = useCallback(
    async (ids: string[]) => {
      if (running || ids.length === 0) return;
      setRunning(true);
      const toGenerate = ids.filter((id) => {
        const s = previews[id];
        return !s || s.state === "idle" || s.state === "error";
      });

      // Mark all as queued first
      setPreviews((prev) => {
        const next = { ...prev };
        toGenerate.forEach((id, i) => {
          next[id] = { state: "queued", position: i + 1 };
        });
        return next;
      });

      for (let i = 0; i < toGenerate.length; i += BATCH_SIZE) {
        const batch = toGenerate.slice(i, i + BATCH_SIZE);
        const leads = ranked.filter((l) => batch.includes(l.id));

        // Update queue positions
        const remaining = toGenerate.slice(i + BATCH_SIZE);
        setPreviews((prev) => {
          const next = { ...prev };
          remaining.forEach((id, j) => {
            next[id] = { state: "queued", position: j + 1 };
          });
          return next;
        });

        // Generate batch in parallel
        await Promise.allSettled(leads.map((l) => generateOne(l)));

        if (i + BATCH_SIZE < toGenerate.length) {
          toast.info(`Batch ${Math.floor(i / BATCH_SIZE) + 1} done — waiting ${BETWEEN_DELAY_MS / 1000}s before next batch...`);
          await new Promise((r) => setTimeout(r, BETWEEN_DELAY_MS));
        }
      }

      setRunning(false);
      setQueue([]);
      toast.success("All previews generated!");
    },
    [running, ranked, generateOne, previews]
  );

  function generateAll() {
    const ids = ranked.map((l) => l.id);
    setQueue(ids);
    runQueue(ids);
  }

  function generateActive() {
    if (!activeLead) return;
    runQueue([activeLead.id]);
  }

  function regenerate(lead: RankedLead) {
    // Delete existing and regenerate
    setPreviews((prev) => ({ ...prev, [lead.id]: { state: "idle" } }));
    setTimeout(() => runQueue([lead.id]), 100);
  }

  const activePreview = activeLead ? previews[activeLead.id] : undefined;
  const doneCount = Object.values(previews).filter((p) => p.state === "done").length;
  const totalCount = ranked.length;

  const currentUrl =
    activePreview?.state === "done"
      ? viewMode === "mobile" && activePreview.mobileUrl
        ? activePreview.mobileUrl
        : activePreview.desktopUrl
      : null;

  return (
    <div className="border border-border rounded-xl bg-card shadow-xs overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shrink-0">
            <Camera className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground flex items-center gap-2">
              Website Preview Generator
              {running && (
                <span className="inline-flex items-center gap-1 text-[10px] text-violet-600 font-medium animate-pulse">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating...
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {doneCount}/{totalCount} previews ready · Screenshot from real website code
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {doneCount > 0 && (
            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              {doneCount} ready
            </Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 pb-4 space-y-4 border-t border-border/60 pt-4">
              {/* Action bar */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={generateActive}
                  disabled={running || !activeLead}
                  className="h-8 text-xs gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0"
                >
                  {activePreview?.state === "generating" ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating...</>
                  ) : activePreview?.state === "done" ? (
                    <><RefreshCw className="h-3.5 w-3.5" />Regenerate This</>
                  ) : (
                    <><Camera className="h-3.5 w-3.5" />Generate This Lead</>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={generateAll}
                  disabled={running}
                  className="h-8 text-xs gap-1.5"
                >
                  {running ? (
                    <><Pause className="h-3.5 w-3.5" />Running...</>
                  ) : (
                    <><Play className="h-3.5 w-3.5" />Generate All ({totalCount})</>
                  )}
                </Button>

                {doneCount > 0 && (
                  <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>~{Math.round((totalCount - doneCount) * 0.5)} min remaining</span>
                  </div>
                )}
              </div>

              {/* Info note */}
              {doneCount === 0 && !running && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-violet-500/5 border border-violet-500/20 text-xs text-muted-foreground">
                  <Zap className="h-3.5 w-3.5 text-violet-500 mt-0.5 shrink-0" />
                  <span>
                    Each preview: Groq generates real website HTML → Playwright screenshots it at 1280×800 →
                    saved as PNG. Takes ~30–60s per business.
                    Batches of {BATCH_SIZE} with {BETWEEN_DELAY_MS / 1000}s gaps to respect free API limits.
                  </span>
                </div>
              )}

              {/* Active lead preview */}
              {activeLead && activePreview?.state === "done" && (
                <div className="space-y-3">
                  {/* View toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground truncate max-w-[60%]">
                      {activeLead.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/60 border border-border">
                        <button
                          onClick={() => setViewMode("desktop")}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-all font-medium ${
                            viewMode === "desktop"
                              ? "bg-background text-foreground shadow-2xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Monitor className="h-3 w-3" />
                          Desktop
                        </button>
                        <button
                          onClick={() => setViewMode("mobile")}
                          disabled={!activePreview.mobileUrl}
                          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-all font-medium disabled:opacity-40 ${
                            viewMode === "mobile"
                              ? "bg-background text-foreground shadow-2xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Smartphone className="h-3 w-3" />
                          Mobile
                        </button>
                      </div>
                      {activePreview.htmlUrl && (
                        <a
                          href={activePreview.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          HTML
                        </a>
                      )}
                      <button
                        onClick={() => activeLead && regenerate(activeLead)}
                        disabled={running}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Redo
                      </button>
                    </div>
                  </div>

                  {/* Screenshot */}
                  {currentUrl && (
                    <div
                      className="relative rounded-xl overflow-hidden border border-border shadow-md cursor-zoom-in group"
                      onClick={() => setLightboxUrl(currentUrl)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${currentUrl}?v=${Date.now()}`}
                        alt={`${activeLead.name} website preview`}
                        className="w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
                        style={{ maxHeight: "380px", objectFit: "cover", objectPosition: "top" }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full transition-opacity">
                          Click to expand
                        </span>
                      </div>
                      {activePreview.cached && (
                        <div className="absolute top-2 left-2">
                          <Badge className="text-[9px] bg-black/60 text-white border-0 backdrop-blur-sm">
                            Cached
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Active lead - generating state */}
              {activeLead && activePreview?.state === "generating" && (
                <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                  <div className="text-center">
                    <div className="text-sm font-semibold text-foreground">Generating preview...</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Groq is writing the website HTML, then Playwright is screenshotting it
                    </div>
                  </div>
                </div>
              )}

              {/* Active lead - queued state */}
              {activeLead && activePreview?.state === "queued" && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-border bg-muted/30">
                  <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      Queued — position {(activePreview as Extract<PreviewStatus, { state: "queued" }>).position}
                    </div>
                    <div className="text-xs text-muted-foreground">Will generate automatically in this batch</div>
                  </div>
                </div>
              )}

              {/* Active lead - error state */}
              {activeLead && activePreview?.state === "error" && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/5">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-destructive">Generation failed</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {(activePreview as Extract<PreviewStatus, { state: "error" }>).message}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => activeLead && regenerate(activeLead)}
                    className="h-7 text-xs shrink-0"
                  >
                    Retry
                  </Button>
                </div>
              )}

              {/* Batch progress mini-list */}
              {running && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {ranked.map((lead) => {
                    const s = previews[lead.id];
                    return (
                      <div
                        key={lead.id}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] truncate ${
                          s?.state === "done"
                            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                            : s?.state === "generating"
                              ? "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                              : s?.state === "queued"
                                ? "border-border bg-muted/30 text-muted-foreground"
                                : s?.state === "error"
                                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                                  : "border-border bg-muted/20 text-muted-foreground"
                        }`}
                      >
                        {s?.state === "done" ? (
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                        ) : s?.state === "generating" ? (
                          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                        ) : s?.state === "error" ? (
                          <AlertCircle className="h-3 w-3 shrink-0" />
                        ) : (
                          <Clock className="h-3 w-3 shrink-0 opacity-40" />
                        )}
                        <span className="truncate">{lead.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
            onClick={() => setLightboxUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-5xl w-full max-h-[90vh] overflow-auto rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setLightboxUrl(null)}
                className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/80 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxUrl}
                alt="Website preview fullscreen"
                className="w-full rounded-xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
