import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "tienda_admin_session";

function getSecret(): string {
  return process.env.ADMIN_PIN || "1234";
}

export function verifyAdminPin(pin: string): boolean {
  const expected = getSecret();
  const a = Buffer.from(pin.trim());
  const b = Buffer.from(expected.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function signAdminToken(): string {
  const payload = "admin-authenticated";
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  const expected = signAdminToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
