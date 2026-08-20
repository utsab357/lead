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
import type { Lead, AuditResult, RankedLead, ConversionPoints, ScrapeSession } from "@/lib/types";
import { Sparkles, History } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Page() {
  const [phase, setPhase] = useState(1);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [audits, setAudits] = useState<Record<string, AuditResult>>({});
  const [ranked, setRanked] = useState<RankedLead[]>([]);
  const [conversions, setConversions] = useState<Record<string, ConversionPoints>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [geminiOk, setGeminiOk] = useState<boolean | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  /** ID of the session file currently loaded (used to PATCH audit/rank back) */
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
    if (selectedId) s.add(5);
    return s;
  }, [leads, audits, ranked, conversions, selectedId]);

  const selectedRanked = useMemo(
    () => ranked.find((r) => r.id === selectedId) ?? null,
    [ranked, selectedId],
  );

  /** Called when user clicks a past session to load it */
  function handleLoadSession(session: ScrapeSession) {
    setLeads(session.leads);
    setActiveSessionId(session.id);

    const savedAudits = session.audits ?? {};
    const savedRanked = session.ranked ?? [];
    const savedSelectedId = session.selectedId ?? null;

    setAudits(savedAudits);
    setRanked(savedRanked);
    setConversions({});
    setSelectedId(savedSelectedId);

    // Jump to the furthest completed phase
    if (savedSelectedId && savedRanked.length > 0) {
      setPhase(4);
    } else if (savedRanked.length > 0) {
      setPhase(3);
    } else if (Object.keys(savedAudits).length > 0) {
      setPhase(2);
    } else {
      setPhase(1);
    }
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

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-foreground focus:text-background focus:px-3 focus:py-2 focus:rounded-md focus:text-sm"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={1.5} aria-hidden="true" />
            </div>
            <div>
              <div className="font-display text-xl leading-none">Lead <span className="text-muted-foreground">→</span> Launch</div>
              <div className="text-[11px] text-muted-foreground leading-tight tracking-wide uppercase mt-1">Scrape · Audit · Rank · Convert · Outreach · Demo · Export</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              id="open-scrape-history"
              variant="outline"
              size="sm"
              onClick={() => setShowSessions(true)}
              className="h-8 gap-1.5 text-xs"
            >
              <History className="h-3.5 w-3.5" />
              History
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
            />
          )}
          {phase === 4 && (
            <Phase4Convert
              key="p4"
              ranked={ranked}
              conversions={conversions}
              setConversions={setConversions}
              onNext={() => setPhase(5)}
              onPrev={() => setPhase(3)}
            />
          )}
          {phase === 5 && (
            <Phase5Outreach
              key="p5"
              selected={selectedRanked}
              onNext={() => setPhase(6)}
              onPrev={() => setPhase(4)}
            />
          )}
          {phase === 6 && (
            <Phase4Build
              key="p6"
              selected={selectedRanked}
              onNext={() => setPhase(7)}
              onPrev={() => setPhase(5)}
            />
          )}
          {phase === 7 && (
            <Phase7Export
              key="p7"
              ranked={ranked}
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
  const color =
    ok === null ? "bg-muted-foreground/40" : ok ? "bg-emerald-500" : "bg-[color:var(--destructive)]";
  const label = ok === null ? "Checking…" : ok ? "Gemini AI connected" : "Gemini AI not connected";
  return (
    <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground tracking-[0.12em] uppercase">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} aria-hidden="true" />
      {label}
    </div>
  );
}
