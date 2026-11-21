import "server-only";
import { randomUUID } from "node:crypto";
import { getAssetPipSize } from "@/lib/engines/asset-precision";
import {
  calculateProportionalCopySize,
  verifySlippageGuard,
  type CopyExecutionOrder,
  type FollowerAccount,
} from "@/lib/engines/copy-trade-engine";
import { calculateCryptoPositionSize } from "@/lib/engines/crypto-position-sizer";
import {
  placeBinanceFuturesOrder,
  placeMetaApiMt5Order,
  placeOkxSwapOrder,
} from "@/lib/engines/exchange-execution-client";
import type { SetupGrade } from "@/lib/engines/fx-crypto-precision-engine";
import {
  getBrokerConnectionSecrets,
  hasExecutionOrderByIdempotency,
  listBotExecutionOrders,
  listBrokerConnections,
  recordVaultAuditLog,
  saveBotExecutionOrder,
  updateBrokerConnectionState,
} from "@/lib/services/broker-vault-store";
import {
  classifyAccountEnvironment,
  type AccountEnvironment,
} from "@/lib/engines/bot-telemetry-types";
import { recordBotActivity } from "@/lib/services/bot-live-telemetry";

export interface DispatchableSignalInput {
  id: string;
  symbol: string;
  assetType: "FOREX" | "CRYPTO";
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1: number;
  takeProfit2?: number;
  takeProfit3?: number;
  masterLotsOrQty: number;
  masterCapitalUsd: number;
  winrateScore: number;
  setupGrade?: SetupGrade;
  recommendedLeverage?: number;
  timestamp: number;
}

export interface VaultDispatchOptions {
  signal: DispatchableSignalInput;
  currentMarketPrice?: number;
  manualOverride?: boolean;
  userId?: string | null;
  targetFollowerIds?: string[];
  /** Tách luồng đẩy lệnh theo môi trường NAV: chỉ đẩy vào tài khoản REAL, chỉ DEMO, hoặc ALL. */
  targetEnvironment?: AccountEnvironment | "ALL";
  /** Inject accounts in tests without touching global store if desired. */
  overrideAccounts?: FollowerAccount[];
  /** Override real exchange network execution in unit tests. */
  orderExecutor?: typeof executePlatformOrder;
}

const INFLIGHT_IDEMPOTENCY_LOCKS = new Set<string>();

function isCryptoSupportedPlatform(platform: FollowerAccount["platform"]): boolean {
  return (
    platform === "BINANCE_FUTURES" ||
    platform === "OKX_FUTURES" ||
    platform === "BYBIT_FUTURES" ||
    platform === "TELEGRAM_1CLICK"
  );
}

function isForexSupportedPlatform(platform: FollowerAccount["platform"]): boolean {
  return (
    platform === "MT5_EXNESS" ||
    platform === "MT5_XM" ||
    platform === "MT5_EA" ||
    platform === "TELEGRAM_1CLICK"
  );
}

function checkSlippage(
  signal: DispatchableSignalInput,
  marketPrice: number,
  maxAllowedSlippagePips: number,
): { passed: boolean; slippagePips: number } {
  if (signal.assetType === "CRYPTO") {
    const pctDiff = Math.abs(marketPrice - signal.entryPrice) / Math.max(1e-9, signal.entryPrice);
    const maxPct = Math.max(0.0025, maxAllowedSlippagePips * 0.001); // 2 pips -> 0.25% min buffer cho Crypto
    return {
      passed: pctDiff <= maxPct,
      slippagePips: Number((pctDiff * 100).toFixed(3)),
    };
  }
  const guard = verifySlippageGuard({
    masterEntry: signal.entryPrice,
    currentPrice: marketPrice,
    maxSlippagePips: maxAllowedSlippagePips,
    pipSize: getAssetPipSize(signal.symbol, signal.assetType, marketPrice),
  });
  return { passed: guard.allowed, slippagePips: guard.slippagePips };
}

