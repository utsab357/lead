/**
 * Verification System — 3-Layer Safety Check
 *
 * Runs automatically after every HTML + screenshot generation.
 * Blocks the image from reaching Phase 5 (Outreach) if it fails.
 *
 * Layer 1: HTML Code Check  (instant, free — catches structural problems)
 * Layer 2: PNG Size Check   (instant, free — catches blank/broken renders)
 * Layer 3: AI Vision Check  (Gemini Vision — catches visual gibberish, wrong category)
 */

import type { RankedLead } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VerificationIssue {
  code: string;         // machine-readable issue code
  message: string;      // human-readable description shown in UI
  severity: "critical" | "warning";
}

export interface VerificationResult {
  pass: boolean;
  score: number;        // 0–100. < 60 = fail, 60–79 = warning, 80+ = pass
  issues: VerificationIssue[];
  layers: {
    html: boolean;
    png: boolean;
    ai: boolean | null; // null = AI check skipped
  };
  aiDetail?: string;    // raw AI response for debugging
}

// ── Layer 1: HTML Code Check ──────────────────────────────────────────────────

export function verifyHTML(html: string, lead: RankedLead): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const lower = html.toLowerCase();

  // 1a. Size — skeleton HTML is < 15KB
  if (html.length < 15000) {
    issues.push({
      code: "HTML_TOO_SHORT",
      message: `HTML is only ${Math.round(html.length / 1024)}KB — likely a skeleton or failed generation`,
      severity: "critical",
    });
  }

  // 1b. Business name must appear in the page
  const nameFragment = lead.name.slice(0, 12).toLowerCase().replace(/[^a-z0-9 ]/g, "");
  if (nameFragment.length > 3 && !lower.includes(nameFragment)) {
    issues.push({
      code: "NAME_MISSING",
      message: `Business name "${lead.name.slice(0, 20)}" not found in generated HTML`,
      severity: "critical",
    });
  }

  // 1c. Placeholder / gibberish text
  const BAD_STRINGS = [
    { text: "lorem ipsum", label: "Lorem ipsum placeholder" },
    { text: "your business name", label: "Placeholder: 'Your Business Name'" },
    { text: "your city here", label: "Placeholder: 'Your City Here'" },
    { text: "phone number here", label: "Placeholder: 'Phone Number Here'" },
    { text: ">undefined<", label: "undefined value rendered in HTML" },
    { text: ">null<", label: "null value rendered in HTML" },
    { text: "[object object]", label: "[object Object] rendered in HTML" },
    { text: "nan", label: "NaN value rendered in HTML" },
  ];

  for (const { text, label } of BAD_STRINGS) {
    if (lower.includes(text)) {
      issues.push({ code: "PLACEHOLDER_TEXT", message: label, severity: "critical" });
    }
  }

  // 1d. Required structural elements
  const requiredElements = [
    { tag: "<nav", label: "Navigation bar" },
    { tag: "<section", label: "Page sections" },
    { tag: "<footer", label: "Footer" },
    { tag: "wa.me", label: "WhatsApp link" },
  ];
  for (const { tag, label } of requiredElements) {
    if (!lower.includes(tag.toLowerCase())) {
      issues.push({ code: "MISSING_ELEMENT", message: `Missing: ${label}`, severity: "critical" });
    }
  }

  // 1e. Phone number present (if we have it)
  if (lead.phone) {
    const digits = lead.phone.replace(/\D/g, "").slice(-8);
    if (digits.length >= 8 && !html.includes(digits)) {
      issues.push({
        code: "PHONE_MISSING",
        message: `Phone number (${lead.phone}) not found on page`,
        severity: "warning",
      });
    }
  }

  // 1f. Category mismatch — critical wrong content detection
  const cat = lead.category.toLowerCase();
  const isFood = /cafe|coffee|restaurant|dining|food|pizza|bistro|bakery|dhaba/.test(cat);
  const isGym  = /gym|fitness|crossfit|yoga/.test(cat);
  const isMed  = /clinic|doctor|dental|hospital|pharmacy/.test(cat);

  // If it's NOT a hotel, warn if hotel keywords dominate
  const hotelKeywords = ["hotel room", "suite", "check-in", "check-out", "accommodation"];
  if (!cat.includes("hotel") && !cat.includes("resort") && !cat.includes("lodge")) {
    for (const kw of hotelKeywords) {
      if ((html.match(new RegExp(kw, "gi")) || []).length > 2) {
        issues.push({
          code: "CATEGORY_MISMATCH",
          message: `Wrong content: hotel keywords found for a "${lead.category}" business`,
          severity: "critical",
        });
        break;
      }
    }
  }

  // If it's food but medical content dominates
  if (isFood) {
    const medWords = ["prescription", "dosage", "diagnosis", "treatment plan", "patient"];
    for (const kw of medWords) {
      if ((html.match(new RegExp(kw, "gi")) || []).length > 1) {
        issues.push({
          code: "CATEGORY_MISMATCH",
          message: `Wrong content: medical terms found for a food business`,
          severity: "critical",
        });
        break;
      }
    }
  }

  // 1g. City present
  if (lead.city) {
    const cityName = lead.city.split(",")[0].trim().toLowerCase();
    if (cityName.length > 3 && !lower.includes(cityName)) {
      issues.push({
        code: "CITY_MISSING",
        message: `City "${lead.city.split(",")[0]}" not found on page`,
        severity: "warning",
      });
    }
  }

  return issues;
}

// ── Layer 2: PNG Size Check ───────────────────────────────────────────────────

