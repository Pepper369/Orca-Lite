import "server-only";
import { randomUUID } from "node:crypto";
import { eventBus } from "@/lib/events";
import { getAssetPipSize, roundPrice } from "@/lib/engines/asset-precision";
import {
  clearLiveTrainedMetaModels,
  recordLiveMetaLabelOutcome,
} from "@/lib/engines/meta-labeling-calibration";
import { calibrateAndRegisterLiveMetaModels } from "@/lib/engines/fx-crypto-backtest-harness";
import * as binance from "@/lib/providers/binance";
import { getBiquotePublicQuotes } from "@/lib/providers/forex";
import { binanceWs, ensureBinanceWsStarted } from "@/lib/realtime/binance-ws";
import {
  ensureBiquoteCoreWatch,
  ensureBiquotePollStarted,
  getBiquoteLiveTick,
  watchBiquoteSymbol,
} from "@/lib/realtime/biquote-poll";
import type { BrokerPlatform, CopyExecutionOrder, FollowerAccount } from "@/lib/engines/copy-trade-engine";
import {
  fetchBrokerLiveTelemetry,
  updatePlatformExchangeStopLoss,
  type LiveExchangeTelemetryResult,
} from "@/lib/engines/exchange-execution-client";
import { getBrokerMeta, isCryptoPlatform, isForexPlatform } from "@/lib/engines/broker-registry";
import {
  aggregateTierSummary,
  assignPoolNavShares,
  calculateAccountRoiPct,
  calculateMarkToMarketPnlUsd,
  calculatePositionRoePct,
  classifyAccountEnvironment,
  evaluateBotTradingTimeline,
  isAccountPausedByTimeline,
  type AccountPnlTelemetry,
  type BotActivityEvent,
  type BotLiveTelemetrySnapshot,
  type LiveOpenPosition,
} from "@/lib/engines/bot-telemetry-types";
import {
  getBrokerConnectionById,
  getBrokerConnectionSecrets,
  listBotExecutionOrders,
  listBrokerConnections,
  resetDemoBrokerAccounts,
  saveBotExecutionOrder,
  updateBrokerConnectionState,
} from "@/lib/services/broker-vault-store";
import { getAutoTradeWorkerStatus, getLiveQuantEngineFeed } from "@/lib/services/auto-trade-worker";

export const BOT_TELEMETRY_CHANNEL = "bot:telemetry";
const EXCHANGE_SYNC_TTL_MS = 4_500;
const MAX_ACTIVITY_EVENTS = 60;

interface CachedExchangeTelemetry {
  data: LiveExchangeTelemetryResult;
  expiresAt: number;
}

const g = globalThis as typeof globalThis & {
  __orcaBotActivityRing?: BotActivityEvent[];
  __orcaExchangeTelemetryCache?: Map<string, CachedExchangeTelemetry>;
  __orcaClosedOrderIds?: Set<string>;
  __orcaLivePriceRefMap?: Map<string, { price: number; ts: number }>;
  __orcaLastQuoteRefreshAt?: number;
};

const ACTIVITY_RING = g.__orcaBotActivityRing ?? (g.__orcaBotActivityRing = []);
const EXCHANGE_CACHE =
  g.__orcaExchangeTelemetryCache ?? (g.__orcaExchangeTelemetryCache = new Map());
const CLOSED_ORDER_IDS =
  g.__orcaClosedOrderIds ?? (g.__orcaClosedOrderIds = new Set());
const LIVE_PRICE_REF_MAP =
  g.__orcaLivePriceRefMap ?? (g.__orcaLivePriceRefMap = new Map());

export function updateLivePriceReference(symbol: string, price: number): void {
  if (!Number.isFinite(price) || price <= 0) return;
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!clean) return;
  LIVE_PRICE_REF_MAP.set(clean, { price, ts: Date.now() });
}

export function getLivePriceReference(symbol: string, maxAgeMs = 120_000): number | null {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const entry = LIVE_PRICE_REF_MAP.get(clean);
  if (!entry) return null;
  if (Date.now() - entry.ts > maxAgeMs) return null;
  return entry.price;
}

export function recordBotActivity(input: Omit<BotActivityEvent, "id" | "ts">): BotActivityEvent {
  const evt: BotActivityEvent = {
    id: `evt_${randomUUID().slice(0, 10)}`,
    ts: Date.now(),
    ...input,
  };
  ACTIVITY_RING.unshift(evt);
  if (ACTIVITY_RING.length > MAX_ACTIVITY_EVENTS) {
    ACTIVITY_RING.length = MAX_ACTIVITY_EVENTS;
  }
  eventBus.emit(BOT_TELEMETRY_CHANNEL, { type: "activity", event: evt });
  return evt;
}

export function notifyBotTelemetryChanged(reason: string): void {
  eventBus.emit(BOT_TELEMETRY_CHANNEL, { type: "refresh", reason, ts: Date.now() });
}

function isCryptoOrderSymbol(symbol: string, platform: BrokerPlatform): boolean {
  if (platform !== "TELEGRAM_1CLICK") {
    if (isCryptoPlatform(platform)) return true;
    if (isForexPlatform(platform)) return false;
  }
  const u = symbol.toUpperCase();
  return u.endsWith("USDT") || u.endsWith("USDC") || u.includes("BTC") || u.includes("ETH");
}

const IS_TEST_RUNNER =
  process.argv.includes("--test") ||
  process.execArgv.some((arg) => arg.includes("test")) ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.env.NODE_ENV === "test" ||
  process.env.ORCA_DISABLE_REALTIME_WS === "1";

function resolveLiveMarkPrice(symbol: string, assetType: "CRYPTO" | "FOREX", fallbackPrice: number): {
  price: number;
  isLiveFeed: boolean;
} {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (assetType === "CRYPTO") {
    if (!IS_TEST_RUNNER) ensureBinanceWsStarted();
    const mark = binanceWs.getMark(clean, 30_000);
    if (mark && mark.markPrice > 0) {
      updateLivePriceReference(clean, mark.markPrice);
      return { price: mark.markPrice, isLiveFeed: true };
    }
    const tick = binanceWs.getTicker(clean, 30_000);
    if (tick && tick.price > 0) {
      updateLivePriceReference(clean, tick.price);
      return { price: tick.price, isLiveFeed: true };
    }
    const cachedRef = getLivePriceReference(clean, 90_000);
    if (cachedRef && cachedRef > 0) {
      return { price: cachedRef, isLiveFeed: true };
    }
    return { price: fallbackPrice, isLiveFeed: false };
  }

  if (!IS_TEST_RUNNER) {
    ensureBiquotePollStarted();
    watchBiquoteSymbol(clean);
  }
  const fxTick = getBiquoteLiveTick(clean);
  if (fxTick && fxTick.price > 0) {
    updateLivePriceReference(clean, fxTick.price);
    return { price: fxTick.price, isLiveFeed: true };
  }
  const cachedFxRef = getLivePriceReference(clean, 90_000);
  if (cachedFxRef && cachedFxRef > 0) {
    return { price: cachedFxRef, isLiveFeed: true };
  }
  return { price: fallbackPrice, isLiveFeed: false };
}

