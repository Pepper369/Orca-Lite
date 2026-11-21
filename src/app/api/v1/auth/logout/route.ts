import { ok } from "@/lib/envelope";
import { buildClearSessionCookieHeader, clearSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  await clearSessionCookie(req);
  return ok(
    { loggedOut: true },
    { source: "orca-auth" },
    { "Set-Cookie": buildClearSessionCookieHeader(), "Cache-Control": "no-store" },
  );
}
