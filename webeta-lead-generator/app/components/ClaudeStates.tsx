"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, TriangleAlert, ExternalLink, Cpu } from "lucide-react";

/** Branded "Webeta AI Engine is processing" loading block. */
export function WebetaThinking({ label }: { label: string }) {
  return (
    <Card className="border-dashed border-border bg-card/50">
      <CardContent className="py-14 flex flex-col items-center text-center gap-4">
        <div className="relative h-12 w-12">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full border-2 border-primary/25 border-t-primary"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Cpu className="h-5 w-5 text-primary" strokeWidth={1.5} />
          </div>
        </div>
        <div>
          <div className="text-lg font-bold text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Webeta AI Engine — multi-model neural inference (Hermes Core)</span>
          </div>
        </div>
        <div className="flex gap-1.5 mt-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary/60"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Shown when AI Engine API key isn't configured or is invalid. */
export function WebetaAIRequired({
  error,
  onRetry,
}: {
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="py-12 px-6 text-center max-w-xl mx-auto">
        <div className="h-12 w-12 rounded-full bg-destructive/10 mx-auto flex items-center justify-center mb-5">
          <TriangleAlert className="h-5 w-5 text-destructive" strokeWidth={1.5} />
        </div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2 font-bold">
          Webeta AI Key Configuration
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">AI Inference Engine Setup</h2>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-3">
          Phases 2 through 6 run on the Webeta AI Engine (Hermes / Groq / Gemini / OpenRouter).
          Ensure your API key is configured in <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">app/.env.local</code>.
        </p>
        {error && (
          <p className="text-xs text-destructive/80 italic mb-4 break-words">{error}</p>
        )}
        <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
          <Button
            variant="outline"
            className="h-9 px-4 text-xs font-semibold"
            onClick={() => window.open("https://console.groq.com/keys", "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} /> Get Groq Key
          </Button>
          <Button
            variant="outline"
            className="h-9 px-4 text-xs font-semibold"
            onClick={() => window.open("https://aistudio.google.com/apikey", "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} /> Get Gemini Key
          </Button>
          {onRetry && (
            <Button className="h-9 px-4 text-xs font-semibold" onClick={onRetry}>
              Retry Connection
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Legacy aliases — keep for any components that still import the old names
export const ClaudeThinking = WebetaThinking;
export const ClaudeRequired = WebetaAIRequired;
