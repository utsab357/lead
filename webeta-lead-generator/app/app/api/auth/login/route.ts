import { NextResponse } from "next/server";

const VALID_LOGIN_ID = process.env.APP_LOGIN_ID || "9064970761";
const VALID_PASSWORD = process.env.APP_PASSWORD || "Utsab@9749";
const AUTH_SECRET = process.env.APP_AUTH_SECRET || "webeta_lead_gen_secret_token_2025";

export async function POST(req: Request) {
  try {
    const { loginId, password } = (await req.json()) as { loginId?: string; password?: string };

    if (!loginId || !password) {
      return NextResponse.json(
        { ok: false, error: "Please enter both Login ID and Password." },
        { status: 400 }
      );
    }

    if (loginId.trim() === VALID_LOGIN_ID && password === VALID_PASSWORD) {
      const response = NextResponse.json({ ok: true, message: "Login successful" });

      // Set auth cookie valid for 30 days
      const token = Buffer.from(`${loginId}:${AUTH_SECRET}`).toString("base64");
      response.cookies.set("webeta_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });

      return response;
    }

    return NextResponse.json(
      { ok: false, error: "Incorrect Login ID or Password." },
      { status: 401 }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
