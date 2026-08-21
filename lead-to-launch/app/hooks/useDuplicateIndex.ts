import { useEffect, useState } from "react";

export type DuplicateMatch = {
  sessionId: string;
  niche: string;
  city: string;
  timestamp: string;
  leadName: string;
};

/** Map of normalized 10-digit phone → first match in another session */
export type DuplicateMap = Record<string, DuplicateMatch>;

/**
 * Fetches the phone index for all sessions except the current one,
 * and returns a lookup map: normalizedPhone → duplicate session info.
 *
 * Usage:
 *   const duplicates = useDuplicateIndex(currentSessionId);
 *   const match = duplicates[normalizePhone(lead.phone)];
 *   if (match) show ⚠️ badge
 */
export function useDuplicateIndex(currentSessionId: string | null | undefined): DuplicateMap {
  const [map, setMap] = useState<DuplicateMap>({});

  useEffect(() => {
    if (!currentSessionId) return;
    let cancelled = false;

    fetch(`/api/sessions/phone-index?exclude=${encodeURIComponent(currentSessionId)}`)
      .then((r) => r.json())
      .then(({ index }) => {
        if (cancelled || !Array.isArray(index)) return;
        const result: DuplicateMap = {};
        for (const entry of index) {
          // Keep only the first match per phone (oldest/first session)
          if (!result[entry.phone]) {
            result[entry.phone] = {
              sessionId: entry.sessionId,
              niche: entry.niche,
              city: entry.city,
              timestamp: entry.timestamp,
              leadName: entry.leadName,
            };
          }
        }
        setMap(result);
      })
      .catch(() => {}); // silently fail — duplicates are informational only

    return () => { cancelled = true; };
  }, [currentSessionId]);

  return map;
}

/** Normalize a raw phone to 10 digits for lookup */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("910") && digits.length === 12) return digits.slice(3);
  if (digits.startsWith("91") && digits.length === 12) return digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) return digits.slice(1);
  if (digits.length === 10) return digits;
  return digits;
}
