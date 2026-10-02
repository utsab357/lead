"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Camera, Square, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { RankedLead } from "@/lib/types";

interface Props {
  ranked: RankedLead[];
  buildPrompts: Record<string, any>;
}

// Auto-detect pages for a business category (3-4 pages per type)
function getPagesForLead(lead: RankedLead): string[] {
  const cat = (lead.category || "").toLowerCase();
  if (/cafe|coffee|restaurant|dining|food|pizza|bar|bakery|dhaba|biryani|sweets/.test(cat))
    return ["home", "menu", "gallery"];
  if (/gym|fitness|yoga|crossfit|zumba|pilates/.test(cat))
    return ["home", "programs", "gallery"];
  if (/clinic|doctor|dental|hospital|pharmacy|eye|health/.test(cat))
    return ["home", "services"];
  if (/hotel|resort|lodge|homestay|inn/.test(cat))
    return ["home", "rooms", "gallery"];
  if (/salon|spa|beauty|parlour|grooming/.test(cat))
    return ["home", "services", "gallery"];
  // Tech, agency, retail, general — 3 pages
  return ["home", "services", "portfolio"];
}

export function BulkCompileButton({ ranked, buildPrompts }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const stopRef = useRef(false);

  // Modal options
  const [fromIdx, setFromIdx] = useState(1);       // 1-based "from" lead index
  const [toIdx, setToIdx]     = useState(10);      // 1-based "to" lead index
  const [skipMode, setSkipMode] = useState<"skip-done" | "all">("skip-done");
  const [pageMode, setPageMode] = useState<"home" | "all">("home");
  const [device, setDevice]   = useState<"desktop" | "mobile" | "both">("desktop");

  // Leads that will actually be processed given current settings
  const rangeLeads = ranked.slice(Math.max(0, fromIdx - 1), toIdx);

  if (running) {
    return (
      <div className="flex items-center gap-2 w-full">
        <Button
          size="sm"
          variant="outline"
          className="w-full h-8 text-xs gap-1.5 border-amber-500 text-amber-600"
          onClick={() => { stopRef.current = true; }}
        >
          <Square className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
          Stop ({progress?.done}/{progress?.total})
        </Button>
        {progress && (
          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] animate-pulse gap-1 whitespace-nowrap shrink-0">
            <Loader2 className="h-3 w-3 animate-spin" />
            {(progress.current || "Starting…").slice(0, 18)}
          </Badge>
        )}
      </div>
    );
  }

  const handleStart = async () => {
    setShowModal(false);
    stopRef.current = false;
    setRunning(true);

    // Get existing screenshot files to skip
    let existingFiles: string[] = [];
    try {
      const r = await fetch("/api/screenshot-preview?list=true");
      const d = await r.json();
      existingFiles = d.files || [];
    } catch {}

    const hasScreenshot = (lead: RankedLead) => {
      const hash = lead.id.slice(-8);
      return existingFiles.some((f: string) => f.endsWith(".png") && f.includes(hash));
    };

    // Apply range (1-based)
    let todo = ranked.slice(Math.max(0, fromIdx - 1), toIdx);

    // Apply skip mode
    if (skipMode === "skip-done") {
      todo = todo.filter(l => !hasScreenshot(l));
    }

    const devices: Array<"desktop" | "mobile"> = device === "both" ? ["desktop", "mobile"] : [device];

    setProgress({ done: 0, total: todo.length, current: "" });

    if (todo.length === 0) {
      toast.success("Nothing to do — all selected leads already have screenshots!");
      setRunning(false);
      setProgress(null);
      return;
    }

    let failed = 0;

    for (let i = 0; i < todo.length; i++) {
      if (stopRef.current) break;
      const lead = todo[i];
      setProgress({ done: i, total: todo.length, current: lead.name });

      const strategy = buildPrompts?.[lead.id]?.strategy;
      const pages = pageMode === "all" ? getPagesForLead(lead) : ["home"];

      for (const page of pages) {
        if (stopRef.current) break;
        try {
          const compileRes = await fetch("/api/compile-html", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lead, style: "ai-decides", strategy, page }),
          });
          const compileData = await compileRes.json();
          if (!compileData.ok || !compileData.htmlUrl) { failed++; continue; }

          for (const dev of devices) {
            if (stopRef.current) break;
            await fetch("/api/screenshot-preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                htmlUrl: compileData.htmlUrl,
                leadId: lead.id,
                businessName: lead.name,
                page, device: dev, lead,
                category: lead.category, city: lead.city, phone: lead.phone,
              }),
            });
            await new Promise(r => setTimeout(r, 250));
          }
        } catch { failed++; }
      }
    }

    const done = todo.length - failed;
    setRunning(false);
    setProgress(null);
    stopRef.current = false;

    toast[failed === 0 ? "success" : "warning"](
      `Bulk done! ${done} leads compiled${failed ? `, ${failed} failed` : ""}.`
    );
  };

  return (
    <div className="relative w-full">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setShowModal(v => !v)}
        className="w-full h-8 text-xs gap-1.5 font-medium border-primary/40 text-primary hover:bg-primary/5"
      >
        <Camera className="h-3.5 w-3.5" />
        Bulk Compile &amp; Screenshot
        <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${showModal ? "rotate-180" : ""}`} />
      </Button>

      {showModal && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-card border border-border rounded-xl shadow-xl p-3 space-y-3">

          {/* Range selector */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-2">WHICH LEADS? (ranked #1 = top lead)</p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">From</span>
                <input
                  type="number"
                  min={1}
                  max={ranked.length}
                  value={fromIdx}
                  onChange={e => setFromIdx(Math.max(1, Math.min(ranked.length, Number(e.target.value))))}
                  className="w-14 px-2 py-1 text-xs rounded-md border border-border bg-background text-center focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">to</span>
                <input
                  type="number"
                  min={fromIdx}
                  max={ranked.length}
                  value={toIdx}
                  onChange={e => setToIdx(Math.max(fromIdx, Math.min(ranked.length, Number(e.target.value))))}
                  className="w-14 px-2 py-1 text-xs rounded-md border border-border bg-background text-center focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <span className="text-[10px] text-muted-foreground ml-auto">= {rangeLeads.length} leads</span>
            </div>
            {/* Quick range presets */}
            <div className="flex gap-1 mt-1.5">
              {[[1,5],[1,10],[1,25],[1,ranked.length]].map(([f,t]) => (
                <button key={`${f}-${t}`}
                  onClick={() => { setFromIdx(f); setToIdx(t); }}
                  className="px-2 py-0.5 rounded text-[10px] border border-border bg-muted text-muted-foreground hover:border-primary/40 transition-all"
                >
                  {t === ranked.length ? "All" : `1–${t}`}
                </button>
              ))}
            </div>
          </div>

          {/* Skip already done? */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">IF ALREADY DONE?</p>
            <div className="flex gap-1">
              {([["skip-done", "⏭️ Skip (recommended)"], ["all", "🔄 Redo all"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setSkipMode(v)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                    skipMode === v ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>

          {/* Pages */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">PAGES TO GENERATE</p>
            <div className="flex gap-1">
              <button onClick={() => setPageMode("home")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                  pageMode === "home" ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/40"
                }`}
              >🏠 Home only</button>
              <button onClick={() => setPageMode("all")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                  pageMode === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/40"
                }`}
              >📄 All pages (3–4 per business)</button>
            </div>
            {pageMode === "all" && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Auto-detected per type: Cafe → Home+Menu+Gallery · Gym → Home+Programs+Gallery · Hotel → Home+Rooms+Gallery · Clinic → Home+Services · Others → Home+Services+Portfolio
              </p>
            )}
          </div>

          {/* Device */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">DEVICE</p>
            <div className="flex gap-1">
              {([["desktop", "🖥️ Desktop"], ["mobile", "📱 Mobile"], ["both", "🖥️+📱 Both"]] as const).map(([d, label]) => (
                <button key={d} onClick={() => setDevice(d)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                    device === d ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1 border-t border-border">
            <Button size="sm" className="flex-1 h-8 text-xs font-semibold" onClick={handleStart}>
              <Camera className="h-3.5 w-3.5 mr-1.5" />
              Start Bulk ({skipMode === "skip-done" ? "skips done" : "redo all"})
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
