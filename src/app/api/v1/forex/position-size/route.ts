import { ok, badRequest } from "@/lib/envelope";
import {
  calculateForexPositionSize,
  type CrossRateOverrides,
} from "@/lib/engines/forex-position-sizer";
import { getForexMarkets } from "@/lib/services/forex";
import { rateLimit } from "@/lib/rate-limit";
import { hasPrototypePollutionKey, stripPrototypePollution } from "@/app/api/_security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function parsePositiveFinite(
  val: unknown,
  min: number,
  max: number,
): { ok: true; value: number } | { ok: false } {
  if (val === null || val === undefined || val === "" || typeof val === "boolean" || Array.isArray(val)) {
    return { ok: false };
  }
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n) || n < min || n > max) {
    return { ok: false };
  }
  return { ok: true, value: n };
}

function parseOptionalPositiveFinite(
  val: unknown,
  min: number,
  max: number,
): { ok: true; value: number | undefined } | { ok: false } {
  if (val === null || val === undefined || val === "") {
    return { ok: true, value: undefined };
  }
  const parsed = parsePositiveFinite(val, min, max);
  if (!parsed.ok) return { ok: false };
  return { ok: true, value: parsed.value };
}

function sanitizeCrossRates(raw: unknown): { ok: true; value: CrossRateOverrides | undefined } | { ok: false } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: undefined };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false };
  }
  const src = raw as Record<string, unknown>;
  const keys = ["usdJpy", "gbpUsd", "usdChf", "usdCad", "audUsd", "nzdUsd"] as const;
  const out: CrossRateOverrides = {};
  for (const k of keys) {
    const v = src[k];
    if (v === undefined || v === null) continue;
    const parsed = parsePositiveFinite(v, 1e-6, 1e7);
    if (!parsed.ok) return { ok: false };
    out[k] = parsed.value;
  }
  return { ok: true, value: out };
}

/**
 * FOREX POSITION SIZE & RISK MATRIX API
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, {
    name: "forex_position_size_post",
    binding: "RL_AI",
    limit: 60,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return badRequest("Payload JSON không hợp lệ.");
    }
    if (hasForbiddenProtoPayload(rawBody)) {
      return badRequest("Payload chứa khóa không được phép.");
    }
    const body = stripPrototypePollution(rawBody) as Record<string, unknown>;

    if (typeof body.pair !== "string" || !/^[A-Z0-9/_-]{3,16}$/i.test(body.pair.trim())) {
      return badRequest("Thiếu hoặc sai định dạng cặp tiền tệ (pair).");
    }
    const pair = body.pair.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (pair.length < 3 || pair.length > 12) {
      return badRequest("Mã cặp tiền tệ (pair) không hợp lệ.");
    }

    const entryParsed = parsePositiveFinite(body.entryPrice, 1e-6, 1e9);
    const slParsed = parsePositiveFinite(body.stopLossPrice, 1e-6, 1e9);
    if (!entryParsed.ok || !slParsed.ok) {
      return badRequest("entryPrice và stopLossPrice phải là số dương hữu hạn hợp lệ.");
    }
    const entryPrice = entryParsed.value;
    const stopLossPrice = slParsed.value;
    if (Math.abs(entryPrice - stopLossPrice) < 1e-7) {
      return badRequest("entryPrice và stopLossPrice không được trùng nhau.");
    }

    const balanceParsed = parseOptionalPositiveFinite(body.accountBalance, 1, 1e11);
    if (!balanceParsed.ok) {
      return badRequest("accountBalance phải là số dương hữu hạn trong ngưỡng cho phép.");
    }
    const accountBalance = balanceParsed.value ?? 10_000;

    const riskPctParsed = parseOptionalPositiveFinite(body.riskPercent, 0.01, 100);
    if (!riskPctParsed.ok) {
      return badRequest("riskPercent phải nằm trong khoảng [0.01, 100].");
    }
    const riskPercent = riskPctParsed.value ?? 1.0;

    const riskAmtParsed = parseOptionalPositiveFinite(body.riskAmountUsd, 0.01, accountBalance);
    if (!riskAmtParsed.ok) {
      return badRequest("riskAmountUsd phải là số dương hữu hạn và không vượt quá accountBalance.");
    }
    const riskAmountUsd = riskAmtParsed.value;

    const leverageParsed = parseOptionalPositiveFinite(body.leverage, 1, 2000);
    if (!leverageParsed.ok) {
      return badRequest("leverage phải nằm trong khoảng [1, 2000].");
    }
    const leverage = leverageParsed.value ?? 100;

    const tp1Parsed = parseOptionalPositiveFinite(body.takeProfit1, 1e-6, 1e9);
    const tp2Parsed = parseOptionalPositiveFinite(body.takeProfit2, 1e-6, 1e9);
    const tp3Parsed = parseOptionalPositiveFinite(body.takeProfit3, 1e-6, 1e9);
    if (!tp1Parsed.ok || !tp2Parsed.ok || !tp3Parsed.ok) {
      return badRequest("Các mốc takeProfit phải là số dương hữu hạn hợp lệ.");
    }

    const crossRatesParsed = sanitizeCrossRates(body.crossRates);
    if (!crossRatesParsed.ok) {
      return badRequest("crossRates chứa tỷ giá không hợp lệ.");
    }
    let crossRates: CrossRateOverrides | undefined = crossRatesParsed.value;

    // Fetch cached live FX quotes automatically when sizing non-USD crosses without caller-supplied crossRates
    if (
      !crossRates &&
      !pair.endsWith("USD") &&
      !pair.startsWith("USD") &&
      !pair.startsWith("XAU") &&
      !pair.startsWith("XAG") &&
      !pair.includes("OIL")
    ) {
      const fxRes = await Promise.race([
        getForexMarkets().catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      const rows = fxRes?.data?.rows ?? [];
      if (rows.length > 0) {
        const find = (p: string) =>
          rows.find((r) => r.pair === p && Number.isFinite(r.price) && r.price > 0)?.price ?? null;
        crossRates = {
          usdJpy: find("USDJPY"),
          gbpUsd: find("GBPUSD"),
          usdChf: find("USDCHF"),
          usdCad: find("USDCAD"),
          audUsd: find("AUDUSD"),
          nzdUsd: find("NZDUSD"),
        };
      }
    }

    const result = calculateForexPositionSize({
      accountBalance,
      riskPercent,
      riskAmountUsd,
      pair,
      entryPrice,
      stopLossPrice,
      takeProfit1: tp1Parsed.value ?? null,
      takeProfit2: tp2Parsed.value ?? null,
      takeProfit3: tp3Parsed.value ?? null,
      leverage,
      crossRates,
    });
    return ok(result);
  } catch {
    return badRequest("Dữ liệu tính toán vị thế không hợp lệ.");
  }
}