function computeOrderSize(signal: DispatchableSignalInput, acct: FollowerAccount): { qtyOrLots: number; leverage: number } {
  const levCap = Math.max(1, Math.min(20, acct.leverageCap ?? 5));
  const leverage = Math.max(1, Math.min(levCap, Math.round(signal.recommendedLeverage ?? 3)));

  if (signal.assetType === "CRYPTO") {
    const riskPct = Math.max(0.25, Math.min(3.0, 1.0 * acct.riskMultiplier));
    const sizing = calculateCryptoPositionSize({
      accountBalance: acct.balanceUsd,
      riskPercent: riskPct,
      entryPrice: signal.entryPrice,
      stopLossPrice: signal.stopLossPrice,
      leverage,
      direction: signal.direction,
    });
    const qty = sizing.positionQty > 0
      ? sizing.positionQty
      : Number(
          Math.max(
            0.001,
            signal.masterLotsOrQty * (acct.balanceUsd / Math.max(100, signal.masterCapitalUsd)) * acct.riskMultiplier,
          ).toFixed(4),
        );
    return { qtyOrLots: qty, leverage };
  }

  const lots = calculateProportionalCopySize({
    masterLotsOrQty: signal.masterLotsOrQty,
    masterCapitalUsd: signal.masterCapitalUsd,
    followerBalanceUsd: acct.balanceUsd,
    riskMultiplier: acct.riskMultiplier,
    assetType: "FOREX",
  });
  return { qtyOrLots: lots, leverage: 1 };
}

export async function executePlatformOrder(
  acct: FollowerAccount,
  signal: DispatchableSignalInput,
  qtyOrLots: number,
  leverage: number,
  marketPrice: number,
  slippagePips: number,
  idempotencyKey: string,
): Promise<CopyExecutionOrder> {
  const orderId = `ord_${randomUUID().slice(0, 12)}`;
  const now = Date.now();
  const baseOrder: Omit<CopyExecutionOrder, "status" | "message"> = {
    orderId,
    followerId: acct.id,
    followerName: acct.name,
    platform: acct.platform,
    symbol: signal.symbol,
    direction: signal.direction,
    copiedLotsOrQty: qtyOrLots,
    initialLotsOrQty: qtyOrLots,
    entryPrice: signal.entryPrice,
    executionPrice: marketPrice,
    slippagePips,
    stopLossPrice: signal.stopLossPrice,
    takeProfit1: signal.takeProfit1,
    takeProfit2: signal.takeProfit2 ?? null,
    takeProfit3: signal.takeProfit3 ?? null,
    positionStage: "INITIAL",
    realizedPnlUsd: 0,
    timestamp: now,
    signalId: signal.id,
    idempotencyKey,
    isTestnet: acct.isTestnet ?? true,
  };

  if (acct.platform === "MT5_EXNESS" || acct.platform === "MT5_XM" || acct.platform === "MT5_EA") {
    if (acct.hasApiKey) {
      const secrets = await getBrokerConnectionSecrets(acct.id);
      if (!secrets) {
        return {
          ...baseOrder,
          status: "REJECTED_EXCHANGE",
          message: `Không tìm thấy khóa MetaApi giải mã cho tài khoản ${acct.name}`,
        };
      }
      const res = await placeMetaApiMt5Order(
        {
          credentials: secrets,
          symbol: signal.symbol,
          direction: signal.direction,
          baseQty: qtyOrLots,
          entryPrice: marketPrice,
          stopLossPrice: signal.stopLossPrice,
          takeProfit1: signal.takeProfit1,
          takeProfit2: signal.takeProfit2 ?? null,
          takeProfit3: signal.takeProfit3 ?? null,
          leverage,
          idempotencyKey,
        },
        acct.platform,
      );
      const actualQty = res.executedQty > 0 ? res.executedQty : qtyOrLots;
      return {
        ...baseOrder,
        copiedLotsOrQty: actualQty,
        initialLotsOrQty: actualQty,
        executionPrice: res.executedPrice > 0 ? res.executedPrice : marketPrice,
        status: res.ok ? "FILLED" : "REJECTED_EXCHANGE",
        exchangeOrderId: res.exchangeOrderId,
        slOrderId: res.slOrderId,
        tpOrderId: res.tpOrderId,
        message: res.message,
      };
    }

    return {
      ...baseOrder,
      status: "PENDING_EA",
      message: `Đang chờ ${acct.platform} EA xác nhận khớp ${qtyOrLots} lots ${signal.symbol}`,
    };
  }

  if (acct.platform === "BINANCE_FUTURES" || acct.platform === "OKX_FUTURES") {
    if (!acct.hasApiKey) {
      return {
        ...baseOrder,
        status: "FILLED_PAPER",
        message: `Paper Trade ${acct.platform} mô phỏng ${qtyOrLots} ${signal.symbol} @ ${marketPrice} (chưa gắn API Key thật)`,
      };
    }

    const secrets = await getBrokerConnectionSecrets(acct.id);
    if (!secrets) {
      return {
        ...baseOrder,
        status: "REJECTED_EXCHANGE",
        message: `Không tìm thấy khóa giải mã cho tài khoản ${acct.name}`,
      };
    }

    const res =
      acct.platform === "BINANCE_FUTURES"
        ? await placeBinanceFuturesOrder({
            credentials: secrets,
            symbol: signal.symbol,
            direction: signal.direction,
            baseQty: qtyOrLots,
            entryPrice: marketPrice,
            stopLossPrice: signal.stopLossPrice,
            takeProfit1: signal.takeProfit1,
            takeProfit2: signal.takeProfit2 ?? null,
            takeProfit3: signal.takeProfit3 ?? null,
            leverage,
            idempotencyKey,
          })
        : await placeOkxSwapOrder({
            credentials: secrets,
            symbol: signal.symbol,
            direction: signal.direction,
            baseQty: qtyOrLots,
            entryPrice: marketPrice,
            stopLossPrice: signal.stopLossPrice,
            takeProfit1: signal.takeProfit1,
            takeProfit2: signal.takeProfit2 ?? null,
            takeProfit3: signal.takeProfit3 ?? null,
            leverage,
            idempotencyKey,
          });

    const actualQty = res.executedQty > 0 ? res.executedQty : qtyOrLots;
    return {
      ...baseOrder,
      copiedLotsOrQty: actualQty,
      initialLotsOrQty: actualQty,
      executionPrice: res.executedPrice > 0 ? res.executedPrice : marketPrice,
      status: res.ok ? "FILLED" : "REJECTED_EXCHANGE",
      exchangeOrderId: res.exchangeOrderId,
      slOrderId: res.slOrderId,
      tpOrderId: res.tpOrderId,
      message: res.slWarning ? `${res.message} — ${res.slWarning}` : res.message,
    };
  }

  return {
    ...baseOrder,
    status: "FILLED_PAPER",
    message: `Paper / Alert ${acct.platform}: ${signal.direction} ${qtyOrLots} ${signal.symbol} @ ${marketPrice}`,
  };
}

