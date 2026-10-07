import { NextResponse } from "next/server";
import { readConfig } from "../settings/route";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const config = readConfig();
    if (!config.evolutionApiUrl || !config.evolutionApiKey) {
      return NextResponse.json(
        { ok: false, error: "Evolution API not configured. Check settings." },
        { status: 400 }
      );
    }

    const { phone, message, imageUrl, imageUrls, name, appBaseUrl } = (await req.json()) as {
      phone: string;
      message: string;
      imageUrl?: string;
      imageUrls?: string[];
      name: string;
      appBaseUrl?: string;
    };

    if (!phone || !message) {
      return NextResponse.json(
        { ok: false, error: "Phone number and message are required." },
        { status: 400 }
      );
    }

    const { evolutionApiUrl, evolutionApiKey, instanceName } = config;

    // Helper with warmup retry for Render cold starts
    async function fetchWithWarmup(url: string, opts: RequestInit, retries = 4): Promise<Response> {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const res = await fetch(url, opts);
          if ((res.status === 502 || res.status === 503) && attempt < retries) {
            console.warn(`[WhatsApp Test] Render 502 cold-start. Waking up server... (attempt ${attempt}/${retries}, waiting 9s)`);
            await new Promise((r) => setTimeout(r, 9000));
            continue;
          }
          return res;
        } catch (e) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }
          throw e;
        }
      }
      return new Response("Render server is warming up. Please retry in 15 seconds.", { status: 502 });
    }

    // 1. Send Text Pitch First (Option A)
    const textRes = await fetchWithWarmup(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionApiKey,
      },
      body: JSON.stringify({
        number: phone,
        text: message,
      }),
    });

    if (!textRes.ok) {
      const body = await textRes.text();
      return NextResponse.json(
        { ok: false, error: `WhatsApp API (${textRes.status}): ${body.slice(0, 250)}` },
        { status: 400 }
      );
    }

    // 2. Send Preview Images in rapid succession (~400ms) for native WhatsApp Album collage
    const imagesToSend = (imageUrls && imageUrls.length > 0)
      ? imageUrls
      : (imageUrl ? [imageUrl] : []);

    if (imagesToSend.length > 0) {
      await new Promise((r) => setTimeout(r, 1200)); // short pause after text

      for (let imgIdx = 0; imgIdx < imagesToSend.length; imgIdx++) {
        const imgUrl = imagesToSend[imgIdx];
        if (!imgUrl) continue;

        // Resolve localhost to Render production domain
        let base = appBaseUrl || "";
        if (!base || base.includes("localhost") || base.includes("127.0.0.1")) {
          base = "https://webeta-lead-generator.onrender.com";
        }
        let absoluteImageUrl = imgUrl.startsWith("http")
          ? imgUrl
          : `${base.replace(/\/$/, "")}/${imgUrl.replace(/^\//, "")}`;

        if (absoluteImageUrl.includes("localhost") || absoluteImageUrl.includes("127.0.0.1")) {
          absoluteImageUrl = absoluteImageUrl.replace(/http:\/\/(localhost|127\.0\.0\.1):\d+/i, "https://webeta-lead-generator.onrender.com");
        }

        try {
          const imgRes = await fetchWithWarmup(`${evolutionApiUrl}/message/sendMedia/${instanceName}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: evolutionApiKey,
            },
            body: JSON.stringify({
              number: phone,
              mediatype: "image",
              mimetype: "image/png",
              caption: "",
              media: absoluteImageUrl,
              fileName: `website-preview-${imgIdx + 1}.png`,
            }),
          });

          if (!imgRes.ok) {
            const body = await imgRes.text();
            console.warn(`[WhatsApp Test] Image failed: HTTP ${imgRes.status}: ${body}`);
          }
        } catch (err) {
          console.warn(`[WhatsApp Test] Image network error:`, err);
        }

        // 400ms delay triggers native WhatsApp Album collapse
        if (imgIdx < imagesToSend.length - 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }

    return NextResponse.json({ ok: true, message: `Test message sent to ${name} (${phone})` });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
