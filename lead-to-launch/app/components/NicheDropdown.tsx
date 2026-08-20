"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { SEARCH_EXPANSIONS } from "@/lib/searchExpansions";
import { ChevronDown, Search, X } from "lucide-react";

type NicheOption = {
  key: string;        // "gym"
  label: string;      // "Gym"
  alsoSearches: string; // "fitness center, health club, crossfit..."
  group: string;      // "Fitness"
};

const GROUPS: Record<string, string[]> = {
  "🏋️ Fitness":        ["gym", "yoga", "fitness"],
  "🍽️ Food & Hospitality": ["restaurant", "cafe", "hotel", "bar"],
  "💇 Beauty & Wellness": ["salon", "spa"],
  "🏥 Medical":         ["clinic", "dentist", "pharmacy", "eye"],
  "📚 Education":       ["coaching", "school", "computer classes"],
  "🛍️ Retail":          ["shop", "mobile shop", "clothing", "jewellery", "electronics", "furniture"],
  "🚗 Automotive":      ["garage", "car wash"],
  "👔 Professional":    ["lawyer", "ca", "photographer"],
  "🏠 Home Services":   ["plumber", "electrician", "pest"],
  "🏘️ Real Estate":     ["real estate"],
  "🐾 Pet":             ["pet"],
  "✈️ Travel":          ["travel"],
  "🎉 Events":          ["event"],
  "🖨️ Printing":        ["printing"],
};

function buildOptions(): NicheOption[] {
  const options: NicheOption[] = [];
  for (const [group, keys] of Object.entries(GROUPS)) {
    for (const key of keys) {
      const expansions = SEARCH_EXPANSIONS[key] || [key];
      options.push({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        alsoSearches: expansions.filter((e) => e.toLowerCase() !== key.toLowerCase()).join(", "),
        group,
      });
    }
  }
  return options;
}

const ALL_OPTIONS = buildOptions();

export function NicheDropdown({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = search.trim()
    ? ALL_OPTIONS.filter(
        (o) =>
          o.key.includes(search.toLowerCase()) ||
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.alsoSearches.toLowerCase().includes(search.toLowerCase())
      )
    : ALL_OPTIONS;

  // Group the filtered options
  const grouped = new Map<string, NicheOption[]>();
  for (const opt of filtered) {
    if (!grouped.has(opt.group)) grouped.set(opt.group, []);
    grouped.get(opt.group)!.push(opt);
  }

  function selectOption(opt: NicheOption) {
    onChange(opt.key);
    setOpen(false);
    setSearch("");
  }

  function handleCustomInput() {
    if (search.trim()) {
      onChange(search.trim());
      setOpen(false);
      setSearch("");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 100); }}
        className="flex items-center justify-between w-full h-10 px-3 text-base text-left bg-background border border-input rounded-md hover:bg-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={value ? "text-foreground capitalize" : "text-muted-foreground"}>
          {value || "Select business type..."}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-[calc(100%+4px)] left-0 w-full max-h-[350px] overflow-hidden rounded-lg border border-border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95 duration-100">
          {/* Search input */}
          <div className="flex items-center gap-2 p-2 border-b border-border bg-muted/30">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomInput();
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="Search or type custom niche..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Options list */}
          <div className="overflow-y-auto max-h-[290px] py-1">
            {/* Custom option if search doesn't match */}
            {search.trim() && filtered.length === 0 && (
              <button
                onClick={handleCustomInput}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
              >
                <span className="text-primary font-medium">+ Use &quot;{search}&quot;</span>
                <span className="text-muted-foreground ml-1">as custom niche</span>
              </button>
            )}

            {/* Show custom option at top even with results */}
            {search.trim() && filtered.length > 0 && !filtered.some(f => f.key === search.toLowerCase()) && (
              <button
                onClick={handleCustomInput}
                className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 border-b border-border/50 transition-colors"
              >
                <span className="text-primary">+ Use &quot;{search}&quot;</span> as custom niche
              </button>
            )}

            {Array.from(grouped.entries()).map(([group, opts]) => (
              <div key={group}>
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium sticky top-0 bg-popover">
                  {group}
                </div>
                {opts.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => selectOption(opt)}
                    className={`w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors ${value === opt.key ? "bg-primary/5 text-primary" : ""}`}
                  >
                    <div className="text-sm font-medium capitalize">{opt.label}</div>
                    {opt.alsoSearches && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                        Also finds: {opt.alsoSearches}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
