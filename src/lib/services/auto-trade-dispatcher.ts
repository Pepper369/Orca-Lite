import "server-only";
import { randomUUID } from "node:crypto";
import {
  evaluateContinuousDrawdownGovernor,
  evaluateFactorExposureBudget,
  type FactorExposurePosition,
} from "@/lib/engines/advanced-quant-math";
import {
  runMultiScenarioPortfolioStressTest,
  type PortfolioStressPosition,
} from "@/lib/engines/unified-cross-asset-quant";
import { getAssetPipSize } from "@/lib/engines/asset-precision";
import {
  calculateProportionalCopySize,
  verifySlippageGuard,
  type CopyExecutionOrder,
  type FollowerAccount,
} from "@/lib/engines/copy-trade-engine";
import { calculateCryptoPositionSize } from "@/lib/engines/crypto-position-sizer";
import {
  getBrokerMeta,
  isCryptoPlatform,
  isForexPlatform,
  isMt5BrokerPlatform,
} from "@/lib/engines/broker-registry";
import {
  placePlatformExchangeOrder,
  recordExecutionSlippageTelemetry,
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
  return isCryptoPlatform(platform) || platform === "TELEGRAM_1CLICK";
}

function isForexSupportedPlatform(platform: FollowerAccount["platform"]): boolean {
  return isForexPlatform(platform) || platform === "TELEGRAM_1CLICK";
}

export function validateDispatchableSignalGeometry(
  signal: DispatchableSignalInput,
  marketPrice?: number,
): { valid: boolean; reason?: string } {
  if (!signal || (signal.direction !== "BUY" && signal.direction !== "SELL")) {
    return { valid: false, reason: "Hướng lệnh (direction) không hợp lệ" };
  }
  if (!Number.isFinite(signal.entryPrice) || signal.entryPrice <= 0) {
    return { valid: false, reason: "Giá vào lệnh (entryPrice) không hợp lệ hoặc không hữu hạn" };
  }
  if (!Number.isFinite(signal.stopLossPrice) || signal.stopLossPrice <= 0) {
    return { valid: false, reason: "Giá cắt lỗ (stopLossPrice) không hợp lệ hoặc không hữu hạn" };
  }
  if (!Number.isFinite(signal.takeProfit1) || signal.takeProfit1 <= 0) {
    return { valid: false, reason: "Giá chốt lời (takeProfit1) không hợp lệ hoặc không hữu hạn" };
  }
  if (marketPrice !== undefined && (!Number.isFinite(marketPrice) || marketPrice <= 0)) {
    return { valid: false, reason: "Giá thị trường (currentMarketPrice) không hợp lệ hoặc không hữu hạn" };
  }
  if (signal.direction === "BUY") {
    if (signal.stopLossPrice >= signal.entryPrice) {
      return {
        valid: false,
        reason: `Cấu trúc SL đảo ngược cho lệnh BUY: stopLossPrice (${signal.stopLossPrice}) >= entryPrice (${signal.entryPrice})`,
      };
    }
    if (signal.takeProfit1 <= signal.entryPrice) {
      return {
        valid: false,
        reason: `Cấu trúc TP1 đảo ngược cho lệnh BUY: takeProfit1 (${signal.takeProfit1}) <= entryPrice (${signal.entryPrice})`,
      };
    }
    if (signal.takeProfit2 != null && (!Number.isFinite(signal.takeProfit2) || signal.takeProfit2 <= signal.entryPrice)) {
      return { valid: false, reason: "Giá takeProfit2 không hợp lệ cho lệnh BUY" };
    }
    if (signal.takeProfit3 != null && (!Number.isFinite(signal.takeProfit3) || signal.takeProfit3 <= signal.entryPrice)) {
      return { valid: false, reason: "Giá takeProfit3 không hợp lệ cho lệnh BUY" };
    }
  } else {
    if (signal.stopLossPrice <= signal.entryPrice) {
      return {
        valid: false,
        reason: `Cấu trúc SL đảo ngược cho lệnh SELL: stopLossPrice (${signal.stopLossPrice}) <= entryPrice (${signal.entryPrice})`,
      };
    }
    if (signal.takeProfit1 >= signal.entryPrice) {
      return {
        valid: false,
        reason: `Cấu trúc TP1 đảo ngược cho lệnh SELL: takeProfit1 (${signal.takeProfit1}) >= entryPrice (${signal.entryPrice})`,
      };
    }
    if (
      signal.takeProfit2 != null &&
      (!Number.isFinite(signal.takeProfit2) || signal.takeProfit2 <= 0 || signal.takeProfit2 >= signal.entryPrice)
    ) {
      return { valid: false, reason: "Giá takeProfit2 không hợp lệ cho lệnh SELL" };
    }
    if (
      signal.takeProfit3 != null &&
      (!Number.isFinite(signal.takeProfit3) || signal.takeProfit3 <= 0 || signal.takeProfit3 >= signal.entryPrice)
    ) {
      return { valid: false, reason: "Giá takeProfit3 không hợp lệ cho lệnh SELL" };
    }
  }
  return { valid: true };
}

