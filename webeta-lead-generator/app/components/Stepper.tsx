"use client";

import { motion } from "framer-motion";
import { Check, Search, FileSearch, Trophy, Target, Send, Sparkles, Download, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Discovery", sub: "Radar", icon: Search },
  { id: 2, label: "Audit", sub: "Analysis", icon: FileSearch },
  { id: 3, label: "Matrix", sub: "Scoring", icon: Trophy },
  { id: 4, label: "Hooks", sub: "Sales Pitch", icon: Target },
  { id: 5, label: "Studio", sub: "Outreach", icon: Send },
  { id: 6, label: "Architect", sub: "Build Prompt", icon: Sparkles },
  { id: 7, label: "Pipeline", sub: "Client CRM", icon: Download },
];

export function Stepper({
  current,
  completed,
  onJump,
}: {
  current: number;
  completed: Set<number>;
  onJump: (n: number) => void;
}) {
  const currentStep = STEPS[current - 1] ?? STEPS[0];
  const percent = Math.round((completed.size / STEPS.length) * 100);

  return (
    <div className="w-full border-t border-border/60 bg-muted/20 py-2.5 px-4" role="navigation" aria-label="Pipeline progress">
      <div className="max-w-7xl mx-auto">
        {/* Mobile View (< md) */}
        <div className="md:hidden flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center">
                {current}
              </span>
              <span>{currentStep.label}</span>
              <span className="text-muted-foreground font-normal">({currentStep.sub})</span>
            </span>
            <span className="text-[11px] text-muted-foreground font-medium">
              {percent}% Pipeline Ready
            </span>
          </div>

          {/* Mobile scrollable step track */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none no-scrollbar">
            {STEPS.map((step) => {
              const isDone = completed.has(step.id);
              const isCurrent = current === step.id;
              const Icon = step.icon;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => onJump(step.id)}
                  aria-label={`Phase ${step.id}: ${step.label}${isCurrent ? " (active)" : isDone ? " (completed)" : ""}`}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-colors border",
                    isCurrent
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : isDone
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                        : "bg-background text-muted-foreground border-border hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  {isDone && !isCurrent ? (
                    <Check className="h-3 w-3 stroke-[2.5]" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                  <span>{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop View (>= md) */}
        <div className="hidden md:flex items-center justify-between w-full">
          {STEPS.map((step, i) => {
            const isDone = completed.has(step.id);
            const isCurrent = current === step.id;
            const Icon = step.icon;

            return (
              <div key={step.id} className="flex items-center flex-1 last:flex-none">
                <button
                  type="button"
                  onClick={() => onJump(step.id)}
                  aria-label={`Phase ${step.id} of ${STEPS.length}: ${step.label}${isCurrent ? " (current)" : isDone ? " (completed)" : ""}`}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 group transition-all rounded-lg p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer select-none",
                    !isCurrent && !isDone && "opacity-75 hover:opacity-100"
                  )}
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center border text-xs font-semibold transition-all shrink-0",
                      isCurrent
                        ? "bg-primary text-primary-foreground border-primary shadow-xs ring-4 ring-primary/10"
                        : isDone
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                          : "bg-card text-muted-foreground border-border group-hover:border-foreground/30 group-hover:text-foreground"
                    )}
                  >
                    {isDone && !isCurrent ? (
                      <Check className="h-4 w-4 stroke-[2.5]" />
                    ) : (
                      <Icon className="h-3.5 w-3.5 stroke-[2]" />
                    )}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground leading-none">
                      Phase 0{step.id}
                    </span>
                    <span
                      className={cn(
                        "text-xs tracking-tight leading-tight mt-0.5 font-semibold",
                        isCurrent
                          ? "text-foreground"
                          : isDone
                            ? "text-foreground/80"
                            : "text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                </button>

                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-[2px] mx-3 relative overflow-hidden bg-border/80 rounded-full">
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: isDone ? 1 : 0 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      style={{ originX: 0 }}
                      className="absolute inset-0 bg-primary/60"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
