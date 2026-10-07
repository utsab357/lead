/**
 * Next.js Server Lifecycle Instrumentation
 *
 * Runs automatically when the Next.js server starts on Render.
 * Starts a background self-ping loop every 10 minutes to ensure
 * Render's 15-minute free tier inactivity sleep timer is NEVER reached.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Only activate auto-keepalive in production or when running on Render
    const isRender = process.env.NODE_ENV === "production" || !!process.env.RENDER || !!process.env.RENDER_EXTERNAL_URL;
    
    if (isRender) {
      const renderHost = process.env.RENDER_EXTERNAL_URL || "https://webeta-lead-generator.onrender.com";
      const evoUrl = process.env.EVOLUTION_API_URL || "https://evolution-api-webeta.onrender.com";

      console.log(`[Keep-Alive Engine] Initialized on ${renderHost}. Interval: 10 minutes.`);

      // 10 minutes (600,000 ms) — safely below Render's 15-minute idle cutoff
      setInterval(async () => {
        try {
          // Pinging the public URL routes through Render's external load balancer,
          // registering an incoming HTTP request that resets Render's 15-min idle timer to 0!
          await fetch(`${renderHost.replace(/\/$/, "")}/api/health`, {
            signal: AbortSignal.timeout(25000),
          });

          // Also keep Evolution API awake
          await fetch(evoUrl, {
            signal: AbortSignal.timeout(25000),
          });

          console.log(`[Keep-Alive Engine] Heartbeat ping sent successfully to Render.`);
        } catch (err) {
          console.warn(`[Keep-Alive Engine] Ping error:`, (err as Error).message);
        }
      }, 10 * 60 * 1000);
    }
  }
}