function checkSlippage(
  signal: DispatchableSignalInput,
  marketPrice: number,
  maxAllowedSlippagePips: number,
): { passed: boolean; slippagePips: number } {
  if (
    !Number.isFinite(marketPrice) ||
    marketPrice <= 0 ||
    !Number.isFinite(signal.entryPrice) ||
    signal.entryPrice <= 0
  ) {
    return { passed: false, slippagePips: 9999 };
  }
  const safeMaxSlippage =
    Number.isFinite(maxAllowedSlippagePips) && maxAllowedSlippagePips >= 0 ? maxAllowedSlippagePips : 0;

  if (signal.assetType === "CRYPTO") {
    const pctDiff = Math.abs(marketPrice - signal.entryPrice) / Math.max(1e-9, signal.entryPrice);
    const maxPct = Math.max(0.0025, safeMaxSlippage * 0.001); // 2 pips -> 0.25% min buffer cho Crypto
    return {
      passed: pctDiff <= maxPct,
      slippagePips: Number((pctDiff * 100).toFixed(3)),
    };
  }
  const guard = verifySlippageGuard({
    masterEntry: signal.entryPrice,
    currentPrice: marketPrice,
    maxSlippagePips: safeMaxSlippage,
    pipSize: getAssetPipSize(signal.symbol, signal.assetType, marketPrice),
  });
  return { passed: guard.allowed, slippagePips: guard.slippagePips };
}