async function refreshOpenPositionLiveQuotes(orders: CopyExecutionOrder[]): Promise<void> {
  if (IS_TEST_RUNNER) return;
  const now = Date.now();
  if (g.__orcaLastQuoteRefreshAt && now - g.__orcaLastQuoteRefreshAt < 2_500) {
    return;
  }
  g.__orcaLastQuoteRefreshAt = now;

  const openOrders = orders.filter(
    (o) =>
      (o.status === "FILLED_PAPER" || o.status === "FILLED" || o.status === "PENDING_EA") &&
      !CLOSED_ORDER_IDS.has(o.orderId) &&
      !o.message.startsWith("[ĐÃ ĐÓNG]"),
  );
  if (openOrders.length === 0) return;

  const cryptoSyms = new Set<string>();
  const fxSyms = new Set<string>();
  for (const o of openOrders) {
    const clean = o.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const fresh = LIVE_PRICE_REF_MAP.get(clean);
    if (fresh && now - fresh.ts < 2_500) continue;
    if (isCryptoOrderSymbol(clean, o.platform)) {
      const wsMark = binanceWs.getMark(clean, 5_000) ?? binanceWs.getTicker(clean, 5_000);
      if (wsMark) {
        updateLivePriceReference(clean, "markPrice" in wsMark ? wsMark.markPrice : wsMark.price);
      } else {
        cryptoSyms.add(clean);
      }
    } else {
      const fxLive = getBiquoteLiveTick(clean, 5_000);
      if (fxLive && fxLive.price > 0) {
        updateLivePriceReference(clean, fxLive.price);
      } else {
        fxSyms.add(clean);
      }
    }
  }

  await Promise.allSettled([
    ...[...cryptoSyms].slice(0, 6).map(async (sym) => {
      const t = await binance.getSpotTicker(sym).catch(() => null);
      const p = Number(t?.lastPrice ?? 0);
      if (p > 0) updateLivePriceReference(sym, p);
    }),
    fxSyms.size > 0
      ? getBiquotePublicQuotes([...fxSyms])
        .then(({ ticks }) => {
          for (const [sym, t] of Object.entries(ticks)) {
            if (t.mid > 0) updateLivePriceReference(sym, t.mid);
          }
        })
        .catch(() => null)
      : Promise.resolve(null),
  ]);
}

