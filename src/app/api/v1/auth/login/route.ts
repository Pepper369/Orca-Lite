import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fail, badRequest, ok } from "@/lib/envelope";
import { buildSessionCookieHeader, createSessionCookie, isValidEmail, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = await rateLimit(req, { name: "login", binding: "RL_AUTH", limit: 10, windowSec: 60 });
  if (limited) return limited;
  try {
    const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null;
    const email = body?.email?.trim().toLowerCase();
    const password = body?.password ?? "";
    if (!email || !isValidEmail(email) || !password) return badRequest("Thông tin đăng nhập không hợp lệ");
    if (password.length > 128) return badRequest("Mật khẩu không hợp lệ");
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      if (user) await db.insert(auditLogs).values({ userId: user.id, action: "login_failed" }).catch(() => {});
      return fail("INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng", 401);
    }
    const token = await createSessionCookie(user.id, req);
    await db.insert(auditLogs).values({ userId: user.id, action: "login" }).catch(() => {});
    return ok(
      { user: { id: user.id, email: user.email, name: user.name } },
      { source: "orca-auth" },
      { "Set-Cookie": buildSessionCookieHeader(token), "Cache-Control": "no-store" },
    );
  } catch (e) {
    console.error("[auth-login] Unexpected error:", e);
    return fail("LOGIN_FAILED", "Đã xảy ra lỗi máy chủ khi đăng nhập. Vui lòng thử lại sau.", 500);
  }
}
