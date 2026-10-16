import { adminAuth } from "@/lib/firebase-admin";
import { getOrCreateUser } from "@/db/users";
import { createSessionCookie } from "@/lib/auth";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { ok, fail } from "@/lib/envelope";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = await rateLimit(req, { name: "auth_firebase", binding: "RL_AUTH", limit: 15, windowSec: 60 });
  if (limited) return limited;

  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return fail("UNAUTHORIZED", "Thiếu mã xác thực Firebase (Bearer token)", 401);
    }

    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.uid || !decoded.email) {
      return fail("UNAUTHORIZED", "Token Firebase không hợp lệ", 401);
    }

    const user = await getOrCreateUser(decoded.uid, decoded.email, decoded.name ?? null);
    if (!user) {
      return fail("USER_SYNC_FAILED", "Không thể đồng bộ người dùng với cơ sở dữ liệu", 500);
    }

    await createSessionCookie(user.id);
    await db.insert(auditLogs).values({ userId: user.id, action: "login_firebase" }).catch(() => {});

    return ok(
      {
        user: {
          id: user.id,
          uid: user.uid,
          email: user.email,
          name: user.name,
        },
      },
      { source: "firebase-auth" },
    );
  } catch (error) {
    console.error("[auth-firebase] Token verification failed:", error);
    return fail("FIREBASE_AUTH_FAILED", "Xác thực Firebase không thành công", 401);
  }
}
