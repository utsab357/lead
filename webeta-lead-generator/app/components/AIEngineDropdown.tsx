"use client";

import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Cpu,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ExternalLink,
  Zap,
  Activity,
  Layers,
} from "lucide-react";

interface AIProvider {
  id: string;
  name: string;
  role: string;
  configured: boolean;
  status: "ready" | "rate_limited" | "error" | "unconfigured";
  model: string;
  quotaInfo: string;
  rateLimited: boolean;
  latencyMs: number | null;
  error: string | null;
}

interface AIStatusData {
  providers: AIProvider[];
  healthyCount: number;
  rateLimitedCount: number;
  configuredCount: number;
  activeProvider: string | null;
  activeName: string;
}

export function AIEngineDropdown() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AIStatusData | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initial status fetch (lightweight without pinging)
  useEffect(() => {
    fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Ping test
  async function testConnections() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-status?ping=true");
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  const isAllReady = data && data.healthyCount === data.configuredCount && data.configuredCount > 0;
  const hasRateLimit = data && data.rateLimitedCount > 0;
  const isNoneConfigured = data && data.configuredCount === 0;

  const dotColor = isNoneConfigured
    ? "bg-rose-500"
    : hasRateLimit
    ? "bg-amber-500 animate-pulse"
    : isAllReady
    ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
    : "bg-emerald-500";

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* ── TRIGGER BUTTON ── */}
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && !data?.providers[0]?.latencyMs) {
            testConnections();
          }
        }}
        className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted/50 transition-all shadow-2xs cursor-pointer select-none"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className={`h-2 w-2 rounded-full ${dotColor} shrink-0`} />
        
        {data ? (
          <div className="flex items-center gap-1.5">
            <span className="text-foreground">
              {hasRateLimit
                ? "AI Limit Alert"
                : isNoneConfigured
                ? "No AI Key Set"
                : "Webeta AI Active"}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted font-mono font-medium text-muted-foreground hidden sm:inline">
              {hasRateLimit
                ? `${data.rateLimitedCount} limited`
                : `${data.healthyCount}/${data.configuredCount} ready`}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">Checking AI…</span>
        )}

        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* ── DROPDOWN POPOVER ── */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl p-4 z-50 animate-in fade-in-0 zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-border">
            <div>
              <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-primary" />
                <span>Webeta AI Multi-Model Matrix</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Autonomous 3-provider neural fallback chain
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={testConnections}
              disabled={loading}
              className="h-7 text-[11px] px-2.5 gap-1 shrink-0 font-medium"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin text-primary" : ""}`} />
              <span>{loading ? "Pinging…" : "Ping test"}</span>
            </Button>
          </div>

          {/* Active Chain Visualizer */}
          <div className="py-2.5 px-3 rounded-xl bg-muted/30 border border-border/60 my-3 text-[11px]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
              <span>Failover Chain Priority</span>
              <span className="font-mono text-emerald-600 font-semibold">Active: {data?.activeName?.split(" ")[0]}</span>
            </div>
            <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground overflow-x-auto">
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">1. Groq</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-muted text-foreground">2. Gemini</span>
              <span>→</span>
              <span className="px-1.5 py-0.5 rounded bg-muted text-foreground">3. OpenRouter</span>
            </div>
          </div>

          {/* Provider List */}
          <div className="space-y-2">
            {(data?.providers ?? []).map((provider) => {
              const isReady = provider.status === "ready";
              const isLimited = provider.status === "rate_limited";
              const isError = provider.status === "error";

              return (
                <div
                  key={provider.id}
                  className={`rounded-xl border p-2.5 transition-all text-xs ${
                    isLimited
                      ? "border-destructive/40 bg-destructive/5 ring-1 ring-destructive/20"
                      : isReady
                      ? "border-border bg-card hover:border-primary/30"
                      : "border-border/60 bg-muted/20 opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          isLimited
                            ? "bg-destructive animate-pulse"
                            : isReady
                            ? "bg-emerald-500"
                            : isError
                            ? "bg-rose-500"
                            : "bg-slate-400"
                        }`}
                      />
                      <span className="font-semibold text-foreground truncate">{provider.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {provider.latencyMs !== null && (
                        <span className="text-[10px] font-mono text-muted-foreground tabular-nums flex items-center gap-0.5">
                          <Zap className="h-2.5 w-2.5 text-amber-500" />
                          {provider.latencyMs}ms
                        </span>
                      )}

                      {isLimited ? (
                        <Badge variant="destructive" className="text-[9px] py-0 px-1.5 font-bold">
                          Rate Limited (429)
                        </Badge>
                      ) : isReady ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[9px] py-0 px-1.5 font-semibold">
                          Online
                        </Badge>
                      ) : isError ? (
                        <Badge variant="destructive" className="text-[9px] py-0 px-1.5">
                          Error
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] py-0 px-1.5 text-muted-foreground">
                          No Key
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span className="font-mono truncate max-w-[170px]">{provider.model}</span>
                    <span className="truncate">{provider.quotaInfo}</span>
                  </div>

                  {provider.error && (
                    <div className="mt-1 text-[10px] text-destructive leading-tight flex items-center gap-1 font-medium">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      <span className="truncate">{provider.error}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer Info */}
          <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="text-[10px]">Auto-failover enabled</span>
            <span className="text-[10px] font-mono">app/.env.local</span>
          </div>
        </div>
      )}
    </div>
  );
}
