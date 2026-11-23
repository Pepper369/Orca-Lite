import { fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import { cronUnauthorized } from "@/lib/cron-auth";
import { rateLimit } from "@/lib/rate-limit";
import { pollAndPersistDerivatives } from "@/lib/services/derivatives-p5";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const limited = await rateLimit(req, { name: "derivatives_poll_get", binding: "RL_AUTH", limit: 20, windowSec: 60 });
  if (limited) return limited;
  if (process.env.NODE_ENV === "production") {
    const session = await getSessionUser(req);
    if (!session && cronUnauthorized(req) !== null) {
      return fail("UNAUTHENTICATED", "Đăng nhập hoặc cung cấp CRON_SECRET để kích hoạt poll phái sinh", 401);
    }
  }
  const { data, meta } = await pollAndPersistDerivatives({ coreOnly: true });
  return ok(data, meta);
}

export async function POST(req: Request) {
  return GET(req);
}
