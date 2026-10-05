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

    // 1. Send Preview Images (supports multiple pages: Home, Menu, Gallery)
    const imagesToSend = (imageUrls && imageUrls.length > 0)
      ? imageUrls
      : (imageUrl ? [imageUrl] : []);

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

    for (let imgIdx = 0; imgIdx < imagesToSend.length; imgIdx++) {
      const imgUrl = imagesToSend[imgIdx];
      if (!imgUrl) continue;
      const absoluteImageUrl = imgUrl.startsWith("http")
        ? imgUrl
        : `${appBaseUrl || ""}${imgUrl.startsWith("/") ? "" : "/"}${imgUrl}`;

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

      await new Promise((r) => setTimeout(r, 2000));
    }

    // 2. Send Text
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

    return NextResponse.json({ ok: true, message: `Test message sent to ${name} (${phone})` });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
