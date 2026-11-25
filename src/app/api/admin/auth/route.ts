import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  signAdminToken,
  verifyAdminPin,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pin?: string };
    if (!body.pin || !verifyAdminPin(body.pin)) {
      return NextResponse.json(
        { error: "PIN incorrecto" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE_NAME, signAdminToken(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 días
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Solicitud inválida" },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_COOKIE_NAME);
  return response;
}
