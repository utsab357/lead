"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft } from "lucide-react";

export function PhaseShell({
  title,
  subtitle,
  children,
  onPrev,
  onNext,
  nextLabel = "Next phase",
  nextDisabled = false,
  nextDisabledHint,
  prevDisabled = false,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextDisabledHint?: string;
  prevDisabled?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="max-w-7xl mx-auto px-4 sm:px-6 pb-28 sm:pb-32"
    >
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="text-muted-foreground mt-1.5 text-xs sm:text-sm max-w-3xl leading-relaxed">{subtitle}</p>
      </header>
      <div>{children}</div>
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={onPrev}
            disabled={prevDisabled || !onPrev}
            aria-label="Go to previous phase"
            className="h-9 sm:h-10 px-3.5 sm:px-4 text-xs sm:text-sm font-medium"
          >
            <ChevronLeft className="h-4 w-4 mr-1 sm:mr-1.5 stroke-[2]" /> Back
          </Button>
          <div className="flex flex-col items-end gap-0.5">
            {nextDisabled && nextDisabledHint && (
              <span className="text-[10px] sm:text-[11px] text-muted-foreground font-medium">{nextDisabledHint}</span>
            )}
            <Button
              onClick={onNext}
              disabled={nextDisabled || !onNext}
              aria-label={nextLabel}
              className="h-9 sm:h-10 px-4 sm:px-5 text-xs sm:text-sm font-semibold transition-all"
            >
              {nextLabel} <ChevronRight className="h-4 w-4 ml-1 sm:ml-1.5 stroke-[2]" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

