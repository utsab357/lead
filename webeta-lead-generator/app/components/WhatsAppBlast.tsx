"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  ChevronDown,
  ChevronUp,
  Zap,
  AlertTriangle,
  Wifi,
  WifiOff,
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
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
}

export function WhatsAppBlast({ ranked, outreachResults, previews }: WhatsAppBlastProps) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

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

  useEffect(() => {
    fetch("/api/whatsapp-blast/settings")
      .then((r) => r.json())
      .then((d: WaConfig) => setConfig(d))
      .catch(() => {});
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp-blast/status");
      const data: BlastState = await res.json();
      setBlastState(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (blastState.status === "running" || blastState.status === "paused") {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchStatus, 10000);
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

  const readyLeads = ranked.filter(
    (l) => outreachResults[l.id] && l.whatsapp && l.whatsapp.replace(/\D/g, "").length >= 10
  );
  const readyCount = readyLeads.length;
  const withImage = readyLeads.filter((l) => previews[l.id]?.exists).length;

  async function saveConfig() {
    setSavingConfig(true);
    try {
      await fetch("/api/whatsapp-blast/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      toast.success("WhatsApp settings saved!");
      setSettingsOpen(false);
      const r = await fetch("/api/whatsapp-blast/settings");
      const d: WaConfig = await r.json();
      setConfig(d);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSavingConfig(false);
    }
  }

  async function startBlast() {
    if (!config.hasUrl || !config.hasKey) {
      toast.error("Configure Evolution API settings first!");
      setSettingsOpen(true);
      return;
    }
    const leads = readyLeads.map((l) => ({
      id: l.id,
      name: l.name,
      phone: cleanPhone(l.whatsapp!),
      message: prepareText(outreachResults[l.id].first),
      imageUrl: previews[l.id]?.previewUrl ?? undefined,
    }));
    setStarting(true);
    try {
      const res = await fetch("/api/whatsapp-blast/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads, appBaseUrl: window.location.origin }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Blast started! Sending ${data.queued} messages.`);
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

  async function control(action: "pause" | "resume" | "stop") {
    await fetch("/api/whatsapp-blast/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await fetchStatus();
  }

  const isConfigured = config.hasUrl && config.hasKey;
  const pct = blastState.total > 0 ? Math.round((blastState.done / blastState.total) * 100) : 0;

  const statusColors: Record<string, string> = {
    idle: "text-muted-foreground",
    running: "text-emerald-600 dark:text-emerald-400",
    paused: "text-amber-600 dark:text-amber-400",
    done: "text-blue-600 dark:text-blue-400",
    error: "text-destructive",
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-green-600">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-foreground flex items-center gap-2">
              WhatsApp Auto-Blast
              {blastState.status !== "idle" && (
                <span className={`text-xs font-medium ${statusColors[blastState.status]}`}>
                  {" "}{blastState.status.charAt(0).toUpperCase() + blastState.status.slice(1)}
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {readyCount} leads ready · {withImage} with preview image
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isConfigured && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <WifiOff className="h-3 w-3" /> Not configured
            </Badge>
          )}
          {isConfigured && blastState.status === "idle" && (
            <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
              <Wifi className="h-3 w-3" /> Ready
            </Badge>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4">

          <div className="flex gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong>Use a secondary WhatsApp number.</strong> Send max 150-200 msgs/day.
              Random delays mimic human speed - do not reduce below 5 min.
            </p>
          </div>

          {blastState.status !== "idle" && (
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    {blastState.done} / {blastState.total} sent
                    {blastState.failed > 0 && (
                      <span className="text-destructive ml-2">({blastState.failed} failed)</span>
                    )}
                  </span>
                  <span className="font-mono font-semibold text-foreground">{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {blastState.status === "running" && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {blastState.currentName
                      ? <span>Sending to <strong className="text-foreground">{blastState.currentName}</strong></span>
                      : <span>Processing...</span>
                    }
                  </div>
                  {countdown && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      Next in <strong className="text-foreground font-mono ml-1">{countdown}</strong>
                    </div>
                  )}
                </div>
              )}

              {blastState.status === "paused" && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <Pause className="h-3.5 w-3.5" />
                  <span>Blast paused - {blastState.total - blastState.done} messages remaining</span>
                </div>
              )}

              {blastState.status === "done" && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Blast complete! {blastState.done} sent, {blastState.failed} failed.</span>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {blastState.status === "running" && (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => control("pause")}>
                    <Pause className="h-3 w-3" /> Pause
                  </Button>
                )}
                {blastState.status === "paused" && (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-emerald-600 border-emerald-500/30" onClick={() => control("resume")}>
                    <Play className="h-3 w-3" /> Resume
                  </Button>
                )}
                {(blastState.status === "running" || blastState.status === "paused") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => { if (window.confirm("Stop the blast? Progress so far is saved in the log.")) control("stop"); }}
                  >
                    <Square className="h-3 w-3" /> Stop
                  </Button>
                )}
                {(blastState.status === "done" || blastState.status === "error") && (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => control("stop")}>
                    Reset
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs gap-1.5 ml-auto"
                  onClick={() => setLogOpen((p) => !p)}
                >
                  {logOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Log ({blastState.log.length})
                </Button>
              </div>

              {logOpen && blastState.log.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/60 sticky top-0">
                        <tr>
                          <th className="text-left px-2.5 py-1.5 font-semibold text-muted-foreground">Lead</th>
                          <th className="text-left px-2.5 py-1.5 font-semibold text-muted-foreground">Phone</th>
                          <th className="text-left px-2.5 py-1.5 font-semibold text-muted-foreground">Status</th>
                          <th className="text-left px-2.5 py-1.5 font-semibold text-muted-foreground">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...blastState.log].reverse().map((entry, i) => (
                          <tr key={i} className="border-t border-border/50 hover:bg-muted/20">
                            <td className="px-2.5 py-1.5 font-medium truncate max-w-[120px]">{entry.name}</td>
                            <td className="px-2.5 py-1.5 font-mono text-muted-foreground">{entry.phone.slice(-10)}</td>
                            <td className="px-2.5 py-1.5">
                              {entry.result === "sent" ? (
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <CheckCircle2 className="h-3 w-3" /> Sent
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-destructive" title={entry.error}>
                                  <XCircle className="h-3 w-3" /> Failed
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-1.5 text-muted-foreground font-mono">{formatTime(entry.ts)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {(blastState.status === "idle" || blastState.status === "done" || blastState.status === "error") && (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
                <div className="text-[11px] text-muted-foreground font-medium">BLAST SUMMARY</div>
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="font-bold text-foreground text-sm">{readyCount}</span>
                    <span className="text-muted-foreground ml-1">leads ready</span>
                  </div>
                  <div>
                    <span className="font-bold text-foreground text-sm">{withImage}</span>
                    <span className="text-muted-foreground ml-1">with image</span>
                  </div>
                  <div>
                    <span className="font-bold text-foreground text-sm">
                      ~{Math.round((config.delayMinMs * readyCount) / 3600000)}-{Math.round((config.delayMaxMs * readyCount) / 3600000)}h
                    </span>
                    <span className="text-muted-foreground ml-1">total time</span>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Delay: {msToMin(config.delayMinMs)}-{msToMin(config.delayMaxMs)} min between each message
                </div>
              </div>

              <Button
                size="lg"
                disabled={starting || readyCount === 0 || !isConfigured}
                onClick={startBlast}
                className="sm:self-end gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 shrink-0"
              >
                {starting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Starting...</>
                ) : (
                  <><Zap className="h-4 w-4" /> Start Blast</>
                )}
              </Button>
            </div>
          )}

          <div className="border-t border-border pt-3">
            <button
              onClick={() => setSettingsOpen((p) => !p)}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Evolution API Settings
              {settingsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {settingsOpen && (
              <div className="mt-3 space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Evolution API URL
                    </label>
                    <input
                      type="url"
                      placeholder="http://your-vps-ip:8080"
                      value={config.evolutionApiUrl}
                      onChange={(e) => setConfig((c) => ({ ...c, evolutionApiUrl: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Your Oracle VPS IP with Evolution API port</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      API Key
                    </label>
                    <input
                      type="password"
                      placeholder={config.hasKey ? "saved - enter new to change" : "Enter your Evolution API key"}
                      value={config.evolutionApiKey}
                      onChange={(e) => setConfig((c) => ({ ...c, evolutionApiKey: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Set in Evolution API .env as AUTHENTICATION_API_KEY</p>
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
                    <p className="text-[10px] text-muted-foreground">The WhatsApp instance name you created</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Delay Between Messages
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="text-[10px] text-muted-foreground mb-1">Min (minutes)</div>
                        <input
                          type="number"
                          min={3}
                          max={60}
                          value={msToMin(config.delayMinMs)}
                          onChange={(e) => setConfig((c) => ({ ...c, delayMinMs: Math.max(3, +e.target.value) * 60000 }))}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] text-muted-foreground mb-1">Max (minutes)</div>
                        <input
                          type="number"
                          min={5}
                          max={120}
                          value={msToMin(config.delayMaxMs)}
                          onChange={(e) => setConfig((c) => ({ ...c, delayMaxMs: Math.max(5, +e.target.value) * 60000 }))}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Recommended: 8-20 min. Do not go below 5 min (ban risk increases)</p>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={saveConfig}
                  disabled={savingConfig}
                  className="h-8 text-xs gap-1.5"
                >
                  {savingConfig ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Save Settings
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}