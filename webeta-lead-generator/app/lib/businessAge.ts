import type { BusinessReview } from "./types";

/** Parse a Google Maps "timeAgo" string to approximate months */
export function parseTimeAgoToMonths(timeAgo: string): number {
  const s = timeAgo.toLowerCase().trim();

  // "X years ago" / "a year ago"
  const years = s.match(/(\d+)\s*year/);
  if (years) return parseInt(years[1]) * 12;
  if (s.includes("a year") || s.includes("an year")) return 12;

  // "X months ago" / "a month ago"
  const months = s.match(/(\d+)\s*month/);
  if (months) return parseInt(months[1]);
  if (s.includes("a month")) return 1;

  // "X weeks ago" / "a week ago"
  const weeks = s.match(/(\d+)\s*week/);
  if (weeks) return Math.max(1, Math.round(parseInt(weeks[1]) / 4.3));
  if (s.includes("a week") || s.includes("last week")) return 1;

  // days or less
  return 0;
}

/** Returns estimated age in months from the oldest review, or null if no reviews */
export function estimateBusinessAgeMonths(reviews?: BusinessReview[]): number | null {
  if (!reviews || reviews.length === 0) return null;
  let max = 0;
  for (const r of reviews) {
    if (r.timeAgo) {
      const m = parseTimeAgoToMonths(r.timeAgo);
      if (m > max) max = m;
    }
  }
  return max > 0 ? max : null;
}

/** Returns display info for an age badge shown in Phase 4 */
export function getAgeBadge(months: number | null): {
  label: string;
  sublabel: string;
  color: string;
  bg: string;
  border: string;
} {
  const display =
    months === null ? ""
    : months < 12 ? `~${months}mo`
    : months === 12 ? "~1 yr"
    : `~${Math.round(months / 12)} yrs`;

  if (months === null) {
    return {
      label: "📅 Age unknown",
      sublabel: "No review data to estimate",
      color: "text-slate-500",
      bg: "bg-slate-50 dark:bg-slate-900/30",
      border: "border-slate-200 dark:border-slate-700",
    };
  }
  if (months < 3) {
    return {
      label: `📅 Just opened · ${display}`,
      sublabel: "Too early — check back in 3–6 months",
      color: "text-orange-700 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-900/20",
      border: "border-orange-200 dark:border-orange-800",
    };
  }
  if (months < 12) {
    return {
      label: `📅 New & growing · ${display}`,
      sublabel: "Open to pitch — push the growth angle",
      color: "text-blue-700 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/20",
      border: "border-blue-200 dark:border-blue-800",
    };
  }
  if (months < 48) {
    return {
      label: `📅 Sweet spot · ${display}`,
      sublabel: "Has revenue, wants to grow — best time to pitch",
      color: "text-green-700 dark:text-green-400",
      bg: "bg-green-50 dark:bg-green-900/20",
      border: "border-green-200 dark:border-green-800",
    };
  }
  if (months < 84) {
    return {
      label: `📅 Established · ${display}`,
      sublabel: "Needs a strong pitch — focus on competitor gap",
      color: "text-amber-700 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20",
      border: "border-amber-200 dark:border-amber-800",
    };
  }
  return {
    label: `📅 Old-school · ${display}`,
    sublabel: "Hard sell — owner likely resistant to change",
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
  };
}
