import { NextResponse } from "next/server";
import type { RankedLead } from "@/lib/types";

/**
 * Export leads to CSV format for offline use.
 */
export async function POST(req: Request) {
  const { ranked } = (await req.json()) as { ranked: RankedLead[] };

  if (!Array.isArray(ranked) || ranked.length === 0) {
    return NextResponse.json({ error: "No leads to export." }, { status: 400 });
  }

  // CSV Header
  const headers = [
    "Score",
    "Name",
    "Category",
    "City",
    "Address",
    "Phone",
    "WhatsApp",
    "Rating",
    "Reviews",
    "Has Website",
    "Website URL",
    "Source",
    "Photos Count",
    "Business Hours",
    "Services",
    "Social Media",
    "Owner Replies",
    "Biggest Gap",
    "Est. Lost Revenue (₹/month)",
    "Score Reasoning",
    "Gaps",
  ];

  // CSV Rows
  const rows = ranked.map((lead) => [
    lead.score,
    escapeCsv(lead.name),
    escapeCsv(lead.category),
    escapeCsv(lead.city),
    escapeCsv(lead.address),
    escapeCsv(lead.phone ?? ""),
    escapeCsv(lead.whatsapp ?? lead.phone ?? ""),
    lead.rating ?? "",
    lead.reviewsCount ?? "",
    lead.audit.hasWebsite ? "Yes" : "No",
    escapeCsv(lead.website ?? ""),
    escapeCsv(lead.source ?? "maps"),
    lead.photosCount ?? 0,
    escapeCsv(lead.hours?.join("; ") ?? ""),
    escapeCsv(lead.services?.join(", ") ?? ""),
    escapeCsv(lead.socialLinks?.map(s => s.platform).join(", ") ?? ""),
    lead.ownerReplies ? "Yes" : "No",
    escapeCsv(lead.audit.biggestGap),
    lead.audit.estLostRevenuePerMonth,
    escapeCsv(lead.scoreReasoning ?? ""),
    escapeCsv((lead.audit.gaps ?? []).join("; ")),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}

function escapeCsv(value: string): string {
  if (!value) return '""';
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}
