#!/usr/bin/env node
import { execSync } from "child_process";

console.log("==================================================");
console.log("🚀 [Webeta Build] Starting production build...");
console.log("==================================================");

// Force Playwright to install browser into node_modules (persists across Render container stages)
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";

try {
  console.log("📦 [1/2] Installing Playwright Chromium browser into node_modules...");
  execSync("npx playwright install chromium", {
    stdio: "inherit",
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "0" },
  });
  console.log("✅ Playwright Chromium installed successfully.");
} catch (err) {
  console.warn("⚠️ [Playwright install notice]:", err.message || err);
  console.warn("Continuing with Next.js build...");
}

console.log("\n🏗️ [2/2] Running Next.js build...");
execSync("next build", {
  stdio: "inherit",
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: "0" },
});

console.log("\n==================================================");
console.log("🎉 [Webeta Build] Build completed successfully!");
console.log("==================================================");

