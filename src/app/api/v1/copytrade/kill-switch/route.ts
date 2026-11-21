import { fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import { triggerGlobalKillSwitch } from "@/lib/services/broker-vault-store";
import { recordBotActivity } from "@/lib/services/bot-live-telemetry";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = await rateLimit(req, {
    name: "copytrade-kill-switch",
    binding: "RL_AUTH",
    limit: 30,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const session = await getSessionUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      engage?: boolean;
      reason?: string;
    };
    const engage = body.engage !== false;
    const accounts = await triggerGlobalKillSwitch({
      engage,
      reason: body.reason || (engage ? "Kích hoạt Kill-Switch khẩn cấp từ Dashboard" : undefined),
      userId: session?.id ?? null,
    });

    recordBotActivity({
      level: engage ? "error" : "ok",
      category: "GUARDRAIL",
      message: engage
        ? `KILL-SWITCH kích hoạt: Đã khóa khẩn cấp ${accounts.length} tài khoản bot`
        : `Đã mở khóa an toàn ${accounts.length} tài khoản bot`,
    });

    return ok({
      engaged: engage,
      updatedCount: accounts.length,
      accounts,
      message: engage
        ? `ĐÃ KHÓA KHẨN CẤP ${accounts.length} bot Auto-Trade. Không có lệnh mới nào được phép gửi lên sàn.`
        : `Đã mở khóa an toàn ${accounts.length} kết nối.`,
    });
  } catch (err) {
    return fail("KILL_SWITCH_ERROR", err instanceof Error ? err.message : "Lỗi Kill-Switch", 500);
  }
}