function computeOrderSize(
  signal: DispatchableSignalInput,
  acct: FollowerAccount,
  factorSizeMultiplier = 1.0,
): { qtyOrLots: number; leverage: number } {
  const rawLevCap =
    Number.isFinite(acct.leverageCap) && (acct.leverageCap ?? 0) > 0 ? Math.round(acct.leverageCap!) : 5;
  const levCap = Math.max(1, Math.min(20, rawLevCap));
  const rawRecLev =
    Number.isFinite(signal.recommendedLeverage) && (signal.recommendedLeverage ?? 0) > 0
      ? Math.round(signal.recommendedLeverage!)
      : 3;
  const leverage = Math.max(1, Math.min(levCap, rawRecLev));

  if (
    !Number.isFinite(acct.balanceUsd) ||
    acct.balanceUsd <= 0 ||
    !Number.isFinite(acct.riskMultiplier) ||
    acct.riskMultiplier <= 0 ||
    !validateDispatchableSignalGeometry(signal).valid
  ) {
    return { qtyOrLots: 0, leverage };
  }

  const safeBalanceUsd = acct.balanceUsd;
  const safeRiskMultiplier = Math.min(5.0, acct.riskMultiplier);
  const safeFactorMult =
    Number.isFinite(factorSizeMultiplier) && factorSizeMultiplier > 0 ? factorSizeMultiplier : 1.0;
  const safeMasterLots =
    Number.isFinite(signal.masterLotsOrQty) && signal.masterLotsOrQty > 0 ? signal.masterLotsOrQty : 0.01;
  const safeMasterCapital =
    Number.isFinite(signal.masterCapitalUsd) && signal.masterCapitalUsd > 0 ? signal.masterCapitalUsd : 10_000;

  // Phase 3: Continuous Drawdown De-leveraging Governor
  const ddGovernor = evaluateContinuousDrawdownGovernor({
    currentBalanceUsd: safeBalanceUsd,
    dailyRealizedPnlUsd: Number.isFinite(acct.dailyRealizedPnlUsd) ? acct.dailyRealizedPnlUsd! : 0,
    maxDailyLossUsd:
      Number.isFinite(acct.maxDailyLossUsd) && (acct.maxDailyLossUsd ?? 0) > 0 ? acct.maxDailyLossUsd! : 500,
  });
  const govScale = Number.isFinite(ddGovernor.recommendedSizeScale) ? ddGovernor.recommendedSizeScale : 1.0;
  const combinedScale = Math.max(0.2, Math.min(1.25, govScale * safeFactorMult));

  if (signal.assetType === "CRYPTO") {
    const riskPct = Math.max(0.20, Math.min(3.0, 1.0 * safeRiskMultiplier * combinedScale));
    const sizing = calculateCryptoPositionSize({
      accountBalance: safeBalanceUsd,
      riskPercent: riskPct,
      entryPrice: signal.entryPrice,
      stopLossPrice: signal.stopLossPrice,
      leverage,
      direction: signal.direction,
    });
    const qty =
      Number.isFinite(sizing.positionQty) && sizing.positionQty > 0
        ? sizing.positionQty
        : Number(
            Math.max(
              0.001,
              safeMasterLots *
                (safeBalanceUsd / Math.max(100, safeMasterCapital)) *
                safeRiskMultiplier *
                combinedScale,
            ).toFixed(4),
          );
    return { qtyOrLots: Number.isFinite(qty) && qty > 0 ? qty : 0, leverage };
  }

  const lots = calculateProportionalCopySize({
    masterLotsOrQty: safeMasterLots,
    masterCapitalUsd: safeMasterCapital,
    followerBalanceUsd: safeBalanceUsd,
    riskMultiplier: safeRiskMultiplier * combinedScale,
    assetType: "FOREX",
  });
  return { qtyOrLots: Number.isFinite(lots) && lots > 0 ? lots : 0, leverage: 1 };
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

  const geom = validateDispatchableSignalGeometry(signal, marketPrice);
  if (!geom.valid || !Number.isFinite(qtyOrLots) || qtyOrLots <= 0) {
    return {
      ...baseOrder,
      copiedLotsOrQty: 0,
      initialLotsOrQty: 0,
      status: "REJECTED_EXCHANGE",
      message: geom.reason ?? "Khối lượng đặt lệnh không hợp lệ (<= 0 hoặc NaN/Infinity)",
    };
  }
  const safeLeverage =
    Number.isFinite(leverage) && leverage > 0 ? Math.max(1, Math.min(20, Math.round(leverage))) : 1;

  if (isMt5BrokerPlatform(acct.platform)) {
    if (acct.hasApiKey) {
      const secrets = await getBrokerConnectionSecrets(acct.id);
      if (!secrets) {
        return {
          ...baseOrder,
          status: "REJECTED_EXCHANGE",
          message: `Không tìm thấy khóa MetaApi giải mã cho tài khoản ${acct.name}`,
        };
      }
      const res = await placePlatformExchangeOrder(acct.platform, {
        credentials: secrets,
        symbol: signal.symbol,
        direction: signal.direction,
        baseQty: qtyOrLots,
        entryPrice: marketPrice,
        stopLossPrice: signal.stopLossPrice,
        takeProfit1: signal.takeProfit1,
        takeProfit2: signal.takeProfit2 ?? null,
        takeProfit3: signal.takeProfit3 ?? null,
        leverage: safeLeverage,
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
        message: res.message,
      };
    }

    return {
      ...baseOrder,
      status: "PENDING_EA",
      message: `Đang chờ ${getBrokerMeta(acct.platform).shortName} EA xác nhận khớp ${qtyOrLots} lots ${signal.symbol}`,
    };
  }

  const brokerMeta = getBrokerMeta(acct.platform);
  if (brokerMeta.supportsDirectOrderExecution || isCryptoPlatform(acct.platform) || isForexPlatform(acct.platform)) {
    if (!acct.hasApiKey) {
      return {
        ...baseOrder,
        status: "FILLED_PAPER",
        message: `Paper Trade ${brokerMeta.shortName} mô phỏng ${qtyOrLots} ${signal.symbol} @ ${marketPrice} (chưa gắn API Key thật)`,
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

    const res = await placePlatformExchangeOrder(acct.platform, {
      credentials: secrets,
      symbol: signal.symbol,
      direction: signal.direction,
      baseQty: qtyOrLots,
      entryPrice: marketPrice,
      stopLossPrice: signal.stopLossPrice,
      takeProfit1: signal.takeProfit1,
      takeProfit2: signal.takeProfit2 ?? null,
      takeProfit3: signal.takeProfit3 ?? null,
      leverage: safeLeverage,
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

  // Track currently open positions per account for autonomous portfolio concentration, duplicate-pair & Factor Exposure Budgeting
  const openCountByAccount = new Map<string, number>();
  const openSymbolsByAccount = new Map<string, Set<string>>();
  const openPositionsByAccount = new Map<string, FactorExposurePosition[]>();
  if (!manualOverride && !opts.overrideAccounts) {
    const existingOrders = await listBotExecutionOrders(150, userId);
    for (const o of existingOrders) {
      if (
        (o.status === "FILLED_PAPER" || o.status === "FILLED" || o.status === "PENDING_EA") &&
        !o.message.startsWith("[ĐÃ ĐÓNG]")
      ) {
        openCountByAccount.set(o.followerId, (openCountByAccount.get(o.followerId) ?? 0) + 1);
        const cleanSym = o.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const set = openSymbolsByAccount.get(o.followerId) ?? new Set<string>();
        set.add(cleanSym);
        openSymbolsByAccount.set(o.followerId, set);

        const posList = openPositionsByAccount.get(o.followerId) ?? [];
        posList.push({
          symbol: cleanSym,
          assetType: cleanSym.endsWith("USDT") || cleanSym.endsWith("USDC") ? "CRYPTO" : "FOREX",
          direction: o.direction,
          riskFractionPct: 1.0,
        });
        openPositionsByAccount.set(o.followerId, posList);
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

    // 2b) Portfolio Concentration, Active Symbol & Macro Factor Exposure Budget Guard (autonomous mode)
    let factorSizeMultiplier = 1.0;
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

      const factorBudget = evaluateFactorExposureBudget({
        candidateSymbol: cleanSym,
        candidateAssetType: signal.assetType,
        candidateDirection: signal.direction,
        candidateRiskPct: Math.max(0.25, Math.min(3.0, 1.0 * acct.riskMultiplier)),
        openPositions: openPositionsByAccount.get(acct.id) ?? [],
        maxSameClusterPositions: Math.min(2, maxOpen),
      });
      if (!factorBudget.allowed) {
        continue;
      }
      factorSizeMultiplier = factorBudget.sizeMultiplier;

      // Phase 4C: Pre-Trade Counterfactual Multi-Scenario Stress Test Gate
      const openList = openPositionsByAccount.get(acct.id) ?? [];
      const estCandidateStopPct =
        signal.entryPrice > 0
          ? Math.max(0.001, Math.abs(signal.entryPrice - signal.stopLossPrice) / signal.entryPrice)
          : 0.015;
      const estCandidateNotionalUsd =
        (Math.max(100, acct.balanceUsd) * 0.01 * Math.min(3, acct.riskMultiplier)) / estCandidateStopPct;
      const stressPositions: PortfolioStressPosition[] = [
        ...openList.map((p) => ({
          symbol: p.symbol,
          assetType: p.assetType,
          direction: p.direction,
          notionalUsd: Math.max(100, acct.balanceUsd) * 0.5,
          stopDistancePct: p.assetType === "FOREX" ? 0.005 : 0.018,
        })),
        {
          symbol: cleanSym,
          assetType: signal.assetType,
          direction: signal.direction,
          notionalUsd: estCandidateNotionalUsd,
          stopDistancePct: estCandidateStopPct,
        },
      ];
      const stressRes = runMultiScenarioPortfolioStressTest({
        positions: stressPositions,
        accountBalanceUsd: acct.balanceUsd,
        maxDailyLossUsd: acct.maxDailyLossUsd ?? 500,
        currentDailyRealizedPnlUsd: acct.dailyRealizedPnlUsd ?? 0,
      });
      factorSizeMultiplier = Number(
        (factorSizeMultiplier * stressRes.recommendedPositionScale).toFixed(3),
      );
      if (factorSizeMultiplier <= 0) {
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
    const maxDailyLoss =
      Number.isFinite(acct.maxDailyLossUsd) && (acct.maxDailyLossUsd ?? 0) > 0
        ? Math.max(10, acct.maxDailyLossUsd!)
        : 500;
    const dailyPnl = Number.isFinite(acct.dailyRealizedPnlUsd) ? acct.dailyRealizedPnlUsd! : 0;
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

    // 4b) Signal Price & SL/TP Geometry + Account Capital Boundary Guard
    const geomCheck = validateDispatchableSignalGeometry(signal, marketPrice);
    if (!geomCheck.valid) {
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
        status: "REJECTED_EXCHANGE",
        stopLossPrice: signal.stopLossPrice,
        takeProfit1: signal.takeProfit1,
        timestamp: now,
        signalId: signal.id,
        idempotencyKey,
        message: `Từ chối tín hiệu: ${geomCheck.reason}`,
      });
      continue;
    }

    if (
      !Number.isFinite(acct.balanceUsd) ||
      acct.balanceUsd <= 0 ||
      !Number.isFinite(acct.riskMultiplier) ||
      acct.riskMultiplier <= 0
    ) {
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
        status: "REJECTED_EXCHANGE",
        stopLossPrice: signal.stopLossPrice,
        takeProfit1: signal.takeProfit1,
        timestamp: now,
        signalId: signal.id,
        idempotencyKey,
        message: "Từ chối thực thi: Số dư tài khoản (balanceUsd) hoặc hệ số rủi ro (riskMultiplier) không hợp lệ",
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
      await saveBotExecutionOrder(rejOrder, userId);
      results.push(rejOrder);
      continue;
    }

    // 7) Compute Size & Execute (or Queue for MT5 EA) under In-Flight Lock
    INFLIGHT_IDEMPOTENCY_LOCKS.add(idempotencyKey);
    let executed: CopyExecutionOrder;
    try {
      const { qtyOrLots, leverage } = computeOrderSize(signal, acct, factorSizeMultiplier);
      executed = await executor(
        acct,
        signal,
        qtyOrLots,
        leverage,
        marketPrice,
        slippage.slippagePips,
        idempotencyKey,
      );
      await saveBotExecutionOrder(executed, userId);
    } finally {
      INFLIGHT_IDEMPOTENCY_LOCKS.delete(idempotencyKey);
    }

    if (executed.status === "FILLED" || executed.status === "FILLED_PAPER" || executed.status === "PENDING_EA") {
      openCountByAccount.set(acct.id, (openCountByAccount.get(acct.id) ?? 0) + 1);
      const cleanSym = signal.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const set = openSymbolsByAccount.get(acct.id) ?? new Set<string>();
      set.add(cleanSym);
      openSymbolsByAccount.set(acct.id, set);

      const posList = openPositionsByAccount.get(acct.id) ?? [];
      posList.push({
        symbol: cleanSym,
        assetType: signal.assetType,
        direction: signal.direction,
        riskFractionPct: Math.max(0.25, Math.min(3.0, 1.0 * acct.riskMultiplier * factorSizeMultiplier)),
      });
      openPositionsByAccount.set(acct.id, posList);

      // Phase 3: Closed-Loop Slippage & Implementation Shortfall Calibration
      recordExecutionSlippageTelemetry({
        symbol: cleanSym,
        assetType: signal.assetType,
        direction: signal.direction,
        intendedEntryPrice: signal.entryPrice,
        executedFillPrice: executed.executionPrice,
        stopLossPrice: signal.stopLossPrice,
        timestamp: executed.timestamp,
      });
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