/**
 * Thực thi luồng Auto-Trade / Copy-Trade có đầy đủ 5 lớp bảo vệ:
 * 1) Kill-Switch
 * 2) Setup Grade A+/A Gate (khi chạy tự động)
 * 3) Daily Loss Circuit Breaker
 * 4) Idempotency Lock chống đúp lệnh
 * 5) Slippage Guard
 */
export async function dispatchSignalWithVault(opts: VaultDispatchOptions): Promise<CopyExecutionOrder[]> {
  const { signal, manualOverride = false, userId = null, targetFollowerIds, targetEnvironment = "ALL" } = opts;
  const marketPrice = opts.currentMarketPrice ?? signal.entryPrice;
  const executor = opts.orderExecutor ?? executePlatformOrder;
  const accounts = opts.overrideAccounts ?? (await listBrokerConnections(userId));
  const results: CopyExecutionOrder[] = [];

  // Track currently open positions per account for autonomous portfolio concentration & duplicate-pair guard
  const openCountByAccount = new Map<string, number>();
  const openSymbolsByAccount = new Map<string, Set<string>>();
  if (!manualOverride && !opts.overrideAccounts) {
    const existingOrders = await listBotExecutionOrders(150);
    for (const o of existingOrders) {
      if (
        (o.status === "FILLED_PAPER" || o.status === "FILLED" || o.status === "PENDING_EA") &&
        !o.message.startsWith("[ĐÃ ĐÓNG]")
      ) {
        openCountByAccount.set(o.followerId, (openCountByAccount.get(o.followerId) ?? 0) + 1);
        const set = openSymbolsByAccount.get(o.followerId) ?? new Set<string>();
        set.add(o.symbol.toUpperCase().replace(/[^A-Z0-9]/g, ""));
        openSymbolsByAccount.set(o.followerId, set);
      }
    }
  }

  for (const acct of accounts) {
    if (!acct.isActive) continue;
    if (targetFollowerIds?.length && !targetFollowerIds.includes(acct.id)) continue;
    const acctEnv = classifyAccountEnvironment(acct).environment;
    if (targetEnvironment !== "ALL" && acctEnv !== targetEnvironment) continue;
    if (!manualOverride && !acct.autoExecuteEnabled) continue;

    const idempotencyKey = `${acct.id}_${signal.id}_${signal.symbol}_${signal.direction}`;
    const orderId = `ord_${randomUUID().slice(0, 12)}`;
    const now = Date.now();

    // 1) Kill-Switch check
    if (acct.killSwitched) {
      results.push({
        orderId,
        followerId: acct.id,
        followerName: acct.name,
        platform: acct.platform,
        symbol: signal.symbol,
        direction: signal.direction,
        copiedLotsOrQty: 0,
        entryPrice: signal.entryPrice,
        executionPrice: marketPrice,
        slippagePips: 0,
        status: "BLOCKED_KILL_SWITCH",
        stopLossPrice: signal.stopLossPrice,
        takeProfit1: signal.takeProfit1,
        timestamp: now,
        signalId: signal.id,
        idempotencyKey,
        message: "Bị chặn: Tài khoản đang bật Kill-Switch khẩn cấp",
      });
      continue;
    }

    // 2) Grade A+ / A Gate khi chạy Auto-Trade
    const grade = signal.setupGrade;
    const isHighGrade = grade ? grade === "A+" || grade === "A" : signal.winrateScore >= 75;
    if (!manualOverride && !isHighGrade) {
      results.push({
        orderId,
        followerId: acct.id,
        followerName: acct.name,
        platform: acct.platform,
        symbol: signal.symbol,
        direction: signal.direction,
        copiedLotsOrQty: 0,
        entryPrice: signal.entryPrice,
        executionPrice: marketPrice,
        slippagePips: 0,
        status: "REJECTED_LOW_GRADE",
        stopLossPrice: signal.stopLossPrice,
        takeProfit1: signal.takeProfit1,
        timestamp: now,
        signalId: signal.id,
        idempotencyKey,
        message: `Auto-Bot từ chối: Setup Grade ${grade ?? "N/A"} (yêu cầu A+ hoặc A)`,
      });
      continue;
    }

    // 2b) Portfolio Concentration & Active Symbol Guard (autonomous mode)
    if (!manualOverride && !opts.overrideAccounts) {
      const cleanSym = signal.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const activeSyms = openSymbolsByAccount.get(acct.id);
      if (activeSyms?.has(cleanSym)) {
        continue;
      }
      const maxOpen = Math.max(1, acct.maxOpenPositions ?? 3);
      const currentOpen = openCountByAccount.get(acct.id) ?? 0;
      if (currentOpen >= maxOpen) {
        continue;
      }
    }

    // 3) Asset-Class compatibility check
    const assetOk =
      signal.assetType === "CRYPTO"
        ? isCryptoSupportedPlatform(acct.platform)
        : isForexSupportedPlatform(acct.platform);
    if (!assetOk) {
      if (!manualOverride && !opts.overrideAccounts) {
        continue;
      }
      results.push({
        orderId,
        followerId: acct.id,
        followerName: acct.name,
        platform: acct.platform,
        symbol: signal.symbol,
        direction: signal.direction,
        copiedLotsOrQty: 0,
        entryPrice: signal.entryPrice,
        executionPrice: marketPrice,
        slippagePips: 0,
        status: "REJECTED_ASSET_MISMATCH",
        stopLossPrice: signal.stopLossPrice,
        takeProfit1: signal.takeProfit1,
        timestamp: now,
        signalId: signal.id,
        idempotencyKey,
        message: `${acct.platform} không hỗ trợ giao dịch trực tiếp cặp ${signal.assetType} ${signal.symbol}`,
      });
      continue;
    }

    // 4) Daily Loss Circuit Breaker
    const maxDailyLoss = Math.max(10, acct.maxDailyLossUsd ?? 500);
    const dailyPnl = acct.dailyRealizedPnlUsd ?? 0;
    if (dailyPnl <= -maxDailyLoss) {
      results.push({
        orderId,
        followerId: acct.id,
        followerName: acct.name,
        platform: acct.platform,
        symbol: signal.symbol,
        direction: signal.direction,
        copiedLotsOrQty: 0,
        entryPrice: signal.entryPrice,
        executionPrice: marketPrice,
        slippagePips: 0,
        status: "BLOCKED_DAILY_LOSS",
        stopLossPrice: signal.stopLossPrice,
        takeProfit1: signal.takeProfit1,
        timestamp: now,
        signalId: signal.id,
        idempotencyKey,
        message: `Ngắt mạch bảo vệ vốn: Lỗ trong ngày $${Math.abs(dailyPnl).toFixed(2)} >= giới hạn $${maxDailyLoss}`,
      });
      continue;
    }

    // 5) Idempotency Lock (không vào đúp 1 tín hiệu trên cùng tài khoản, kể cả gọi đồng thời)
    if (INFLIGHT_IDEMPOTENCY_LOCKS.has(idempotencyKey)) {
      results.push({
        orderId,
        followerId: acct.id,
        followerName: acct.name,
        platform: acct.platform,
        symbol: signal.symbol,
        direction: signal.direction,
        copiedLotsOrQty: 0,
        entryPrice: signal.entryPrice,
        executionPrice: marketPrice,
        slippagePips: 0,
        status: "SKIPPED_DUPLICATE",
        stopLossPrice: signal.stopLossPrice,
        takeProfit1: signal.takeProfit1,
        timestamp: now,
        signalId: signal.id,
        idempotencyKey,
        message: `Bỏ qua: Tín hiệu ${signal.id} đang được xử lý đồng thời (In-Flight Lock)`,
      });
      continue;
    }

    const duplicate = await hasExecutionOrderByIdempotency(idempotencyKey);
    if (duplicate) {
      results.push({
        orderId,
        followerId: acct.id,
        followerName: acct.name,
        platform: acct.platform,
        symbol: signal.symbol,
        direction: signal.direction,
        copiedLotsOrQty: 0,
        entryPrice: signal.entryPrice,
        executionPrice: marketPrice,
        slippagePips: 0,
        status: "SKIPPED_DUPLICATE",
        stopLossPrice: signal.stopLossPrice,
        takeProfit1: signal.takeProfit1,
        timestamp: now,
        signalId: signal.id,
        idempotencyKey,
        message: `Bỏ qua: Tín hiệu ${signal.id} đã thực thi trước đó (Idempotency Lock)`,
      });
      continue;
    }

    // 6) Slippage Guard
    const slippage = checkSlippage(signal, marketPrice, acct.maxAllowedSlippagePips);
    if (!slippage.passed) {
      const rejOrder: CopyExecutionOrder = {
        orderId,
        followerId: acct.id,
        followerName: acct.name,
        platform: acct.platform,
        symbol: signal.symbol,
        direction: signal.direction,
        copiedLotsOrQty: 0,
        entryPrice: signal.entryPrice,
        executionPrice: marketPrice,
        slippagePips: slippage.slippagePips,
        status: "REJECTED_SLIPPAGE",
        stopLossPrice: signal.stopLossPrice,
        takeProfit1: signal.takeProfit1,
        timestamp: now,
        signalId: signal.id,
        idempotencyKey,
        message: `Hủy lệnh bảo vệ vốn: Trượt giá ${slippage.slippagePips} vượt ngưỡng cho phép`,
      };
      await saveBotExecutionOrder(rejOrder);
      results.push(rejOrder);
      continue;
    }

    // 7) Compute Size & Execute (or Queue for MT5 EA) under In-Flight Lock
    INFLIGHT_IDEMPOTENCY_LOCKS.add(idempotencyKey);
    let executed: CopyExecutionOrder;
    try {
      const { qtyOrLots, leverage } = computeOrderSize(signal, acct);
      executed = await executor(
        acct,
        signal,
        qtyOrLots,
        leverage,
        marketPrice,
        slippage.slippagePips,
        idempotencyKey,
      );
      await saveBotExecutionOrder(executed);
    } finally {
      INFLIGHT_IDEMPOTENCY_LOCKS.delete(idempotencyKey);
    }

    if (executed.status === "FILLED" || executed.status === "FILLED_PAPER" || executed.status === "PENDING_EA") {
      openCountByAccount.set(acct.id, (openCountByAccount.get(acct.id) ?? 0) + 1);
      const set = openSymbolsByAccount.get(acct.id) ?? new Set<string>();
      set.add(signal.symbol.toUpperCase().replace(/[^A-Z0-9]/g, ""));
      openSymbolsByAccount.set(acct.id, set);
    }

    if (executed.status === "FILLED" || executed.status === "FILLED_PAPER") {
      await updateBrokerConnectionState(acct.id, {
        totalCopiedTrades: acct.totalCopiedTrades + 1,
        lastError: null,
      });
    } else if (executed.status === "REJECTED_EXCHANGE") {
      await updateBrokerConnectionState(acct.id, {
        lastError: executed.message,
      });
    }

    await recordVaultAuditLog(userId, "BOT_ORDER_DISPATCH", {
      orderId: executed.orderId,
      connectionId: acct.id,
      environment: acctEnv,
      platform: acct.platform,
      symbol: signal.symbol,
      direction: signal.direction,
      status: executed.status,
      exchangeOrderId: executed.exchangeOrderId ?? null,
    });

    recordBotActivity({
      level:
        executed.status === "FILLED" || executed.status === "FILLED_PAPER"
          ? "ok"
          : executed.status === "PENDING_EA"
            ? "info"
            : "warn",
      category:
        executed.status === "FILLED" ||
        executed.status === "FILLED_PAPER" ||
        executed.status === "PENDING_EA"
          ? "EXECUTION"
          : "GUARDRAIL",
      symbol: signal.symbol,
      accountName: acct.name,
      platform: acct.platform,
      message: `[${acctEnv}] ${executed.message}`,
    });

    results.push(executed);
  }

  return results;
}
