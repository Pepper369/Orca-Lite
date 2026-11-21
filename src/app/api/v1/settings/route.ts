import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fail, ok, badRequest } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  hasPrototypePollutionKey,
  sanitizeAvatarUrl,
  sanitizeIdentityName,
  sanitizePlainText,
  stripPrototypePollution,
} from "@/app/api/_security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Persistent user settings — synced from the client settings store. */
export async function GET(req: Request) {
  const limited = await rateLimit(req, { name: "settings_get", binding: "RL_AUTH", limit: 60, windowSec: 60 });
  if (limited) return limited;

  const session = await getSessionUser(req);
  if (!session) return fail("UNAUTHENTICATED", "Đăng nhập để đồng bộ settings", 401);
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.userId, session.id)).limit(1);
  return ok(
    row
      ? { settings: row.settings, updatedAt: row.updatedAt.getTime() }
      : { settings: null, updatedAt: 0 },
    { source: "orca-settings" },
  );
}

export async function PUT(req: Request) {
  const limited = await rateLimit(req, { name: "settings_put", binding: "RL_AUTH", limit: 30, windowSec: 60 });
  if (limited) return limited;

  const session = await getSessionUser(req);
  if (!session) return fail("UNAUTHENTICATED", "Đăng nhập để đồng bộ settings", 401);
  const body = (await req.json().catch(() => null)) as { settings?: unknown } | null;
  if (!body?.settings || typeof body.settings !== "object" || Array.isArray(body.settings)) {
    return badRequest("Payload settings không hợp lệ");
  }
  if (hasPrototypePollutionKey(body.settings)) {
    return badRequest("Payload settings chứa khóa không hợp lệ");
  }

  const sanitized = stripPrototypePollution(body.settings as Record<string, unknown>);

  // Validate & sanitize profile fields to prevent stored XSS (avatarUrl, displayName, bio)
  if (sanitized.profile && typeof sanitized.profile === "object" && !Array.isArray(sanitized.profile)) {
    const profile = { ...(sanitized.profile as Record<string, unknown>) };
    if ("avatarUrl" in profile) {
      const avatarCheck = sanitizeAvatarUrl(profile.avatarUrl);
      if (!avatarCheck.ok) return badRequest(avatarCheck.reason ?? "avatarUrl không hợp lệ");
      profile.avatarUrl = avatarCheck.value ?? null;
    }
    if ("displayName" in profile && profile.displayName !== null && profile.displayName !== undefined) {
      const rawDisplay = String(profile.displayName).trim();
      if (rawDisplay) {
        const nameCheck = sanitizeIdentityName(rawDisplay, 80);
        if (!nameCheck.ok) return badRequest(nameCheck.reason ?? "Tên hiển thị không hợp lệ");
        profile.displayName = nameCheck.value ?? "";
      } else {
        profile.displayName = "";
      }
    }
    if ("bio" in profile && typeof profile.bio === "string") {
      profile.bio = sanitizePlainText(profile.bio, 160);
    }
    sanitized.profile = profile;
  }

  const size = JSON.stringify(sanitized).length;
  if (size > 32_000) return badRequest("Settings quá lớn");
  await db
    .insert(userPreferences)
    .values({ userId: session.id, settings: sanitized, updatedAt: new Date() })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { settings: sanitized, updatedAt: new Date() } });
  return ok({ saved: true }, { source: "orca-settings" });
}
