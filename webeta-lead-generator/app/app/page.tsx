"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Stepper } from "@/components/Stepper";
import { Phase1Scrape } from "@/components/Phase1Scrape";
import { Phase2Audit } from "@/components/Phase2Audit";
import { Phase3Rank } from "@/components/Phase3Rank";
import { Phase4Convert } from "@/components/Phase4Convert";
import { Phase5Outreach } from "@/components/Phase5Outreach";
import { Phase4Build } from "@/components/Phase4Build";
import { Phase7Export } from "@/components/Phase7Export";
import { SessionsPage } from "@/components/SessionsPage";
import { AIEngineDropdown } from "@/components/AIEngineDropdown";
import type { Lead, AuditResult, RankedLead, ConversionPoints, OutreachResult, BuildPromptResult, LeadStatus, ScrapeSession, ClientDetail, LeadVisualPreviewSet } from "@/lib/types";
import { Sparkles, History, Plus, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Page() {
  const [phase, setPhase] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("webeta_active_phase") || localStorage.getItem("webeta_active_phase");
        if (saved) {
          const p = parseInt(saved, 10);
          if (p >= 1 && p <= 7) return p;
        }
      } catch { /* ignore */ }
    }
    return 1;
  });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [audits, setAudits] = useState<Record<string, AuditResult>>({});
  const [ranked, setRanked] = useState<RankedLead[]>([]);
  const [conversions, setConversions] = useState<Record<string, ConversionPoints>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outreachResults, setOutreachResults] = useState<Record<string, OutreachResult>>({});
  const [buildPrompts, setBuildPrompts] = useState<Record<string, BuildPromptResult>>({});
  const [visualPreviews, setVisualPreviews] = useState<Record<string, LeadVisualPreviewSet>>({});
  const [leadStatuses, setLeadStatuses] = useState<Record<string, LeadStatus>>({});
  const [leadNotes, setLeadNotes] = useState<Record<string, string>>({});
  const [clientDetails, setClientDetails] = useState<Record<string, ClientDetail>>({});
  const [goToLeadId, setGoToLeadId] = useState<string | null>(null);
  const [geminiOk, setGeminiOk] = useState<boolean | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Persist current phase in sessionStorage & localStorage for refresh / tab restore
  useEffect(() => {
    if (typeof window !== "undefined" && phase >= 1 && phase <= 7) {
      try {
        sessionStorage.setItem("webeta_active_phase", String(phase));
        localStorage.setItem("webeta_active_phase", String(phase));
      } catch { /* ignore */ }
    }
  }, [phase]);

  // On mount: check AI status & auto-rehydrate active session from localStorage
  useEffect(() => {
    fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d) => setGeminiOk((d.healthyCount ?? d.configuredCount ?? 0) > 0))
      .catch(() => setGeminiOk(false));

    try {
      const localData = localStorage.getItem("webeta_active_session_data");
      const cached = sessionStorage.getItem("webeta_cached_session");
      const savedId = localStorage.getItem("webeta_active_session_id");

      // 1. High priority: Fast rehydration from full localStorage snapshot
      if (localData) {
        try {
          const parsed = JSON.parse(localData) as ScrapeSession;
          if (parsed && Array.isArray(parsed.leads) && parsed.leads.length > 0) {
            handleLoadSession(parsed);
            return;
          }
        } catch { /* parse error, ignore */ }
      }

      // 2. Saved session by ID from localStorage
      if (savedId) {
        try {
          const savedRaw = localStorage.getItem(`webeta_session_${savedId}`);
          if (savedRaw) {
            const parsed = JSON.parse(savedRaw) as ScrapeSession;
            if (parsed && Array.isArray(parsed.leads) && parsed.leads.length > 0) {
              handleLoadSession(parsed);
              return;
            }
          }
        } catch {}
      }

      // 3. Tab cache fallback
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as ScrapeSession;
          if (parsed && Array.isArray(parsed.leads) && parsed.leads.length > 0) {
            handleLoadSession(parsed);
            return;
          }
        } catch { /* parse error, ignore */ }
      }

      // 4. Rehydrate from server disk session if savedId exists
      if (savedId) {
        fetch(`/api/sessions/${savedId}`)
          .then((r) => {
            if (!r.ok) throw new Error("Session not found");
            return r.json();
          })
          .then((d) => {
            if (d?.session && Array.isArray(d.session.leads) && d.session.leads.length > 0) {
              handleLoadSession(d.session);
            }
          })
          .catch(() => {
            // Server file not found on disk — do NOT wipe user storage!
          });
      }
    } catch {
      // storage disabled / private browsing
    }
  }, []);

  // Real-time auto-save effect across ALL phases (1 to 7)
  // Whenever leads, audits, rankings, hooks, prompts, or notes change, immediately persist to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (leads.length === 0 && !activeSessionId) return;

    const sessionSnapshot: ScrapeSession = {
      id: activeSessionId || `session-local-${Date.now()}`,
      niche: leads[0]?.category || "Local Business",
      city: leads[0]?.city || "",
      timestamp: new Date().toISOString(),
      leadsCount: leads.length,
      noWebsiteCount: leads.filter((l) => !l.website).length,
      withPhoneCount: leads.filter((l) => l.phone).length,
      expandedTerms: [],
      leads,
      audits,
      ranked,
      selectedId,
      conversions,
      outreachResults,
      buildPrompts,
      visualPreviews,
      leadStatuses,
      leadNotes,
      clientDetails,
    };

    try {
      localStorage.setItem("webeta_active_session_data", JSON.stringify(sessionSnapshot));
      if (sessionSnapshot.id) {
        localStorage.setItem("webeta_active_session_id", sessionSnapshot.id);
        localStorage.setItem(`webeta_session_${sessionSnapshot.id}`, JSON.stringify(sessionSnapshot));

        // Keep persistent client-side session index (immune to Render ephemeral disk restarts)
        const metaItem = {
          id: sessionSnapshot.id,
          niche: sessionSnapshot.niche,
          city: sessionSnapshot.city,
          timestamp: sessionSnapshot.timestamp,
          leadsCount: sessionSnapshot.leadsCount,
          noWebsiteCount: sessionSnapshot.noWebsiteCount,
          withPhoneCount: sessionSnapshot.withPhoneCount,
        };
        try {
          const listRaw = localStorage.getItem("webeta_saved_sessions_meta");
          let list: any[] = listRaw ? JSON.parse(listRaw) : [];
          list = list.filter((x: any) => x && x.id !== sessionSnapshot.id);
          list.unshift(metaItem);
          localStorage.setItem("webeta_saved_sessions_meta", JSON.stringify(list.slice(0, 30)));
        } catch { /* storage limit */ }
      }
      sessionStorage.setItem("webeta_cached_session", JSON.stringify(sessionSnapshot));
    } catch {
      // storage quota protection
    }
  }, [
    leads,
    audits,
    ranked,
    selectedId,
    conversions,
    outreachResults,
    buildPrompts,
    visualPreviews,
    leadStatuses,
    leadNotes,
    clientDetails,
    activeSessionId,
  ]);

  const completed = useMemo(() => {
    const s = new Set<number>();
    if (leads.length > 0) s.add(1);
    if (Object.keys(audits).length > 0) s.add(2);
    if (ranked.length > 0) s.add(3);
    if (Object.keys(conversions).length > 0) s.add(4);
    if (Object.keys(outreachResults).length > 0) s.add(5);
    if (Object.keys(buildPrompts).length > 0) s.add(6);
    return s;
  }, [leads, audits, ranked, conversions, outreachResults, buildPrompts]);

  const selectedRanked = useMemo(
    () => ranked.find((r) => r.id === selectedId) ?? null,
    [ranked, selectedId],
  );

  /** Called when user clicks a past session to load it or on auto-rehydrate */
  function handleLoadSession(session: ScrapeSession) {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("webeta_active_session_id", session.id);
        sessionStorage.setItem("webeta_cached_session", JSON.stringify(session));
      } catch { /* storage quota */ }
    }

    setLeads(session.leads ?? []);
    setActiveSessionId(session.id);
    setAudits(session.audits ?? {});
    setRanked(session.ranked ?? []);
    setConversions(session.conversions ?? {});
    setSelectedId(session.selectedId ?? null);
    setOutreachResults(session.outreachResults ?? {});
    setBuildPrompts(session.buildPrompts ?? {});
    setLeadStatuses(
      // Migration: old sessions used "closed", new name is "completed"
      Object.fromEntries(
        Object.entries(session.leadStatuses ?? {}).map(([id, s]) => [
          id,
          (s as string) === "closed" ? "completed" : s,
        ])
      ) as Record<string, LeadStatus>
    );
    setLeadNotes(session.leadNotes ?? {});
    setClientDetails(session.clientDetails ?? {});
    setVisualPreviews(session.visualPreviews ?? {});

    const savedRanked      = session.ranked ?? [];
    const savedAudits      = session.audits ?? {};
    const savedOutreach    = session.outreachResults ?? {};
    const savedBuildPs     = session.buildPrompts ?? {};
    const savedConversions = session.conversions ?? {};

    // Restore last active phase if available, otherwise jump to furthest progress
    const cachedPhase = typeof window !== "undefined"
      ? (sessionStorage.getItem("webeta_active_phase") || localStorage.getItem("webeta_active_phase"))
      : null;
    if (cachedPhase && !isNaN(Number(cachedPhase)) && Number(cachedPhase) >= 1 && Number(cachedPhase) <= 7) {
      setPhase(Number(cachedPhase));
    } else {
      if (Object.keys(savedOutreach).length > 0)       setPhase(6);
      else if (Object.keys(savedBuildPs).length > 0)    setPhase(5);
      else if (session.selectedId && savedRanked.length > 0) setPhase(5);
      else if (Object.keys(savedConversions).length > 0) setPhase(4);
      else if (savedRanked.length > 0)                 setPhase(3);
      else if (Object.keys(savedAudits).length > 0)    setPhase(2);
      else setPhase(1);
    }
  }

  /** Clears active session and resets to fresh state */
  function handleStartNewSession() {
    setLeads([]);
    setAudits({});
    setRanked([]);
    setConversions({});
    setSelectedId(null);
    setOutreachResults({});
    setBuildPrompts({});
    setVisualPreviews({});
    setLeadStatuses({});
    setLeadNotes({});
    setClientDetails({});
    setActiveSessionId(null);
    setPhase(1);
    fetch("/api/scrape?cancel=true", { method: "POST" }).catch(() => {});
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("webeta_active_session_id");
        localStorage.removeItem("webeta_active_session_data");
        localStorage.removeItem("webeta_active_phase");
        sessionStorage.removeItem("webeta_cached_session");
        sessionStorage.removeItem("webeta_active_phase");
      } catch { /* ignore */ }
    }
    toast.info("Started fresh discovery session");
  }

  /** Persist audits back to the session file silently */
  async function saveAuditsToSession(newAudits: Record<string, AuditResult>) {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audits: newAudits }),
      });
    } catch { /* non-critical, ignore */ }
  }

  /** Persist ranked leads back to the session file silently */
  async function saveRankedToSession(newRanked: RankedLead[]) {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ranked: newRanked }),
      });
    } catch { /* non-critical, ignore */ }
  }

  /** Persist selectedId back to the session file silently */
  async function saveSelectedIdToSession(id: string | null) {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selectedId: id }),
      });
    } catch { /* non-critical, ignore */ }
  }

  /** Persist conversion points back to the session file silently */
  async function saveConversionsToSession(newConversions: Record<string, ConversionPoints>) {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversions: newConversions }),
      });
    } catch { /* non-critical, ignore */ }
  }

  /** Persist outreach results back to the session file silently */
  async function saveOutreachToSession(newOutreach: Record<string, OutreachResult>) {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outreachResults: newOutreach }),
      });
    } catch { /* non-critical, ignore */ }
  }

  /** Persist build prompts back to the session file silently */
  async function saveBuildPromptsToSession(newPrompts: Record<string, BuildPromptResult>) {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buildPrompts: newPrompts }),
      });
    } catch { /* non-critical, ignore */ }
  }

  /** Persist visual previews back to the session file silently */
  async function saveVisualPreviewsToSession(newPreviews: Record<string, LeadVisualPreviewSet>) {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visualPreviews: newPreviews }),
      });
    } catch { /* non-critical, ignore */ }
  }

  /** Persist lead pipeline statuses silently */
  async function saveLeadStatusesToSession(statuses: Record<string, LeadStatus>) {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadStatuses: statuses }),
      });
    } catch { /* non-critical, ignore */ }
  }

  /** Persist lead notes silently */
  async function saveLeadNotesToSession(notes: Record<string, string>) {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadNotes: notes }),
      });
    } catch { /* non-critical, ignore */ }
  }

  /** Persist client deal details silently */
  async function saveClientDetailsToSession(details: Record<string, ClientDetail>) {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientDetails: details }),
      });
    } catch { /* non-critical, ignore */ }
  }

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-foreground focus:text-background focus:px-3 focus:py-2 focus:rounded-md focus:text-sm"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-card/90 backdrop-blur-md sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-sky-500 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0 select-none ring-2 ring-indigo-500/20">
              W
            </div>
            <div className="min-w-0">
              <div className="font-bold text-base sm:text-lg tracking-tight text-foreground truncate flex items-center gap-1.5">
                Webeta Lead Generator
                <span className="hidden sm:inline-block text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  Pro
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground font-semibold tracking-wider uppercase hidden sm:block truncate">
                Autonomous Lead Discovery · Neural Audit · Conversion Intelligence
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {activeSessionId && leads.length > 0 && (
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 text-[11px] text-muted-foreground border border-border/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium text-foreground">{leads.length} leads</span>
                <span>in session</span>
              </div>
            )}
            {activeSessionId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartNewSession}
                className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                title="Start a fresh discovery session"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New Session</span>
              </Button>
            )}
            <Button
              id="open-scrape-history"
              variant="outline"
              size="sm"
              onClick={() => setShowSessions(true)}
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <History className="h-3.5 w-3.5" />
              <span>History</span>
            </Button>
            <AIEngineDropdown />
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive gap-1"
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Sign Out</span>
            </Button>
          </div>
        </div>
        <Stepper current={phase} completed={completed} onJump={(n) => setPhase(n)} />
      </header>
      <main id="main" className="pt-6" tabIndex={-1}>
        <AnimatePresence mode="wait">
          {phase === 1 && (
            <Phase1Scrape
              key="p1"
              leads={leads}
              setLeads={setLeads}
              sessionId={activeSessionId}
              onScrapeStart={() => {
                // Clear downstream data when a new scrape begins
                setAudits({});
                setRanked([]);
                setSelectedId(null);
                setActiveSessionId(null);
                if (typeof window !== "undefined") {
                  try {
                    localStorage.removeItem("webeta_active_session_id");
                    localStorage.removeItem("webeta_active_session_data");
                    localStorage.removeItem("webeta_active_phase");
                    sessionStorage.removeItem("webeta_cached_session");
                    sessionStorage.removeItem("webeta_active_phase");
                  } catch { /* ignore */ }
                }
              }}
              onSessionCreated={(id) => {
                setActiveSessionId(id);
                if (typeof window !== "undefined") {
                  try {
                    localStorage.setItem("webeta_active_session_id", id);
                  } catch { /* ignore */ }
                }
              }}
              onNext={() => setPhase(2)}
            />
          )}
          {phase === 2 && (
            <Phase2Audit
              key="p2"
              leads={leads}
              audits={audits}
              setAudits={(a) => {
                setAudits(a);
                saveAuditsToSession(a);
              }}
              onNext={() => setPhase(3)}
              onPrev={() => setPhase(1)}
            />
          )}
          {phase === 3 && (
            <Phase3Rank
              key="p3"
              leads={leads}
              audits={audits}
              ranked={ranked}
              setRanked={(r) => {
                setRanked(r);
                saveRankedToSession(r);
              }}
              selectedId={selectedId}
              setSelectedId={(id) => {
                setSelectedId(id);
                saveSelectedIdToSession(id);
              }}
              onNext={() => setPhase(4)}
              onPrev={() => setPhase(2)}
              sessionId={activeSessionId}
            />
          )}
          {phase === 4 && (
            <Phase4Convert
              key={`p4-${goToLeadId || selectedId || "all"}`}
              ranked={ranked}
              conversions={conversions}
              setConversions={(c) => {
                setConversions(c);
                saveConversionsToSession(c);
              }}
              leadStatuses={leadStatuses}
              setLeadStatuses={(s) => { setLeadStatuses(s); saveLeadStatusesToSession(s); }}
              leadNotes={leadNotes}
              setLeadNotes={(n) => { setLeadNotes(n); saveLeadNotesToSession(n); }}
              clientDetails={clientDetails}
              setClientDetails={(d) => { setClientDetails(d); saveClientDetailsToSession(d); }}
              initialExpandedId={goToLeadId || selectedId}
              selectedLeadId={selectedId}
              onSelectLead={(id) => {
                setSelectedId(id);
                saveSelectedIdToSession(id);
              }}
              onGoToPhase={(phaseNum, leadId) => {
                setSelectedId(leadId);
                saveSelectedIdToSession(leadId);
                setGoToLeadId(leadId);
                setPhase(phaseNum);
              }}
              onNext={() => setPhase(5)}
              onPrev={() => setPhase(3)}
            />
          )}
          {/* Phase 5: Build / Website Preview */}
          {phase === 5 && (
            <Phase4Build
              key={`p5-${goToLeadId || selectedId || "all"}`}
              ranked={ranked}
              buildPrompts={buildPrompts}
              setBuildPrompts={(b) => {
                setBuildPrompts(b);
                saveBuildPromptsToSession(b);
              }}
              visualPreviews={visualPreviews}
              setVisualPreviews={(vp) => {
                setVisualPreviews(vp);
                saveVisualPreviewsToSession(vp);
              }}
              sessionId={activeSessionId}
              initialLeadId={goToLeadId || selectedId}
              onSelectLead={(id) => {
                setSelectedId(id);
                saveSelectedIdToSession(id);
              }}
              onNext={() => setPhase(6)}
              onPrev={() => setPhase(4)}
            />
          )}
          {/* Phase 6: Outreach */}
          {phase === 6 && (
            <Phase5Outreach
              key={`p6-${goToLeadId || selectedId || "all"}`}
              ranked={ranked}
              outreachResults={outreachResults}
              setOutreachResults={(r) => {
                setOutreachResults(r);
                saveOutreachToSession(r);
              }}
              initialLeadId={goToLeadId || selectedId}
              onSelectLead={(id) => {
                setSelectedId(id);
                saveSelectedIdToSession(id);
              }}
              onNext={() => setPhase(7)}
              onPrev={() => setPhase(5)}
            />
          )}
          {phase === 7 && (
            <Phase7Export
              key="p7"
              ranked={ranked}
              conversions={conversions}
              outreachResults={outreachResults}
              buildPrompts={buildPrompts}
              leadStatuses={leadStatuses}
              leadNotes={leadNotes}
              clientDetails={clientDetails}
              sessionId={activeSessionId}
              setLeadStatuses={(s) => { setLeadStatuses(s); saveLeadStatusesToSession(s); }}
              setLeadNotes={(n) => { setLeadNotes(n); saveLeadNotesToSession(n); }}
              setClientDetails={(d) => { setClientDetails(d); saveClientDetailsToSession(d); }}
              onGoToPhase={(phaseNum, leadId) => {
                setSelectedId(leadId);
                saveSelectedIdToSession(leadId);
                setGoToLeadId(leadId);
                setPhase(phaseNum);
              }}
              onPrev={() => setPhase(6)}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Sessions modal */}
      <AnimatePresence>
        {showSessions && (
          <SessionsPage
            activeSessionId={activeSessionId}
            onLoadSession={handleLoadSession}
            onDeleteActiveSession={handleStartNewSession}
            onClose={() => setShowSessions(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
