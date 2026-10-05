"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Settings2,
  Send,
  Pause,
  Play,
  Square,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Zap,
  AlertTriangle,
  Wifi,
  WifiOff,
  Search,
  Filter,
  RefreshCw,
  Image as ImageIcon,
  MessageSquare,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  CheckSquare,
  Square as SquareIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { RankedLead, OutreachResult } from "@/lib/types";

interface WaConfig {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  instanceName: string;
  delayMinMs: number;
  delayMaxMs: number;
  hasKey: boolean;
  hasUrl: boolean;
}

interface BlastLog {
  name: string;
  phone: string;
  result: "sent" | "failed";
  error?: string;
  ts: number;
}

interface BlastState {
  status: "idle" | "running" | "paused" | "done" | "error";
  total: number;
  done: number;
  failed: number;
  currentName: string;
  nextSendAt: number;
  log: BlastLog[];
  startedAt: number;
  updatedAt: number;
}

interface ServerHealth {
  checking: boolean;
  ok: boolean | null;
  serverMessage?: string;
  version?: string;
  instanceState?: string;
  error?: string;
}

function msToMin(ms: number) {
  return Math.round(ms / 60000);
}

function formatCountdown(nextSendAt: number): string {
  const diff = nextSendAt - Date.now();
  if (diff <= 0) return "Sending now...";
  const totalSec = Math.ceil(diff / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatEstimatedFinish(remainingCount: number, avgDelayMs: number): string {
  if (remainingCount <= 0) return "Done";
  const finishTs = Date.now() + remainingCount * avgDelayMs;
  return new Date(finishTs).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
}

function cleanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function prepareText(raw: string): string {
  if (!raw) return "";
  let clean = raw;
  clean = clean.replace(/https?:\/\/[^\s)]+/gi, "");
  clean = clean.replace(/or explore our work at\s*/gi, "");
  clean = clean.replace(/visit us at\s*/gi, "");
  clean = clean.replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return clean;
}

interface WhatsAppBlastProps {
  ranked: RankedLead[];
  outreachResults: Record<string, OutreachResult>;
  previews: Record<string, { exists: boolean; previewUrl?: string }>;
  onBackToSingle?: () => void;
}

export function WhatsAppBlast({
  ranked,
  outreachResults,
  previews,
  onBackToSingle,
}: WhatsAppBlastProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "selected" | "sent" | "pending" | "failed">("all");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [testingLeadId, setTestingLeadId] = useState<string | null>(null);

  const [config, setConfig] = useState<WaConfig>({
    evolutionApiUrl: "",
    evolutionApiKey: "",
    instanceName: "webeta",
    delayMinMs: 8 * 60 * 1000,
    delayMaxMs: 20 * 60 * 1000,
    hasKey: false,
    hasUrl: false,
  });
  const [savingConfig, setSavingConfig] = useState(false);

  const [health, setHealth] = useState<ServerHealth>({
    checking: false,
    ok: null,
  });

  const [blastState, setBlastState] = useState<BlastState>({
    status: "idle",
    total: 0,
    done: 0,
    failed: 0,
    currentName: "",
    nextSendAt: 0,
    log: [],
    startedAt: 0,
    updatedAt: 0,
  });

  const [countdown, setCountdown] = useState("");
  const [starting, setStarting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load settings on mount
  useEffect(() => {
    fetch("/api/whatsapp-blast/settings")
      .then((r) => r.json())
      .then((d: WaConfig) => {
        setConfig(d);
        if (d.hasUrl) {
          checkHealth();
        }
      })
      .catch(() => {});
  }, []);

  // Check health and ping server
  const checkHealth = useCallback(async () => {
    setHealth((h) => ({ ...h, checking: true }));
    try {
      const res = await fetch("/api/whatsapp-blast/ping");
      const data = await res.json();
      setHealth({
        checking: false,
        ok: data.ok,
        serverMessage: data.serverMessage,
        version: data.version,
        instanceState: data.instanceState,
        error: data.error,
      });
    } catch (e) {
      setHealth({
        checking: false,
        ok: false,
        error: (e as Error).message,
      });
    }
  }, []);

  // Automatic keep-alive: ping Evolution API every 10 minutes while tab is open
  useEffect(() => {
    keepAliveRef.current = setInterval(() => {
      fetch("/api/whatsapp-blast/ping").catch(() => {});
    }, 10 * 60 * 1000);

    return () => {
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    };
  }, []);

  // Fetch status of running blast
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp-blast/status");
      const data: BlastState = await res.json();
      setBlastState(data);
    } catch {
      /* ignore */
    }
  }, []);

  // Status polling loop
  useEffect(() => {
    if (blastState.status === "running" || blastState.status === "paused") {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchStatus, 5000);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [blastState.status, fetchStatus]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Live countdown timer
  useEffect(() => {
    if (blastState.status === "running" && blastState.nextSendAt > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown(formatCountdown(blastState.nextSendAt));
      }, 1000);
    } else {
      setCountdown("");
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [blastState.status, blastState.nextSendAt]);

  // All leads with valid WhatsApp numbers and drafts
  const eligibleLeads = useMemo(() => {
    return ranked.filter(
      (l) => outreachResults[l.id] && l.whatsapp && l.whatsapp.replace(/\D/g, "").length >= 10
    );
  }, [ranked, outreachResults]);

  // Auto-select all eligible leads by default on first load
  useEffect(() => {
    if (eligibleLeads.length > 0 && selectedLeadIds.size === 0) {
      setSelectedLeadIds(new Set(eligibleLeads.map((l) => l.id)));
    }
  }, [eligibleLeads]);

  // Map of lead logs
  const logMap = useMemo(() => {
    const map = new Map<string, BlastLog>();
    for (const entry of blastState.log) {
      const normalizedPhone = entry.phone.slice(-10);
      map.set(normalizedPhone, entry);
    }
    return map;
  }, [blastState.log]);

  // Toggle selection
  const toggleSelectAll = () => {
    if (selectedLeadIds.size === eligibleLeads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(eligibleLeads.map((l) => l.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filtered leads for the table
  const displayedLeads = useMemo(() => {
    return eligibleLeads.filter((l) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        l.name.toLowerCase().includes(q) ||
        (l.whatsapp && l.whatsapp.includes(q)) ||
        l.category.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      const normPhone = cleanPhone(l.whatsapp || "").slice(-10);
      const log = logMap.get(normPhone);

      if (statusFilter === "selected") return selectedLeadIds.has(l.id);
      if (statusFilter === "sent") return log?.result === "sent";
      if (statusFilter === "failed") return log?.result === "failed";
      if (statusFilter === "pending") return !log;
      return true;
    });
  }, [eligibleLeads, searchQuery, statusFilter, selectedLeadIds, logMap]);

  // Metrics
  const totalInQueue = blastState.total > 0 ? blastState.total : selectedLeadIds.size;
  const sentCount = blastState.done;
  const failedCount = blastState.failed;
  const remainingCount = Math.max(0, totalInQueue - sentCount);
  const pct = totalInQueue > 0 ? Math.round((sentCount / totalInQueue) * 100) : 0;
  const avgDelayMs = (config.delayMinMs + config.delayMaxMs) / 2;
  const estimatedFinish = formatEstimatedFinish(remainingCount, avgDelayMs);

  // Save config
  async function saveConfig() {
    setSavingConfig(true);
    try {
      await fetch("/api/whatsapp-blast/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      toast.success("Settings saved!");
      setSettingsOpen(false);
      checkHealth();
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSavingConfig(false);
    }
  }

  // Start blast
  async function startBlast() {
    if (!config.hasUrl || !config.hasKey) {
      toast.error("Configure Evolution API URL and Key first!");
      setSettingsOpen(true);
      return;
    }

    const leadsToSend = eligibleLeads
      .filter((l) => selectedLeadIds.has(l.id))
      .map((l) => ({
        id: l.id,
        name: l.name,
        phone: cleanPhone(l.whatsapp!),
        message: prepareText(outreachResults[l.id].first),
        imageUrl: previews[l.id]?.previewUrl ?? undefined,
      }));

    if (leadsToSend.length === 0) {
      toast.error("Please select at least 1 lead to send!");
      return;
    }

    setStarting(true);
    try {
      const res = await fetch("/api/whatsapp-blast/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: leadsToSend,
          appBaseUrl: window.location.origin,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Blast started! Queued ${data.queued} leads.`);
        setTimeout(fetchStatus, 1500);
      } else {
        toast.error(data.error || "Failed to start blast");
      }
    } catch {
      toast.error("Network error starting blast");
    } finally {
      setStarting(false);
    }
  }

  // Control action
  async function control(action: "pause" | "resume" | "stop") {
    await fetch("/api/whatsapp-blast/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await fetchStatus();
  }

  // Send single test message
  async function sendTestMessage(lead: RankedLead) {
    if (!lead.whatsapp) return;
    setTestingLeadId(lead.id);
    try {
      const res = await fetch("/api/whatsapp-blast/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lead.name,
          phone: cleanPhone(lead.whatsapp),
          message: prepareText(outreachResults[lead.id]?.first || ""),
          imageUrl: previews[lead.id]?.previewUrl,
          appBaseUrl: window.location.origin,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Test sent to ${lead.name}!`);
      } else {
        toast.error(data.error || "Failed to send test");
      }
    } catch (e) {
      toast.error((e as Error).message || "Network error");
    } finally {
      setTestingLeadId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── TOP HEADER & STATUS BAR ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="h-10 w-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-600">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2.5">
                WhatsApp Bulk Auto-Sender
                {blastState.status === "running" && (
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs animate-pulse">
                    Live Blasting
                  </Badge>
                )}
                {blastState.status === "paused" && (
                  <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">
                    Paused
                  </Badge>
                )}
              </h2>
              <p className="text-xs text-muted-foreground">
                Human-paced auto outreach: sends website preview screenshot + personalized message with {msToMin(config.delayMinMs)}–{msToMin(config.delayMaxMs)} min random delays.
              </p>
            </div>
          </div>
        </div>

        {/* Server & Status Badges */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={checkHealth}
            disabled={health.checking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs font-medium text-muted-foreground transition-all"
            title={health.error ? `Error: ${health.error} (click to re-ping)` : "Click to re-ping server"}
          >
            {health.checking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : health.ok ? (
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-destructive" />
            )}
            <span>
              {health.checking
                ? "Connecting / Waking up..."
                : health.ok
                ? `Render API: Live (v${health.version || "2.3"})`
                : "Render API: Offline (click to wake)"}
            </span>
            <RefreshCw className={`h-3 w-3 ml-0.5 opacity-60 ${health.checking ? "animate-spin" : ""}`} />
          </button>

          <Badge
            variant="outline"
            className="text-xs py-1.5 px-2.5 gap-1.5 border-border bg-card text-foreground"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Keep-Alive: Active
          </Badge>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen((p) => !p)}
            className="gap-1.5 text-xs h-9"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
          </Button>

          {onBackToSingle && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToSingle}
              className="text-xs h-9 text-muted-foreground"
            >
              Single Review
            </Button>
          )}
        </div>
      </div>

      {/* ── SETTINGS PANEL (COLLAPSIBLE / EDITABLE) ── */}
      {settingsOpen && (
        <div className="p-5 rounded-2xl bg-card border border-primary/20 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Evolution API & Speed Settings</h3>
            </div>
            <button
              onClick={() => setSettingsOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close ✕
            </button>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Evolution API URL (Render)
              </label>
              <input
                type="url"
                placeholder="https://evolution-api-webeta.onrender.com"
                value={config.evolutionApiUrl}
                onChange={(e) => setConfig((c) => ({ ...c, evolutionApiUrl: e.target.value }))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Your deployed Evolution service on Render</p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                API Key
              </label>
              <input
                type="password"
                placeholder={config.hasKey ? "saved (webeta2025secret)" : "Enter API key"}
                value={config.evolutionApiKey}
                onChange={(e) => setConfig((c) => ({ ...c, evolutionApiKey: e.target.value }))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Default: webeta2025secret</p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Instance Name
              </label>
              <input
                type="text"
                placeholder="webeta"
                value={config.instanceName}
                onChange={(e) => setConfig((c) => ({ ...c, instanceName: e.target.value }))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Instance created in Evolution Manager</p>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Delay Between Messages (Minutes)
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-[10px] text-muted-foreground mb-1">Minimum (minutes)</div>
                  <input
                    type="number"
                    min={3}
                    max={60}
                    value={msToMin(config.delayMinMs)}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, delayMinMs: Math.max(3, +e.target.value) * 60000 }))
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-muted-foreground mb-1">Maximum (minutes)</div>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={msToMin(config.delayMaxMs)}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, delayMaxMs: Math.max(5, +e.target.value) * 60000 }))
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Recommended: 8–20 mins (mimics human typing & preserves WhatsApp number health)</p>
            </div>

            <div className="sm:col-span-2 flex items-end gap-2">
              <Button
                onClick={saveConfig}
                disabled={savingConfig}
                className="gap-2 text-xs h-9 bg-primary"
              >
                {savingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Save Settings & Test Connection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 6 KEY METRICS ROW (WHAT'S SENT, WHAT'S LEFT, TIME) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Metric 1: Total Queue */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Total in Queue
          </div>
          <div className="text-2xl font-black text-foreground font-mono">
            {totalInQueue}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {selectedLeadIds.size} selected
          </div>
        </div>

        {/* Metric 2: Sent So Far */}
        <div className="p-4 rounded-xl bg-card border border-emerald-500/20 shadow-xs bg-emerald-500/5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1 flex items-center justify-between">
            <span>Sent Successfully</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            {sentCount}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {totalInQueue > 0 ? `${pct}% completed` : "0%"}
          </div>
        </div>

        {/* Metric 3: Left to Send (Remaining) */}
        <div className="p-4 rounded-xl bg-card border border-blue-500/20 shadow-xs bg-blue-500/5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400 mb-1 flex items-center justify-between">
            <span>Left to Send</span>
            <Clock className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
            {remainingCount}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            messages remaining
          </div>
        </div>

        {/* Metric 4: Failed / Errors */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-between">
            <span>Failed / Skipped</span>
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className={`text-2xl font-black font-mono ${failedCount > 0 ? "text-destructive" : "text-foreground"}`}>
            {failedCount}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {failedCount === 0 ? "All deliveries clean" : "Issues logged"}
          </div>
        </div>

        {/* Metric 5: Next Send Countdown */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Next Message In
          </div>
          <div className="text-xl font-bold font-mono text-foreground truncate">
            {blastState.status === "running" ? countdown || "Queued..." : "—"}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {blastState.status === "running" && blastState.currentName
              ? `To: ${blastState.currentName}`
              : "Waiting to blast"}
          </div>
        </div>

        {/* Metric 6: Estimated Finish */}
        <div className="p-4 rounded-xl bg-card border border-border shadow-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Est. Blast Finish
          </div>
          <div className="text-base font-bold text-foreground truncate">
            {blastState.status === "running" || blastState.status === "paused"
              ? estimatedFinish
              : `~${Math.round((avgDelayMs * totalInQueue) / 3600000)}h total`}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            at ~{msToMin(avgDelayMs)}m / lead
          </div>
        </div>
      </div>

      {/* ── MASTER CONTROL & PROGRESS BAR BANNER ── */}
      <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-4">
        {/* Progress Bar & Status Text */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
            <span className="font-semibold text-foreground flex items-center gap-2">
              <span>Overall Blast Progress:</span>
              <strong className="text-primary font-mono text-sm">{sentCount} / {totalInQueue}</strong>
              <span className="text-muted-foreground font-normal">
                ({remainingCount} leads left)
              </span>
            </span>
            <span className="font-mono font-bold text-sm text-foreground">
              {pct}% Completed
            </span>
          </div>

          <div className="h-3 rounded-full bg-muted overflow-hidden relative border border-border/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-600 transition-all duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Action Controls & Active Lead Notification */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 text-xs">
            {blastState.status === "running" && (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                <span>
                  Currently processing:{" "}
                  <strong className="text-foreground">{blastState.currentName || "Next Lead"}</strong>
                </span>
              </div>
            )}
            {blastState.status === "paused" && (
              <div className="flex items-center gap-2 text-amber-600 font-medium">
                <Pause className="h-4 w-4" />
                <span>Blast paused. Click Resume to continue.</span>
              </div>
            )}
            {blastState.status === "idle" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                <span>Ready to start blast for {selectedLeadIds.size} selected leads.</span>
              </div>
            )}
            {blastState.status === "done" && (
              <div className="flex items-center gap-2 text-emerald-600 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                <span>Blast complete! All selected leads were delivered.</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {blastState.status === "idle" || blastState.status === "done" || blastState.status === "error" ? (
              <Button
                size="default"
                disabled={starting || selectedLeadIds.size === 0 || !config.hasUrl}
                onClick={startBlast}
                className="gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 shadow-sm"
              >
                {starting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Starting Blast...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" /> Start WhatsApp Blast ({selectedLeadIds.size} Leads)
                  </>
                )}
              </Button>
            ) : null}

            {blastState.status === "running" && (
              <Button
                size="default"
                variant="outline"
                className="gap-2 font-semibold text-xs border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                onClick={() => control("pause")}
              >
                <Pause className="h-4 w-4" /> Pause Blast
              </Button>
            )}

            {blastState.status === "paused" && (
              <Button
                size="default"
                className="gap-2 font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => control("resume")}
              >
                <Play className="h-4 w-4" /> Resume Blast
              </Button>
            )}

            {(blastState.status === "running" || blastState.status === "paused") && (
              <Button
                size="default"
                variant="outline"
                className="gap-2 font-semibold text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => {
                  if (window.confirm("Are you sure you want to stop the blast? Finished messages remain recorded.")) {
                    control("stop");
                  }
                }}
              >
                <Square className="h-3.5 w-3.5" /> Stop Blast
              </Button>
            )}

            {blastState.status === "done" && (
              <Button
                size="default"
                variant="outline"
                className="gap-2 font-semibold text-xs"
                onClick={() => control("stop")}
              >
                Reset Queue
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── QUEUE MANAGEMENT TABLE (FILTERABLE, SELECTABLE, TESTABLE) ── */}
      <div className="rounded-2xl bg-card border border-border shadow-xs overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3 bg-muted/20">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary transition-colors"
            >
              {selectedLeadIds.size === eligibleLeads.length && eligibleLeads.length > 0 ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <SquareIcon className="h-4 w-4 text-muted-foreground" />
              )}
              <span>
                {selectedLeadIds.size === eligibleLeads.length
                  ? "Deselect All"
                  : `Select All (${eligibleLeads.length})`}
              </span>
            </button>

            <div className="h-4 w-px bg-border" />

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded-lg border border-border text-xs">
              {(["all", "selected", "pending", "sent", "failed"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`px-2.5 py-1 rounded-md capitalize font-medium transition-all ${
                    statusFilter === tab
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-64">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by business or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0 border-b border-border z-10 backdrop-blur-xs">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Lead / Business</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">WhatsApp Number</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Preview Image</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Draft Message</th>
                <th className="px-3 py-3 text-left font-semibold text-muted-foreground">Blast Status</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Test</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {displayedLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No leads found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                displayedLeads.map((lead) => {
                  const isSelected = selectedLeadIds.has(lead.id);
                  const normPhone = cleanPhone(lead.whatsapp || "").slice(-10);
                  const log = logMap.get(normPhone);
                  const hasPreview = previews[lead.id]?.exists;
                  const draft = outreachResults[lead.id]?.first;

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-muted/20 transition-colors ${
                        isSelected ? "bg-primary/[0.02]" : "opacity-60"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleSelectOne(lead.id)}
                          className="flex items-center text-muted-foreground hover:text-foreground"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <SquareIcon className="h-4 w-4" />
                          )}
                        </button>
                      </td>

                      <td className="px-3 py-3 font-medium">
                        <div className="font-semibold text-foreground">{lead.name}</div>
                        <div className="text-[10px] text-muted-foreground">{lead.category} · {lead.city}</div>
                      </td>

                      <td className="px-3 py-3 font-mono text-foreground">
                        {lead.whatsapp}
                      </td>

                      <td className="px-3 py-3">
                        {hasPreview ? (
                          <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-500/20 bg-emerald-500/5">
                            <ImageIcon className="h-3 w-3" /> Image Ready
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Text Only
                          </Badge>
                        )}
                      </td>

                      <td className="px-3 py-3 max-w-[280px]">
                        <p className="truncate text-muted-foreground text-[11px]" title={draft}>
                          {draft || "No draft written yet"}
                        </p>
                      </td>

                      <td className="px-3 py-3">
                        {log?.result === "sent" ? (
                          <span className="flex items-center gap-1.5 font-semibold text-emerald-600 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Sent ({formatTime(log.ts)})
                          </span>
                        ) : log?.result === "failed" ? (
                          <span className="flex items-center gap-1.5 font-semibold text-destructive text-xs" title={log.error}>
                            <XCircle className="h-3.5 w-3.5" /> Failed
                          </span>
                        ) : blastState.status === "running" && blastState.currentName === lead.name ? (
                          <span className="flex items-center gap-1.5 font-semibold text-primary text-xs animate-pulse">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending...
                          </span>
                        ) : isSelected ? (
                          <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                            Queued
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Unselected</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={testingLeadId === lead.id || blastState.status === "running"}
                          onClick={() => sendTestMessage(lead)}
                          className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                          title="Send a 1-off test message to verify delivery immediately"
                        >
                          {testingLeadId === lead.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3 text-primary" />
                          )}
                          <span>Send Test</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}