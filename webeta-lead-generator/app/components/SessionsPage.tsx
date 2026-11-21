"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2, Trash2, FolderOpen, Clock, MapPin,
  Zap, Phone, Globe, X, Search, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import type { ScrapeSession } from "@/lib/types";

type SessionMeta = Omit<ScrapeSession, "leads">;

export function SessionsPage({
  onLoadSession,
  onClose,
  activeSessionId,
  onDeleteActiveSession,
}: {
  onLoadSession: (session: ScrapeSession) => void;
  onClose: () => void;
  activeSessionId?: string | null;
  onDeleteActiveSession?: () => void;
}) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsedCities, setCollapsedCities] = useState<Set<string>>(new Set());

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      let serverSessions: SessionMeta[] = [];
      try {
        const res = await fetch("/api/sessions");
        const data = await res.json();
        serverSessions = data.sessions ?? [];
      } catch { /* server offline or restarting */ }

      // Read client-side persistent session index (survives Render container restarts)
      let localSessions: SessionMeta[] = [];
      try {
        const raw = localStorage.getItem("webeta_saved_sessions_meta");
        if (raw) localSessions = JSON.parse(raw);
      } catch { /* parse error */ }

      const seen = new Set<string>();
      const combined: SessionMeta[] = [];
      for (const s of [...serverSessions, ...localSessions]) {
        if (s && s.id && !seen.has(s.id)) {
          seen.add(s.id);
          combined.push(s);
        }
      }

      setSessions(combined);
      try {
        localStorage.setItem("webeta_saved_sessions_meta", JSON.stringify(combined.slice(0, 30)));
      } catch { /* storage limit */ }
    } catch {
      toast.error("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  async function loadSession(id: string) {
    setLoadingId(id);
    try {
      let session: ScrapeSession | null = null;
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (res.ok) {
          const data = await res.json();
          session = data.session as ScrapeSession;
        }
      } catch { /* fallback to localStorage */ }

      // Fallback: load from client-side persistent storage if server container restarted
      if (!session) {
        try {
          const raw = localStorage.getItem(`webeta_session_${id}`);
          if (raw) session = JSON.parse(raw);
        } catch { /* ignore */ }
      }

      if (!session) throw new Error("Session not found");
      onLoadSession(session);
      toast.success(`Loaded ${session.leadsCount} leads from session`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingId(null);
    }
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmDeleteId(id);
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      fetch("/api/sessions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      }).catch(() => {});

      // Remove from client localStorage
      try {
        localStorage.removeItem(`webeta_session_${id}`);
        const raw = localStorage.getItem("webeta_saved_sessions_meta");
        if (raw) {
          const list = (JSON.parse(raw) as SessionMeta[]).filter((s) => s.id !== id);
          localStorage.setItem("webeta_saved_sessions_meta", JSON.stringify(list));
        }
        if (localStorage.getItem("webeta_active_session_id") === id) {
          localStorage.removeItem("webeta_active_session_id");
          localStorage.removeItem("webeta_active_session_data");
        }
      } catch { /* ignore */ }

      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (id === activeSessionId) {
        onDeleteActiveSession?.();
      }
      toast.success("Session deleted");
    } catch {
      toast.error("Failed to delete session");
    } finally {
      setDeletingId(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function toggleCity(city: string) {
    setCollapsedCities((prev) => {
      const next = new Set(prev);
      next.has(city) ? next.delete(city) : next.add(city);
      return next;
    });
  }

  // Filter by search
  const q = search.toLowerCase().trim();
  const filtered = q
    ? sessions.filter(
        (s) =>
          s.city.toLowerCase().includes(q) ||
          s.niche.toLowerCase().includes(q)
      )
    : sessions;

  // Group by city (sorted newest first within each city)
  const grouped = filtered.reduce<Record<string, SessionMeta[]>>((acc, s) => {
    const key = s.city || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  // Sort cities by most recent session
  const sortedCities = Object.keys(grouped).sort((a, b) => {
    const latestA = Math.max(...grouped[a].map((s) => new Date(s.timestamp).getTime()));
    const latestB = Math.max(...grouped[b].map((s) => new Date(s.timestamp).getTime()));
    return latestB - latestA;
  });

  const totalSessions = sessions.length;
  const totalLeads = sessions.reduce((sum, s) => sum + (s.leadsCount ?? 0), 0);

  async function wipeAllOldSessions() {
    if (!confirm("Are you sure you want to delete all scrape history? This will permanently wipe all sessions.")) return;
    setLoading(true);
    try {
      fetch("/api/sessions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "all" }),
      }).catch(() => {});

      try {
        const raw = localStorage.getItem("webeta_saved_sessions_meta");
        if (raw) {
          const list = JSON.parse(raw) as SessionMeta[];
          for (const s of list) {
            localStorage.removeItem(`webeta_session_${s.id}`);
          }
        }
        localStorage.removeItem("webeta_saved_sessions_meta");
        localStorage.removeItem("webeta_active_session_id");
        localStorage.removeItem("webeta_active_session_data");
        sessionStorage.removeItem("webeta_cached_session");
      } catch { /* ignore */ }

      setSessions([]);
      toast.success("All scrape history wiped clean.");
    } catch {
      toast.error("Failed to wipe old sessions");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-8 px-4">
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.97 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-3xl"
      >
        <Card className="shadow-2xl border-border">
          {/* Header */}
          <CardHeader className="flex flex-row items-start justify-between pb-3 gap-4">
            <div>
              <CardTitle className="font-display text-2xl">Scrape History</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {totalSessions} sessions · {totalLeads.toLocaleString()} total leads scraped
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={wipeAllOldSessions}
                className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Wipe Old History
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {/* Search bar */}
            {!loading && sessions.length > 0 && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  id="history-search"
                  placeholder="Search by city or niche…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                  autoFocus
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading sessions…
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No scrape sessions yet.</p>
                <p className="text-xs mt-1 opacity-60">Run a scrape in Phase 1 to save your first session.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No sessions match &ldquo;{search}&rdquo;</p>
                <button onClick={() => setSearch("")} className="text-xs text-primary underline mt-1">Clear search</button>
              </div>
            ) : (
              <div className="space-y-4">
                <AnimatePresence>
                  {sortedCities.map((city) => {
                    const citySessions = grouped[city].sort(
                      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    );
                    const isCollapsed = collapsedCities.has(city);
                    const cityLeads = citySessions.reduce((sum, s) => sum + (s.leadsCount ?? 0), 0);

                    return (
                      <motion.div
                        key={city}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        {/* City group header */}
                        <button
                          className="w-full flex items-center gap-2 mb-2 group"
                          onClick={() => toggleCity(city)}
                        >
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                            {city}
                          </div>
                          <div className="flex items-center gap-1.5 ml-1">
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                              {citySessions.length} {citySessions.length === 1 ? "session" : "sessions"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                              {cityLeads} leads
                            </Badge>
                          </div>
                          <div className="flex-1 h-px bg-border ml-2" />
                          {isCollapsed
                            ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          }
                        </button>

                        {/* Sessions under this city */}
                        <AnimatePresence>
                          {!isCollapsed && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.15 }}
                              className="space-y-2 overflow-hidden"
                            >
                              {citySessions.map((s) => (
                                <div
                                  key={s.id}
                                  className="group flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all duration-150 ml-2"
                                  onClick={() => loadSession(s.id)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => e.key === "Enter" && loadSession(s.id)}
                                >
                                  {/* Load indicator */}
                                  <div className="shrink-0 h-9 w-9 rounded-md bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                    {loadingId === s.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                    ) : (
                                      <FolderOpen className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                                    )}
                                  </div>

                                  {/* Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium capitalize text-sm">{s.niche}</span>
                                      {s.id === activeSessionId && (
                                        <Badge className="text-[9px] h-4 px-1.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                                          Active
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Zap className="h-2.5 w-2.5" />{s.leadsCount} leads
                                      </span>
                                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Phone className="h-2.5 w-2.5" />{s.withPhoneCount} with phone
                                      </span>
                                      <span className="flex items-center gap-1 text-[10px] text-destructive/70">
                                        <Globe className="h-2.5 w-2.5" />{s.noWebsiteCount} no site
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/60">
                                      <Clock className="h-2.5 w-2.5" />
                                      {formatDate(s.timestamp)}
                                    </div>
                                  </div>

                                  {/* Delete */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0 h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                    onClick={(e) => deleteSession(s.id, e)}
                                    disabled={deletingId === s.id}
                                    aria-label={`Delete session for ${s.niche} in ${s.city}`}
                                  >
                                    {deletingId === s.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Delete confirm popup ───────────────────────────────────────────── */}
      {confirmDeleteId && (() => {
        const target = sessions.find(s => s.id === confirmDeleteId);
        return (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]"
              onClick={() => setConfirmDeleteId(null)}
            />
            {/* Dialog */}
            <div className="fixed inset-0 z-[61] flex items-center justify-center p-4" onClick={() => setConfirmDeleteId(null)}>
              <div
                className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4"
                onClick={e => e.stopPropagation()}
              >
                {/* Icon */}
                <div className="h-14 w-14 rounded-full bg-destructive/10 border-2 border-destructive/20 flex items-center justify-center">
                  <Trash2 className="h-6 w-6 text-destructive" />
                </div>
                {/* Text */}
                <div className="text-center">
                  <div className="font-semibold text-base mb-1">Delete this session?</div>
                  {target && (
                    <div className="text-xs text-muted-foreground mb-2 font-medium">
                      {target.niche} · {target.city} · {target.leadsCount} leads
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Once deleted, this session and all its data will be 
                    <span className="text-destructive font-semibold">gone forever</span>.
                    It can never be recovered.
                  </p>
                </div>
                {/* Buttons */}
                <div className="flex gap-3 w-full mt-1">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    No, Keep It
                  </Button>
                  <Button
                    className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    onClick={confirmDelete}
                    disabled={!!deletingId}
                  >
                    {deletingId ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Yes, Delete Forever
                  </Button>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