async function fetchAccountExchangeTelemetryCached(
  acct: FollowerAccount,
): Promise<LiveExchangeTelemetryResult | null> {
  if (!acct.hasApiKey) return null;
  if (!getBrokerMeta(acct.platform).supportsDirectRestVerify) return null;

  const cached = EXCHANGE_CACHE.get(acct.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const secrets = await getBrokerConnectionSecrets(acct.id);
  if (!secrets) return null;

  const res = await fetchBrokerLiveTelemetry(acct.platform, secrets);
  if (!res) return null;

  EXCHANGE_CACHE.set(acct.id, {
    data: res,
    expiresAt: Date.now() + EXCHANGE_SYNC_TTL_MS,
  });

  if (res.ok && res.walletBalanceUsd !== null && res.walletBalanceUsd > 0) {
    if (Math.abs(res.walletBalanceUsd - acct.balanceUsd) >= 0.05) {
      void updateBrokerConnectionState(acct.id, {
        balanceUsd: res.walletBalanceUsd,
        lastVerifiedAt: res.fetchedAt,
        lastError: null,
      });
    }
  }
  return res;
}

function buildLocalOpenPositions(
  acct: FollowerAccount,
  accountOrders: CopyExecutionOrder[],
): LiveOpenPosition[] {
  const { accountTier: tier, environment } = classifyAccountEnvironment(acct);
  const openOrders = accountOrders.filter(
    (o) =>
      (o.status === "FILLED_PAPER" || o.status === "FILLED" || o.status === "PENDING_EA") &&
      !CLOSED_ORDER_IDS.has(o.orderId) &&
      !o.message.startsWith("[ĐÃ ĐÓNG]"),
  );

  // Deduplicate by symbol+direction keeping most recent open order for clean position view
  const byKey = new Map<string, CopyExecutionOrder>();
  for (const o of openOrders) {
    const key = `${o.symbol}_${o.direction}_${o.orderId}`;
    if (!byKey.has(key)) byKey.set(key, o);
  }

  const out: LiveOpenPosition[] = [];
  for (const o of byKey.values()) {
    const assetType: "CRYPTO" | "FOREX" = isCryptoOrderSymbol(o.symbol, acct.platform)
      ? "CRYPTO"
      : "FOREX";
    const rawEntry = o.executionPrice > 0 ? o.executionPrice : o.entryPrice;
    const entry = roundPrice(rawEntry, o.symbol, assetType);
    const { price: rawMarkPrice } = resolveLiveMarkPrice(o.symbol, assetType, entry);
    const markPrice = roundPrice(rawMarkPrice, o.symbol, assetType);
    const leverage = assetType === "CRYPTO" ? Math.max(1, acct.leverageCap ?? 5) : 100;
    const unrealizedPnlUsd = calculateMarkToMarketPnlUsd({
      symbol: o.symbol,
      assetType,
      direction: o.direction,
      entryPrice: entry,
      markPrice,
      qtyOrLots: o.copiedLotsOrQty,
    });
    const roePct = calculatePositionRoePct({
      unrealizedPnlUsd,
      entryPrice: entry,
      qtyOrLots: o.copiedLotsOrQty,
      leverage,
      assetType,
      symbol: o.symbol,
    });

    out.push({
      positionId: o.orderId,
      orderId: o.orderId,
      accountId: acct.id,
      accountName: acct.name,
      platform: acct.platform,
      accountTier: tier,
      environment,
      symbol: o.symbol,
      assetType,
      direction: o.direction,
      qtyOrLots: o.copiedLotsOrQty,
      initialQtyOrLots: o.initialLotsOrQty ?? o.copiedLotsOrQty,
      leverage,
      entryPrice: entry,
      markPrice,
      stopLossPrice: o.stopLossPrice > 0 ? o.stopLossPrice : null,
      takeProfit1: o.takeProfit1 > 0 ? o.takeProfit1 : null,
      takeProfit2: o.takeProfit2 && o.takeProfit2 > 0 ? o.takeProfit2 : null,
      takeProfit3: o.takeProfit3 && o.takeProfit3 > 0 ? o.takeProfit3 : null,
      positionStage:
        o.positionStage && o.positionStage !== "CLOSED" ? o.positionStage : "INITIAL",
      realizedPnlUsd: o.realizedPnlUsd ?? 0,
      unrealizedPnlUsd,
      roePct,
      liquidationPrice: null,
      source: o.status === "PENDING_EA" ? "EA_TRACKED" : "MARK_TO_MARKET_WS",
      openedAt: o.timestamp,
      canCloseInApp: true,
    });
  }
  return out;
}

function computeAccountWinrateStats(
  acctOrders: CopyExecutionOrder[],
  fallbackWinratePct = 0,
  fallbackTotalTrades = 0,
): { closedTradesCount: number; wins: number; winratePct: number | null } {
  const resolvedOrders = acctOrders.filter(
    (o) =>
      o.message.startsWith("[ĐÃ ĐÓNG]") ||
      ((o.positionStage === "TP1_BE" || o.positionStage === "TP2_TRAIL") &&
        o.realizedPnlUsd != null &&
        o.realizedPnlUsd > 0),
  );
  let wins = 0;
  for (const co of resolvedOrders) {
    if (co.realizedPnlUsd != null && Number.isFinite(co.realizedPnlUsd)) {
      if (co.realizedPnlUsd > 0) wins++;
      continue;
    }
    const m = co.message.match(/PnL\s*([+-]?\$?\d+(?:\.\d+)?)/);
    if (m) {
      const val = Number(m[1].replace("$", ""));
      if (val > 0) wins++;
    }
  }
  const closedTradesCount = resolvedOrders.length;
  const winratePct =
    closedTradesCount > 0
      ? Number(((wins / closedTradesCount) * 100).toFixed(1))
      : fallbackWinratePct > 0 && fallbackTotalTrades > 0
        ? Number(fallbackWinratePct.toFixed(1))
        : null;
  return { closedTradesCount, wins, winratePct };
}

export interface PairEmpiricalWinrateModifier {
  symbol: string;
  resolvedCount: number;
  wins: number;
  empiricalWinRatePct: number | null;
  consecutiveLosses: number;
  consecutiveWins: number;
  requireAPlusOnly: boolean;
  winrateScoreBonus: number;
  sizeMultiplier: number;
}

/**
 * Computes real-state empirical winrate & streak feedback for a specific trading pair
 * from recent resolved orders in the database, enabling adaptive per-pair quality gating.
 */
export async function getPairEmpiricalWinrateModifier(
  symbolRaw: string,
): Promise<PairEmpiricalWinrateModifier> {
  const clean = symbolRaw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  try {
    const orders = await listBotExecutionOrders(150);
    const pairResolved = orders
      .filter(
        (o) =>
          o.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "") === clean &&
          (o.message.startsWith("[ĐÃ ĐÓNG]") ||
            ((o.positionStage === "TP1_BE" || o.positionStage === "TP2_TRAIL") &&
              o.realizedPnlUsd != null &&
              o.realizedPnlUsd > 0)),
      )
      .slice(0, 12);

    if (pairResolved.length === 0) {
      return {
        symbol: clean,
        resolvedCount: 0,
        wins: 0,
        empiricalWinRatePct: null,
        consecutiveLosses: 0,
        consecutiveWins: 0,
        requireAPlusOnly: false,
        winrateScoreBonus: 0,
        sizeMultiplier: 1.0,
      };
    }

    let wins = 0;
    let consecutiveLosses = 0;
    let consecutiveWins = 0;
    let streakBroken = false;
    let firstOutcomeIsWin: boolean | null = null;

    for (const o of pairResolved) {
      let isWin = false;
      if (o.realizedPnlUsd != null && Number.isFinite(o.realizedPnlUsd)) {
        isWin = o.realizedPnlUsd > 0;
      } else {
        const m = o.message.match(/PnL\s*([+-]?\$?\d+(?:\.\d+)?)/);
        if (m) isWin = Number(m[1]!.replace("$", "")) > 0;
      }
      if (isWin) wins++;

      if (!streakBroken) {
        if (firstOutcomeIsWin === null) firstOutcomeIsWin = isWin;
        if (isWin === firstOutcomeIsWin) {
          if (isWin) consecutiveWins++;
          else consecutiveLosses++;
        } else {
          streakBroken = true;
        }
      }
    }

    const resolvedCount = pairResolved.length;
    const empiricalWinRatePct = Number(((wins / resolvedCount) * 100).toFixed(1));
    const isColdStreak = consecutiveLosses >= 2 || (resolvedCount >= 3 && empiricalWinRatePct < 55);
    const isHotStreak =
      consecutiveWins >= 2 || (resolvedCount >= 2 && empiricalWinRatePct >= 75 && consecutiveLosses === 0);

    return {
      symbol: clean,
      resolvedCount,
      wins,
      empiricalWinRatePct,
      consecutiveLosses,
      consecutiveWins,
      requireAPlusOnly: isColdStreak,
      winrateScoreBonus: isHotStreak ? 4 : isColdStreak ? -6 : 0,
      sizeMultiplier: isColdStreak ? 0.65 : isHotStreak ? 1.1 : 1.0,
    };
  } catch {
    return {
      symbol: clean,
      resolvedCount: 0,
      wins: 0,
      empiricalWinRatePct: null,
      consecutiveLosses: 0,
      consecutiveWins: 0,
      requireAPlusOnly: false,
      winrateScoreBonus: 0,
      sizeMultiplier: 1.0,
    };
  }
}