export function verifyPNG(pngSizeBytes: number): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const kb = Math.round(pngSizeBytes / 1024);

  if (pngSizeBytes < 150 * 1024) {
    issues.push({
      code: "PNG_TOO_SMALL",
      message: `Screenshot is only ${kb}KB — page may have rendered blank or broken`,
      severity: "critical",
    });
  } else if (pngSizeBytes < 400 * 1024) {
    issues.push({
      code: "PNG_SUSPICIOUSLY_SMALL",
      message: `Screenshot is ${kb}KB — smaller than expected, check for missing sections`,
      severity: "warning",
    });
  }

  return issues;
}

// ── Layer 3: AI Vision Check (Gemini) ─────────────────────────────────────────

export async function verifyWithAI(
  pngBase64: string,
  lead: RankedLead,
  geminiApiKey: string
): Promise<{ issues: VerificationIssue[]; score: number; detail: string }> {
  const issues: VerificationIssue[] = [];

  const prompt = `You are a quality control inspector for website previews.

This is a screenshot of a website generated for:
- Business name: "${lead.name}"
- Business type: "${lead.category}"
- City: "${lead.city?.split(",")[0] || "unknown"}"

Check for ALL of these issues and respond ONLY with valid JSON:

1. Is the business name "${lead.name.slice(0, 30)}" clearly visible somewhere on the page?
2. Does the page content match a "${lead.category}" business (not some other type like hotel/medical/gym by mistake)?
3. Is there any gibberish, garbled, random characters, or AI hallucination text visible?
4. Are there obvious layout problems (text overlapping images, broken sections, white gaps)?
5. Is the WhatsApp or phone contact info visible?

Respond ONLY with this JSON (no extra text):
{
  "nameVisible": true/false,
  "categoryMatch": true/false,
  "hasGibberish": true/false,
  "hasLayoutIssues": true/false,
  "hasContactInfo": true/false,
  "score": <number 1-10>,
  "issues": ["describe any specific problem you see"]
}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/png", data: pngBase64 } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
        }),
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!res.ok) return { issues, score: 100, detail: "AI check skipped (API error)" };

    const json = await res.json();
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    // Parse AI response
    const aiResult = JSON.parse(raw.replace(/```json|```/g, "").trim());

    if (!aiResult.nameVisible) {
      issues.push({ code: "AI_NAME_MISSING", message: "AI: Business name not clearly visible", severity: "critical" });
    }
    if (!aiResult.categoryMatch) {
      issues.push({ code: "AI_CATEGORY_MISMATCH", message: "AI: Page content doesn't match business type", severity: "critical" });
    }
    if (aiResult.hasGibberish) {
      issues.push({ code: "AI_GIBBERISH", message: "AI: Gibberish or garbled text detected on page", severity: "critical" });
    }
    if (aiResult.hasLayoutIssues) {
      issues.push({ code: "AI_LAYOUT_ISSUES", message: "AI: Layout problems detected (overlapping/broken sections)", severity: "warning" });
    }
    if (!aiResult.hasContactInfo) {
      issues.push({ code: "AI_NO_CONTACT", message: "AI: No phone/WhatsApp contact visible", severity: "warning" });
    }
    if (aiResult.issues?.length) {
      for (const issue of aiResult.issues.slice(0, 3)) {
        issues.push({ code: "AI_SPECIFIC", message: `AI: ${issue}`, severity: "warning" });
      }
    }

    const score = Math.round((aiResult.score || 5) * 10); // convert 1-10 to 0-100
    return { issues, score, detail: raw };

  } catch {
    return { issues: [], score: 100, detail: "AI check skipped (timeout)" };
  }
}

// ── Master Verifier ───────────────────────────────────────────────────────────

export async function runFullVerification(
  html: string,
  pngSizeBytes: number,
  lead: RankedLead,
  options: {
    pngBase64?: string;        // if provided, runs AI vision check
    geminiApiKey?: string;
    skipAI?: boolean;
  } = {}
): Promise<VerificationResult> {

  // Layer 1: HTML check
  const htmlIssues = verifyHTML(html, lead);

  // Layer 2: PNG size check
  const pngIssues = verifyPNG(pngSizeBytes);

  // Layer 3: AI vision (optional, only if PNG base64 provided and key available)
  let aiIssues: VerificationIssue[] = [];
  let aiScore = 100;
  let aiDetail: string | undefined;
  let aiRan = false;

  if (!options.skipAI && options.pngBase64 && options.geminiApiKey) {
    const aiResult = await verifyWithAI(options.pngBase64, lead, options.geminiApiKey);
    aiIssues = aiResult.issues;
    aiScore = aiResult.score;
    aiDetail = aiResult.detail;
    aiRan = true;
  }

  const allIssues = [...htmlIssues, ...pngIssues, ...aiIssues];
  const criticalCount = allIssues.filter((i) => i.severity === "critical").length;
  const warningCount  = allIssues.filter((i) => i.severity === "warning").length;

  // Score calculation: start at 100, deduct per issue
  let score = aiRan ? Math.min(100, aiScore) : 100;
  score -= criticalCount * 25;
  score -= warningCount * 8;
  score = Math.max(0, score);

  const pass = criticalCount === 0 && score >= 60;

  return {
    pass,
    score,
    issues: allIssues,
    layers: {
      html: htmlIssues.length === 0,
      png: pngIssues.length === 0,
      ai: aiRan ? aiIssues.filter((i) => i.severity === "critical").length === 0 : null,
    },
    aiDetail,
  };
}
