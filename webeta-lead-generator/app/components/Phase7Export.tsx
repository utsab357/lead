"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PhaseShell } from "./PhaseShell";
import {
  Download, FileSpreadsheet, MessageCircle, Globe2, Target,
  ChevronDown, ChevronUp, Copy, ExternalLink, StickyNote,
  Phone, PhoneOff, ThumbsUp, Presentation, Calendar, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import type { RankedLead, ConversionPoints, OutreachResult, BuildPromptResult, LeadStatus, ClientDetail } from "@/lib/types";
import { toast } from "sonner";
import { LeadHistoryDrawer } from "./LeadHistoryDrawer";
import type { LeadHistoryEntry } from "./LeadHistoryDrawer";

// ─── Status config ──────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string; icon: typeof Phone }> = {
  new:             { label: "New",            color: "text-sky-700 dark:text-sky-400",      bg: "bg-sky-50 border-sky-200 dark:bg-sky-900/30 dark:border-sky-700",         icon: AlertCircle },
  called:          { label: "Called",         color: "text-amber-700 dark:text-amber-400",  bg: "bg-amber-50 border-amber-200 dark:bg-amber-900/30 dark:border-amber-700", icon: Phone },
  interested:      { label: "Interested",     color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700", icon: ThumbsUp },
  demo_sent:       { label: "Demo Sent",      color: "text-purple-700 dark:text-purple-400",bg: "bg-purple-50 border-purple-200 dark:bg-purple-900/30 dark:border-purple-700", icon: Presentation },
  meeting_set:     { label: "Meeting Set",    color: "text-indigo-700 dark:text-indigo-400",bg: "bg-indigo-50 border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-700", icon: Calendar },
  completed:       { label: "Completed ✓",   color: "text-green-700 dark:text-green-400",  bg: "bg-green-100 border-green-300 dark:bg-green-900/40 dark:border-green-600",  icon: CheckCircle2 },
  not_interested:  { label: "Not Interested", color: "text-red-700 dark:text-red-400",      bg: "bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-700",           icon: XCircle },
  no_response:     { label: "No Response",    color: "text-slate-500 dark:text-slate-400",  bg: "bg-slate-50 border-slate-200 dark:bg-slate-800/40 dark:border-slate-600",   icon: PhoneOff },
};

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as LeadStatus[];

// ─── Props ───────────────────────────────────────────────────────────────────
export function Phase7Export({
  ranked,
  conversions = {},
  outreachResults = {},
  buildPrompts = {},
  leadStatuses = {},
  leadNotes = {},
  clientDetails = {},
  setLeadStatuses,
  setLeadNotes,
  setClientDetails,
  onGoToPhase,
  onPrev,
  sessionId,
}: {
  ranked: RankedLead[];
  conversions?: Record<string, ConversionPoints>;
  outreachResults?: Record<string, OutreachResult>;
  buildPrompts?: Record<string, BuildPromptResult>;
  leadStatuses?: Record<string, LeadStatus>;
  leadNotes?: Record<string, string>;
  clientDetails?: Record<string, ClientDetail>;
  setLeadStatuses?: (s: Record<string, LeadStatus>) => void;
  setLeadNotes?: (n: Record<string, string>) => void;
  setClientDetails?: (d: Record<string, ClientDetail>) => void;
  onGoToPhase?: (phase: number, leadId: string) => void;
  onPrev?: () => void;
  sessionId?: string | null;
}) {
  const [tab, setTab] = useState<"pipeline" | "export">("pipeline");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  // Lead quality filters
  const [fNoSite,  setFNoSite]  = useState(false);
  const [fPhone,   setFPhone]   = useState(false);
  const [fRating,  setFRating]  = useState<"" | "3.5" | "4.0" | "4.5">("" );
  const [fReviews, setFReviews] = useState<"" | "10" | "50" | "100">("" );

  // Cross-session duplicate index
  const [phoneIndex, setPhoneIndex] = useState<Map<string, { niche: string; city: string; timestamp: string; status?: string; notes?: string }>>(new Map());
  const [historyEntry, setHistoryEntry] = useState<LeadHistoryEntry | null>(null);
  // Client detail drawer
  const [detailDrawer, setDetailDrawer] = useState<{ open: boolean; leadId: string | null }>({ open: false, leadId: null });
  const [draftDetail, setDraftDetail] = useState<ClientDetail>({});

  function openDetailDrawer(leadId: string) {
    setDraftDetail(clientDetails[leadId] ?? {});
    setDetailDrawer({ open: true, leadId });
  }

  function saveDetailDrawer() {
    if (!detailDrawer.leadId) return;
    const next = { ...clientDetails, [detailDrawer.leadId]: draftDetail };
    setClientDetails?.(next);
    setDetailDrawer({ open: false, leadId: null });
    toast.success("Client details saved ✔");
  }

  function updateDraft(field: keyof ClientDetail, value: string) {
    setDraftDetail(prev => {
      const next = { ...prev, [field]: value };
      // Auto-calc balance due
      if (field === "priceAgreed" || field === "advanceReceived") {
        const price = parseFloat(field === "priceAgreed" ? value : prev.priceAgreed ?? "0") || 0;
        const adv   = parseFloat(field === "advanceReceived" ? value : prev.advanceReceived ?? "0") || 0;
        if (price > 0) next.balanceDue = String(price - adv);
      }
      return next;
    });
  }

  useEffect(() => {
    const excl = sessionId ? `?exclude=${sessionId}` : "";
    fetch(`/api/sessions/phone-index${excl}`)
      .then(r => r.json())
      .then(({ index = [] }) => {
        const map = new Map<string, { niche: string; city: string; timestamp: string; status?: string; notes?: string }>();
        for (const e of index) {
          if (e.phone) map.set(e.phone, { niche: e.niche, city: e.city, timestamp: e.timestamp, status: e.status, notes: e.notes });
        }
        setPhoneIndex(map);
      })
      .catch(() => {});
  }, [sessionId]);

  function normPhone(raw: string): string {
    const d = raw.replace(/\D/g, "");
    let n = d;
    if (n.startsWith("910") && n.length === 12) n = n.slice(3);
    else if (n.startsWith("91") && n.length === 12) n = n.slice(2);
    else if (n.startsWith("0") && n.length === 11) n = n.slice(1);
    return n.length === 10 ? n : "";
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  function setStatus(leadId: string, status: LeadStatus) {
    const next = { ...leadStatuses, [leadId]: status };
    setLeadStatuses?.(next);
  }

  function setNote(leadId: string, note: string) {
    const next = { ...leadNotes, [leadId]: note };
    setLeadNotes?.(next);
  }

  function copy(text: string, label = "Copied") {
    navigator.clipboard.writeText(text);
    toast.success(label);
  }

  function today() { return new Date().toISOString().split("T")[0]; }

  function toggleStatusFilter(s: LeadStatus) {
    setStatusFilter(prev => prev === s ? "all" : s);
  }

  // Smart search: if query is all digits (or starts with +), search phone; else search name
  function matchesSearch(l: (typeof ranked)[number]): boolean {
    if (!searchQuery) return true;
    const q = searchQuery.trim();
    const isPhoneQuery = /^[\d\s+\-()]+$/.test(q) && q.replace(/\D/g, "").length >= 2;
    if (isPhoneQuery) {
      const digits = q.replace(/\D/g, "");
      const rawPhone = (l.phone ?? l.whatsapp ?? "").replace(/\D/g, "");
      const normPhone = rawPhone.startsWith("91") && rawPhone.length === 12 ? rawPhone.slice(2) : rawPhone;
      return normPhone.includes(digits) || rawPhone.includes(digits);
    }
    return l.name.toLowerCase().includes(q.toLowerCase());
  }

  // Leads visible in pipeline after search + status filter + quality filters
  const filteredRanked = ranked.filter(l => {
    if (!matchesSearch(l)) return false;
    if (statusFilter !== "all" && (leadStatuses[l.id] ?? "new") !== statusFilter) return false;
    if (fNoSite  && l.website)                               return false;
    if (fPhone   && !l.phone)                                return false;
    if (fRating  && (l.rating        ?? 0) < parseFloat(fRating))  return false;
    if (fReviews && (l.reviewsCount  ?? 0) < parseInt(fReviews))   return false;
    return true;
  });
  const anyQualityFilter = fNoSite || fPhone || !!fRating || !!fReviews;

  function trigger(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Export functions ───────────────────────────────────────────────────────
  function downloadCSV() {
    const exportList = statusFilter !== "all"
      ? ranked.filter(l => (leadStatuses[l.id] ?? "new") === statusFilter)
      : ranked;
    if (!exportList.length) { toast.error("No leads to export"); return; }
    const headers = [
      "Rank","Name","Category","Address","City","Phone","WhatsApp","Website",
      "Maps Link","Rating","Reviews","Score","Has Website","Status","Notes",
      "Biggest Gap","Est. Lost ₹/mo","Conv. Points","Outreach Drafted","Site Prompt Ready",
    ];
    const rows = exportList.map((lead, i) => {
      const conv = conversions[lead.id];
      const status = leadStatuses[lead.id] ?? "new";
      return [
        String(i + 1), lead.name, lead.category, lead.address, lead.city,
        lead.phone || "", lead.whatsapp || lead.phone || "", lead.website || "",
        lead.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name+" "+lead.city)}`,
        String(lead.rating || ""), String(lead.reviewsCount || ""), String(lead.score),
        lead.website ? "Yes" : "No",
        STATUS_CONFIG[status]?.label ?? status,
        leadNotes[lead.id] || "",
        lead.audit?.biggestGap || "", lead.audit?.estLostRevenuePerMonth || "",
        conv ? conv.points.join("; ") : "",
        outreachResults[lead.id] ? "Yes" : "No",
        buildPrompts[lead.id] ? "Yes" : "No",
      ];
    });
    const csv = [headers, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(","))
      .join("\n");
    trigger(csv, `leads-${today()}.csv`, "text/csv;charset=utf-8;");
    toast.success(`Exported ${exportList.length} leads to CSV`);
  }

  function downloadClientRecords() {
    const completed = ranked.filter(l => (leadStatuses[l.id] ?? "new") === "completed");
    if (!completed.length) { toast.error("No completed leads yet — mark leads as 'Completed ✓' first."); return; }
    const city = (ranked[0]?.city ?? "leads").replace(/\s+/g, "-").toLowerCase();
    const cat  = (ranked[0]?.category ?? "clients").replace(/\s+/g, "-").toLowerCase();
    const filename = `${city}-${cat}-clients-${today()}.csv`;
    const headers = [
      "Business Name", "Owner Phone", "WhatsApp", "Google Maps Link",
      "City", "Business Category", "Your Notes",
      "Client Name", "Price Agreed (Rs)", "Advance Received (Rs)", "Balance Due (Rs)",
      "Domain Name", "Website Live URL",
      "Free Hosting Start Date", "Free Hosting End Date",
      "Paid Hosting Start Date", "Paid Hosting End Date",
      "Remarks",
    ];
    // Helper: force Excel to show phone as text (prevents 9.2E+11 scientific notation)
    const asText = (v: string) => v ? `="${v}"` : "";
    const rows = completed.map(lead => [
      lead.name,
      asText(lead.phone ?? ""),
      asText(lead.whatsapp ?? lead.phone ?? ""),
      lead.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + " " + lead.city)}`,
      lead.city,
      lead.category,
      leadNotes[lead.id] ?? "",
      clientDetails[lead.id]?.clientName ?? "",
      clientDetails[lead.id]?.priceAgreed ?? "",
      clientDetails[lead.id]?.advanceReceived ?? "",
      clientDetails[lead.id]?.balanceDue ?? "",
      clientDetails[lead.id]?.domainName ?? "",
      clientDetails[lead.id]?.websiteUrl ?? "",
      clientDetails[lead.id]?.freeHostingStart ?? "",
      clientDetails[lead.id]?.freeHostingEnd ?? "",
      clientDetails[lead.id]?.paidHostingStart ?? "",
      clientDetails[lead.id]?.paidHostingEnd ?? "",
      clientDetails[lead.id]?.remarks ?? "",
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map((c, i) => {
        // Phone columns (index 1,2) already formatted; Maps link (index 3) keep raw; rest quote-wrap
        if (i === 1 || i === 2) return c; // already ="..." or ""
        return `"${String(c).replace(/"/g, '""')}"`;
      }).join(","))
      .join("\n");
    // BOM ensures Excel opens UTF-8 correctly (no garbled Hindi/special chars)
    trigger("\uFEFF" + csv, filename, "text/csv;charset=utf-8;");
    toast.success(`Exported ${completed.length} client record${completed.length > 1 ? "s" : ""} \u2192 ${filename}`);
  }

  function downloadClientHTML() {
    const completed = ranked.filter(l => (leadStatuses[l.id] ?? "new") === "completed");
    if (!completed.length) { toast.error("No completed leads yet \u2014 mark as 'Completed \u2713' first."); return; }
    const city = ranked[0]?.city ?? "";
    const cat  = ranked[0]?.category ?? "";
    const filename = `${city}-${cat}-clients-${today()}.html`.toLowerCase().replace(/\s+/g, "-");
    const esc = (s: string) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

    const cards = completed.map((lead, i) => {
      const note = leadNotes[lead.id] ?? "";
      const waNum = (lead.whatsapp ?? lead.phone ?? "").replace(/\D/g, "");
      const d = clientDetails[lead.id] ?? {};
      const dealFields: { label: string; value: string }[] = [
        { label: "Client Name",           value: d.clientName       ?? "" },
        { label: "Price Agreed (Rs)",     value: d.priceAgreed      ?? "" },
        { label: "Advance Received (Rs)", value: d.advanceReceived  ?? "" },
        { label: "Balance Due (Rs)",      value: d.balanceDue       ?? "" },
        { label: "Domain Name",           value: d.domainName       ?? "" },
        { label: "Website Live URL",      value: d.websiteUrl       ?? "" },
        { label: "Free Hosting Start",    value: d.freeHostingStart ?? "" },
        { label: "Free Hosting End",      value: d.freeHostingEnd   ?? "" },
        { label: "Paid Hosting Start",    value: d.paidHostingStart ?? "" },
        { label: "Paid Hosting End",      value: d.paidHostingEnd   ?? "" },
        { label: "Remarks",               value: d.remarks          ?? "" },
      ];
      const hasDealData = dealFields.some(f => f.value);
      const fillRows = dealFields.map(f =>
        f.value
          ? `<div class="fill-item"><span class="fill-label">${esc(f.label)}</span><span class="fill-value">${esc(f.value)}</span></div>`
          : `<div class="fill-item"><span class="fill-label">${esc(f.label)}</span><span class="fill-blank"></span></div>`
      ).join("");
      return `
<div class="card">
  <div class="card-header">
    <span class="num">${i + 1}</span>
    <span class="name">\ud83c\udfe2 ${esc(lead.name)}</span>
    <span class="badge">\u2705 Completed</span>
  </div>
  <div class="card-body">
    <div class="info-grid">
      <div class="info-row"><span class="label">\ud83d\udcde Phone</span><span class="val"><a href="tel:${esc(lead.phone ?? "")}">${esc(lead.phone ?? "\u2014")}</a></span></div>
      <div class="info-row"><span class="label">\ud83d\udcac WhatsApp</span><span class="val">${waNum ? `<a href="https://wa.me/${waNum}" target="_blank">${esc(lead.whatsapp ?? lead.phone ?? "")}</a>` : "\u2014"}</span></div>
      <div class="info-row"><span class="label">\ud83d\udccd Maps</span><span class="val">${lead.mapUrl ? `<a href="${esc(lead.mapUrl)}" target="_blank">Open in Google Maps \u2197</a>` : "\u2014"}</span></div>
      <div class="info-row"><span class="label">\ud83c\udfd9\ufe0f City</span><span class="val">${esc(lead.city)}</span></div>
      <div class="info-row"><span class="label">\ud83c\udff7\ufe0f Category</span><span class="val">${esc(lead.category)}</span></div>
      <div class="info-row"><span class="label">\u2b50 Rating</span><span class="val">${lead.rating ?? "\u2014"} <span class="muted">(${lead.reviewsCount ?? 0} reviews)</span></span></div>
      ${note ? `<div class="info-row note-row"><span class="label">\ud83d\udcdd Note</span><span class="val note-val">${esc(note)}</span></div>` : ""}
    </div>
    <div class="fill-section${hasDealData ? " fill-section--filled" : ""}">
      <div class="fill-title">${hasDealData ? "\u270f\ufe0f Deal Details \u2714\ufe0f" : "\u270f\ufe0f Fill after deal"}</div>
      <div class="fill-grid">${fillRows}</div>
    </div>
  </div>
</div>`;
    }).join("\n");

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Client Records \u2014 ${esc(city)} ${esc(cat)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Segoe UI',sans-serif;background:#f0fdf4;color:#1a2e1a;padding:24px 16px 60px;max-width:760px;margin:0 auto}
a{color:#16a34a;text-decoration:none}a:hover{text-decoration:underline}
.page-header{background:linear-gradient(135deg,#14532d,#166534);color:#fff;border-radius:14px;padding:24px 28px;margin-bottom:28px}
.page-header h1{font-size:20px;font-weight:700;margin-bottom:4px}
.page-header .meta{font-size:12px;opacity:.8}
.card{background:#fff;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:20px;overflow:hidden;box-shadow:0 1px 4px #00000010}
.card-header{display:flex;align-items:center;gap:10px;padding:14px 18px;background:#f0fdf4;border-bottom:1px solid #bbf7d0}
.num{font-size:11px;color:#16a34a;font-weight:700;background:#dcfce7;border:1px solid #86efac;border-radius:99px;padding:1px 7px}
.name{font-weight:700;font-size:16px;flex:1}
.badge{font-size:11px;font-weight:600;background:#dcfce7;color:#15803d;border:1px solid #86efac;padding:2px 9px;border-radius:99px}
.card-body{padding:16px 18px;display:grid;gap:16px}
.info-grid{display:grid;gap:0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
.info-row{display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid #f1f5f9;gap:12px}
.info-row:last-child{border-bottom:none}
.note-row{background:#fffbeb;border-color:#fde68a}
.label{font-size:12px;color:#64748b;font-weight:500;min-width:110px}
.val{font-size:13px;color:#1e293b;font-weight:500}
.note-val{color:#92400e;font-style:italic}
.muted{font-weight:400;color:#94a3b8}
.fill-section{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px}
.fill-section--filled{background:#f0fdf4;border-color:#bbf7d0}
.fill-title{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:600;margin-bottom:10px}
.fill-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fill-item{display:flex;flex-direction:column;gap:3px}
.fill-label{font-size:11px;color:#64748b;font-weight:500}
.fill-blank{border-bottom:1.5px solid #cbd5e1;min-height:20px}
.fill-value{font-size:13px;color:#15803d;font-weight:600;padding:2px 0;border-bottom:1.5px solid #86efac}
@media(max-width:500px){.fill-grid{grid-template-columns:1fr}}
@media print{body{background:#fff}.page-header{background:#14532d!important;-webkit-print-color-adjust:exact}}
</style></head><body>
<div class="page-header">
  <h1>\ud83d\udccb Client Records \u2014 ${esc(city)}, ${esc(cat)}</h1>
  <div class="meta">Generated: ${today()} &nbsp;&bull;&nbsp; Total Clients: ${completed.length}</div>
</div>
${cards}
</body></html>`;

    trigger("\uFEFF" + html, filename, "text/html;charset=utf-8;");
    toast.success(`Client summary downloaded \u2192 open the .html file in Chrome`);
  }

  function openGoogleSheets() {
    const completed = ranked.filter(l => (leadStatuses[l.id] ?? "new") === "completed");
    if (!completed.length) { toast.error("No completed leads yet"); return; }
    const headers = ["Business Name","Owner Phone","WhatsApp","Google Maps Link","City","Business Category","Your Notes","Client Name","Price Agreed (Rs)","Advance Received (Rs)","Balance Due (Rs)","Domain Name","Website Live URL","Free Hosting Start","Free Hosting End","Paid Hosting Start","Paid Hosting End","Remarks"];
    const rows = completed.map(lead => [
      lead.name, lead.phone ?? "", lead.whatsapp ?? lead.phone ?? "",
      lead.mapUrl ?? "", lead.city, lead.category, leadNotes[lead.id] ?? "",
      clientDetails[lead.id]?.clientName ?? "",
      clientDetails[lead.id]?.priceAgreed ?? "",
      clientDetails[lead.id]?.advanceReceived ?? "",
      clientDetails[lead.id]?.balanceDue ?? "",
      clientDetails[lead.id]?.domainName ?? "",
      clientDetails[lead.id]?.websiteUrl ?? "",
      clientDetails[lead.id]?.freeHostingStart ?? "",
      clientDetails[lead.id]?.freeHostingEnd ?? "",
      clientDetails[lead.id]?.paidHostingStart ?? "",
      clientDetails[lead.id]?.paidHostingEnd ?? "",
      clientDetails[lead.id]?.remarks ?? "",
    ]);
    const tsv = [headers, ...rows].map(r => r.join("\t")).join("\n");
    navigator.clipboard.writeText(tsv)
      .then(() => {
        toast.success("✅ Data copied! Opening Google Sheets in 2 sec — click cell A1 then press Ctrl+V to paste.", { duration: 6000 });
        setTimeout(() => window.open("https://sheets.new", "_blank"), 2000);
      })
      .catch(() => {
        downloadClientRecords();
        toast.info("Clipboard blocked — CSV downloaded instead. In Google Sheets: File \u2192 Import \u2192 Upload that file.");
      });
  }

  function downloadFullJSON() {
    if (!ranked.length) { toast.error("No leads to export"); return; }
    const data = {
      exportedAt: new Date().toISOString(),
      totalLeads: ranked.length,
      leads: ranked.map(lead => ({
        ...lead,
        status: leadStatuses[lead.id] ?? "new",
        notes: leadNotes[lead.id] ?? "",
        conversionPoints: conversions[lead.id] ?? null,
        outreach: outreachResults[lead.id] ?? null,
        buildPrompt: buildPrompts[lead.id] ?? null,
      })),
    };
    trigger(JSON.stringify(data, null, 2), `leads-full-${today()}.json`, "application/json");
    toast.success(`Exported ${ranked.length} leads with all data`);
  }

  function downloadOutreachTXT() {
    const entries = Object.entries(outreachResults);
    if (!entries.length) { toast.error("No outreach drafts to export"); return; }
    const lines: string[] = [];
    for (const [id, r] of entries) {
      const lead = ranked.find(l => l.id === id);
      lines.push("========================================", `Business: ${lead?.name ?? id}`,
        `Phone: ${lead?.phone ?? "n/a"} | WhatsApp: ${lead?.whatsapp ?? "n/a"}`,
        "----------------------------------------", "FIRST MESSAGE:", r.first, "",
        "DAY-3 FOLLOW-UP:", r.followUp, `Best send time: ${r.bestSendTime}`, "");
    }
    trigger(lines.join("\n"), `outreach-${today()}.txt`, "text/plain;charset=utf-8;");
    toast.success(`Exported ${entries.length} outreach drafts`);
  }

  function copyForGoogleSheets() {
    const completed = ranked.filter(l => (leadStatuses[l.id] ?? "new") === "completed");
    if (!completed.length) { toast.error("No completed leads yet"); return; }
    const headers = ["Business Name","Owner Phone","WhatsApp","Google Maps Link","City","Business Category","Your Notes","Client Name","Price Agreed (Rs)","Advance Received (Rs)","Balance Due (Rs)","Domain Name","Website Live URL","Free Hosting Start","Free Hosting End","Paid Hosting Start","Paid Hosting End","Remarks"];
    const rows = completed.map(lead => [
      lead.name, lead.phone ?? "", lead.whatsapp ?? lead.phone ?? "",
      lead.mapUrl ?? "", lead.city, lead.category, leadNotes[lead.id] ?? "",
      "","","","","","","","","","","",
    ]);
    const tsv = [headers, ...rows].map(r => r.join("\t")).join("\n");
    navigator.clipboard.writeText(tsv).then(() => {
      toast.success("Copied! Open Google Sheets → click cell A1 → paste (Ctrl+V)");
    }).catch(() => toast.error("Clipboard access denied"));
  }

  function downloadHTMLReport() {
    const leadsWithData = ranked.filter(l => conversions[l.id] || outreachResults[l.id] || buildPrompts[l.id]);
    if (!leadsWithData.length) { toast.error("No data to export — generate conversion points or outreach first"); return; }
    const city = (ranked[0]?.city ?? "");
    const cat  = (ranked[0]?.category ?? "");
    const filename = `${city}-${cat}-report-${today()}.html`.toLowerCase().replace(/\s+/g, "-");

    const statusColors: Record<string, string> = {
      new:"#3b82f6", called:"#f59e0b", interested:"#10b981",
      demo_sent:"#8b5cf6", meeting_set:"#6366f1", completed:"#22c55e",
      not_interested:"#ef4444", no_response:"#64748b"
    };
    const statusLabel: Record<string, string> = {
      new:"New", called:"Called", interested:"Interested",
      demo_sent:"Demo Sent", meeting_set:"Meeting Set", completed:"Completed ✓",
      not_interested:"Not Interested", no_response:"No Response"
    };

    const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const pre = (s: string) => `<pre>${esc(s)}</pre>`;

    const sections = leadsWithData.map((lead, i) => {
      const conv    = conversions[lead.id];
      const outreach = outreachResults[lead.id];
      const prompt  = buildPrompts[lead.id];
      const note    = leadNotes[lead.id];
      const status  = leadStatuses[lead.id] ?? "new";
      const sc      = statusColors[status] ?? "#64748b";
      const sl      = statusLabel[status] ?? status;
      const waNum   = (lead.whatsapp ?? lead.phone ?? "").replace(/\D/g, "");

      return `
<details id="l${i}" open>
<summary>
  <span class="lead-num">#${i+1}</span>
  <span class="lead-name">${esc(lead.name)}</span>
  <span class="status-pill" style="background:${sc}18;color:${sc};border-color:${sc}40">${sl}</span>
  <span class="lead-meta">${esc(lead.category)} &bull; ${esc(lead.city ?? "")} &bull; ⭐ ${lead.rating ?? "—"} (${lead.reviewsCount ?? 0})</span>
  <span class="chevron">&#9660;</span>
</summary>
<div class="contact-row">
  ${lead.phone ? `<a class="btn-phone" href="tel:${esc(lead.phone)}">📞 ${esc(lead.phone)}</a>` : ""}
  ${waNum ? `<a class="btn-wa" href="https://wa.me/${waNum}" target="_blank">💬 WhatsApp</a>` : ""}
  ${lead.mapUrl ? `<a class="btn-maps" href="${esc(lead.mapUrl)}" target="_blank">📍 Google Maps</a>` : ""}
  ${note ? `<span class="note-inline">📝 ${esc(note)}</span>` : ""}
</div>
<div class="lead-body">
${ conv ? `
<div class="section conv-section">
  <div class="sh">🎯 Conversion Points</div>
  <div class="sb">
    <ul>${conv.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
    ${conv.competitorInsight ? `<div class="insight">💡 ${esc(conv.competitorInsight)}</div>` : ""}
    ${conv.revenueArgument ? `<div class="revenue">💰 ${esc(conv.revenueArgument)}</div>` : ""}
    ${conv.urgencyHook ? `<div class="urgency">⚡ ${esc(conv.urgencyHook)}</div>` : ""}
  </div>
</div>
${ conv.callScript ? `
<div class="section script-section">
  <div class="sh">📞 Call Script</div>
  <div class="sb">
    <div class="msg-label">Opening</div><div class="msg-box">${esc(conv.callScript.opener)}</div>
    ${conv.callScript.iceBreaker ? `<div class="msg-label" style="margin-top:10px">Ice Breaker</div><div class="msg-box">${esc(conv.callScript.iceBreaker)}</div>` : ""}
    <div class="msg-label" style="margin-top:10px">Key Points</div>
    <ul>${conv.callScript.keyPoints.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
    <div class="msg-label" style="margin-top:10px">Objection Handler</div><div class="msg-box">${esc(conv.callScript.objectionHandler)}</div>
    <div class="msg-label" style="margin-top:10px">Closing Line</div><div class="msg-box closer">${esc(conv.callScript.closer)}</div>
    ${conv.callScript.doNotSay ? `<div class="do-not">⛔ Do NOT say: ${esc(conv.callScript.doNotSay)}</div>` : ""}
  </div>
</div>` : ""}
${ conv.postCallWhatsApp ? `
<div class="section wa-section">
  <div class="sh">💬 Post-Call WhatsApp</div>
  <div class="sb">${pre(conv.postCallWhatsApp)}${conv.bestTimeToCall ? `<div class="time-badge">🕐 Best time: ${esc(conv.bestTimeToCall)}</div>` : ""}</div>
</div>` : ""}` : ""}

${ outreach ? `
<div class="section outreach-section">
  <div class="sh">📱 Outreach Messages</div>
  <div class="sb">
    <div class="msg-label">First Message</div><div class="msg-box">${pre(outreach.first)}</div>
    <div class="msg-label" style="margin-top:14px">Day-3 Follow-Up</div><div class="msg-box">${pre(outreach.followUp)}</div>
    <div class="time-badge">🕐 Best send time: ${esc(outreach.bestSendTime)}</div>
  </div>
</div>` : ""}

${ prompt ? `
<div class="section prompt-section">
  <div class="sh">🌐 Website Build Brief</div>
  <div class="sb">
    ${pre(prompt.prompt)}
    ${prompt.pitchPoints?.length ? `<div class="msg-label" style="margin-top:10px">Pitch Points</div><ul>${prompt.pitchPoints.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
  </div>
</div>` : ""}
</div>
</details>`;
    }).join("\n");

    const toc = leadsWithData.map((l, i) => `<a href="#l${i}">${esc(l.name)}</a>`).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Webeta Report — ${esc(city)} ${esc(cat)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Segoe UI',sans-serif;background:#09090f;color:#e2e8f0;line-height:1.65;padding:0 12px 80px}
a{color:inherit;text-decoration:none}
ul{padding-left:18px}li{padding:3px 0;font-size:13.5px}
pre{white-space:pre-wrap;font-family:-apple-system,'Segoe UI',sans-serif;font-size:13px;line-height:1.75}
.site-header{background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);padding:28px 24px;margin:0 -12px 28px;border-bottom:1px solid #1e3a5f}
.site-header h1{font-size:20px;font-weight:700;color:#fff;display:flex;align-items:center;gap:8px}
.site-header .meta{font-size:12px;color:#94a3b8;margin-top:6px}
.toc{background:#13131a;border:1px solid #1e1e2e;border-radius:10px;padding:12px 16px;margin-bottom:20px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.toc-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-right:6px;white-space:nowrap}
.toc a{font-size:11px;color:#818cf8;background:#6366f110;border:1px solid #6366f128;padding:3px 10px;border-radius:99px;white-space:nowrap}
.toc a:hover{background:#6366f122}
details{background:#13131a;border:1px solid #1e1e2e;border-radius:12px;margin-bottom:14px;overflow:hidden}
summary{padding:14px 18px;cursor:pointer;display:flex;align-items:center;gap:10px;list-style:none;background:#161621;border-bottom:1px solid #1e1e2e;flex-wrap:wrap}
summary::-webkit-details-marker{display:none}
.lead-num{font-size:11px;color:#64748b;min-width:24px}
.lead-name{font-weight:700;font-size:15px;flex:1;min-width:160px}
.status-pill{font-size:10px;font-weight:600;padding:2px 9px;border-radius:99px;border:1px solid;white-space:nowrap}
.lead-meta{font-size:11px;color:#64748b;flex:1}
.chevron{color:#64748b;font-size:11px;margin-left:auto}
details:not([open]) .chevron{transform:rotate(-90deg)}
.contact-row{display:flex;flex-wrap:wrap;gap:7px;padding:10px 18px;background:#0f1019;border-bottom:1px solid #1e1e2e}
.contact-row a,.contact-row span{font-size:12px;padding:5px 12px;border-radius:8px;border:1px solid;font-weight:500;display:inline-flex;align-items:center;gap:4px}
.btn-phone{background:#10b98110;border-color:#10b98130;color:#10b981}
.btn-wa{background:#22c55e10;border-color:#22c55e30;color:#22c55e}
.btn-maps{background:#3b82f610;border-color:#3b82f630;color:#60a5fa}
.note-inline{background:#1e1e2e;border-color:#2a2a3e;color:#94a3b8;font-style:italic}
.lead-body{padding:16px;display:grid;gap:12px}
.section{border-radius:8px;overflow:hidden;border:1px solid}
.sh{padding:7px 14px;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:700}
.sb{padding:14px;display:grid;gap:8px}
.conv-section{border-color:#f59e0b30}.conv-section .sh{background:#f59e0b0e;color:#fbbf24}
.script-section{border-color:#6366f130}.script-section .sh{background:#6366f10e;color:#a5b4fc}
.wa-section{border-color:#22c55e30}.wa-section .sh{background:#22c55e0e;color:#4ade80}
.outreach-section{border-color:#38bdf830}.outreach-section .sh{background:#0ea5e90e;color:#38bdf8}
.prompt-section{border-color:#8b5cf630}.prompt-section .sh{background:#8b5cf60e;color:#c4b5fd}
.msg-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:600}
.msg-box{background:#0a0a0f;border:1px solid #1e1e2e;border-radius:6px;padding:11px 13px;font-size:13px;line-height:1.75}
.closer{border-color:#22c55e30;background:#22c55e0a}
.do-not{background:#ef44440a;border:1px solid #ef444430;color:#f87171;padding:8px 12px;border-radius:6px;font-size:12px}
.insight{background:#0ea5e90a;border:1px solid #0ea5e930;color:#7dd3fc;padding:8px 12px;border-radius:6px;font-size:13px}
.revenue{background:#22c55e0a;border:1px solid #22c55e30;color:#4ade80;padding:8px 12px;border-radius:6px;font-size:13px}
.urgency{background:#ef44440a;border:1px solid #ef444428;color:#fca5a5;padding:8px 12px;border-radius:6px;font-size:13px;font-weight:500}
.time-badge{font-size:11px;color:#64748b;padding:4px 0}
@media print{body{background:#fff;color:#000}.site-header{background:#1e293b;color:#fff}}
</style>
</head>
<body>
<header class="site-header">
  <h1>📋 Webeta Lead Report</h1>
  <div class="meta">${esc(city)} &bull; ${esc(cat)} &bull; Generated ${today()} &bull; ${leadsWithData.length} leads</div>
</header>
<nav class="toc">
  <span class="toc-label">Jump to:</span>
  ${toc}
</nav>
${sections}
</body>
</html>`;

    trigger("\uFEFF" + html, filename, "text/html;charset=utf-8;");
    toast.success(`Report downloaded — open the .html file in Chrome or Edge`);
  }

  function downloadPromptsTXT() {
    const entries = Object.entries(buildPrompts);
    if (!entries.length) { toast.error("No site prompts to export"); return; }
    const lines: string[] = [];
    for (const [id, r] of entries) {
      const lead = ranked.find(l => l.id === id);
      lines.push("========================================", `Business: ${lead?.name ?? id}`,
        `Category: ${lead?.category ?? "n/a"} | City: ${lead?.city ?? "n/a"}`,
        "----------------------------------------", r.prompt, "");
    }
    trigger(lines.join("\n"), `site-prompts-${today()}.txt`, "text/plain;charset=utf-8;");
    toast.success(`Exported ${entries.length} site prompts`);
  }

  const convCount     = Object.keys(conversions).length;
  const outreachCount = Object.keys(outreachResults).length;
  const buildCount    = Object.keys(buildPrompts).length;

  // ── status summary counts ──────────────────────────────────────────────────
  const closedCount    = ranked.filter(l => leadStatuses[l.id] === "completed").length;
  const interestedCount= ranked.filter(l => leadStatuses[l.id] === "interested").length;
  const calledCount    = ranked.filter(l => leadStatuses[l.id] === "called" || leadStatuses[l.id] === "demo_sent" || leadStatuses[l.id] === "meeting_set").length;

  return (
    <>
    <PhaseShell
      title="Phase 7 — Deal Pipeline & CRM"
      subtitle="Track client deals, manage pipeline stages, view complete campaign intelligence, and export client records."
      onPrev={onPrev}
      nextDisabled
      nextLabel="Done"
    >
      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 bg-muted/40 rounded-lg p-1 w-fit">
        {(["pipeline", "export"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              tab === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "pipeline" ? "📋 Pipeline View" : "📥 Export"}
          </button>
        ))}
      </div>

      {/* ── PIPELINE TAB ─────────────────────────────────────────────────────── */}
      {tab === "pipeline" && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Stat label="Total Leads"  value={ranked.length} />
            <Stat label="Called / Demo" value={calledCount} />
            <Stat label="Interested"   value={interestedCount} />
            <Stat label="Closed"       value={closedCount} accent />
          </div>

          {ranked.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No ranked leads yet — complete Phases 1–3 first.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Search bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or phone number..."
                    className="w-full h-9 pl-8 pr-8 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                  />
                  {/* Switch icon to phone when typing digits */}
                  {searchQuery && /^[\d\s+\-()]+$/.test(searchQuery) && searchQuery.replace(/\D/g, "").length >= 2
                    ? <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-primary/70 pointer-events-none" />
                    : <svg className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  }
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded">
                      ✕
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <span className="text-xs text-muted-foreground">
                    {filteredRanked.length} of {ranked.length}
                  </span>
                )}
              </div>

              {/* Status filter bar — single dropdown */}
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "all")}
                  className="h-8 px-2 pr-7 text-xs rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
                >
                  <option value="all">All ({ranked.length})</option>
                  {ALL_STATUSES.map(s => {
                    const count = ranked.filter(l => (leadStatuses[l.id] ?? "new") === s).length;
                    if (count === 0) return null;
                    return (
                      <option key={s} value={s}>
                        {STATUS_CONFIG[s].label} ({count})
                      </option>
                    );
                  })}
                </select>
                {/* Count chips for quick overview */}
                <div className="flex flex-wrap gap-1 ml-1">
                  {ALL_STATUSES.map(s => {
                    const cfg = STATUS_CONFIG[s];
                    const count = ranked.filter(l => (leadStatuses[l.id] ?? "new") === s).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={s}
                        onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded border transition-all ${
                          statusFilter === s ? `${cfg.bg} ${cfg.color}` : "bg-background border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {cfg.label} {count}
                      </button>
                    );
                  })}
                </div>
                {statusFilter !== "all" && (
                  <button
                    onClick={() => setStatusFilter("all")}
                    className="text-[11px] text-muted-foreground underline hover:text-foreground ml-auto"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Lead quality filter bar */}
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mr-1">Lead:</span>

                <button
                  id="p7-filter-nosite"
                  onClick={() => setFNoSite(v => !v)}
                  className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                    fNoSite ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-background border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  No website
                </button>

                <button
                  id="p7-filter-phone"
                  onClick={() => setFPhone(v => !v)}
                  className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                    fPhone ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  Has phone
                </button>

                <select
                  id="p7-filter-rating"
                  value={fRating}
                  onChange={e => setFRating(e.target.value as typeof fRating)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-background text-muted-foreground hover:border-primary/40 focus:outline-none cursor-pointer"
                >
                  <option value="">Any rating</option>
                  <option value="3.5">★ 3.5+</option>
                  <option value="4.0">★ 4.0+</option>
                  <option value="4.5">★ 4.5+</option>
                </select>

                <select
                  id="p7-filter-reviews"
                  value={fReviews}
                  onChange={e => setFReviews(e.target.value as typeof fReviews)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-background text-muted-foreground hover:border-primary/40 focus:outline-none cursor-pointer"
                >
                  <option value="">Any reviews</option>
                  <option value="10">10+ reviews</option>
                  <option value="50">50+ reviews</option>
                  <option value="100">100+ reviews</option>
                </select>

                {anyQualityFilter && (
                  <button
                    onClick={() => { setFNoSite(false); setFPhone(false); setFRating(""); setFReviews(""); }}
                    className="text-[11px] text-muted-foreground underline hover:text-foreground ml-auto"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Lead count after filter */}
              {(statusFilter !== "all" || searchQuery) && (
                <p className="text-xs text-muted-foreground">
                  Showing {filteredRanked.length} of {ranked.length} leads
                </p>
              )}

              <div className="space-y-2">
              {filteredRanked.map((lead, i) => {
                const status: LeadStatus = leadStatuses[lead.id] ?? "new";
                const cfg = STATUS_CONFIG[status];
                const StatusIcon = cfg.icon;
                const isOpen = expanded === lead.id;
                const conv = conversions[lead.id];
                const outreach = outreachResults[lead.id];
                const buildPrompt = buildPrompts[lead.id];
                const note = leadNotes[lead.id] ?? "";
                const hasDeal = !!(clientDetails[lead.id] && Object.values(clientDetails[lead.id]).some(v => v));

                return (
                  <div key={lead.id} className={`rounded-xl border transition-all duration-200 ${isOpen ? "border-primary/30 shadow-sm" : "border-border"}`}>
                    {/* ── Row header ── */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Rank */}
                      <span className="text-xs tabular-nums text-muted-foreground w-6 shrink-0">#{i+1}</span>

                      {/* Status badge — visible before expanding */}
                      <div className="shrink-0">
                        <select
                          value={status}
                          onChange={e => setStatus(lead.id, e.target.value as LeadStatus)}
                          onClick={e => e.stopPropagation()}
                          className={`text-[10px] font-semibold border rounded-full px-2.5 py-1 cursor-pointer appearance-none ${cfg.color} ${cfg.bg} focus:outline-none`}
                          title="Pipeline status"
                        >
                          {ALL_STATUSES.map(s => (
                            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0" onClick={() => setExpanded(isOpen ? null : lead.id)}>
                        <div className="font-medium text-sm truncate cursor-pointer flex items-center gap-1.5 flex-wrap">
                          {lead.name}
                          {(() => {
                            const np = normPhone(lead.phone ?? lead.whatsapp ?? "");
                            const prev = np ? phoneIndex.get(np) : undefined;
                            if (!prev) return null;
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHistoryEntry({
                                    leadName: lead.name,
                                    niche: prev.niche,
                                    city: prev.city,
                                    timestamp: prev.timestamp,
                                    status: prev.status,
                                    notes: prev.notes,
                                  });
                                }}
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20 transition-colors cursor-pointer shrink-0"
                              >
                                Seen before{prev.status ? ` · ${prev.status}` : ""}
                              </button>
                            );
                          })()}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {lead.category} · {lead.city}
                          {lead.rating ? ` · ★${lead.rating} (${lead.reviewsCount})` : ""}
                        </div>
                      </div>

                      {/* Phase data indicators */}
                      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                        {conv     && <span title="Conversion points" className="h-5 w-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-[9px] font-bold">P4</span>}
                        {outreach && <span title="Outreach drafted"  className="h-5 w-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-bold">P5</span>}
                        {buildPrompt && <span title="Site prompt ready" className="h-5 w-5 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-[9px] font-bold">P6</span>}
                      </div>

                      {/* Score */}
                      <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums hidden sm:flex">
                        Score {lead.score}
                      </Badge>

                      {/* Expand toggle */}
                      <button
                        onClick={() => setExpanded(isOpen ? null : lead.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        aria-label={isOpen ? "Collapse" : "Expand"}
                      >
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>

                      {/* 💼 Client details button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); openDetailDrawer(lead.id); }}
                        className={`shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border transition-all ${
                          hasDeal
                            ? "bg-green-50 border-green-300 text-green-700 dark:bg-green-900/20 dark:border-green-700 dark:text-green-400"
                            : "bg-muted/40 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                        title="Fill client deal details"
                      >
                        {hasDeal ? <>✅</> : <>💼</>} Details
                      </button>
                    </div>

                    {/* ── Expanded accordion ── */}
                    {isOpen && (
                      <div className="border-t border-border px-4 pb-4 pt-4 space-y-4">

                        {/* Contact quick-actions */}
                        <div className="flex flex-wrap gap-2">
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1.5 text-xs border border-border rounded-full px-3 py-1.5 hover:bg-muted/50 transition-colors">
                              <Phone className="h-3 w-3" /> {lead.phone}
                            </a>
                          )}
                          {(lead.whatsapp || lead.phone) && (
                            <a
                              href={`https://wa.me/${(lead.whatsapp ?? lead.phone ?? "").replace(/\D/g,"")}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs bg-green-50 border border-green-200 text-green-700 rounded-full px-3 py-1.5 hover:bg-green-100 transition-colors"
                            >
                              💬 WhatsApp
                            </a>
                          )}
                          {lead.mapUrl && (
                            <a href={lead.mapUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs border border-border rounded-full px-3 py-1.5 hover:bg-muted/50 transition-colors">
                              <ExternalLink className="h-3 w-3" /> Maps
                            </a>
                          )}
                        </div>

                        {/* Phase 4 — compact redirect card */}
                        {conv ? (
                          <div className="rounded-lg bg-orange-50/60 border border-orange-100 p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase tracking-widest text-orange-600 font-semibold mb-1.5">Phase 4 — Conversion Points</div>
                              <div className="text-xs text-gray-700 font-medium line-clamp-2">
                                {conv.points[0]}
                              </div>
                              {conv.urgencyHook && (
                                <div className="text-[11px] text-orange-700 mt-1.5 italic">⚡ {conv.urgencyHook}</div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs shrink-0 border-orange-200 text-orange-700 hover:bg-orange-50"
                              onClick={() => onGoToPhase?.(4, lead.id)}
                            >
                              Open P4 →
                            </Button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-orange-200 px-3 py-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">No conversion points yet.</span>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-orange-600" onClick={() => onGoToPhase?.(4, lead.id)}>
                              Generate in Phase 4 →
                            </Button>
                          </div>
                        )}

                        {/* Phase 5 — compact redirect */}
                        {outreach ? (
                          <div className="rounded-lg bg-blue-50/60 border border-blue-100 p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase tracking-widest text-blue-600 font-semibold mb-1">Phase 5 — Outreach</div>
                              <div className="text-xs text-gray-600 truncate">{outreach.bestSendTime}</div>
                            </div>
                            <Button size="sm" variant="outline" className="h-8 text-xs shrink-0 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => onGoToPhase?.(5, lead.id)}>
                              Open P5 →
                            </Button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-blue-200 px-3 py-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">No outreach draft yet.</span>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-600" onClick={() => onGoToPhase?.(5, lead.id)}>
                              Generate in Phase 5 →
                            </Button>
                          </div>
                        )}

                        {/* Phase 6 — compact redirect */}
                        {buildPrompt ? (
                          <div className="rounded-lg bg-purple-50/60 border border-purple-100 p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase tracking-widest text-purple-600 font-semibold mb-1">Phase 6 — Site Prompt</div>
                              <div className="text-xs text-gray-600 truncate">{buildPrompt.prompt.slice(0, 60)}…</div>
                            </div>
                            <Button size="sm" variant="outline" className="h-8 text-xs shrink-0 border-purple-200 text-purple-700 hover:bg-purple-50" onClick={() => onGoToPhase?.(6, lead.id)}>
                              Open P6 →
                            </Button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-purple-200 px-3 py-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">No site prompt yet.</span>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-purple-600" onClick={() => onGoToPhase?.(6, lead.id)}>
                              Generate in Phase 6 →
                            </Button>
                          </div>
                        )}

                        {/* Notes */}
                        <div className="space-y-1.5">
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-1.5">
                            <StickyNote className="h-3 w-3" /> Notes
                          </div>
                          <Textarea
                            value={note}
                            onChange={e => setNote(lead.id, e.target.value)}
                            placeholder="Write call notes, what they said, next steps…"
                            className="text-xs min-h-[70px] resize-none font-mono"
                          />
                          <p className="text-[10px] text-muted-foreground">Notes auto-save to session history.</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          )}
        </>
      )}

      {/* ── EXPORT TAB ───────────────────────────────────────────────────────── */}
      {tab === "export" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            <Stat label="Total Leads"  value={ranked.length} />
            <Stat label="With Phone"   value={ranked.filter(l => l.phone).length} />
            <Stat label="Conv. Points" value={convCount} />
            <Stat label="Outreach"     value={outreachCount} />
            <Stat label="Site Prompts" value={buildCount} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSpreadsheet className="h-4 w-4 text-primary" /> Lead Data
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  All leads with status, notes, scores, contact info, and all phase data.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={downloadCSV} disabled={!ranked.length} className="h-9">
                    <Download className="h-4 w-4 mr-2" /> CSV
                  </Button>
                  <Button onClick={downloadFullJSON} variant="outline" disabled={!ranked.length} className="h-9">
                    <Download className="h-4 w-4 mr-2" /> Full JSON
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Client Records card */}
            <Card className="border-green-200 dark:border-green-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> Client Records
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-1">
                  Exports <strong>Completed ✓ leads only</strong> — your lifetime client file.
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Name, phone, WhatsApp, Maps, city, category, your notes + 11 empty columns.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {/* Button 1: Excel */}
                  <Button
                    onClick={downloadClientRecords}
                    disabled={!ranked.filter(l => (leadStatuses[l.id] ?? "new") === "completed").length}
                    className="h-9 bg-green-600 hover:bg-green-700 text-white"
                    title="Download as .csv — opens in Excel"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    📊 Excel
                    {(() => { const n = ranked.filter(l => (leadStatuses[l.id] ?? "new") === "completed").length; return n > 0 ? ` (${n})` : ""; })()}
                  </Button>
                  {/* Button 2: Google Sheets — opens sheets.new + copies data */}
                  <Button
                    onClick={openGoogleSheets}
                    disabled={!ranked.filter(l => (leadStatuses[l.id] ?? "new") === "completed").length}
                    variant="outline"
                    className="h-9 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400"
                    title="Opens Google Sheets + copies data to clipboard"
                  >
                    📅 Google Sheets
                  </Button>
                  {/* Button 3: HTML summary */}
                  <Button
                    onClick={downloadClientHTML}
                    disabled={!ranked.filter(l => (leadStatuses[l.id] ?? "new") === "completed").length}
                    variant="outline"
                    className="h-9"
                  >
                    <Download className="h-4 w-4 mr-2" /> 📄 Client Summary
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  📅 Google Sheets: opens a new sheet + copies data — just press Ctrl+V
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4 text-primary" /> Conversion Points
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  {convCount > 0 ? `${convCount} set${convCount !== 1 ? "s" : ""} — pitch points, revenue argument & urgency.` : "Generate in Phase 4 first."}
                </p>
                <Button disabled={!convCount} className="h-9" onClick={() => {
                  const lines: string[] = [];
                  for (const [id, c] of Object.entries(conversions)) {
                    const lead = ranked.find(l => l.id === id);
                    lines.push("========================================", `Business: ${lead?.name ?? id}`, "----------------------------------------");
                    c.points.forEach((p, i) => lines.push(`  ${i+1}. ${p}`));
                    lines.push(`\nRevenue: ${c.revenueArgument}\nUrgency: ${c.urgencyHook}`, "");
                  }
                  trigger(lines.join("\n"), `conversion-points-${today()}.txt`, "text/plain;charset=utf-8;");
                  toast.success(`Exported ${Object.keys(conversions).length} conversion sets`);
                }}>
                  <Download className="h-4 w-4 mr-2" /> Download ({convCount}) TXT
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageCircle className="h-4 w-4 text-primary" /> Outreach Drafts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  {outreachCount > 0 ? `${outreachCount} draft${outreachCount !== 1 ? "s" : ""} — first messages + day-3 follow-ups.` : "Generate in Phase 5 first."}
                </p>
                <Button onClick={downloadOutreachTXT} disabled={!outreachCount} className="h-9">
                  <Download className="h-4 w-4 mr-2" /> Download ({outreachCount}) TXT
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe2 className="h-4 w-4 text-primary" /> Website Prompts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  {buildCount > 0 ? `${buildCount} prompt${buildCount !== 1 ? "s" : ""} — paste into Google Stitch, Lovable, or Bolt.` : "Generate in Phase 6 first."}
                </p>
                <Button onClick={downloadPromptsTXT} disabled={!buildCount} className="h-9">
                  <Download className="h-4 w-4 mr-2" /> Download ({buildCount}) TXT
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </PhaseShell>

    <LeadHistoryDrawer
      entry={historyEntry}
      onClose={() => setHistoryEntry(null)}
    />

    {/* ── Client Detail Drawer ─────────────────────────────────────────────── */}
    {detailDrawer.open && (() => {
      const lead = ranked.find(l => l.id === detailDrawer.leadId);
      if (!lead) return null;
      const f = (label: string, field: keyof ClientDetail, type = "text", readOnly = false) => (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</label>
          <input
            type={type}
            value={draftDetail[field] ?? ""}
            onChange={e => !readOnly && updateDraft(field, e.target.value)}
            readOnly={readOnly}
            className={`h-9 px-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 ${readOnly ? "bg-muted/40 text-muted-foreground cursor-not-allowed" : "border-border"}`}
          />
        </div>
      );
      return (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 transition-opacity"
            onClick={() => setDetailDrawer({ open: false, leadId: null })}
          />
          {/* Drawer */}
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-background border-l border-border shadow-2xl z-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30 shrink-0">
              <div>
                <div className="font-semibold text-sm">💼 Client Details</div>
                <div className="text-[11px] text-muted-foreground truncate max-w-[280px]">{lead.name} · {lead.city}</div>
              </div>
              <button
                onClick={() => setDetailDrawer({ open: false, leadId: null })}
                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-lg"
              >×</button>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {/* Deal Info */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3 flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" /> Deal Info <span className="h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {f("Client Name", "clientName")}
                  {f("Price Agreed (Rs)", "priceAgreed", "number")}
                  {f("Advance Received (Rs)", "advanceReceived", "number")}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Balance Due (Rs)</label>
                    <input
                      type="number"
                      value={draftDetail.balanceDue ?? ""}
                      onChange={e => updateDraft("balanceDue", e.target.value)}
                      placeholder="Auto-calculated"
                      className="h-9 px-3 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    {draftDetail.priceAgreed && draftDetail.advanceReceived && (
                      <span className="text-[10px] text-muted-foreground">Auto: {Number(draftDetail.priceAgreed) - Number(draftDetail.advanceReceived)} Rs</span>
                    )}
                  </div>
                </div>
              </div>
              {/* Website */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3 flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" /> Website <span className="h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {f("Domain Name", "domainName")}
                  {f("Website Live URL", "websiteUrl")}
                </div>
              </div>
              {/* Hosting */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3 flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" /> Hosting <span className="h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {f("Free Start", "freeHostingStart", "date")}
                  {f("Free End", "freeHostingEnd", "date")}
                  {f("Paid Start", "paidHostingStart", "date")}
                  {f("Paid End", "paidHostingEnd", "date")}
                </div>
              </div>
              {/* Remarks */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3 flex items-center gap-2">
                  <span className="h-px flex-1 bg-border" /> Remarks <span className="h-px flex-1 bg-border" />
                </div>
                <textarea
                  value={draftDetail.remarks ?? ""}
                  onChange={e => updateDraft("remarks", e.target.value)}
                  rows={3}
                  placeholder="Any notes about this client deal..."
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                />
              </div>
            </div>
            {/* Footer */}
            <div className="px-5 py-4 border-t border-border bg-muted/20 shrink-0 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDetailDrawer({ open: false, leadId: null })}>
                Cancel
              </Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={saveDetailDrawer}>
                💾 Save Details
              </Button>
            </div>
          </div>
        </>
      );
    })()}
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3.5 py-3 shadow-2xs ${accent && value > 0 ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30" : "border-border bg-card"}`}>
      <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums text-foreground mt-0.5 ${accent && value > 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{value}</div>
    </div>
  );
}