export async function closeTrackedBotPosition(params: {
  orderId: string;
  userId?: string | null;
  reasonTag?: string;
  overrideClosePrice?: number;
}): Promise<{
  ok: boolean;
  realizedPnlUsd: number;
  closePrice: number;
  symbol: string;
  accountName: string;
  message: string;
}> {
  const orders = await listBotExecutionOrders(150, params.userId);
  const order = orders.find((o) => o.orderId === params.orderId);
  if (!order) {
    return {
      ok: false,
      realizedPnlUsd: 0,
      closePrice: 0,
      symbol: "",
      accountName: "",
      message: "Không tìm thấy vị thế đang mở trong hệ thống",
    };
  }

  if (params.userId) {
    const owned = await listBrokerConnections(params.userId);
    if (!owned.some((a) => a.id === order.followerId)) {
      return {
        ok: false,
        realizedPnlUsd: 0,
        closePrice: 0,
        symbol: order.symbol,
        accountName: order.followerName,
        message: "Không có quyền đóng vị thế thuộc tài khoản khác",
      };
    }
  }

  const acct = await getBrokerConnectionById(order.followerId);
  if (!acct) {
    return {
      ok: false,
      realizedPnlUsd: 0,
      closePrice: 0,
      symbol: order.symbol,
      accountName: order.followerName,
      message: "Không tìm thấy tài khoản sở hữu vị thế này",
    };
  }

  const assetType: "CRYPTO" | "FOREX" = isCryptoOrderSymbol(order.symbol, acct.platform)
    ? "CRYPTO"
    : "FOREX";
  const entry = order.executionPrice > 0 ? order.executionPrice : order.entryPrice;
  const resolvedPrice =
    params.overrideClosePrice && params.overrideClosePrice > 0
      ? params.overrideClosePrice
      : resolveLiveMarkPrice(order.symbol, assetType, entry).price;
  const closePrice = roundPrice(resolvedPrice, order.symbol, assetType);
  const chunkRealizedPnlUsd = calculateMarkToMarketPnlUsd({
    symbol: order.symbol,
    assetType,
    direction: order.direction,
    entryPrice: entry,
    markPrice: closePrice,
    qtyOrLots: order.copiedLotsOrQty,
  });
  const totalRealizedTradePnl = Number(((order.realizedPnlUsd ?? 0) + chunkRealizedPnlUsd).toFixed(2));

  CLOSED_ORDER_IDS.add(order.orderId);
  const pnlSign = totalRealizedTradePnl >= 0 ? "+" : "";
  const tag = params.reasonTag ? ` [${params.reasonTag}]` : "";
  await saveBotExecutionOrder({
    ...order,
    status: "CANCELLED",
    positionStage: "CLOSED",
    realizedPnlUsd: totalRealizedTradePnl,
    message: `[ĐÃ ĐÓNG]${tag} Chốt phần còn lại tại ${closePrice} · PnL ${pnlSign}$${totalRealizedTradePnl.toFixed(2)}`,
  });

  const nextTotalPnl = Number((acct.totalPnlUsd + chunkRealizedPnlUsd).toFixed(2));
  const nextDailyPnl = Number(((acct.dailyRealizedPnlUsd ?? 0) + chunkRealizedPnlUsd).toFixed(2));
  const nextBalance = Number(Math.max(0, acct.balanceUsd + chunkRealizedPnlUsd).toFixed(2));
  const acctOrdersNow = (await listBotExecutionOrders(150)).filter((o) => o.followerId === acct.id);
  const wrStats = computeAccountWinrateStats(acctOrdersNow, acct.winratePct, acct.totalCopiedTrades);
  await updateBrokerConnectionState(acct.id, {
    balanceUsd: nextBalance,
    totalPnlUsd: nextTotalPnl,
    dailyRealizedPnlUsd: nextDailyPnl,
    dailyPnlDate: new Date().toISOString().slice(0, 10),
    ...(wrStats.winratePct != null ? { winratePct: wrStats.winratePct } : {}),
  });
  recordLiveMetaLabelOutcome({
    assetType,
    isWin: totalRealizedTradePnl > 0,
    realizedR: totalRealizedTradePnl > 0 ? 1.25 : -1.0,
  });

  const chunkSign = chunkRealizedPnlUsd >= 0 ? "+" : "";
  recordBotActivity({
    level: totalRealizedTradePnl >= 0 ? "ok" : "warn",
    category: "CLOSE",
    symbol: order.symbol,
    accountName: acct.name,
    platform: acct.platform,
    message: `Đóng vị thế${tag} ${order.direction} ${order.symbol} @ ${closePrice} (${chunkSign}$${chunkRealizedPnlUsd.toFixed(2)}, tổng ${pnlSign}$${totalRealizedTradePnl.toFixed(2)})`,
  });

  return {
    ok: true,
    realizedPnlUsd: chunkRealizedPnlUsd,
    closePrice,
    symbol: order.symbol,
    accountName: acct.name,
    message: `Đã chốt${tag} ${order.symbol} tại ${closePrice} · Lãi/Lỗ chốt: ${chunkSign}$${chunkRealizedPnlUsd.toFixed(2)} (Tổng kèo: ${pnlSign}$${totalRealizedTradePnl.toFixed(2)})`,
  };
}

/**
 * Resets all DEMO accounts back to clean $10,000 starting NAV, wipes old Demo orders,
 * recalibrates the isolated FOREX & CRYPTO Meta-Labeling models, and triggers an immediate fresh Auto-Trade scan.
 */
export async function resetDemoAccountsAndRestartTrading(
  userId?: string | null,
  initialBalanceUsd = 10_000,
): Promise<{
  ok: boolean;
  resetCount: number;
  clearedOrdersCount: number;
  dispatchedCount: number;
  message: string;
}> {
  const res = await resetDemoBrokerAccounts(userId, initialBalanceUsd);
  CLOSED_ORDER_IDS.clear();
  for (const acc of res.accounts) {
    EXCHANGE_CACHE.delete(acc.id);
  }
  clearLiveTrainedMetaModels();
  try {
    calibrateAndRegisterLiveMetaModels({ assetType: "ALL" });
  } catch {
    /* ignore calibration fallback */
  }

  let dispatchedCount = 0;
  if (!IS_TEST_RUNNER) {
    try {
      const workerMod = await import("@/lib/services/auto-trade-worker");
      const tick = await workerMod.runAutoTradeTick();
      dispatchedCount = tick.dispatched;
    } catch {
      /* ignore immediate tick error */
    }
  }

  const msg = `Đã reset ${res.resetCount} tài khoản DEMO về $${initialBalanceUsd.toLocaleString()} gốc, xóa ${res.clearedOrdersCount} lệnh cũ và khởi động lại Bot Auto-Trade (${dispatchedCount} lệnh mới vừa khớp).`;
  recordBotActivity({
    level: "ok",
    category: "GUARDRAIL",
    message: `🔄 [RESET DEMO] ${msg}`,
  });

  return {
    ok: true,
    resetCount: res.resetCount,
    clearedOrdersCount: res.clearedOrdersCount,
    dispatchedCount,
    message: msg,
  };
}

function roundOrderQuantity(qty: number, assetType: "CRYPTO" | "FOREX"): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return assetType === "FOREX"
    ? Math.round(qty * 100) / 100
    : Number(qty.toFixed(4));
}

