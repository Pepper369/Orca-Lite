import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import { listBrokerConnections } from "@/lib/services/broker-vault-store";
import { summarizeLinkedTradingAccounts } from "@/lib/engines/bot-telemetry-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSessionUser(req);
  if (!session) return fail("UNAUTHENTICATED", "Chưa đăng nhập", 401);
  const [user] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, session.id)).limit(1);
  if (!user) return fail("UNAUTHENTICATED", "Phiên không hợp lệ", 401);
  const conns = await listBrokerConnections(session.id).catch(() => []);
  const tradingAccounts = summarizeLinkedTradingAccounts(conns);
  return ok({ user, tradingAccounts }, { source: "orca-auth" }, { "Cache-Control": "no-store" });
}
