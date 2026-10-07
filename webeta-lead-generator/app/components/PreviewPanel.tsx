"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  AlertCircle,
  Maximize2,
  Trash2,
  Code2,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Clock,
  CheckCircle2,
  Camera,
  Download,
  ImageIcon,
} from "lucide-react";
import type { RankedLead, BuildPromptResult, PreviewGenerationMethod } from "@/lib/types";
import { toast } from "sonner";
import { getIntelligentPagesForLead } from "@/lib/pageRecommendation";

// ── Types ────────────────────────────────────────────────────────────────────────

export interface PreviewStatus {
  state: "idle" | "generating" | "done" | "error";
  desktopUrl?: string;
  mobileUrl?: string;
  htmlUrl?: string;
  generationMethod?: PreviewGenerationMethod;
  provider?: string;
  model?: string;
  message?: string;
  error?: string;
  cached?: boolean;
  compilationTimeMs?: number;
  htmlLength?: number;
}

type DeviceFrame = "desktop" | "tablet" | "mobile";

interface PreviewPanelProps {
  /** All ranked leads in session */
  ranked: RankedLead[];
  /** The currently active lead */
  activeLead: RankedLead | null;
  /** Generated prompts from Phase 4/5 (if available) */
  buildPrompts?: Record<string, BuildPromptResult>;
  /** Callback when preview state changes */
  onPreviewUpdated?: (leadId: string, status: PreviewStatus) => void;
  /** Session ID if active */
  sessionId?: string | null;
  // Legacy props kept for compatibility
  visualPreviews?: Record<string, unknown>;
  onVisualPreviewUpdated?: (leadId: string, set: unknown) => void;
}

const DEVICE_WIDTHS: Record<DeviceFrame, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 375,
};

// ── Component ────────────────────────────────────────────────────────────────────

