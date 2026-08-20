import { NextResponse } from "next/server";
import { geminiConnected } from "@/lib/gemini";

/**
 * Replaces the old claude-status check.
 * Returns whether Gemini API is connected and working.
 */
export async function GET() {
  const connected = await geminiConnected();
  return NextResponse.json({
    installed: connected,
    source: "gemini",
    message: connected
      ? "Gemini AI connected ✓"
      : "Gemini API key not working. Check GEMINI_API_KEY in app/.env.local",
  });
}
