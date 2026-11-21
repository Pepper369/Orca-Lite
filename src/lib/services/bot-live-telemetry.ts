import "server-only";
import { randomUUID } from "node:crypto";
import { eventBus } from "@/lib/events";
import { binanceWs, ensureBinanceWsStarted } from "@/lib/realtime/binance-ws";
import {
  ensureBiquotePollStarted,
  getBiquoteLiveTick,
  watchBiquoteSymbol,
} from "@/lib/realtime/biquote-poll";
import type { BrokerPlatform, CopyExecutionOrder, FollowerAccount } from "@/lib/engines/copy-trade-engine";
import {
  fetchBinanceFuturesTelemetry,
  fetchMetaApiMt5Telemetry,
  fetchOkxTelemetry,
  type LiveExchangeTelemetryResult,
} from "@/lib/engines/exchange-execution-client";
import {
  aggregateTierSummary,
  calculateAccountRoiPct,
  calculateMarkToMarketPnlUsd,
  calculatePositionRoePct,
  classifyAccountTier,
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
  saveBotExecutionOrder,
  updateBrokerConnectionState,
} from "@/lib/services/broker-vault-store";
import { getAutoTradeWorkerStatus } from "@/lib/services/auto-trade-worker";

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
};

const ACTIVITY_RING = g.__orcaBotActivityRing ?? (g.__orcaBotActivityRing = []);
const EXCHANGE_CACHE =
  g.__orcaExchangeTelemetryCache ?? (g.__orcaExchangeTelemetryCache = new Map());
const CLOSED_ORDER_IDS =
  g.__orcaClosedOrderIds ?? (g.__orcaClosedOrderIds = new Set());

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
  if (platform === "BINANCE_FUTURES" || platform === "OKX_FUTURES" || platform === "BYBIT_FUTURES") {
    return true;
  }
  const u = symbol.toUpperCase();
  return u.endsWith("USDT") || u.endsWith("USDC") || u.includes("BTC") || u.includes("ETH");
}

const IS_TEST_RUNNER =
  process.argv.includes("--test") ||
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
    if (mark && mark.markPrice > 0) return { price: mark.markPrice, isLiveFeed: true };
    const tick = binanceWs.getTicker(clean, 30_000);
    if (tick && tick.price > 0) return { price: tick.price, isLiveFeed: true };
    return { price: fallbackPrice, isLiveFeed: false };
  }

  if (!IS_TEST_RUNNER) {
    ensureBiquotePollStarted();
    watchBiquoteSymbol(clean);
  }
  const fxTick = getBiquoteLiveTick(clean);
  if (fxTick && fxTick.price > 0) {
    return { price: fxTick.price, isLiveFeed: true };
  }
  return { price: fallbackPrice, isLiveFeed: false };
}

