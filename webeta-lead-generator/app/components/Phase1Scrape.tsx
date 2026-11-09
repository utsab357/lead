"use client";

import { useState, useRef, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { PhaseShell } from "./PhaseShell";
import { Loader2, MapPin, Phone, Star, Globe, MessageCircle, Mail, ExternalLink, StopCircle, Plus, ChevronDown, Search } from "lucide-react";
import { NicheDropdown } from "./NicheDropdown";
import type { Lead, ScrapeInput } from "@/lib/types";
import { toast } from "sonner";
import { LeadHistoryDrawer } from "./LeadHistoryDrawer";
import type { LeadHistoryEntry } from "./LeadHistoryDrawer";
import { normalizePhone10 } from "@/lib/phoneUtils";

const LeadMap = dynamic(() => import("./LeadMap"), { ssr: false });

export function Phase1Scrape({
  leads,
  setLeads,
  onNext,
  onPrev,
  sessionId,
  onSessionCreated,
  onScrapeStart,
}: {
  leads: Lead[];
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  onNext: () => void;
  onPrev?: () => void;
  /** Active session ID — used to persist manually added leads */
  sessionId?: string | null;
  /** Called with the new sessionId when a scrape finishes saving */
  onSessionCreated?: (sessionId: string) => void;
  /** Called just before a new scrape begins (use to clear downstream state) */
  onScrapeStart?: () => void;
}) {
  const [input, setInput] = useState<ScrapeInput>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("webeta_scrape_input");
        if (saved) return JSON.parse(saved);
      } catch { /* ignore parse error */ }
    }
    return {
      niche: "gym",
      city: "Barasat, West Bengal",
      noWebsiteOnly: true,
    };
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("webeta_scrape_input", JSON.stringify(input));
      } catch { /* ignore */ }
    }
  }, [input]);

  const [loading, setLoading]       = useState(false);
  const [statusMsg, setStatusMsg]   = useState("");
  const [progress, setProgress]     = useState<{ index: number; total: number } | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  // Manual add state
  const [manualInput,   setManualInput]   = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualOpen,    setManualOpen]    = useState(false);

  // Post-scrape result filters
  const [fNoSite,   setFNoSite]   = useState(false);
  const [fPhone,    setFPhone]    = useState(false);
  const [fRating,   setFRating]   = useState<"" | "3.5" | "4.0" | "4.5">("" );
  const [fReviews,  setFReviews]  = useState<"" | "10" | "50" | "100">("" );
  const [fNewOnly,  setFNewOnly]  = useState(false);

  // Cross-session duplicate index: normalizedPhone → { leadName, niche, city, status }
  const [phoneIndex, setPhoneIndex] = useState<Map<string, { leadName: string; niche: string; city: string; timestamp: string; status?: string; notes?: string }>>(new Map());
  const [historyEntry, setHistoryEntry] = useState<LeadHistoryEntry | null>(null);

  // Fetch phone index whenever a new session is created (scrape finished)
  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/sessions/phone-index?exclude=${sessionId}`)
      .then(r => r.json())
      .then(({ index = [] }) => {
        const map = new Map<string, { leadName: string; niche: string; city: string; timestamp: string; status?: string; notes?: string }>();
        for (const e of index) {
          if (e.phone) map.set(e.phone, { leadName: e.leadName, niche: e.niche, city: e.city, timestamp: e.timestamp, status: e.status, notes: e.notes });
        }
        setPhoneIndex(map);
      })
      .catch(() => {});
  }, [sessionId]);

  /** Normalize phone to 10-digit string for cross-session lookup */
  function normPhone(raw: string): string {
    return normalizePhone10(raw);
  }

  async function runScrape() {
    setLoading(true);
    setLeads([]);
    setStatusMsg("Connecting...");
    setProgress(null);
    onScrapeStart?.(); // notify parent to clear audit/rank/selectedId

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Scrape failed" }));
        throw new Error(err.error ?? "Scrape failed");
      }

      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const msg = JSON.parse(line);

            if (msg.type === "status") {
              setStatusMsg(msg.message);
            }

            if (msg.type === "lead") {
              setProgress({ index: msg.index, total: msg.total });
              setLeads((prev: Lead[]) => {
                // Avoid duplicate IDs
                if (prev.some((l) => l.id === msg.lead.id)) return prev;
                return [...prev, msg.lead];
              });
            }

            if (msg.type === "source_done") {
              toast.success(`${msg.source} done — ${msg.total} businesses found.`);
            }

            if (msg.type === "done" || msg.type === "stats") {
              setStatusMsg("");
              setProgress(null);
              const sources = msg.sources ? ` (Maps: ${msg.sources.maps}, JustDial: ${msg.sources.justdial})` : "";
              toast.success(`Scrape complete! ${msg.total} businesses found${sources}`);
              // Track the session ID so Phase 2 & 3 can auto-save back to it
              if (msg.sessionId && onSessionCreated) onSessionCreated(msg.sessionId);
            }

            if (msg.type === "error") {
              toast.error(msg.message);
              setStatusMsg("");
            }
          } catch { /* non-JSON, skip */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        toast.error((e as Error).message);
      }
    } finally {
      readerRef.current = null;
      setLoading(false);
      setStatusMsg("");
      setProgress(null);
    }
  }

  function cancelScrape() {
    try { readerRef.current?.cancel(); } catch { /* ok */ }
    setLoading(false);
    setStatusMsg("");
    setProgress(null);
    toast.info("Scrape cancelled — leads found so far are kept.");
  }

  async function addManually() {
    if (!manualInput.trim()) return;
    setManualLoading(true);
    try {
      const res = await fetch("/api/scrape-single", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: manualInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to fetch business");
      const lead: Lead = data.lead;
      setLeads((prev) => {
        // Don't add if name already exists
        if (prev.some((l) => l.name.toLowerCase() === lead.name.toLowerCase())) {
          toast.info(`"${lead.name}" is already in your list.`);
          return prev;
        }
        const updated = [...prev, lead];
        toast.success(`Added: ${lead.name}`);
        // Persist to existing session OR create a new one
        if (sessionId) {
          // Update existing session
          fetch(`/api/sessions/${sessionId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ leads: updated }),
          }).catch(() => { /* non-critical */ });
        } else {
          // No session yet — create one and notify parent
          fetch("/api/sessions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ leads: updated, niche: "manual", city: lead.city || "mixed" }),
          }).then((r) => r.json()).then((d) => {
            if (d.sessionId) onSessionCreated?.(d.sessionId);
          }).catch(() => { /* non-critical */ });
        }
        return updated;
      });
      setManualInput("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setManualLoading(false);
    }
  }

  const withPhone = leads.filter((l) => l.phone).length;
  const noSite    = leads.filter((l) => !l.website).length;

  // Apply result filters
  const displayLeads = leads.filter((l) => {
    if (fNoSite  && l.website)                          return false;
    if (fPhone   && !l.phone)                           return false;
    if (fRating  && (l.rating  ?? 0) < parseFloat(fRating))  return false;
    if (fReviews && (l.reviewsCount ?? 0) < parseInt(fReviews)) return false;
    if (fNewOnly) {
      const np = normPhone(l.phone ?? l.whatsapp ?? "");
      if (np && phoneIndex.has(np)) return false; // hide if seen before
    }
    return true;
  });
  const anyFilter = fNoSite || fPhone || !!fRating || !!fReviews || fNewOnly;

  return (
    <>
    <PhaseShell
      title="Phase 1 — Lead Discovery"
      subtitle="Autonomous Google Maps discovery engine. Uncover verified local businesses, phone numbers, review ratings, and website status."
      onPrev={onPrev}
      onNext={onNext}
      nextDisabled={leads.length === 0}
      nextLabel="Audit these leads"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
        {/* Controls */}
        <Card className="md:col-span-1 lg:col-span-4 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Target</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="niche" className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Business type
              </Label>
              <NicheDropdown
                value={input.niche}
                onChange={(val) => setInput({ ...input, niche: val })}
                disabled={loading}
              />
              {/* Quick Niche Presets */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { niche: "gym", label: "🏋️ Gyms" },
                  { niche: "cafe", label: "☕ Cafes" },
                  { niche: "dental clinic", label: "🦷 Dentists" },
                  { niche: "salon", label: "💇 Salons" },
                  { niche: "hotel", label: "🏨 Hotels" },
                  { niche: "car repair", label: "🚗 Auto Repair" },
                ].map((p) => (
                  <button
                    key={p.niche}
                    type="button"
                    onClick={() => setInput((prev) => ({ ...prev, niche: p.niche }))}
                    className={`text-[11px] px-2.5 py-1 rounded-md border transition-all ${
                      input.niche.toLowerCase() === p.niche.toLowerCase()
                        ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                        : "bg-background border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="city" className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Location
              </Label>
              <Input
                id="city"
                autoComplete="off"
                value={input.city}
                disabled={loading}
                onChange={(e) => setInput({ ...input, city: e.target.value })}
                placeholder="e.g. Barasat, West Bengal"
                className="h-10 text-sm"
              />
              {/* Quick Locations */}
              <div className="flex flex-wrap gap-1 pt-1">
                {["Barasat, West Bengal", "Kolkata, WB", "Mumbai, MH", "Delhi NCR", "Bangalore, KA"].map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setInput((prev) => ({ ...prev, city: loc }))}
                    className="text-[10px] px-2 py-0.5 rounded border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all"
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>

            {/* No website filter */}
            <div className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-muted/40">
              <input
                type="checkbox"
                id="noWebsiteOnly"
                checked={input.noWebsiteOnly ?? false}
                disabled={loading}
                onChange={(e) => setInput({ ...input, noWebsiteOnly: e.target.checked })}
                className="h-4 w-4 accent-primary rounded cursor-pointer"
              />
              <label htmlFor="noWebsiteOnly" className="text-xs text-muted-foreground cursor-pointer select-none leading-tight">
                Show only businesses with <strong className="text-foreground">NO website</strong> (ideal prospects)
              </label>
            </div>

            {/* Action buttons */}
            {!loading ? (
              <Button
                id="run-scrape-btn"
                onClick={runScrape}
                className="w-full h-11 text-sm font-semibold transition-all shadow-xs"
              >
                <Search className="h-4 w-4 mr-2 stroke-[2.5]" /> Scrape Leads
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={cancelScrape}
                  className="w-full h-11 border-rose-500/40 text-rose-600 hover:bg-rose-500/10 font-semibold"
                >
                  <StopCircle className="h-4 w-4 mr-2" /> Stop scraping
                </Button>
              </div>
            )}

            {/* Live status box */}
            {loading && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-primary font-medium">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Chrome is scraping Google Maps...
                </div>
                {statusMsg && (
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    {statusMsg}
                  </div>
                )}
                {progress && (
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">
                      {progress.index} / {progress.total} businesses processed
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className="h-full bg-primary rounded-full"
                        animate={{ width: `${(progress.index / progress.total) * 100}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground/60">
                  Do not close Chrome. Results appear below as they are found.
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <Stat label="Found" value={leads.length} />
              <Stat label="Phone" value={withPhone} />
              <Stat label="No site" value={noSite} />
            </div>

            {/* Success badge after scrape */}
            {leads.length > 0 && !loading && (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-1.5">
                <span className="font-semibold">✓</span>
                <span>Scraped real data from Google Maps. Saved to history.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add manually */}
        <Card className="md:col-span-1 lg:col-span-3 border-dashed shadow-xs self-start">
          <button
            className="w-full flex items-center justify-between px-4 py-3.5 text-left cursor-pointer"
            onClick={() => setManualOpen((o) => !o)}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Plus className="h-4 w-4" /> Add specific business
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${manualOpen ? "rotate-180" : ""}`} />
          </button>
          {manualOpen && (
            <CardContent className="pt-0 pb-4 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Paste a Google Maps URL, Zomato link, business website, or type the business name.
              </p>
              <Input
                placeholder="e.g. Gold's Gym Barasat or paste URL"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addManually()}
                disabled={manualLoading}
                className="h-9 text-xs"
              />
              <Button
                onClick={addManually}
                disabled={manualLoading || !manualInput.trim()}
                size="sm"
                className="w-full text-xs font-medium"
              >
                {manualLoading
                  ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Fetching...</>
                  : <><Plus className="h-3.5 w-3.5 mr-2" />Add business</>}
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Live map */}
        <Card className="md:col-span-2 lg:col-span-5 flex flex-col isolate shadow-xs min-h-[280px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Live Map</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-3">
            <LeadMap leads={leads} />
          </CardContent>
        </Card>
      </div>

      {/* Results table */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>
            Results
            {loading && leads.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — updating live
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Result filter bar — shown once leads exist */}
          {leads.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4 p-2.5 rounded-lg bg-muted/40 border border-border">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mr-1">Filter results:</span>

              {/* No website toggle */}
              <button
                id="p1-filter-nosite"
                onClick={() => setFNoSite(v => !v)}
                className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                  fNoSite ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-background border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <Globe className="h-3 w-3" /> No website
              </button>

              {/* Has phone toggle */}
              <button
                id="p1-filter-phone"
                onClick={() => setFPhone(v => !v)}
                className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                  fPhone ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <Phone className="h-3 w-3" /> Has phone
              </button>

              {/* Min rating */}
              <select
                id="p1-filter-rating"
                value={fRating}
                onChange={e => setFRating(e.target.value as typeof fRating)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-background text-muted-foreground hover:border-primary/40 focus:outline-none cursor-pointer"
              >
                <option value="">Any rating</option>
                <option value="3.5">★ 3.5+</option>
                <option value="4.0">★ 4.0+</option>
                <option value="4.5">★ 4.5+</option>
              </select>

              {/* Min reviews */}
              <select
                id="p1-filter-reviews"
                value={fReviews}
                onChange={e => setFReviews(e.target.value as typeof fReviews)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-background text-muted-foreground hover:border-primary/40 focus:outline-none cursor-pointer"
              >
                <option value="">Any reviews</option>
                <option value="10">10+ reviews</option>
                <option value="50">50+ reviews</option>
                <option value="100">100+ reviews</option>
              </select>

              {/* New leads only toggle — shown only if phone index has entries */}
              {phoneIndex.size > 0 && (
                <button
                  id="p1-filter-newonly"
                  onClick={() => setFNewOnly(v => !v)}
                  className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                    fNewOnly ? "bg-amber-500/10 border-amber-500/30 text-amber-600" : "bg-background border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  ✨ New leads only
                </button>
              )}

              {/* Count + clear */}
              {anyFilter && (
                <>
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    Showing {displayLeads.length} of {leads.length}
                  </span>
                  <button
                    onClick={() => { setFNoSite(false); setFPhone(false); setFRating(""); setFReviews(""); setFNewOnly(false); }}
                    className="text-[11px] text-muted-foreground underline hover:text-foreground"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Reviews</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Map</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence initial={false}>
                  {displayLeads.map((l, i) => (
                    <motion.tr
                      key={l.id}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25 }}
                      className="border-b border-border"
                    >
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <div className="font-medium flex items-center gap-1.5 flex-wrap">
                          {l.name}
                          {(() => {
                            const np = normPhone(l.phone ?? l.whatsapp ?? "");
                            const prev = np ? phoneIndex.get(np) : undefined;
                            if (!prev) return null;
                            return (
                              <button
                                onClick={() => setHistoryEntry({
                                  leadName: l.name,
                                  niche: prev.niche,
                                  city: prev.city,
                                  timestamp: prev.timestamp,
                                  status: prev.status,
                                  notes: prev.notes,
                                })}
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20 transition-colors cursor-pointer"
                              >
                                Seen before{prev.status ? ` · ${prev.status}` : ""}
                              </button>
                            );
                          })()}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[200px]">{l.address}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-0.5">
                          {l.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" /> {l.phone}</span>}
                          {l.whatsapp && <span className="flex items-center gap-1 text-green-600"><MessageCircle className="h-3 w-3 shrink-0" /> WhatsApp</span>}
                          {l.email && (
                            <a
                              href={`mailto:${l.email}`}
                              className="flex items-center gap-1 text-primary truncate max-w-[170px] hover:underline"
                              title={l.email}
                            >
                              <Mail className="h-3 w-3 shrink-0" /> {l.email}
                            </a>
                          )}
                          {l.socialLinks && l.socialLinks.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              {l.socialLinks.map((s, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] px-1 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors capitalize font-medium"
                                  title={s.url}
                                >
                                  {s.platform}
                                </a>
                              ))}
                            </div>
                          )}
                          {!l.phone && !l.email && (!l.socialLinks || l.socialLinks.length === 0) && (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          <span className="font-medium">{l.rating?.toFixed(1) ?? "—"}</span>
                          <span className="text-muted-foreground text-xs">({l.reviewsCount ?? 0})</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {l.website ? (
                          <Badge variant="secondary" className="text-xs font-normal">
                            <Globe className="h-3 w-3 mr-1" /> Yes
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs font-normal text-destructive border-destructive/40 bg-destructive/5">
                            No site ✓
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <a
                            href={l.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.name + " " + l.city)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> Maps
                          </a>
                          <span className={`text-[9px] px-1 py-0.5 rounded-sm w-fit ${
                            l.source === "justdial" ? "bg-orange-500/10 text-orange-600" : "bg-blue-500/10 text-blue-600"
                          }`}>
                            {l.source === "justdial" ? "📒 JD" : "📍 Maps"}
                          </span>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
            {leads.length === 0 && !loading && (
              <div className="text-center py-12 text-sm text-muted-foreground">
                Type a business type and city above, then click <strong>Scrape leads</strong>
              </div>
            )}
            {leads.length === 0 && loading && (
              <div className="text-center py-12 text-sm text-muted-foreground animate-pulse">
                Chrome is opening... first results will appear here shortly
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </PhaseShell>

    <LeadHistoryDrawer
      entry={historyEntry}
      onClose={() => setHistoryEntry(null)}
    />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-2 text-center shadow-2xs">
      <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums text-foreground mt-0.5">{value}</div>
    </div>
  );
}
