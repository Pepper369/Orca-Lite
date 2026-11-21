import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { badRequest, fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeIdentityName } from "@/app/api/_security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Update profile fields (display name). */
export async function PATCH(req: Request) {
  const limited = await rateLimit(req, { name: "profile_update", binding: "RL_AUTH", limit: 20, windowSec: 60 });
  if (limited) return limited;

  const session = await getSessionUser(req);
  if (!session) return fail("UNAUTHENTICATED", "Chưa đăng nhập", 401);
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  let cleanName: string | null = null;
  if (body?.name !== undefined) {
    const check = sanitizeIdentityName(body.name, 80);
    if (!check.ok) return badRequest(check.reason ?? "Tên không hợp lệ");
    cleanName = check.value ?? null;
  }
  if (cleanName) await db.update(users).set({ name: cleanName }).where(eq(users.id, session.id));
  const [user] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, session.id)).limit(1);
  await db.insert(auditLogs).values({ userId: session.id, action: "profile_update" }).catch(() => {});
  return ok({ user }, { source: "orca-auth" });
}
