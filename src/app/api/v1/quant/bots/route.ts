import { NextRequest, NextResponse } from "next/server";
import { MiQuantEngine, type AllocationMode } from "@/lib/engines/miquant-quant-engine";
import { rateLimit } from "@/lib/rate-limit";
import { hasPrototypePollutionKey, stripPrototypePollution } from "@/app/api/_security";

export const dynamic = "force-dynamic";

const VALID_MODES = new Set<AllocationMode>([
  "EQUAL_WEIGHT",
  "INVERSE_VOLATILITY",
  "SCORE_WEIGHTED",
  "HIERARCHICAL_RISK_PARITY",
]);

function hasForbiddenProtoPayload(value: unknown, depth = 0): boolean {
  if (depth > 12 || !value || typeof value !== "object") return false;
  if (hasPrototypePollutionKey(value, depth)) return true;
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype && proto !== Array.prototype) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenProtoPayload(item, depth + 1));
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return true;
    }
    if (hasForbiddenProtoPayload((value as Record<string, unknown>)[key], depth + 1)) {
      return true;
    }
  }
  return false;
}

export async function GET(req?: NextRequest) {
  if (req) {
    const limited = await rateLimit(req, {
      name: "quant_bots_get",
      binding: "RL_AI",
      limit: 60,
      windowSec: 60,
    });
    if (limited) return limited;
  }
  try {
    const bots = await MiQuantEngine.getBots();
    return NextResponse.json({
      success: true,
      data: bots,
    });
  } catch (err: unknown) {
    console.error("[API Quant Bots] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, {
    name: "quant_bots_post",
    binding: "RL_AI",
    limit: 30,
    windowSec: 60,
  });
  if (limited) return limited;
  try {
    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ success: false, error: "Payload không hợp lệ" }, { status: 400 });
    }
    if (hasForbiddenProtoPayload(rawBody)) {
      return NextResponse.json(
        { success: false, error: "Payload chứa khóa không được phép" },
        { status: 400 },
      );
    }
    const body = stripPrototypePollution(rawBody) as Record<string, unknown>;

    if (
      body.botId !== undefined &&
      (typeof body.botId !== "string" || !/^[a-z0-9_-]{1,64}$/i.test(body.botId.trim()))
    ) {
      return NextResponse.json(
        { success: false, error: "Mã botId không hợp lệ" },
        { status: 400 },
      );
    }
    const botId =
      typeof body.botId === "string" ? body.botId.trim() : "bot_breakout_momentum";

    if (
      body.allocationMode !== undefined &&
      (typeof body.allocationMode !== "string" ||
        !VALID_MODES.has(body.allocationMode as AllocationMode))
    ) {
      return NextResponse.json(
        { success: false, error: "Chế độ phân bổ vốn (allocationMode) không hợp lệ" },
        { status: 400 },
      );
    }
    const allocationMode: AllocationMode =
      typeof body.allocationMode === "string"
        ? (body.allocationMode as AllocationMode)
        : "EQUAL_WEIGHT";

    if (typeof body.capital === "boolean" || Array.isArray(body.capital)) {
      return NextResponse.json(
        { success: false, error: "Số vốn không hợp lệ" },
        { status: 400 },
      );
    }
    const capital = body.capital === undefined ? 100_000_000 : Number(body.capital);

    if (!Number.isFinite(capital) || capital <= 0 || capital > 1e13) {
      return NextResponse.json(
        { success: false, error: "Số vốn không hợp lệ" },
        { status: 400 },
      );
    }

    const plan = await MiQuantEngine.calculateRebalancePlan(botId, capital, allocationMode);
    return NextResponse.json({
      success: true,
      data: plan,
    });
  } catch (err: unknown) {
    console.error("[API Quant Bots Rebalance] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
