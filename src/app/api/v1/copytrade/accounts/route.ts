import { ok, badRequest, fail } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  getFollowerAccounts,
  registerFollowerAccount,
  toggleFollowerAccount,
  getMasterTraderPerformance,
} from "@/lib/engines/copy-trade-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const accounts = getFollowerAccounts();
  const masterStats = getMasterTraderPerformance();

  return ok({
    accounts,
    masterStats,
  });
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, { name: "copytrade_accounts_post", binding: "RL_AUTH", limit: 20, windowSec: 60 });
  if (limited) return limited;
  if (process.env.NODE_ENV === "production") {
    const session = await getSessionUser();
    if (!session) return fail("UNAUTHENTICATED", "Đăng nhập để quản lý tài khoản Copy Trade", 401);
  }
  try {
    const body = await req.json();
    const { name, platform, accountNumberMasked, balanceUsd, riskMultiplier = 1.0, maxAllowedSlippagePips = 3.0, isActive = true } = body;

    if (!name || !platform || !accountNumberMasked || !balanceUsd) {
      return badRequest("Thiếu thông tin tài khoản follower (name, platform, accountNumberMasked, balanceUsd).");
    }

    const created = registerFollowerAccount({
      name,
      platform,
      accountNumberMasked,
      balanceUsd: Number(balanceUsd),
      riskMultiplier: Number(riskMultiplier),
      maxAllowedSlippagePips: Number(maxAllowedSlippagePips),
      isActive: Boolean(isActive),
    });

    return ok(created);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Lỗi khi đăng ký tài khoản Follower";
    return badRequest(msg);
  }
}

export async function PATCH(req: Request) {
  const limited = await rateLimit(req, { name: "copytrade_accounts_patch", binding: "RL_AUTH", limit: 30, windowSec: 60 });
  if (limited) return limited;
  if (process.env.NODE_ENV === "production") {
    const session = await getSessionUser();
    if (!session) return fail("UNAUTHENTICATED", "Đăng nhập để cập nhật tài khoản Copy Trade", 401);
  }
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return badRequest("Thiếu follower id.");

    const updated = toggleFollowerAccount(id);
    if (!updated) return badRequest("Không tìm thấy tài khoản follower.");

    return ok(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Lỗi khi cập nhật tài khoản Follower";
    return badRequest(msg);
  }
}
