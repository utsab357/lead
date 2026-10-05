import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";

export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    const filename = slug.join("/");
    const filePath = path.join(process.cwd(), "public", "previews", filename);

    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    return new Response("Preview image not found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500 });
  }
}
