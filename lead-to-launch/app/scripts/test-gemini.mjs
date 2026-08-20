/**
 * Quick test: verify Gemini works for business search.
 * Run: node scripts/test-gemini.mjs
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, "..", ".env.local");

// Parse .env.local manually
let GEMINI_KEY = "";
try {
  const env = readFileSync(envPath, "utf-8");
  const match = env.match(/GEMINI_API_KEY=(.+)/);
  if (match) GEMINI_KEY = match[1].trim();
} catch {
  console.error("Could not read .env.local");
  process.exit(1);
}

if (!GEMINI_KEY) {
  console.error("❌ GEMINI_API_KEY not found in .env.local");
  process.exit(1);
}

console.log(`✅ API key found: ${GEMINI_KEY.slice(0, 10)}...`);
console.log("🔍 Testing Gemini (no grounding — JSON mode)...\n");

const client = new GoogleGenerativeAI(GEMINI_KEY);

// No googleSearch tool — uses JSON mode which is reliable and has high free quota
const model = client.getGenerativeModel({
  model: "gemini-flash-latest",
  generationConfig: {
    temperature: 0.2,
    responseMimeType: "application/json",
  },
});

const prompt = `List 5 real gym businesses in Barasat, West Bengal, India.
Return ONLY a JSON array:
[{"name": "...", "phone": "+91XXXXXXXXXX or null", "address": "...", "rating": 4.2, "reviewsCount": 100, "website": null, "lat": 22.72, "lng": 88.48, "category": "gym", "city": "Barasat, West Bengal"}]`;

try {
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  console.log(`Raw response (${text.length} chars):\n${text.slice(0, 600)}\n`);

  try {
    const parsed = JSON.parse(text);
    console.log(`\n✅ SUCCESS! Got ${parsed.length} businesses:`);
    parsed.forEach((b, i) => console.log(`  ${i + 1}. ${b.name} | ${b.phone || "no phone"} | ${b.address?.slice(0, 50)}`));
  } catch (e) {
    console.error("❌ JSON parse failed:", e.message);
  }
} catch (e) {
  console.error("❌ Gemini API error:", e.message);
}
