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
import type { Lead, AuditResult, RankedLead, ConversionPoints, OutreachResult, BuildPromptResult, LeadStatus, ScrapeSession, ClientDetail } from "@/lib/types";
import { Sparkles, History } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Page() {
  const [phase, setPhase] = useState(1);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [audits, setAudits] = useState<Record<string, AuditResult>>({});
  const [ranked, setRanked] = useState<RankedLead[]>([]);
  const [conversions, setConversions] = useState<Record<string, ConversionPoints>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outreachResults, setOutreachResults] = useState<Record<string, OutreachResult>>({});
  const [buildPrompts, setBuildPrompts] = useState<Record<string, BuildPromptResult>>({});
  const [leadStatuses, setLeadStatuses] = useState<Record<string, LeadStatus>>({});
  const [leadNotes, setLeadNotes] = useState<Record<string, string>>({});
  const [clientDetails, setClientDetails] = useState<Record<string, ClientDetail>>({});
  const [goToLeadId, setGoToLeadId] = useState<string | null>(null);
  const [geminiOk, setGeminiOk] = useState<boolean | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/claude-status")
      .then((r) => r.json())
      .then((d) => setGeminiOk(!!d.installed))
      .catch(() => setGeminiOk(false));
  }, []);

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

  /** Called when user clicks a past session to load it */
  function handleLoadSession(session: ScrapeSession) {
    setLeads(session.leads);
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

    const savedRanked      = session.ranked ?? [];
    const savedAudits      = session.audits ?? {};
    const savedOutreach    = session.outreachResults ?? {};
    const savedBuildPs     = session.buildPrompts ?? {};
    const savedConversions = session.conversions ?? {};

    if (Object.keys(savedBuildPs).length > 0)        setPhase(7);
    else if (Object.keys(savedOutreach).length > 0)  setPhase(6);
    else if (session.selectedId && savedRanked.length > 0) setPhase(5);
    else if (Object.keys(savedConversions).length > 0) setPhase(4);
    else if (savedRanked.length > 0)                 setPhase(3);
    else if (Object.keys(savedAudits).length > 0)    setPhase(2);
    else setPhase(1);
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
            <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm tracking-wider shadow-xs shrink-0 select-none">
              W
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-base sm:text-lg tracking-tight text-foreground truncate">
                Webeta Lead Generator
              </div>
              <div className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase hidden sm:block truncate">
                Scrape · Audit · Rank · Convert · Outreach · Build · Export
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
            <GeminiBadge ok={geminiOk} />
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
              }}
              onSessionCreated={(id) => setActiveSessionId(id)}
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
              key={`p4-${goToLeadId}`}
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
              initialExpandedId={goToLeadId}
              onNext={() => { setGoToLeadId(null); setPhase(5); }}
              onPrev={() => { setGoToLeadId(null); setPhase(3); }}
            />
          )}
          {phase === 5 && (
            <Phase5Outreach
              key={`p5-${goToLeadId}`}
              ranked={ranked}
              outreachResults={outreachResults}
              setOutreachResults={(r) => {
                setOutreachResults(r);
                saveOutreachToSession(r);
              }}
              initialLeadId={goToLeadId}
              onNext={() => { setGoToLeadId(null); setPhase(6); }}
              onPrev={() => { setGoToLeadId(null); setPhase(4); }}
            />
          )}
          {phase === 6 && (
            <Phase4Build
              key={`p6-${goToLeadId}`}
              ranked={ranked}
              buildPrompts={buildPrompts}
              setBuildPrompts={(b) => {
                setBuildPrompts(b);
                saveBuildPromptsToSession(b);
              }}
              initialLeadId={goToLeadId}
              onNext={() => { setGoToLeadId(null); setPhase(7); }}
              onPrev={() => { setGoToLeadId(null); setPhase(5); }}
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
            onLoadSession={handleLoadSession}
            onClose={() => setShowSessions(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function GeminiBadge({ ok }: { ok: boolean | null }) {
  const dotColor =
    ok === null ? "bg-slate-400 animate-pulse" : ok ? "bg-emerald-500" : "bg-rose-500";
  const label = ok === null ? "Checking AI…" : ok ? "AI Ready" : "AI Disconnected";
  return (
    <div className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium px-2.5 py-1 rounded-full border border-border bg-background shadow-2xs">
      <span className={`h-2 w-2 rounded-full ${dotColor} shrink-0`} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