async function advancePartialTakeProfitStage(params: {
  order: CopyExecutionOrder;
  assetType: "CRYPTO" | "FOREX";
  entry: number;
  markPrice: number;
  closeQty: number;
  remainQty: number;
  nextSlPrice: number;
  nextStage: "TP1_BE" | "TP2_TRAIL";
  stageLabel: string;
}): Promise<boolean> {
  const { order, assetType, entry, markPrice, closeQty, remainQty, nextSlPrice, nextStage, stageLabel } = params;
  const acct = await getBrokerConnectionById(order.followerId);
  if (!acct) return false;

  const execClosePrice = roundPrice(markPrice, order.symbol, assetType);
  const partialPnlUsd = calculateMarkToMarketPnlUsd({
    symbol: order.symbol,
    assetType,
    direction: order.direction,
    entryPrice: entry,
    markPrice: execClosePrice,
    qtyOrLots: closeQty,
  });
  const cumulativePnlUsd = Number(((order.realizedPnlUsd ?? 0) + partialPnlUsd).toFixed(2));

  let syncedSlOrderId = order.slOrderId ?? null;
  if (acct.hasApiKey && nextSlPrice > 0) {
    const secrets = await getBrokerConnectionSecrets(acct.id);
    if (secrets) {
      const slSync = await updatePlatformExchangeStopLoss(acct.platform, {
        credentials: secrets,
        symbol: order.symbol,
        direction: order.direction,
        previousSlOrderId: order.slOrderId,
        exchangeOrderId: order.exchangeOrderId,
        newStopLossPrice: nextSlPrice,
      });
      if (slSync.ok && slSync.newSlOrderId) {
        syncedSlOrderId = slSync.newSlOrderId;
      }
    }
  }

  const pnlSign = partialPnlUsd >= 0 ? "+" : "";
  await saveBotExecutionOrder({
    ...order,
    copiedLotsOrQty: remainQty,
    initialLotsOrQty: order.initialLotsOrQty ?? order.copiedLotsOrQty,
    stopLossPrice: nextSlPrice,
    slOrderId: syncedSlOrderId,
    positionStage: nextStage,
    realizedPnlUsd: cumulativePnlUsd,
    message: `[${stageLabel}] Chốt ${closeQty} @ ${execClosePrice} (${pnlSign}$${partialPnlUsd.toFixed(2)}) · SL -> ${nextSlPrice} · Còn ${remainQty}`,
  });

  const acctOrdersNow = (await listBotExecutionOrders(150)).filter((o) => o.followerId === acct.id);
  const wrStats = computeAccountWinrateStats(acctOrdersNow, acct.winratePct, acct.totalCopiedTrades);
  await updateBrokerConnectionState(acct.id, {
    balanceUsd: Number(Math.max(0, acct.balanceUsd + partialPnlUsd).toFixed(2)),
    totalPnlUsd: Number((acct.totalPnlUsd + partialPnlUsd).toFixed(2)),
    dailyRealizedPnlUsd: Number(((acct.dailyRealizedPnlUsd ?? 0) + partialPnlUsd).toFixed(2)),
    dailyPnlDate: new Date().toISOString().slice(0, 10),
    ...(wrStats.winratePct != null ? { winratePct: wrStats.winratePct } : {}),
  });
  if (nextStage === "TP1_BE" && partialPnlUsd > 0) {
    recordLiveMetaLabelOutcome({
      assetType,
      isWin: true,
      realizedR: 1.0,
    });
  }

  recordBotActivity({
    level: "ok",
    category: "CLOSE",
    symbol: order.symbol,
    accountName: acct.name,
    platform: acct.platform,
    message: `[${stageLabel}] ${order.direction} ${order.symbol}: Chốt ${closeQty} @ ${execClosePrice} (${pnlSign}$${partialPnlUsd.toFixed(2)}), dời SL -> ${nextSlPrice} (còn ${remainQty})`,
  });

  return true;
}

/**
 * Quản trị vị thế tự động 3 chặng theo thời gian thực:
 * - TP1 (50% + dời SL về Breakeven) -> TP2 (30% + khóa lãi sát TP1) -> TP3 (20% còn lại)
 * - Auto SL Guard, Signal Reversal & Dynamic Trailing Stop chuẩn pip/precision từng lớp tài sản.
 */