export function PreviewPanel({
  ranked,
  activeLead,
  buildPrompts,
  onPreviewUpdated,
}: PreviewPanelProps) {
  // ── State ─────────────────────────────────────────────────────────────────────
  const [deviceFrame, setDeviceFrame] = useState<DeviceFrame>("desktop");
  const [viewMode, setViewMode] = useState<"iframe" | "screenshot">("screenshot");

  // HTML previews state per lead
  const [htmlPreviews, setHtmlPreviews] = useState<Record<string, PreviewStatus>>({});
  // Screenshot PNGs per lead
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});
  const [screenshotting, setScreenshotting] = useState<Record<string, boolean>>({});
  // Verification results per lead
  const [verifications, setVerifications] = useState<Record<string, { pass: boolean; score: number; issues: Array<{ code: string; message: string; severity: string }> }>>({});

  const [activeGenerating, setActiveGenerating] = useState(false);
  const [lightboxHtml, setLightboxHtml] = useState<string | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState<"fit" | "mockup" | "full">("fit");
  const [expanded, setExpanded] = useState(true);
  // Which pages to generate (shown in page selector above Compile button)
  const [selectedPages, setSelectedPages] = useState<string[]>(["home"]);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Multi-page screenshots: { leadId: { menu: url, gallery: url, ... } }
  const [multiPageShots, setMultiPageShots] = useState<Record<string, Record<string, string>>>({});
  const [activePageTab, setActivePageTab] = useState<Record<string, string>>({}); // leadId -> active page tab

  // ── Auto-screenshot after HTML compile ───────────────────────────────────────
  const takeScreenshot = useCallback(async (
    lead: RankedLead,
    htmlUrl: string,
    force = false,
    page = "home",
    device: "desktop" | "mobile" = "desktop"
  ) => {
    if (screenshotting[lead.id]) return;
    setScreenshotting((prev) => ({ ...prev, [lead.id]: true }));
    try {
      const res = await fetch("/api/screenshot-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          htmlUrl,
          leadId: lead.id,
          businessName: lead.name,
          force,
          page,
          device,
          // Pass full lead data for verification checks
          lead,
          category: lead.category,
          city: lead.city,
          phone: lead.phone,
        }),
      });
      const data = await res.json();
      if (data.ok && data.previewUrl) {
        if (page === "home") {
          setScreenshots((prev) => ({
            ...prev,
            [lead.id]: data.previewUrl,
            [`${lead.id}_${device}`]: data.previewUrl,
          }));
        } else {
          setMultiPageShots((prev) => ({
            ...prev,
            [lead.id]: { ...(prev[lead.id] || {}), [`${page}_${device}`]: data.previewUrl },
          }));
        }
        // Store verification result (only for home page)
        if (data.verification && page === "home") {
          setVerifications((prev) => ({ ...prev, [lead.id]: data.verification }));
          // Bubble up to parent (Phase4Build sidebar badge)
          onPreviewUpdated?.(lead.id, { state: "done", verification: data.verification } as any);
          if (!data.verification.pass) {
            const criticals = data.verification.issues.filter((i: any) => i.severity === "critical").length;
            toast.warning(`⚠️ ${lead.name}: ${criticals} issue(s) — check before sending`, { duration: 6000 });
          } else {
            toast.success(`✅ ${lead.name} — Verified (score: ${data.verification.score}/100)`);
          }
        } else {
          toast.success(`${page === "home" ? "Screenshot" : `${page} page`} ready for ${lead.name}`);
        }
      } else {
        toast.error(`Screenshot failed: ${data.error?.slice(0, 100)}`);
      }
    } catch (err) {
      toast.error(`Screenshot error: ${(err as Error).message}`);
    } finally {
      setScreenshotting((prev) => ({ ...prev, [lead.id]: false }));
    }
  }, [screenshotting]);

  // Set intelligent recommended pages whenever the active lead changes
  useEffect(() => {
    if (!activeLead) {
      setSelectedPages(["home"]);
      return;
    }
    const strategy = buildPrompts?.[activeLead.id]?.strategy;
    const intelligentPages = getIntelligentPagesForLead(activeLead, strategy);
    setSelectedPages(intelligentPages.map(p => p.id));
  }, [activeLead?.id, buildPrompts]);

  // Ref to ensure cache checks only run ONCE (not on every re-render)
  const cacheChecked = useRef(false);

  // One-time cache check: HTML previews + Screenshots + Verifications
  useEffect(() => {
    if (ranked.length === 0 || cacheChecked.current) return;
    cacheChecked.current = true;

    // Check existing HTML files (once)
    fetch("/api/compile-html?list=true")
      .then(r => r.json())
      .then(d => {
        if (!d.files || !Array.isArray(d.files)) return;
        const next: Record<string, PreviewStatus> = {};
        ranked.forEach(lead => {
          const hash = lead.id.slice(-8);
          const match = d.files.find((f: string) => f.includes(hash));
          if (match) {
            const status: PreviewStatus = { state: "done", htmlUrl: `/html-previews/${match}`, generationMethod: "html-screenshot", cached: true };
            next[lead.id] = status;
            onPreviewUpdated?.(lead.id, status);
          }
        });
        setHtmlPreviews(prev => ({ ...prev, ...next }));
      })
      .catch(() => {});

    // Check existing screenshots + load verifications (once)
    fetch("/api/screenshot-preview?list=true")
      .then(r => r.json())
      .then(d => {
        if (!d.files || !Array.isArray(d.files)) return;
        const next: Record<string, string> = {};
        ranked.forEach(lead => {
          const hash = lead.id.slice(-8);
          const mobileMatch = d.files.find((f: string) => f.endsWith(".png") && f.includes(hash) && f.includes("_mobile"));
          const desktopMatch = d.files.find((f: string) => f.endsWith(".png") && f.includes(hash) && !f.includes("_mobile") && !f.includes("_menu") && !f.includes("_gallery"));
          if (mobileMatch) next[`${lead.id}_mobile`] = `/previews/${mobileMatch}`;
          if (desktopMatch) {
            next[`${lead.id}_desktop`] = `/previews/${desktopMatch}`;
            next[lead.id] = `/previews/${desktopMatch}`;
          } else if (mobileMatch && !next[lead.id]) {
            next[lead.id] = `/previews/${mobileMatch}`;
          }
        });
        setScreenshots(prev => ({ ...prev, ...next }));
        // Load verifications for all found screenshots in parallel
        ranked.filter(l => next[l.id]).forEach(lead => {
          fetch(`/api/screenshot-preview?leadId=${lead.id}&name=${encodeURIComponent(lead.name)}`)
            .then(r => r.json())
            .then(data => { if (data.verification) setVerifications(prev => ({ ...prev, [lead.id]: data.verification })); })
            .catch(() => {});
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranked.length]); // only re-run if lead count changes


  // ── Generate HTML Preview (with multi-page + device support) ─────────────────
  const generateHtmlPreview = useCallback(
    async (lead: RankedLead, force = false, pages: string[] = ["home"], device: "desktop" | "mobile" = "desktop"): Promise<boolean> => {
      setHtmlPreviews((prev) => ({
        ...prev,
        [lead.id]: { state: "generating" },
      }));

      try {
        const strategy = buildPrompts?.[lead.id]?.strategy;

        // Compile + screenshot each selected page sequentially
        let anyOk = false;
        for (const page of pages) {
          const res = await fetch("/api/compile-html", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lead, style: "ai-decides", strategy, force, page }),
          });

          const data = await res.json();

          if (!res.ok || !data.ok) {
            if (page === "home") {
              const errorMsg = data.error || "Failed to compile HTML";
              const status: PreviewStatus = { state: "error", error: errorMsg };
              setHtmlPreviews((prev) => ({ ...prev, [lead.id]: status }));
              onPreviewUpdated?.(lead.id, status);
              toast.error(errorMsg);
              return false;
            }
            // Non-home page failure is non-fatal
            toast.warning(`${page} page compile failed for ${lead.name}`);
            continue;
          }

          if (page === "home") {
            const status: PreviewStatus = {
              state: "done",
              htmlUrl: data.htmlUrl,
              generationMethod: "html-screenshot",
              provider: data.provider,
              model: data.model,
              message: data.message,
              cached: data.cached,
              compilationTimeMs: data.compilationTimeMs,
              htmlLength: data.htmlLength,
            };
            setHtmlPreviews((prev) => ({ ...prev, [lead.id]: status }));
            onPreviewUpdated?.(lead.id, status);
            const timeStr = data.compilationTimeMs ? ` in ${(data.compilationTimeMs / 1000).toFixed(1)}s` : "";
            toast.success(`HTML compiled for ${lead.name}${timeStr} — taking screenshot…`);
          }

          // Screenshot this page
          if (data.htmlUrl) {
            await takeScreenshot(lead, data.htmlUrl, force, page, device);
          }
          anyOk = true;
        }
        return anyOk;
      } catch (err) {
        const msg = (err as Error).message || "Network error";
        const status: PreviewStatus = { state: "error", error: msg };
        setHtmlPreviews((prev) => ({ ...prev, [lead.id]: status }));
        onPreviewUpdated?.(lead.id, status);
        toast.error(`Error: ${msg}`);
        return false;
      }
    },
    [buildPrompts, onPreviewUpdated]
  );

  // ── Active lead status ────────────────────────────────────────────────────────
  const activeHtmlStatus = activeLead ? htmlPreviews[activeLead.id] : undefined;
  const activeStatus = activeHtmlStatus;

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleGenerateActive = async (force = false) => {
    if (!activeLead || activeGenerating) return;
    setActiveGenerating(true);
    const pagesToGen = selectedPages.length > 0 ? selectedPages : ["home"];
    const screenshotDevice = deviceFrame === "mobile" ? "mobile" : "desktop";
    await generateHtmlPreview(activeLead, force, pagesToGen, screenshotDevice);
    setActiveGenerating(false);
  };

  const handleClearActivePreview = () => {
    if (!activeLead) return;
    setHtmlPreviews((prev) => {
      const next = { ...prev };
      delete next[activeLead.id];
      return next;
    });
    toast.info(`Preview cleared for ${activeLead.name}`);
  };

  // Resolve currently active display URL
  const currentHtmlUrl = activeHtmlStatus?.htmlUrl;

  // ── Get counts for tab badges ─────────────────────────────────────────────────
  const htmlDoneCount = Object.values(htmlPreviews).filter((p) => p.state === "done").length;

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* ── Top Header ────────────────────────────────────────────────────────── */}
      <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-sm sm:text-base text-foreground">
              Client Website Preview
              {activeLead ? ` — ${activeLead.name}` : ""}
            </h3>
            {activeStatus?.state === "done" ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-semibold">
                ● Ready
              </Badge>
            ) : activeStatus?.state === "generating" || activeGenerating ? (
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-semibold animate-pulse">
                Compiling…
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Pending
              </Badge>
            )}
            {/* ── Verification badge ── */}
            {activeLead && verifications[activeLead.id] && (() => {
              const v = verifications[activeLead.id];
              const criticals = v.issues.filter(i => i.severity === "critical").length;
              const warnings  = v.issues.filter(i => i.severity === "warning").length;
              if (v.pass) return (
                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-semibold gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Verified {v.score}/100
                </Badge>
              );
              if (criticals > 0) return (
                <Badge className="bg-red-500/10 text-red-600 border-red-500/20 text-[10px] font-semibold gap-1" title={v.issues.map(i => i.message).join(" | ")}>
                  <AlertCircle className="h-3 w-3" />
                  {criticals} Critical Issue{criticals > 1 ? "s" : ""}
                </Badge>
              );
              return (
                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-semibold gap-1" title={v.issues.map(i => i.message).join(" | ")}>
                  <AlertCircle className="h-3 w-3" />
                  {warnings} Warning{warnings > 1 ? "s" : ""}
                </Badge>
              );
            })()}
            {htmlDoneCount > 0 && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">
                <Code2 className="h-3 w-3" />
                {htmlDoneCount} compiled
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeLead
              ? `Live interactive HTML website for ${activeLead.name} (${activeLead.category} · ${activeLead.city?.split(",")[0]})`
              : "Select a lead to generate or inspect its website preview."}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded((v) => !v)}
            className="h-8 w-8 rounded-lg"
            aria-label={expanded ? "Collapse preview panel" : "Expand preview panel"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 sm:p-6 space-y-5">
          {/* ── Controls Bar ──────────────────────────────────────────────────── */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border/80">
            {/* Left: View Mode + Device Frame */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* View mode toggle */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5 text-primary" />
                  <span>View</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setViewMode("screenshot")} className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${viewMode === "screenshot" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    <ImageIcon className="h-3.5 w-3.5" /><span>Screenshot</span>
                  </button>
                  <button type="button" onClick={() => setViewMode("iframe")} className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${viewMode === "iframe" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                    <Globe className="h-3.5 w-3.5" /><span>Live Site</span>
                  </button>
                </div>
              </div>

              {/* Device Frame / Screenshot Format */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Monitor className="h-3.5 w-3.5 text-primary" />
                  <span>{viewMode === "screenshot" ? "Image Format" : "Device"}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {viewMode === "screenshot" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setDeviceFrame("mobile")}
                        className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${deviceFrame === "mobile" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                        title="Mobile format (390px) — Best for sending to leads on WhatsApp!"
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                        <span>Mobile (WhatsApp)</span>
                        <span className="text-[9px] opacity-70">390px</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeviceFrame("desktop")}
                        className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${deviceFrame === "desktop" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                        title="Desktop format (1280px)"
                      >
                        <Monitor className="h-3.5 w-3.5" />
                        <span>Desktop</span>
                        <span className="text-[9px] opacity-70">1280px</span>
                      </button>
                    </>
                  ) : (
                    ([
                      { key: "desktop", icon: Monitor, label: "Desktop", w: "1280px" },
                      { key: "tablet", icon: Tablet, label: "Tablet", w: "768px" },
                      { key: "mobile", icon: Smartphone, label: "Mobile", w: "375px" },
                    ] as const).map(({ key, icon: Icon, label, w }) => (
                      <button key={key} type="button" onClick={() => setDeviceFrame(key)}
                        className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${deviceFrame === key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                        title={`${label} (${w})`}>
                        <Icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{label}</span>
                        <span className="text-[9px] opacity-70">{w}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {activeLead && (
              <div className="flex items-center gap-2 self-start lg:self-end pt-1">
                {/* Fix & Regenerate button — shown only when verification fails */}
                {activeLead && verifications[activeLead.id] && !verifications[activeLead.id].pass && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      // Clear old verification so badge resets while regenerating
                      setVerifications(prev => { const n = { ...prev }; delete n[activeLead.id]; return n; });
                      // Force regenerate ALL currently selected pages, not just home
                      const pagesToFix = selectedPages.length > 0 ? selectedPages : ["home"];
                      const dev = deviceFrame === "mobile" ? "mobile" : "desktop";
                      const ok = await generateHtmlPreview(activeLead, true, pagesToFix, dev);
                      if (ok && currentHtmlUrl) {
                        await takeScreenshot(activeLead, currentHtmlUrl, true, "home", dev);
                      }
                    }}
                    disabled={activeGenerating || !!screenshotting[activeLead.id]}
                    className="h-9 px-3 text-xs gap-1.5"
                    title={verifications[activeLead.id].issues.map(i => i.message).join(" | ")}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Fix &amp; Regenerate
                  </Button>
                )}

                {/* Re-screenshot button */}
                {activeStatus?.state === "done" && currentHtmlUrl && (
                  <Button variant="outline" size="sm"
                    onClick={() => takeScreenshot(activeLead, currentHtmlUrl, true)}
                    disabled={!!screenshotting[activeLead.id]}
                    className="h-9 px-3 text-xs gap-1.5">
                    {screenshotting[activeLead.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                    {screenshotting[activeLead.id] ? "Capturing…" : "Re-screenshot"}
                  </Button>
                )}

                <Button
                  onClick={() => handleGenerateActive(activeStatus?.state === "done")}
                  disabled={activeGenerating || activeStatus?.state === "generating"}
                  className="h-9 px-4 font-semibold text-xs rounded-lg transition-transform active:scale-[0.98] bg-primary text-primary-foreground"
                >
                  {activeGenerating || activeStatus?.state === "generating" ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Compiling…</>
                  ) : activeStatus?.state === "done" ? (
                    <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Regenerate</>
                  ) : (
                    <><Code2 className="h-3.5 w-3.5 mr-1.5" />Compile Preview</>
                  )}
                </Button>

                {activeStatus?.state === "done" && (
                  <Button variant="outline" size="sm" onClick={handleClearActivePreview}
                    className="h-9 px-2.5 text-xs text-muted-foreground hover:text-destructive" title="Clear preview">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* ── Page Selector Row ─────────────────────────────────────────────── */}
          {activeLead && (
            <div className="flex flex-wrap items-center gap-2 px-1 pb-1">
              <span className="text-[11px] font-semibold text-muted-foreground">Pages:</span>
              {getIntelligentPagesForLead(activeLead, buildPrompts?.[activeLead.id]?.strategy).map(p => {
                const checked = selectedPages.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPages(prev =>
                      p.id === "home" ? prev : checked ? prev.filter(x => x !== p.id) : [...prev, p.id]
                    )}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                      checked
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:border-primary/40"
                    } ${p.id === "home" ? "opacity-60 cursor-default" : ""}`}
                    title={p.id === "home" ? "Home page always included" : (p.reason || p.description || `Toggle ${p.label}`)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Preview Display ─────────────────────────────────────────────────── */}
          {activeLead ? (
            <div className="space-y-3">
              {/* Multi-page tabs — shown when extra pages have been generated */}
              {activeLead && multiPageShots[activeLead.id] && Object.keys(multiPageShots[activeLead.id]).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setActivePageTab(prev => ({ ...prev, [activeLead.id]: "home" }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      !activePageTab[activeLead.id] || activePageTab[activeLead.id] === "home"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border"
                    }`}
                  >🏠 Home</button>
                  {Object.entries(multiPageShots[activeLead.id]).map(([pageKey]) => {
                    const [pg] = pageKey.split("_");
                    const label = pg === "menu" ? "🍽️ Menu" : pg === "gallery" ? "📸 Gallery" : pg === "services" ? "⚙️ Services" : pg === "rooms" ? "🛏️ Rooms" : pg === "programs" ? "💪 Programs" : pg === "portfolio" ? "🎨 Portfolio" : pg === "amenities" ? "✨ Amenities" : pg === "doctors" ? "🩺 Specialists" : pg;
                    return (
                      <button
                        key={pageKey}
                        onClick={() => setActivePageTab(prev => ({ ...prev, [activeLead.id]: pageKey }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          activePageTab[activeLead.id] === pageKey
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >{label}</button>
                    );
                  })}
                </div>
              )}

              {/* Status badges for ready previews */}
              {activeStatus?.state === "done" && (
                <div className="flex items-center justify-between gap-3 text-xs flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] gap-1 py-0.5">
                      <CheckCircle2 className="h-3 w-3" />
                      {activeHtmlStatus?.provider || "AI"} ({activeHtmlStatus?.model || "compiled"})
                    </Badge>
                    {activeHtmlStatus?.compilationTimeMs && (
                      <Badge variant="outline" className="text-[10px] gap-1 py-0.5 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {(activeHtmlStatus.compilationTimeMs / 1000).toFixed(1)}s
                      </Badge>
                    )}
                    {activeHtmlStatus?.htmlLength && (
                      <Badge variant="outline" className="text-[10px] gap-1 py-0.5 text-muted-foreground">
                        <Code2 className="h-3 w-3" />
                        {(activeHtmlStatus.htmlLength / 1024).toFixed(0)}KB HTML
                      </Badge>
                    )}
                    {activeStatus.cached && (
                      <span className="text-[10px] text-muted-foreground">● Cached</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {currentHtmlUrl && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLightboxHtml(currentHtmlUrl)}
                          className="h-7 text-xs gap-1.5"
                        >
                          <Maximize2 className="h-3 w-3" />
                          <span>Fullscreen</span>
                        </Button>
                        <a
                          href={currentHtmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Open tab</span>
                        </a>
                      </>
                    )}
                  </div>
                </div>
              )}

              {currentHtmlUrl && viewMode === "screenshot" ? (
                /* ── Screenshot / shareable image view ──────────────────────────── */
                <div className="space-y-4">
                  {/* Screenshot status bar */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {activeLead && screenshotting[activeLead.id] ? (
                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] gap-1 animate-pulse">
                          <Camera className="h-3 w-3" /> Capturing {deviceFrame === "mobile" ? "Mobile (WhatsApp)" : "Desktop"} screenshot…
                        </Badge>
                      ) : activeLead && (deviceFrame === "mobile" ? screenshots[`${activeLead.id}_mobile`] : (screenshots[`${activeLead.id}_desktop`] || screenshots[activeLead.id])) ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {deviceFrame === "mobile" ? "📱 Mobile Screenshot (WhatsApp Ready)" : "🖥️ Desktop Screenshot"} ready!
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                          <Camera className="h-3 w-3" /> {deviceFrame === "mobile" ? "Mobile screenshot not taken yet" : "Desktop screenshot not taken yet"}
                        </Badge>
                      )}
                    </div>
                    {activeLead && (() => {
                      const currentShot = deviceFrame === "mobile" ? screenshots[`${activeLead.id}_mobile`] : (screenshots[`${activeLead.id}_desktop`] || screenshots[activeLead.id]);
                      return (
                        <div className="flex items-center gap-2">
                          {currentShot && (
                            <a
                              href={currentShot}
                              download={`${activeLead.name.replace(/[^a-z0-9]/gi, "_")}_${deviceFrame}_preview.png`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download {deviceFrame === "mobile" ? "WhatsApp PNG" : "PNG"}
                            </a>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => takeScreenshot(activeLead, currentHtmlUrl, true, "home", deviceFrame === "mobile" ? "mobile" : "desktop")}
                            className="h-7 text-xs gap-1.5"
                          >
                            <Camera className="h-3 w-3" />
                            {currentShot ? "Recapture" : `Capture ${deviceFrame === "mobile" ? "Mobile" : "Desktop"}`}
                          </Button>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Screenshot display */}
                  {activeLead && (() => {
                    const isMobile = deviceFrame === "mobile";
                    const _tab = activePageTab[activeLead.id] || "home";
                    const _mobileSuffix = isMobile ? "_mobile" : "";
                    const _shotUrl = _tab !== "home" && multiPageShots[activeLead.id]?.[`${_tab}${_mobileSuffix}`]
                      ? multiPageShots[activeLead.id][`${_tab}${_mobileSuffix}`]
                      : isMobile
                        ? screenshots[`${activeLead.id}_mobile`]
                        : (screenshots[`${activeLead.id}_desktop`] || screenshots[activeLead.id]);
                    const _pg = _tab.split("_")[0];
                    const _lbl = _pg === "menu" ? "Menu" : _pg === "gallery" ? "Gallery" : _pg === "services" ? "Services" : "Home";

                    if (_shotUrl) {
                      return isMobile ? (
                        /* Mobile iPhone mockup */
                        <div className="flex flex-col items-center justify-center p-4 sm:p-6 bg-neutral-900/60 rounded-2xl border border-border/80">
                          <div className="text-center mb-3">
                            <span className="text-xs font-medium text-emerald-400">📱 Mobile WhatsApp View (390px)</span>
                            <p className="text-[11px] text-muted-foreground">Click image to inspect in full HD or download for WhatsApp</p>
                          </div>
                          <div
                            className="group relative max-w-[380px] w-full rounded-[36px] p-2 bg-neutral-800 border-4 border-neutral-700 shadow-2xl overflow-hidden cursor-zoom-in"
                            onClick={() => setLightboxImg(_shotUrl)}
                          >
                            <div className="w-24 h-4 bg-neutral-800 rounded-full mx-auto mb-2 flex items-center justify-center">
                              <div className="w-3 h-3 rounded-full bg-neutral-900 border border-neutral-700 mr-2" />
                              <div className="w-2 h-2 rounded-full bg-neutral-900" />
                            </div>
                            <div className="rounded-[24px] overflow-hidden bg-neutral-950 max-h-[640px] overflow-y-auto">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`${_shotUrl}?t=${Date.now()}`} alt={`${activeLead.name} mobile screenshot`} className="w-full h-auto object-top block" />
                            </div>
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                              <span className="bg-black/80 backdrop-blur-md px-3.5 py-1.5 rounded-lg text-white text-xs font-medium flex items-center gap-1.5 shadow-lg">
                                <Maximize2 className="h-3.5 w-3.5" /> Click to view full size
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Desktop full-width container */
                        <div className="group relative rounded-xl overflow-hidden border border-border bg-neutral-950 cursor-zoom-in shadow-lg" onClick={() => setLightboxImg(_shotUrl)}>
                          <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between text-xs text-muted-foreground">
                            <span>🖥️ Desktop Preview (1280px)</span>
                            <span>Click to expand full height</span>
                          </div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`${_shotUrl}?t=${Date.now()}`} alt={`${activeLead.name} ${_lbl}`} className="w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.005]" style={{ maxHeight: "650px" }} />
                          <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-xs flex items-center gap-1.5">
                            <Maximize2 className="h-3.5 w-3.5" /><span>Click to view full size</span>
                          </div>
                        </div>
                      );
                    }

                    if (screenshotting[activeLead.id]) return (
                      <div className="p-16 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col items-center justify-center gap-3 text-center">
                        <div className="h-12 w-12 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center animate-pulse"><Camera className="h-6 w-6" /></div>
                        <div className="font-semibold text-sm text-foreground">Taking {isMobile ? "mobile" : "desktop"} screenshot...</div>
                        <p className="text-xs text-muted-foreground">Rendering {activeLead.name}&apos;s website in {isMobile ? "390px mobile" : "1280px desktop"} viewport.</p>
                      </div>
                    );

                    return (
                      <div className="p-12 rounded-xl border border-dashed border-border bg-muted/10 flex flex-col items-center gap-3 text-center">
                        <Smartphone className="h-10 w-10 text-muted-foreground/40" />
                        <div>
                          <div className="text-sm font-semibold">{isMobile ? "Mobile Screenshot (WhatsApp Ready)" : "Desktop Screenshot"}</div>
                          <p className="text-xs text-muted-foreground mt-0.5">{isMobile ? "Capture a 390px phone-optimized screenshot perfect for sending over WhatsApp." : "Capture full 1280px desktop resolution."}</p>
                        </div>
                        {currentHtmlUrl && (
                          <Button size="sm" onClick={() => takeScreenshot(activeLead!, currentHtmlUrl, true, "home", isMobile ? "mobile" : "desktop")} className="text-xs gap-1.5">
                            <Camera className="h-3.5 w-3.5" /> Capture {isMobile ? "Mobile" : "Desktop"} Screenshot Now
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : currentHtmlUrl && viewMode === "iframe" ? (
                /* Live HTML iframe */
                <div className="rounded-xl border border-border bg-neutral-100 dark:bg-neutral-900 overflow-hidden shadow-md">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-200/80 dark:bg-neutral-800/80 border-b border-border">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <div className="bg-white dark:bg-neutral-700 rounded-md px-4 py-1 text-[11px] text-muted-foreground font-mono flex items-center gap-1.5 max-w-md w-full">
                        <Globe className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                        <span className="truncate">{activeLead.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.webeta.app</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 text-muted-foreground">
                      {deviceFrame === "desktop" ? "1280px" : deviceFrame === "tablet" ? "768px" : "375px"}
                    </Badge>
                  </div>
                  <div className="mx-auto bg-white transition-all duration-500 ease-out" style={{ maxWidth: `${DEVICE_WIDTHS[deviceFrame]}px`, width: "100%" }}>
                    <iframe ref={iframeRef} src={currentHtmlUrl} title={`${activeLead.name} website preview`}
                      className="w-full border-0"
                      style={{ height: deviceFrame === "mobile" ? "667px" : "700px" }}
                      sandbox="allow-scripts allow-same-origin" />
                  </div>
                </div>
              ) : activeStatus?.state === "error" ? (
                <div className="p-8 rounded-xl border border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center gap-2 text-center text-xs text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-semibold">HTML Compilation Failed</span>
                  <p className="text-[11px] text-muted-foreground max-w-md">{activeStatus.error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGenerateActive(true)}
                    className="mt-2 text-xs"
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                /* ── Empty State ──────────────────────────────────────────────── */
                <div className="p-10 rounded-xl border border-dashed border-border bg-muted/10 flex flex-col items-center justify-center gap-2 text-center">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-1">
                    <Code2 className="h-5 w-5" />
                  </div>
                  <div className="text-xs font-semibold text-foreground">
                    No live HTML preview yet
                  </div>
                  <p className="text-[11px] text-muted-foreground max-w-sm">
                    Click &quot;Compile Live Preview&quot; to generate a complete, interactive HTML website for {activeLead.name} using AI. The site will use real business data from Google Maps.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => handleGenerateActive(false)}
                    className="mt-2 text-xs font-semibold gap-1.5"
                  >
                    <Code2 className="h-3.5 w-3.5" /> Compile Live Preview
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Please select a business from the sidebar to view or generate its website preview.
            </div>
          )}
        </div>
      )}

      {/* ── Lightbox Modal for Screenshot Image ──────────────────────────────────── */}
      <AnimatePresence>
        {lightboxImg && activeLead && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 sm:p-6 backdrop-blur-md"
            onClick={() => setLightboxImg(null)}
          >
            <div
              className="relative max-w-5xl w-full h-[92vh] flex flex-col bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-neutral-950 border-b border-neutral-800 shrink-0 gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-white font-semibold text-sm truncate">
                    {activeLead.name}
                  </span>
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 shrink-0">
                    {lightboxImg.includes("_mobile") ? "📱 WhatsApp Mobile (390px)" : "🖥️ Desktop Full (1280px)"}
                  </Badge>
                </div>

                {/* Zoom / View controls */}
                <div className="flex items-center gap-1.5 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
                  <button
                    onClick={() => setLightboxZoom("mockup")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      lightboxZoom === "mockup" ? "bg-primary text-white shadow-sm" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    📱 Phone (390px)
                  </button>
                  <button
                    onClick={() => setLightboxZoom("fit")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      lightboxZoom === "fit" ? "bg-primary text-white shadow-sm" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    ↔️ Fit Screen
                  </button>
                  <button
                    onClick={() => setLightboxZoom("full")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      lightboxZoom === "full" ? "bg-primary text-white shadow-sm" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    🔍 100% Full HD
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <a
                    href={lightboxImg}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white transition-colors border border-neutral-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open Tab
                  </a>
                  <a
                    href={lightboxImg}
                    download={`${activeLead.name.replace(/[^a-z0-9]/gi, "_")}_${lightboxImg.includes("_mobile") ? "mobile" : "desktop"}_preview.png`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" /> Download PNG
                  </a>
                  <button
                    onClick={() => setLightboxImg(null)}
                    className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-neutral-950/90 flex justify-center items-start">
                {lightboxZoom === "mockup" ? (
                  /* Phone frame */
                  <div className="max-w-[400px] w-full rounded-[40px] p-2.5 bg-neutral-900 border-4 border-neutral-700 shadow-2xl overflow-hidden my-auto">
                    <div className="w-24 h-4 bg-neutral-800 rounded-full mx-auto mb-2 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full bg-neutral-950 border border-neutral-700 mr-2" />
                      <div className="w-2 h-2 rounded-full bg-neutral-950" />
                    </div>
                    <div className="rounded-[28px] overflow-hidden bg-neutral-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={lightboxImg}
                        alt={`${activeLead.name} mobile phone preview`}
                        className="w-full h-auto object-top block"
                      />
                    </div>
                  </div>
                ) : (
                  /* Standard / Full image */
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={lightboxImg}
                    alt={`${activeLead.name} full-page website screenshot`}
                    className={`h-auto rounded-lg shadow-2xl object-top block transition-all ${
                      lightboxZoom === "fit" ? "max-w-3xl w-full" : "w-full max-w-5xl"
                    }`}
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Lightbox Modal for Fullscreen HTML ──────────────────────────────────── */}
      <AnimatePresence>
        {lightboxHtml && activeLead && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-2 sm:p-4 backdrop-blur-sm"
            onClick={() => setLightboxHtml(null)}
          >
            <div
              className="relative w-full h-full max-w-7xl bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-3 border-b border-neutral-200 bg-neutral-100">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm text-neutral-900">
                    {activeLead.name} — Live HTML Preview (Fullscreen)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Device switcher inside fullscreen */}
                  {(["desktop", "tablet", "mobile"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDeviceFrame(d)}
                      className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold transition-all ${
                        deviceFrame === d
                          ? "bg-primary text-white"
                          : "bg-neutral-200 text-neutral-600 hover:bg-neutral-300"
                      }`}
                    >
                      {d === "desktop" ? "Desktop" : d === "tablet" ? "Tablet" : "Mobile"}
                    </button>
                  ))}
                  <a
                    href={lightboxHtml}
                    target="_blank"
                    rel="noreferrer"
                    className="h-8 px-3 rounded-lg text-xs font-medium bg-neutral-200 hover:bg-neutral-300 text-neutral-700 flex items-center gap-1.5 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open Tab</span>
                  </a>
                  <button
                    onClick={() => setLightboxHtml(null)}
                    className="h-8 w-8 rounded-lg bg-neutral-200 hover:bg-neutral-300 text-neutral-500 hover:text-neutral-900 flex items-center justify-center transition-colors"
                    aria-label="Close modal"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden bg-neutral-200 flex items-start justify-center p-4">
                <div
                  className="bg-white shadow-2xl rounded-lg overflow-hidden transition-all duration-500"
                  style={{
                    width: `${DEVICE_WIDTHS[deviceFrame]}px`,
                    maxWidth: "100%",
                    height: "100%",
                  }}
                >
                  <iframe
                    src={lightboxHtml}
                    title={`${activeLead.name} fullscreen preview`}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
