"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, FolderOpen, Clock, MapPin, Zap, Phone, Globe, X } from "lucide-react";
import { toast } from "sonner";
import type { ScrapeSession } from "@/lib/types";

type SessionMeta = Omit<ScrapeSession, "leads">;

export function SessionsPage({
  onLoadSession,
  onClose,
}: {
  onLoadSession: (session: ScrapeSession) => void;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      setSessions(data.sessions ?? []);
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
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) throw new Error("Session not found");
      const data = await res.json();
      onLoadSession(data.session as ScrapeSession);
      toast.success(`Loaded ${data.session.leadsCount} leads from session`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingId(null);
    }
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      const res = await fetch("/api/sessions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      setSessions((prev) => prev.filter((s) => s.id !== id));
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
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="font-display text-2xl">Scrape History</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                All past scrape sessions — click to load, trash to delete.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" />
            </Button>
          </CardHeader>

          <CardContent>
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
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {sessions.map((s) => (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div
                        className="group flex items-center gap-4 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all duration-150"
                        onClick={() => loadSession(s.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && loadSession(s.id)}
                      >
                        {/* Load indicator */}
                        <div className="shrink-0 h-10 w-10 rounded-md bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                          {loadingId === s.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          ) : (
                            <FolderOpen className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium capitalize">{s.niche}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="flex items-center gap-1 text-sm text-muted-foreground">
                              <MapPin className="h-3 w-3" /> {s.city}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge variant="secondary" className="text-[10px] gap-1">
                              <Zap className="h-2.5 w-2.5" />
                              {s.leadsCount} leads
                            </Badge>
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Phone className="h-2.5 w-2.5" />
                              {s.withPhoneCount} with phone
                            </Badge>
                            <Badge variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/30">
                              <Globe className="h-2.5 w-2.5" />
                              {s.noWebsiteCount} no site
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/70">
                            <Clock className="h-3 w-3" />
                            {formatDate(s.timestamp)}
                          </div>
                        </div>

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                          onClick={(e) => deleteSession(s.id, e)}
                          disabled={deletingId === s.id}
                          aria-label={`Delete session for ${s.niche} in ${s.city}`}
                        >
                          {deletingId === s.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