async function fetchAccountExchangeTelemetryCached(
  acct: FollowerAccount,
): Promise<LiveExchangeTelemetryResult | null> {
  if (!acct.hasApiKey) return null;
  const isSupported =
    acct.platform === "BINANCE_FUTURES" ||
    acct.platform === "OKX_FUTURES" ||
    acct.platform === "MT5_EXNESS" ||
    acct.platform === "MT5_XM" ||
    acct.platform === "MT5_EA";
  if (!isSupported) return null;

  const cached = EXCHANGE_CACHE.get(acct.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const secrets = await getBrokerConnectionSecrets(acct.id);
  if (!secrets) return null;

  const res =
    acct.platform === "BINANCE_FUTURES"
      ? await fetchBinanceFuturesTelemetry(secrets)
      : acct.platform === "OKX_FUTURES"
        ? await fetchOkxTelemetry(secrets)
        : await fetchMetaApiMt5Telemetry(secrets);

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
  const tier = classifyAccountTier(acct);
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
    const entry = o.executionPrice > 0 ? o.executionPrice : o.entryPrice;
    const { price: markPrice } = resolveLiveMarkPrice(o.symbol, assetType, entry);
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
      symbol: o.symbol,
      assetType,
      direction: o.direction,
      qtyOrLots: o.copiedLotsOrQty,
      leverage,
      entryPrice: entry,
      markPrice,
      stopLossPrice: o.stopLossPrice > 0 ? o.stopLossPrice : null,
      takeProfit1: o.takeProfit1 > 0 ? o.takeProfit1 : null,
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

export async function closeTrackedBotPosition(params: {
  orderId: string;
  userId?: string | null;
}): Promise<{
  ok: boolean;
  realizedPnlUsd: number;
  closePrice: number;
  symbol: string;
  accountName: string;
  message: string;
}> {
  const orders = await listBotExecutionOrders(150);
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
  const { price: closePrice } = resolveLiveMarkPrice(order.symbol, assetType, entry);
  const realizedPnlUsd = calculateMarkToMarketPnlUsd({
    symbol: order.symbol,
    assetType,
    direction: order.direction,
    entryPrice: entry,
    markPrice: closePrice,
    qtyOrLots: order.copiedLotsOrQty,
  });

  CLOSED_ORDER_IDS.add(order.orderId);
  const pnlSign = realizedPnlUsd >= 0 ? "+" : "";
  await saveBotExecutionOrder({
    ...order,
    status: "CANCELLED",
    message: `[ĐÃ ĐÓNG] Chốt tại ${closePrice} · PnL ${pnlSign}$${realizedPnlUsd.toFixed(2)}`,
  });

  const nextTotalPnl = Number((acct.totalPnlUsd + realizedPnlUsd).toFixed(2));
  const nextDailyPnl = Number(((acct.dailyRealizedPnlUsd ?? 0) + realizedPnlUsd).toFixed(2));
  const nextBalance = Number(Math.max(0, acct.balanceUsd + realizedPnlUsd).toFixed(2));
  await updateBrokerConnectionState(acct.id, {
    balanceUsd: nextBalance,
    totalPnlUsd: nextTotalPnl,
    dailyRealizedPnlUsd: nextDailyPnl,
    dailyPnlDate: new Date().toISOString().slice(0, 10),
  });

  recordBotActivity({
    level: realizedPnlUsd >= 0 ? "ok" : "warn",
    category: "CLOSE",
    symbol: order.symbol,
    accountName: acct.name,
    platform: acct.platform,
    message: `Đóng vị thế ${order.direction} ${order.symbol} @ ${closePrice} (${pnlSign}$${realizedPnlUsd.toFixed(2)})`,
  });

  return {
    ok: true,
    realizedPnlUsd,
    closePrice,
    symbol: order.symbol,
    accountName: acct.name,
    message: `Đã chốt ${order.symbol} tại ${closePrice} · Lãi/Lỗ thực hiện: ${pnlSign}$${realizedPnlUsd.toFixed(2)}`,
  };
}

export async function buildBotLiveTelemetrySnapshot(
  userId?: string | null,
): Promise<BotLiveTelemetrySnapshot> {
  const now = Date.now();
  const [accounts, orders] = await Promise.all([
    listBrokerConnections(userId),
    listBotExecutionOrders(150),
  ]);

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
    const tier = classifyAccountTier(acct);

    // Closed PnL stats from tracked history (truth-in-data: null winrate if 0 closed trades)
    const closedOrders = acctOrders.filter((o) => o.message.startsWith("[ĐÃ ĐÓNG]"));
    let wins = 0;
    for (const co of closedOrders) {
      const m = co.message.match(/PnL\s*([+-]?\$?\d+(?:\.\d+)?)/);
      if (m) {
        const val = Number(m[1].replace("$", ""));
        if (val > 0) wins++;
      }
    }

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
      availableMarginUsd = Math.max(0, Number((equityUsd * 0.9).toFixed(2)));
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
    const totalRoiPct = calculateAccountRoiPct(totalNetPnlUsd, startingCapitalUsd);
    const dailyRoiPct = calculateAccountRoiPct(
      dailyRealizedPnlUsd + unrealizedPnlUsd,
      Math.max(1, walletBalanceUsd),
    );
    const maxDailyLossUsd = Math.max(10, acct.maxDailyLossUsd ?? 500);
    const dailyLossAmount = Math.max(0, -(dailyRealizedPnlUsd + Math.min(0, unrealizedPnlUsd)));
    const dailyLossUsedPct = Number(Math.min(100, (dailyLossAmount / maxDailyLossUsd) * 100).toFixed(1));

    const closedTradesCount = closedOrders.length;
    const winratePct =
      closedTradesCount > 0
        ? Number(((wins / closedTradesCount) * 100).toFixed(1))
        : acct.winratePct > 0 && acct.totalCopiedTrades > 0
          ? Number(acct.winratePct.toFixed(1))
          : null;

    accountTelemetries.push({
      accountId: acct.id,
      name: acct.name,
      platform: acct.platform,
      accountNumberMasked: acct.accountNumberMasked,
      accountTier: tier,
      isTestnet: acct.isTestnet !== false,
      isActive: acct.isActive,
      autoExecuteEnabled: Boolean(acct.autoExecuteEnabled),
      killSwitched: Boolean(acct.killSwitched),
      connectionStatus: acct.connectionStatus ?? "PAPER_SIMULATED",
      pnlSource,
      startingCapitalUsd,
      walletBalanceUsd: Number(walletBalanceUsd.toFixed(2)),
      equityUsd: Number(equityUsd.toFixed(2)),
      availableMarginUsd: Number(availableMarginUsd.toFixed(2)),
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

  const liveRealAccounts = accountTelemetries.filter((a) => a.accountTier === "LIVE_REAL");
  const demoAccounts = accountTelemetries.filter((a) => a.accountTier !== "LIVE_REAL");
  const w = getAutoTradeWorkerStatus();

  return {
    generatedAt: now,
    streamIntervalMs: 2_500,
    summary: aggregateTierSummary(accountTelemetries),
    liveRealSummary: aggregateTierSummary(liveRealAccounts),
    demoSummary: aggregateTierSummary(demoAccounts),
    accounts: accountTelemetries,
    openPositions: allOpenPositions.sort((a, b) => b.openedAt - a.openedAt),
    recentEvents: ACTIVITY_RING.slice(0, 25),
    worker: {
      ...w,
      nextTickAt: w.started && w.lastTickAt ? w.lastTickAt + w.pollIntervalMs : null,
    },
  };
}