export async function evaluateRealtimePositionExits(options?: {
  reversals?: Map<string, "BUY" | "SELL">;
  overrideMarkPrices?: Map<string, number>;
  forceEvaluate?: boolean;
}): Promise<{ closedCount: number; trailedCount: number; partialClosedCount?: number }> {
  if (IS_TEST_RUNNER && !options?.forceEvaluate) {
    return { closedCount: 0, trailedCount: 0, partialClosedCount: 0 };
  }
  const orders = await listBotExecutionOrders(150);
  if (!options?.overrideMarkPrices) {
    await refreshOpenPositionLiveQuotes(orders);
  }

  const openOrders = orders.filter(
    (o) =>
      (o.status === "FILLED_PAPER" || o.status === "FILLED" || o.status === "PENDING_EA") &&
      !CLOSED_ORDER_IDS.has(o.orderId) &&
      o.positionStage !== "CLOSED" &&
      !o.message.startsWith("[ĐÃ ĐÓNG]"),
  );

  let closedCount = 0;
  let trailedCount = 0;
  let partialClosedCount = 0;

  for (const o of openOrders) {
    const assetType: "CRYPTO" | "FOREX" = isCryptoOrderSymbol(o.symbol, o.platform)
      ? "CRYPTO"
      : "FOREX";
    if (assetType === "FOREX" && !evaluateBotTradingTimeline().forexBotActive && !options?.forceEvaluate) {
      continue;
    }
    const entry = o.executionPrice > 0 ? o.executionPrice : o.entryPrice;
    if (!Number.isFinite(entry) || entry <= 0) continue;

    const cleanSym = o.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const overridePx =
      options?.overrideMarkPrices?.get(cleanSym) ??
      options?.overrideMarkPrices?.get(o.symbol);
    const { price: markPrice, isLiveFeed } =
      overridePx != null && overridePx > 0
        ? { price: overridePx, isLiveFeed: true }
        : resolveLiveMarkPrice(o.symbol, assetType, entry);
    if (!isLiveFeed || !Number.isFinite(markPrice) || markPrice <= 0) continue;

    const isBuy = o.direction === "BUY";
    const pip = getAssetPipSize(o.symbol, assetType, markPrice);
    const tp1 = o.takeProfit1;
    const tp2 = o.takeProfit2 ?? 0;
    const tp3 = o.takeProfit3 ?? 0;
    const sl = o.stopLossPrice;
    const stage = o.positionStage ?? "INITIAL";
    const initialQty =
      o.initialLotsOrQty && o.initialLotsOrQty > 0 ? o.initialLotsOrQty : o.copiedLotsOrQty;
    const minViableQty = assetType === "FOREX" ? 0.01 : Math.max(0.0001, initialQty * 0.08);

    // 1) Multi-Tier Take-Profit State Machine (Scenario-Conditioned TP1/TP2/TP3 Scaling)
    const tp1Pct = o.tp1ClosePct && o.tp1ClosePct >= 20 && o.tp1ClosePct <= 80 ? o.tp1ClosePct / 100 : 0.5;
    const tp2Pct = o.tp2ClosePct && o.tp2ClosePct >= 10 && o.tp2ClosePct <= 60 ? o.tp2ClosePct / 100 : 0.3;

    if (stage === "INITIAL" && tp1 > 0 && ((isBuy && markPrice >= tp1) || (!isBuy && markPrice <= tp1))) {
      const hasHigherTp = tp2 > 0 && (isBuy ? tp2 > tp1 : tp2 < tp1);
      const closeQty = roundOrderQuantity(initialQty * tp1Pct, assetType);
      const remainQty = roundOrderQuantity(o.copiedLotsOrQty - closeQty, assetType);

      if (hasHigherTp && closeQty > 0 && remainQty >= minViableQty) {
        const beBuffer = Math.max(pip * 1.5, entry * (assetType === "CRYPTO" ? 0.001 : 0.00015));
        const rawBeSl = isBuy ? entry + beBuffer : entry - beBuffer;
        const safeBeSl = roundPrice(
          isBuy ? Math.min(rawBeSl, markPrice - pip * 2) : Math.max(rawBeSl, markPrice + pip * 2),
          o.symbol,
          assetType,
        );
        const nextSl = sl > 0
          ? isBuy ? Math.max(sl, safeBeSl) : Math.min(sl, safeBeSl)
          : safeBeSl;

        const advanced = await advancePartialTakeProfitStage({
          order: o,
          assetType,
          entry,
          markPrice,
          closeQty,
          remainQty,
          nextSlPrice: nextSl,
          nextStage: "TP1_BE",
          stageLabel: "TP1 50% + BE",
        });
        if (advanced) {
          partialClosedCount++;
          trailedCount++;
          continue;
        }
      }

      const res = await closeTrackedBotPosition({
        orderId: o.orderId,
        reasonTag: "AUTO TP1",
        overrideClosePrice: markPrice,
      });
      if (res.ok) closedCount++;
      continue;
    }

    if (
      stage === "TP1_BE" &&
      tp2 > 0 &&
      ((isBuy && markPrice >= tp2) || (!isBuy && markPrice <= tp2))
    ) {
      const hasTp3 = tp3 > 0 && (isBuy ? tp3 > tp2 : tp3 < tp2);
      const closeQty = roundOrderQuantity(initialQty * tp2Pct, assetType);
      const remainQty = roundOrderQuantity(o.copiedLotsOrQty - closeQty, assetType);

      if (hasTp3 && closeQty > 0 && remainQty >= minViableQty) {
        const lockRef = tp1 > 0 ? entry + (tp1 - entry) * 0.65 : entry + (tp2 - entry) * 0.45;
        const lockSl = roundPrice(lockRef, o.symbol, assetType);
        const nextSl = sl > 0
          ? isBuy ? Math.max(sl, lockSl) : Math.min(sl, lockSl)
          : lockSl;

        const advanced = await advancePartialTakeProfitStage({
          order: o,
          assetType,
          entry,
          markPrice,
          closeQty,
          remainQty,
          nextSlPrice: nextSl,
          nextStage: "TP2_TRAIL",
          stageLabel: "TP2 30% + LOCK",
        });
        if (advanced) {
          partialClosedCount++;
          trailedCount++;
          continue;
        }
      }

      const res = await closeTrackedBotPosition({
        orderId: o.orderId,
        reasonTag: "AUTO TP2",
        overrideClosePrice: markPrice,
      });
      if (res.ok) closedCount++;
      continue;
    }

    if (
      (stage === "TP2_TRAIL" || (stage === "TP1_BE" && tp2 <= 0)) &&
      tp3 > 0 &&
      ((isBuy && markPrice >= tp3) || (!isBuy && markPrice <= tp3))
    ) {
      const res = await closeTrackedBotPosition({
        orderId: o.orderId,
        reasonTag: "AUTO TP3",
        overrideClosePrice: markPrice,
      });
      if (res.ok) closedCount++;
      continue;
    }

    // 2) Auto Stop-Loss / Breakeven Lock / Trailing Stop Hit (with cross-feed basis spike sanity guard on newly opened orders)
    if (sl > 0 && ((isBuy && markPrice <= sl) || (!isBuy && markPrice >= sl))) {
      const stopDist = Math.abs(entry - sl);
      const jumpDist = Math.abs(markPrice - entry);
      const ageMs = Date.now() - o.timestamp;
      if (ageMs < 60_000 && stopDist > 0 && jumpDist > stopDist * 1.45 && !options?.forceEvaluate) {
        // Cross-provider basis discrepancy detected within 60s of entry -> ignore phantom price jump
        continue;
      }
      const isProfitSl = (isBuy && sl >= entry) || (!isBuy && sl <= entry);
      const res = await closeTrackedBotPosition({
        orderId: o.orderId,
        reasonTag: isProfitSl ? "TRAILING PROFIT LOCK" : "AUTO SL GUARD",
        overrideClosePrice: markPrice,
      });
      if (res.ok) closedCount++;
      continue;
    }

    // 3) Opposite High-Conviction Quant Signal Reversal Exit & In-Flight Profit Protection
    const reversalDir = options?.reversals?.get(cleanSym);
    if (reversalDir && reversalDir !== o.direction) {
      const holdMs = Date.now() - o.timestamp;
      if (stage === "INITIAL" && holdMs >= 300_000) {
        const res = await closeTrackedBotPosition({
          orderId: o.orderId,
          reasonTag: `QUANT REVERSAL -> ${reversalDir}`,
          overrideClosePrice: markPrice,
        });
        if (res.ok) closedCount++;
        continue;
      }
      // Phase 4 In-Flight Scenario Shift Tightening: if position is in profit (>= 25% of TP1) when opposite A+ signal appears, lock 65% of open profit immediately
      const targetDistRev = tp1 > 0 ? Math.abs(tp1 - entry) : 0;
      const favMoveRev = isBuy ? markPrice - entry : entry - markPrice;
      if (targetDistRev > pip * 3 && favMoveRev >= targetDistRev * 0.25) {
        const tightSl = roundPrice(
          isBuy ? entry + favMoveRev * 0.65 : entry - favMoveRev * 0.65,
          o.symbol,
          assetType,
        );
        const betterSl = isBuy ? tightSl > sl + pip : tightSl < sl - pip;
        if (betterSl) {
          await saveBotExecutionOrder({ ...o, stopLossPrice: tightSl });
          trailedCount++;
          continue;
        }
      }
    }

    // 4) Dynamic Breakeven, Early +0.35R/+0.48R Fee-Lock Shield & Phase 4 Time-Decay Stagnation Shield (45m Half-Life)
    const activeTarget =
      stage === "TP2_TRAIL" && tp3 > 0
        ? tp3
        : stage === "TP1_BE" && tp2 > 0
          ? tp2
          : tp1;
    if (activeTarget > 0 && sl > 0) {
      const targetDist = Math.abs(activeTarget - entry);
      const stopDistInit = Math.abs(entry - sl);
      const favorableMove = isBuy ? markPrice - entry : entry - markPrice;
      const holdDurationMs = Date.now() - o.timestamp;
      const isStagnant45m =
        stage === "INITIAL" &&
        holdDurationMs >= 45 * 60_000 &&
        favorableMove >= pip * 2 &&
        favorableMove < targetDist * 0.40;

      // Early Loss-Halving at +0.40x TP1 distance: tighten initial SL by 48% only when trade has genuinely progressed
      if (
        stage === "INITIAL" &&
        targetDist > pip * 3 &&
        favorableMove >= targetDist * 0.40 &&
        favorableMove < targetDist * 0.55 &&
        ((isBuy && sl < entry) || (!isBuy && sl > entry))
      ) {
        const halfLossSl = roundPrice(
          isBuy ? entry - stopDistInit * 0.48 : entry + stopDistInit * 0.48,
          o.symbol,
          assetType,
        );
        const improvedHalf = isBuy ? halfLossSl > sl + pip * 2 : halfLossSl < sl - pip * 2;
        if (improvedHalf) {
          await saveBotExecutionOrder({ ...o, stopLossPrice: halfLossSl });
          trailedCount++;
          continue;
        }
      }

      // Noise-Buffered Breakeven Guard: Wait until >= 55% of TP1 distance before locking Breakeven,
      // with a minimum noise buffer to avoid whipsawing out positions on micro-spread flickers
      if (targetDist > pip * 3 && (favorableMove >= targetDist * 0.55 || isStagnant45m)) {
        const minBeBuffer = Math.max(pip * 2.5, entry * (assetType === "CRYPTO" ? 0.0006 : 0.00015));
        const lockDist =
          favorableMove >= targetDist * 0.80
            ? favorableMove * 0.72
            : favorableMove >= targetDist * 0.65
              ? favorableMove * 0.52
              : favorableMove >= targetDist * 0.55
                ? Math.max(minBeBuffer, targetDist * 0.16)
                : isStagnant45m
                  ? Math.max(pip * 1.5, favorableMove * 0.5)
                  : minBeBuffer;
        const candidateSl = roundPrice(
          isBuy ? entry + lockDist : entry - lockDist,
          o.symbol,
          assetType,
        );
        // Verify breath space: candidate SL must not choke current live mark price directly
        const hasBreathSpace = isBuy ? markPrice > candidateSl + pip * 2 : markPrice < candidateSl - pip * 2;
        const improved = (isBuy ? candidateSl > sl + pip * 2 : candidateSl < sl - pip * 2) && hasBreathSpace;
        if (improved) {
          let syncedSlOrderId = o.slOrderId ?? null;
          const acct = await getBrokerConnectionById(o.followerId);
          if (acct?.hasApiKey) {
            const secrets = await getBrokerConnectionSecrets(acct.id);
            if (secrets) {
              const slSync = await updatePlatformExchangeStopLoss(acct.platform, {
                credentials: secrets,
                symbol: o.symbol,
                direction: o.direction,
                previousSlOrderId: o.slOrderId,
                exchangeOrderId: o.exchangeOrderId,
                newStopLossPrice: candidateSl,
              });
              if (slSync.ok && slSync.newSlOrderId) {
                syncedSlOrderId = slSync.newSlOrderId;
              }
            }
          }
          await saveBotExecutionOrder({
            ...o,
            stopLossPrice: candidateSl,
            slOrderId: syncedSlOrderId,
          });
          trailedCount++;
          recordBotActivity({
            level: "info",
            category: "GUARDRAIL",
            symbol: o.symbol,
            accountName: o.followerName,
            platform: o.platform,
            message: `[TRAILING SL] Dịch Stop-Loss ${o.direction} ${o.symbol} lên ${candidateSl} (khóa lãi an toàn @ Mark ${markPrice})`,
          });
        }
      }
    }
  }

  return { closedCount, trailedCount, partialClosedCount };
}

