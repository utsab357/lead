"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhaseShell } from "./PhaseShell";
import { IncompleteState } from "./IncompleteState";
import {
  MessageCircle,
  Mail,
  Camera,
  Copy,
  ExternalLink,
  Clock,
  Sparkles,
  Loader2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Search,
  Check,
  Phone,
  MapPin,
  Star,
  ListFilter,
  X,
  Send,
  Languages,
  Download,
  RefreshCw,
  Image as ImageIcon,
  Zap,
  Users,
} from "lucide-react";
import type { RankedLead, OutreachChannel, OutreachLanguage, OutreachResult } from "@/lib/types";
import { toast } from "sonner";
import { WhatsAppBlast } from "./WhatsAppBlast";

export function Phase5Outreach({
  ranked,
  outreachResults,
  setOutreachResults,
  onNext,
  onPrev,
  initialLeadId,
  onSelectLead,
}: {
  ranked: RankedLead[];
  outreachResults: Record<string, OutreachResult>;
  setOutreachResults: (r: Record<string, OutreachResult>) => void;
  onNext?: () => void;
  onPrev: () => void;
  initialLeadId?: string | null;
  onSelectLead?: (leadId: string) => void;
}) {
  const [viewMode, setViewMode] = useState<"single" | "bulk">("bulk");
  const [activeLead, setActiveLead] = useState<RankedLead | null>(
    (initialLeadId ? ranked.find((l) => l.id === initialLeadId) : null) ?? ranked[0] ?? null
  );

  function selectLead(lead: RankedLead) {
    setActiveLead(lead);
    setError(null);
    onSelectLead?.(lead.id);
  }

  // Sync activeLead if initialLeadId changes from parent
  useEffect(() => {
    if (initialLeadId) {
      const match = ranked.find((l) => l.id === initialLeadId);
      if (match) setActiveLead(match);
    }
  }, [initialLeadId, ranked]);
  const [channel, setChannel] = useState<OutreachChannel>("whatsapp");
  const [lang, setLang] = useState<OutreachLanguage>("hinglish");
  const [generating, setGenerating] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const batchCancelRef = { current: false };
  const [error, setError] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [mobilePickerOpen, setMobilePickerOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"first" | "followup">("first");
  const [copiedType, setCopiedType] = useState<"first" | "followup" | null>(null);
  const [copiedImage, setCopiedImage] = useState(false);

  // Copy image binary blob to clipboard so user can press Ctrl+V directly in WhatsApp Web
  async function copyImageToClipboard(imageUrl: string) {
    try {
      setCopiedImage(true);
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      let pngBlob = blob;
      if (blob.type !== "image/png") {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.src = url;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0);
        pngBlob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b || blob), "image/png")
        );
        URL.revokeObjectURL(url);
      }
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      toast.success("Preview image copied! Press Ctrl+V directly in WhatsApp chat.");
      setTimeout(() => setCopiedImage(false), 2000);
    } catch {
      setCopiedImage(false);
      toast.error("Could not copy image directly. Click 'Download PNG' to attach manually!");
    }
  }

  // Local edits to message and followup (keyed by leadId)
  const [localEdits, setLocalEdits] = useState<Record<string, { message: string; followUp: string }>>({});

  // Previews map for leads: tracks whether preview images exist (supports all pages: Home, Menu, Gallery)
  const [previews, setPreviews] = useState<
    Record<string, { exists: boolean; previewUrl?: string; allUrls?: string[]; generating?: boolean }>
  >({});
  const [selectedPreviewTab, setSelectedPreviewTab] = useState<Record<string, string>>({});

  // Check cached previews once in batch (single fast request instead of 100+ separate GETs)
  useEffect(() => {
    if (ranked.length === 0) return;
    fetch("/api/generate-preview?list=true")
      .then((r) => r.json())
      .then((d) => {
        if (d.files && Array.isArray(d.files)) {
          const next: Record<string, { exists: boolean; previewUrl?: string; allUrls?: string[] }> = {};
          ranked.forEach((l) => {
            const hash = l.id.slice(-8);
            const cleanName = l.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15);
            const matches = d.files.filter((f: string) =>
              f.endsWith(".png") && (f.includes(hash) || f.includes(l.id) || (cleanName && f.toLowerCase().includes(cleanName)))
            );
            if (matches.length > 0) {
              matches.sort((a: string, b: string) => {
                const isHomeA = !a.includes("_menu") && !a.includes("_gallery") && !a.includes("_services") && !a.includes("_rooms") && !a.includes("_programs");
                const isHomeB = !b.includes("_menu") && !b.includes("_gallery") && !b.includes("_services") && !b.includes("_rooms") && !b.includes("_programs");
                if (isHomeA && !isHomeB) return -1;
                if (!isHomeA && isHomeB) return 1;
                return a.localeCompare(b);
              });
              const urls = matches.map((m: string) => `/previews/${m}`);
              next[l.id] = { exists: true, previewUrl: urls[0], allUrls: urls };
            }
          });
          setPreviews((prev) => ({ ...prev, ...next }));
        }
      })
      .catch(() => {});
  }, [ranked]);

  // Generate preview for active lead directly from Phase 5
  async function generateActivePreview() {
    if (!activeLead) return;
    setPreviews((prev) => ({ ...prev, [activeLead.id]: { exists: false, generating: true } }));
    try {
      const res = await fetch("/api/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: activeLead, force: true }),
      });
      const data = await res.json();
      if (data.ok && (data.previewUrl || data.desktopUrl)) {
        const url = data.previewUrl || data.desktopUrl;
        setPreviews((prev) => ({ ...prev, [activeLead.id]: { exists: true, previewUrl: url, generating: false } }));
        toast.success(`Website preview generated for ${activeLead.name}!`);
      } else {
        setPreviews((prev) => ({ ...prev, [activeLead.id]: { exists: false, generating: false } }));
        toast.error(data.error || "Failed to generate preview image");
      }
    } catch {
      setPreviews((prev) => ({ ...prev, [activeLead.id]: { exists: false, generating: false } }));
      toast.error("Network error generating preview");
    }
  }

  // Clean message text: eliminate duplicate webeta.site URLs and corrupt emoji characters
  function prepareOutreachText(raw: string, type: "first" | "followup" = "first"): string {
    if (!raw) return "";
    let clean = raw;
    // 1. Remove/replace emojis and characters that get corrupted into  in WhatsApp URLs
    clean = clean.replace(/[\uFFFD\uD83D\uDC47\uD83D\uDC48]/g, ""); // strip , 👇, 👉
    clean = clean.replace(/👇|👉/g, ":");

    if (type === "first") {
      // In first message, remove website links so WhatsApp does not show the agency logo card
      // instead of the client's own website preview image!
      clean = clean.replace(/\(?\s*https?:\/\/[^\s)]+\s*\)?/gi, "");
      clean = clean.replace(/or explore our work at\s*/gi, "");
      clean = clean.replace(/visit us at\s*/gi, "");
    } else {
      // In follow-up message, keep https://webeta.site once at the end
      const matches = [...clean.matchAll(/https:\/\/webeta\.site/gi)];
      if (matches.length > 1) {
        let count = 0;
        clean = clean.replace(/\(?\s*https:\/\/webeta\.site\s*\)?/gi, () => {
          count++;
          if (count < matches.length) return "";
          return " https://webeta.site";
        });
      }
    }

    clean = clean.replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").replace(/\s+([.,!?:])/g, "$1").trim();
    return clean;
  }

  const result = activeLead ? outreachResults[activeLead.id] : null;
  const localEdit = activeLead ? localEdits[activeLead.id] : null;
  const rawMessage = localEdit?.message ?? result?.first ?? "";
  const rawFollowUp = localEdit?.followUp ?? result?.followUp ?? "";
  const message = prepareOutreachText(rawMessage, "first");
  const followUp = prepareOutreachText(rawFollowUp, "followup");
  const bestSendTime = result?.bestSendTime ?? "";

  const activeIndex = activeLead ? ranked.findIndex((l) => l.id === activeLead.id) : -1;
  const doneCount = Object.keys(outreachResults).length;

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

  function goToIndex(idx: number) {
    if (idx >= 0 && idx < ranked.length) {
      selectLead(ranked[idx]);
    }
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
      const data = (await res.json()) as OutreachResult;
      setOutreachResults({ ...outreachResults, [activeLead.id]: data });
      setLocalEdits((prev) => {
        const n = { ...prev };
        delete n[activeLead.id];
        return n;
      });
      toast.success("AI drafted outreach messages");
    } catch (e) {
      setError((e as Error).message);
      toast.error("Draft failed");
    } finally {
      setGenerating(false);
    }
  }

  async function generateAllRemaining() {
    const remaining = ranked.filter((l) => !outreachResults[l.id]);
    if (remaining.length === 0) {
      toast.info("All leads already drafted!");
      return;
    }
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
          const data = (await res.json()) as OutreachResult;
          localResults = { ...localResults, [lead.id]: data };
          setOutreachResults(localResults);
        }
      } catch {
        /* skip failed lead, continue */
      }
      setBatchProgress({ done: i + 1, total: remaining.length });
    }
    setBatchRunning(false);
    setBatchProgress(null);
    toast.success("Done generating remaining outreach!");
  }

  function stopBatch() {
    batchCancelRef.current = true;
  }

  function updateMessage(val: string) {
    if (!activeLead) return;
    setLocalEdits((prev) => ({
      ...prev,
      [activeLead.id]: {
        ...prev[activeLead.id],
        message: val,
        followUp: prev[activeLead.id]?.followUp ?? followUp,
      },
    }));
  }

  function updateFollowUp(val: string) {
    if (!activeLead) return;
    setLocalEdits((prev) => ({
      ...prev,
      [activeLead.id]: {
        ...prev[activeLead.id],
        followUp: val,
        message: prev[activeLead.id]?.message ?? message,
      },
    }));
  }

  function copy(text: string, type: "first" | "followup") {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedType(null), 2000);
  }

  async function openChannel(type: "first" | "followup" = "first") {
    if (!activeLead) return;
    const rawText = type === "first" ? message : followUp;
    const textToSend = prepareOutreachText(rawText, type);

    if (channel === "whatsapp" && activeLead.whatsapp) {
      const num = activeLead.whatsapp.replace(/\D/g, "");

      // For first message only: copy client mockup to clipboard AND auto-download
      if (type === "first" && previews[activeLead.id]?.exists && previews[activeLead.id]?.previewUrl) {
        // 1. Copy client preview image to clipboard (for instant Ctrl+V)
        copyImageToClipboard(previews[activeLead.id].previewUrl!);

        // 2. Auto-download PNG so it's in the browser download bar ready to drag-and-drop
        try {
          const dl = document.createElement("a");
          dl.href = previews[activeLead.id].previewUrl!;
          dl.download = `${activeLead.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-preview.png`;
          document.body.appendChild(dl);
          dl.click();
          document.body.removeChild(dl);
        } catch {
          // ignore
        }
      }

      window.open(`https://wa.me/${num}?text=${encodeURIComponent(textToSend)}`, "_blank");

      if (type === "first") {
        if (previews[activeLead.id]?.exists) {
          toast.info("WhatsApp opened! Client website preview copied (press Ctrl+V) & downloaded.", { duration: 7000 });
        } else {
          toast.info("WhatsApp opened! (Tip: Generate a preview image above to attach with your message)", { duration: 5000 });
        }
      } else {
        toast.success("WhatsApp opened with Day-3 follow-up!");
      }
    } else if (channel === "email" && activeLead.email) {
      const subject =
        lang === "hinglish"
          ? `Aapke business (${activeLead.name}) ke liye ek website demo`
          : `Custom website demo for ${activeLead.name}`;
      window.open(
        `mailto:${activeLead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(textToSend)}`,
        "_blank"
      );
    } else if (channel === "instagram") {
      window.open(`https://instagram.com/`, "_blank");
    } else {
      toast.error("No direct contact for this channel. Copied message instead!");
      navigator.clipboard.writeText(textToSend);
    }
  }

  const channels: { id: OutreachChannel; label: string; icon: typeof MessageCircle; enabled: boolean; note?: string }[] =
    activeLead
      ? [
          {
            id: "whatsapp",
            label: "WhatsApp",
            icon: MessageCircle,
            enabled: !!activeLead.whatsapp,
            note: activeLead.whatsapp ? "Available" : "No WhatsApp",
          },
          {
            id: "email",
            label: "Email",
            icon: Mail,
            enabled: !!activeLead.email,
            note: activeLead.email ? "Available" : "No email",
          },
          {
            id: "instagram",
            label: "Instagram",
            icon: Camera,
            enabled: true,
            note: "Direct DM",
          },
        ]
      : [];

  const filteredLeads = ranked.filter((l) => {
    const q = sidebarSearch.toLowerCase();
    return (
      !q ||
      l.name.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q) ||
      l.category.toLowerCase().includes(q)
    );
  });

  const readyCount = ranked.filter(
    (l) => outreachResults[l.id] && l.whatsapp && l.whatsapp.replace(/\D/g, "").length >= 10
  ).length;

  return (
    <PhaseShell
      title="Phase 5 — Outreach"
      subtitle={`AI writes a personalized first touch + day-3 follow-up for each lead. ${doneCount}/${ranked.length} drafted.`}
      onPrev={onPrev}
      onNext={onNext}
      nextLabel="Build site"
      nextDisabled={doneCount === 0}
    >
      {/* ── TOP MODE SWITCHER TABS ── */}
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-border">
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setViewMode("single")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              viewMode === "single"
                ? "bg-card text-foreground shadow-xs border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Single Lead Review ({ranked.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("bulk")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              viewMode === "bulk"
                ? "bg-primary text-primary-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap className="h-4 w-4" />
            <span>WhatsApp Bulk Auto-Sender</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                viewMode === "bulk"
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {readyCount} ready
            </span>
          </button>
        </div>
      </div>

      {viewMode === "bulk" ? (
        <WhatsAppBlast
          ranked={ranked}
          outreachResults={outreachResults}
          previews={previews}
          onBackToSingle={() => setViewMode("single")}
        />
      ) : (
        <>
          {/* ── MOBILE LEAD SELECTOR STRIP (< lg) ── */}
          <div className="lg:hidden mb-4">
        <div className="bg-card border border-border rounded-xl p-3 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg shrink-0"
                onClick={() => goToIndex(activeIndex - 1)}
                disabled={activeIndex <= 0}
                aria-label="Previous lead"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg shrink-0"
                onClick={() => goToIndex(activeIndex + 1)}
                disabled={activeIndex >= ranked.length - 1}
                aria-label="Next lead"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground ml-1">
                {activeIndex + 1} of {ranked.length}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setMobilePickerOpen(true)}
              className="h-8 text-xs font-medium gap-1.5 px-2.5 rounded-lg"
            >
              <ListFilter className="h-3.5 w-3.5 text-primary" />
              <span>All Leads ({ranked.length})</span>
            </Button>
          </div>

          {activeLead && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-foreground truncate">{activeLead.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {activeLead.category} · {activeLead.city}
                </div>
              </div>
              <div className="shrink-0">
                {result ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Drafted
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    Not drafted
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MOBILE LEADS DRAWER MODAL ── */}
      {mobilePickerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs lg:hidden animate-in fade-in-0 duration-150">
          <div
            className="fixed inset-0"
            onClick={() => setMobilePickerOpen(false)}
            aria-hidden="true"
          />
          <div className="relative bg-background border-t border-border rounded-t-2xl max-h-[80vh] flex flex-col shadow-2xl z-10">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Select Lead ({ranked.length})</h3>
                <p className="text-[11px] text-muted-foreground">{doneCount} of {ranked.length} outreach drafted</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={() => setMobilePickerOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-3 border-b border-border bg-muted/20">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name, city or category…"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-[55vh]">
              {filteredLeads.map((lead) => {
                const isSelected = activeLead?.id === lead.id;
                const isDone = !!outreachResults[lead.id];
                const originalIndex = ranked.indexOf(lead) + 1;
                return (
                  <button
                    key={lead.id}
                    onClick={() => {
                      selectLead(lead);
                      setMobilePickerOpen(false);
                    }}
                    className={`w-full text-left rounded-xl border p-2.5 transition-colors flex items-center gap-2.5 ${
                      isSelected
                        ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/40 font-medium"
                        : "border-border hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="text-xs tabular-nums text-muted-foreground w-6 shrink-0 font-mono">
                      #{originalIndex}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">{lead.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {lead.category} · {lead.city}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {previews[lead.id]?.exists && (
                        <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-border" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-3 border-t border-border bg-muted/30 flex justify-between items-center">
              {!batchRunning && ranked.filter((l) => !outreachResults[l.id]).length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMobilePickerOpen(false);
                    generateAllRemaining();
                  }}
                  className="text-xs h-8 text-primary border-primary/30"
                >
                  Draft remaining ({ranked.filter((l) => !outreachResults[l.id]).length})
                </Button>
              )}
              <Button
                size="sm"
                className="text-xs h-8 ml-auto"
                onClick={() => setMobilePickerOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── DESKTOP & WORKSPACE GRID ── */}
      <div className="grid lg:grid-cols-[280px_1fr] gap-6 items-start">
        {/* DESKTOP SIDEBAR (hidden on mobile) */}
        <aside className="hidden lg:flex flex-col gap-3 sticky top-6 bg-card border border-border rounded-xl p-3 shadow-xs">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-foreground">Ranked Leads</span>
            <span className="text-[11px] text-muted-foreground font-medium">
              {doneCount}/{ranked.length} drafted
            </span>
          </div>

          {/* Batch controls */}
          {!batchRunning && ranked.filter((l) => !outreachResults[l.id]).length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={generateAllRemaining}
              disabled={generating}
              className="w-full text-xs h-8 font-medium border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
            >
              Draft all remaining ({ranked.filter((l) => !outreachResults[l.id]).length})
            </Button>
          )}

          {batchRunning && (
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="text-xs text-foreground font-medium">
                  {batchProgress?.done}/{batchProgress?.total}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={stopBatch}
                className="h-6 text-[10px] text-destructive hover:bg-destructive/10 px-2"
              >
                Stop
              </Button>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search leads…"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Scrollable list */}
          <div className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
            {filteredLeads.map((lead) => {
              const done = !!outreachResults[lead.id];
              const active = activeLead?.id === lead.id;
              const originalIndex = ranked.indexOf(lead) + 1;
              return (
                <button
                  key={lead.id}
                  onClick={() => {
                    selectLead(lead);
                  }}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-all flex items-center gap-2.5 cursor-pointer ${
                    active
                      ? "border-primary bg-primary/8 text-foreground shadow-2xs font-medium ring-1 ring-primary/30"
                      : "border-border hover:border-primary/40 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-xs tabular-nums w-5 shrink-0 font-mono text-muted-foreground">
                    #{originalIndex}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate">{lead.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{lead.category}</div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    {previews[lead.id]?.exists && (
                      <span title="Website Preview Image Ready">
                        <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />
                      </span>
                    )}
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 opacity-30" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── MAIN WORKSPACE ── */}
        <main className="min-w-0 space-y-4">
          {activeLead && (
            <>
              {/* Profile Card */}
              <Card className="border-border shadow-xs">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold font-mono px-2 py-0.5 rounded-md bg-muted text-foreground">
                          #{activeIndex + 1}
                        </span>
                        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
                          {activeLead.name}
                        </h2>
                        {activeLead.rating && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-semibold">
                            <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
                            {activeLead.rating}
                            {activeLead.reviewsCount ? (
                              <span className="text-muted-foreground font-normal">({activeLead.reviewsCount})</span>
                            ) : null}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                        <span>{activeLead.category}</span>
                        <span>·</span>
                        <span>{activeLead.city}</span>
                        {activeLead.address && (
                          <>
                            <span className="hidden sm:inline">·</span>
                            <span className="hidden sm:inline truncate max-w-sm">{activeLead.address}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Quick contact buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {activeLead.phone && (
                        <a
                          href={`tel:${activeLead.phone}`}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                        >
                          <Phone className="h-3 w-3" />
                          <span className="tabular-nums">{activeLead.phone}</span>
                        </a>
                      )}
                      {activeLead.mapUrl && (
                        <a
                          href={activeLead.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <MapPin className="h-3 w-3 text-blue-500" />
                          <span>Map</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Channel & Language Controls */}
                  <div className="mt-4 pt-4 border-t border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-muted-foreground mr-1">Channel:</span>
                      <div className="inline-flex p-0.5 rounded-lg bg-muted/60 border border-border">
                        {channels.map(({ id, label, icon: Icon, enabled }) => (
                          <button
                            key={id}
                            disabled={!enabled}
                            onClick={() => setChannel(id)}
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
                              channel === id
                                ? "bg-background text-foreground shadow-2xs font-semibold"
                                : enabled
                                ? "text-muted-foreground hover:text-foreground"
                                : "text-muted-foreground/40 cursor-not-allowed"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Language Switch */}
                      <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-muted/60 border border-border">
                        <Languages className="h-3.5 w-3.5 text-muted-foreground ml-2" />
                        <button
                          onClick={() => setLang("english")}
                          className={`text-xs px-2.5 py-1 rounded-md transition-all font-medium ${
                            lang === "english"
                              ? "bg-background text-foreground shadow-2xs font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          English
                        </button>
                        <button
                          onClick={() => setLang("hinglish")}
                          className={`text-xs px-2.5 py-1 rounded-md transition-all font-medium ${
                            lang === "hinglish"
                              ? "bg-background text-foreground shadow-2xs font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Hinglish
                        </button>
                      </div>

                      {/* Primary Generate Button */}
                      <Button
                        onClick={generate}
                        disabled={generating}
                        className="h-9 px-4 font-semibold text-xs rounded-lg transition-transform active:scale-[0.98]"
                      >
                        {generating ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Drafting…
                          </>
                        ) : result ? (
                          <>
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            Regenerate
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            Draft outreach
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Status messages */}
              {generating && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <span className="text-xs sm:text-sm font-medium text-foreground">
                    AI is crafting personalized outreach in {lang === "hinglish" ? "Hinglish" : "English"} for {activeLead.name}…
                  </span>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center justify-between text-xs sm:text-sm text-destructive">
                  <span>{error}</span>
                  <Button variant="outline" size="sm" onClick={generate} className="h-7 text-xs">
                    Retry
                  </Button>
                </div>
              )}

              {/* Empty state when not drafted */}
              {!result && !generating && !error && (
                <Card className="border-dashed border-2 border-border/80">
                  <CardContent className="py-12 px-4 text-center">
                    <div className="h-11 w-11 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center mb-3">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold text-foreground">No outreach drafted yet</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                      Choose your channel (WhatsApp, Email, or Instagram) and language above, then tap{" "}
                      <strong>&ldquo;Draft outreach&rdquo;</strong> to generate custom messaging for {activeLead.name}.
                    </p>
                    <Button onClick={generate} className="mt-4 h-9 px-5 text-xs font-semibold">
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Draft message now
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Draft Results: Responsive layout */}
              {(result || localEdit) && !generating && (
                <div className="space-y-4">
                  {/* Mobile Tab Toggle (< md) */}
                  <div className="md:hidden flex rounded-lg bg-muted/60 p-1 border border-border">
                    <button
                      onClick={() => setMobileTab("first")}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                        mobileTab === "first"
                          ? "bg-background text-foreground shadow-2xs font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      First Message
                    </button>
                    <button
                      onClick={() => setMobileTab("followup")}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                        mobileTab === "followup"
                          ? "bg-background text-foreground shadow-2xs font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      Day-3 Follow-up
                    </button>
                  </div>

                  {/* ── Client Website Preview Showcase Card ── */}
                  {activeLead && (
                    <Card className="border-border shadow-xs overflow-hidden">
                      <CardHeader className="p-4 pb-2 border-b border-border/60 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <CardTitle className="text-sm font-semibold">Client Website Preview Mockup</CardTitle>
                          {previews[activeLead.id]?.exists ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                              Ready to Attach
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Not Generated
                            </Badge>
                          )}
                        </div>
                        {previews[activeLead.id]?.exists && previews[activeLead.id]?.previewUrl && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyImageToClipboard(previews[activeLead.id].previewUrl!)}
                              className="h-7 text-xs px-2.5 font-medium gap-1 text-primary border-primary/30 hover:bg-primary/5"
                            >
                              {copiedImage ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-500" /> Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" /> Copy Image (Ctrl+V)
                                </>
                              )}
                            </Button>
                            <a
                              href={previews[activeLead.id].previewUrl}
                              download={`${activeLead.name.toLowerCase().replace(/\s+/g, "-")}-preview.png`}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground font-medium transition-colors"
                            >
                              <Download className="h-3 w-3" /> Download PNG
                            </a>
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="p-4">
                        {previews[activeLead.id]?.generating ? (
                          <div className="py-8 flex flex-col items-center justify-center gap-2 bg-muted/20 rounded-lg border border-dashed border-border">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span className="text-xs text-muted-foreground">Generating 2027 visual mockup for {activeLead.name} via Cloudflare FLUX…</span>
                          </div>
                        ) : previews[activeLead.id]?.exists && previews[activeLead.id]?.previewUrl ? (() => {
                          const currentLeadPreviews = previews[activeLead.id];
                          const allImageUrls = currentLeadPreviews.allUrls && currentLeadPreviews.allUrls.length > 0
                            ? currentLeadPreviews.allUrls
                            : [currentLeadPreviews.previewUrl!];
                          const activeTabKey = selectedPreviewTab[activeLead.id] || allImageUrls[0];

                          const getLabel = (url: string) => {
                            if (url.includes("_menu")) return "🍽️ Menu";
                            if (url.includes("_gallery")) return "📸 Gallery";
                            if (url.includes("_services")) return "⚙️ Services";
                            if (url.includes("_rooms")) return "🛏️ Rooms";
                            if (url.includes("_programs")) return "💪 Programs";
                            return "🏠 Home";
                          };

                          return (
                            <div className="space-y-3">
                              {/* If multi-page previews exist, show tab switcher */}
                              {allImageUrls.length > 1 && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-semibold text-muted-foreground mr-1">Preview Pages:</span>
                                  {allImageUrls.map((url) => {
                                    const isCurrent = activeTabKey === url;
                                    return (
                                      <button
                                        key={url}
                                        type="button"
                                        onClick={() => setSelectedPreviewTab((prev) => ({ ...prev, [activeLead.id]: url }))}
                                        className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                                          isCurrent
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                                        }`}
                                      >
                                        {getLabel(url)}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              <div className="flex flex-col sm:flex-row items-start gap-4">
                                <div className="relative group shrink-0 w-full sm:w-64 h-40 rounded-lg overflow-hidden border border-border bg-black/5 shadow-xs">
                                  <img
                                    src={activeTabKey}
                                    alt={`${activeLead.name} ${getLabel(activeTabKey)}`}
                                    className="w-full h-full object-cover object-top transition-transform group-hover:scale-105"
                                  />
                                  <a
                                    href={activeTabKey}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold gap-1 transition-opacity"
                                  >
                                    <ExternalLink className="h-4 w-4" /> Full View ({getLabel(activeTabKey)})
                                  </a>
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    <span>
                                      {allImageUrls.length > 1
                                        ? `${allImageUrls.length} Website Preview Pages Ready`
                                        : "Design Preview Image Ready (PNG)"}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                    <strong>Best Practice:</strong> When outreach runs via WhatsApp Auto-Sender, all {allImageUrls.length} preview pages are automatically sent directly to the client before the personalized message.
                                  </p>

                                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => copyImageToClipboard(activeTabKey)}
                                      className="h-7 text-xs px-2.5 font-medium gap-1"
                                    >
                                      {copiedImage ? (
                                        <>
                                          <Check className="h-3 w-3 text-emerald-500" /> Copied {getLabel(activeTabKey)}
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="h-3 w-3" /> Copy {getLabel(activeTabKey)} (Ctrl+V)
                                        </>
                                      )}
                                    </Button>
                                    <a
                                      href={activeTabKey}
                                      download={`${activeLead.name.toLowerCase().replace(/\s+/g, "-")}-${getLabel(activeTabKey).replace(/[^a-z0-9]/gi, "").toLowerCase()}-preview.png`}
                                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground font-medium transition-colors"
                                    >
                                      <Download className="h-3 w-3" /> Download PNG
                                    </a>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={generateActivePreview}
                                      className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                                    >
                                      <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
                                    </Button>
                                  </div>

                                  {/* Multi-page thumbnail gallery strip */}
                                  {allImageUrls.length > 1 && (
                                    <div className="mt-3 pt-3 border-t border-border/60">
                                      <div className="text-[10px] font-semibold text-muted-foreground mb-1.5">
                                        All Generated Pages ({allImageUrls.length}):
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {allImageUrls.map((imgUrl) => (
                                          <button
                                            key={imgUrl}
                                            type="button"
                                            onClick={() => setSelectedPreviewTab((prev) => ({ ...prev, [activeLead.id]: imgUrl }))}
                                            className={`group relative w-16 h-12 rounded border overflow-hidden transition-all ${
                                              activeTabKey === imgUrl
                                                ? "ring-2 ring-primary border-primary"
                                                : "opacity-70 hover:opacity-100 border-border"
                                            }`}
                                            title={`Switch to ${getLabel(imgUrl)}`}
                                          >
                                            <img src={imgUrl} alt={getLabel(imgUrl)} className="w-full h-full object-cover object-top" />
                                            <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-white font-mono text-center truncate px-0.5">
                                              {getLabel(imgUrl).split(" ")[1] || getLabel(imgUrl)}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })() : (
                          <div className="py-4 px-4 rounded-lg bg-muted/20 border border-dashed border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                            <div>
                              <div className="text-xs font-semibold text-foreground">No visual mockup generated yet</div>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Generate an agency-grade 2027 concept preview to send alongside your message.
                              </p>
                            </div>
                            <Button
                              size="sm"
                              onClick={generateActivePreview}
                              className="h-8 text-xs font-medium px-3 bg-primary text-primary-foreground shrink-0"
                            >
                              <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate Preview Image
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Message Cards */}
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* First Message Card */}
                    <Card className={`border-border shadow-xs ${mobileTab !== "first" ? "hidden md:flex flex-col" : "flex flex-col"}`}>
                      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between border-b border-border/60">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-semibold">First Message</CardTitle>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            Day 1
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copy(message, "first")}
                            className="h-8 text-xs px-2.5"
                          >
                            {copiedType === "first" ? (
                              <>
                                <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5 mr-1" />
                                Copy
                              </>
                            )}
                          </Button>
                          <Button size="sm" onClick={() => openChannel("first")} className="h-8 text-xs px-2.5">
                            <Send className="h-3.5 w-3.5 mr-1" />
                            Send
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 flex-1 flex flex-col">
                        <textarea
                          value={message}
                          onChange={(e) => updateMessage(e.target.value)}
                          className="w-full flex-1 min-h-[220px] text-xs sm:text-sm font-mono leading-relaxed p-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                          placeholder="First touch message..."
                        />
                        <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                          <span>{message.length} chars · {message.split(/\s+/).filter(Boolean).length} words</span>
                          <span>Editable</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Day-3 Follow-up Card */}
                    <Card className={`border-border shadow-xs ${mobileTab !== "followup" ? "hidden md:flex flex-col" : "flex flex-col"}`}>
                      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between border-b border-border/60">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-semibold">Day-3 Follow-up</CardTitle>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            Day 3
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copy(followUp, "followup")}
                            className="h-8 text-xs px-2.5"
                          >
                            {copiedType === "followup" ? (
                              <>
                                <Check className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5 mr-1" />
                                Copy
                              </>
                            )}
                          </Button>
                          <Button size="sm" onClick={() => openChannel("followup")} className="h-8 text-xs px-2.5">
                            <Send className="h-3.5 w-3.5 mr-1" />
                            Send
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 flex-1 flex flex-col">
                        <textarea
                          value={followUp}
                          onChange={(e) => updateFollowUp(e.target.value)}
                          className="w-full flex-1 min-h-[220px] text-xs sm:text-sm font-mono leading-relaxed p-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                          placeholder="Follow-up message..."
                        />
                        <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                          <span>{followUp.length} chars · {followUp.split(/\s+/).filter(Boolean).length} words</span>
                          <span>Editable</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Send Time & Next Lead Footer */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-card">
                    {bestSendTime ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                        <Clock className="h-4 w-4 text-primary shrink-0" />
                        <span>Best send time: <strong className="text-foreground">{bestSendTime}</strong></span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Drafts automatically sync with Phase 7 export.
                      </div>
                    )}

                    {activeIndex < ranked.length - 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => goToIndex(activeIndex + 1)}
                        className="text-xs font-semibold gap-1 h-8 sm:ml-auto"
                      >
                        Next Lead (#{activeIndex + 2}) <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
        </>
      )}
    </PhaseShell>
  );
}