export async function buildBotLiveTelemetrySnapshot(
  userId?: string | null,
): Promise<BotLiveTelemetrySnapshot> {
  if (!IS_TEST_RUNNER) {
    ensureBinanceWsStarted();
    ensureBiquoteCoreWatch();
    const wStatus = getAutoTradeWorkerStatus();
    if (!wStatus.started || (wStatus.lastTickAt === null && !wStatus.isTickRunning)) {
      import("@/lib/services/auto-trade-worker")
        .then((m) => m.initAutoTradeWorker())
        .catch(() => null);
    }
    await evaluateRealtimePositionExits().catch(() => null);
  }
  const now = Date.now();
  const [accounts, orders] = await Promise.all([
    listBrokerConnections(userId),
    listBotExecutionOrders(150, userId),
  ]);
  await refreshOpenPositionLiveQuotes(orders);

  const ordersByAccount = new Map<string, CopyExecutionOrder[]>();
  for (const o of orders) {
    const arr = ordersByAccount.get(o.followerId) ?? [];
    arr.push(o);
    ordersByAccount.set(o.followerId, arr);
  }

  // Fetch real exchange/broker telemetry concurrently for API-connected accounts
  const liveTelemetryList = await Promise.all(
    accounts.map((a) => fetchAccountExchangeTelemetryCached(a).catch(() => null)),
  );

  const accountTelemetries: AccountPnlTelemetry[] = [];
  const allOpenPositions: LiveOpenPosition[] = [];

  for (let i = 0; i < accounts.length; i++) {
    const acct = accounts[i]!;
    const live = liveTelemetryList[i];
    const acctOrders = ordersByAccount.get(acct.id) ?? [];
    const { accountTier: tier, environment, demoSubtype } = classifyAccountEnvironment(acct);

    // Closed & TP1/TP2 profit-locked stats from tracked history (truth-in-data: null winrate if 0 resolved trades)
    const { closedTradesCount, wins, winratePct } = computeAccountWinrateStats(
      acctOrders,
      acct.winratePct,
      acct.totalCopiedTrades,
    );

    let walletBalanceUsd = acct.balanceUsd;
    let equityUsd = acct.balanceUsd;
    let availableMarginUsd = acct.balanceUsd;
    let unrealizedPnlUsd = 0;
    let pnlSource: AccountPnlTelemetry["pnlSource"] = "MARK_TO_MARKET_LIVE";
    let syncError: string | null = acct.lastError ?? null;
    let lastSyncedAt = acct.lastVerifiedAt ?? now;
    let acctPositions: LiveOpenPosition[] = [];

    if (live && live.ok) {
      pnlSource =
        acct.platform === "BINANCE_FUTURES" || acct.platform === "OKX_FUTURES"
          ? "EXCHANGE_API_LIVE"
          : "METAAPI_CLOUD_LIVE";
      walletBalanceUsd = live.walletBalanceUsd ?? acct.balanceUsd;
      unrealizedPnlUsd = live.unrealizedPnlUsd;
      equityUsd = live.equityUsd ?? Number((walletBalanceUsd + unrealizedPnlUsd).toFixed(2));
      availableMarginUsd = live.availableMarginUsd ?? walletBalanceUsd;
      lastSyncedAt = live.fetchedAt;
      syncError = null;
      acctPositions = live.openPositions.map((p) => ({
        ...p,
        accountId: acct.id,
        accountName: acct.name,
        platform: acct.platform,
        accountTier: tier,
        environment,
        source: pnlSource === "METAAPI_CLOUD_LIVE" ? "METAAPI_CLOUD" : "EXCHANGE_LIVE",
        canCloseInApp: false,
      }));
    } else {
      if (live && !live.ok && live.error) {
        syncError = live.error;
      }
      acctPositions = buildLocalOpenPositions(acct, acctOrders);
      unrealizedPnlUsd = Number(
        acctPositions.reduce((sum, p) => sum + p.unrealizedPnlUsd, 0).toFixed(2),
      );
      equityUsd = Number((walletBalanceUsd + unrealizedPnlUsd).toFixed(2));
      availableMarginUsd =
        acctPositions.length === 0
          ? equityUsd
          : Math.max(0, Number((equityUsd * 0.9).toFixed(2)));
      if (
        (acct.platform === "MT5_EXNESS" || acct.platform === "MT5_XM" || acct.platform === "MT5_EA") &&
        acct.hasEaToken &&
        !acct.hasApiKey
      ) {
        pnlSource = "EA_REPORTED";
      }
    }

    const realizedPnlUsd = Number((acct.totalPnlUsd ?? 0).toFixed(2));
    const dailyRealizedPnlUsd = Number((acct.dailyRealizedPnlUsd ?? 0).toFixed(2));
    const totalNetPnlUsd = Number((realizedPnlUsd + unrealizedPnlUsd).toFixed(2));
    const startingCapitalUsd = Math.max(
      1,
      Number((walletBalanceUsd - realizedPnlUsd > 0 ? walletBalanceUsd - realizedPnlUsd : walletBalanceUsd).toFixed(2)),
    );
    const navUsd = Number(equityUsd.toFixed(2));
    const availableMarginRounded = Number(Math.max(0, availableMarginUsd).toFixed(2));
    const marginUsedUsd = Number(Math.max(0, navUsd - availableMarginRounded).toFixed(2));
    const marginUtilizationPct =
      navUsd > 0 ? Number(Math.min(100, (marginUsedUsd / navUsd) * 100).toFixed(1)) : 0;
    const totalRoiPct = calculateAccountRoiPct(totalNetPnlUsd, startingCapitalUsd);
    const dailyRoiPct = calculateAccountRoiPct(
      dailyRealizedPnlUsd + unrealizedPnlUsd,
      Math.max(1, walletBalanceUsd),
    );
    const maxDailyLossUsd = Math.max(10, acct.maxDailyLossUsd ?? 500);
    const dailyLossAmount = Math.max(0, -(dailyRealizedPnlUsd + Math.min(0, unrealizedPnlUsd)));
    const dailyLossUsedPct = Number(Math.min(100, (dailyLossAmount / maxDailyLossUsd) * 100).toFixed(1));
    const timelineCheck = isAccountPausedByTimeline(acct.platform, now);

    accountTelemetries.push({
      accountId: acct.id,
      name: acct.name,
      platform: acct.platform,
      accountNumberMasked: acct.accountNumberMasked,
      accountTier: tier,
      environment,
      demoSubtype,
      isTestnet: acct.isTestnet !== false,
      isActive: acct.isActive,
      autoExecuteEnabled: Boolean(acct.autoExecuteEnabled),
      killSwitched: Boolean(acct.killSwitched),
      timelinePaused: timelineCheck.paused,
      timelinePauseReason: timelineCheck.reasonVi,
      connectionStatus: acct.connectionStatus ?? "PAPER_SIMULATED",
      pnlSource,
      initialNavUsd: startingCapitalUsd,
      startingCapitalUsd,
      walletBalanceUsd: Number(walletBalanceUsd.toFixed(2)),
      navUsd,
      realNavUsd: environment === "REAL" ? navUsd : 0,
      demoNavUsd: environment === "DEMO" ? navUsd : 0,
      navChangeUsd: totalNetPnlUsd,
      navChangePct: totalRoiPct,
      navShareInPoolPct: 0,
      equityUsd: navUsd,
      availableMarginUsd: availableMarginRounded,
      marginUsedUsd,
      marginUtilizationPct,
      unrealizedPnlUsd: Number(unrealizedPnlUsd.toFixed(2)),
      realizedPnlUsd,
      dailyRealizedPnlUsd,
      totalNetPnlUsd,
      totalRoiPct,
      dailyRoiPct,
      maxDailyLossUsd,
      dailyLossUsedPct,
      openPositionsCount: acctPositions.length,
      totalTrades: acct.totalCopiedTrades,
      closedTradesCount,
      winningTradesCount: wins,
      winratePct,
      lastSyncedAt,
      syncError,
    });

    allOpenPositions.push(...acctPositions);
  }

  const withShares = assignPoolNavShares(accountTelemetries);
  const realAccounts = withShares.filter((a) => a.environment === "REAL");
  const demoAccounts = withShares.filter((a) => a.environment === "DEMO");
  const realNav = aggregateTierSummary(realAccounts, "REAL");
  const demoNav = aggregateTierSummary(demoAccounts, "DEMO");
  const w = getAutoTradeWorkerStatus();
  const timeline = evaluateBotTradingTimeline(now);

  return {
    generatedAt: now,
    streamIntervalMs: 2_500,
    summary: aggregateTierSummary(withShares),
    realNav,
    demoNav,
    liveRealSummary: realNav,
    demoSummary: demoNav,
    realAccounts,
    demoAccounts,
    accounts: withShares,
    openPositions: allOpenPositions.sort((a, b) => b.openedAt - a.openedAt),
    recentEvents: ACTIVITY_RING.slice(0, 25),
    worker: {
      ...w,
      nextTickAt: w.started && w.lastTickAt ? w.lastTickAt + w.pollIntervalMs : null,
    },
    quantFeed: getLiveQuantEngineFeed(),
    timeline,
  };
}
