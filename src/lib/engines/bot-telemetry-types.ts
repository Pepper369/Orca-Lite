/**
 * Shared client/server types & pure PnL/ROI math for Real-Time Bot Trading Telemetry.
 * Pure module (zero server-only imports) so React components and Node services share one SSOT.
 */
import type { BrokerPlatform, ConnectionStatus } from "@/lib/engines/copy-trade-engine";

export type AccountTier = "LIVE_REAL" | "TESTNET_DEMO" | "PAPER_SANDBOX";

/** Môi trường NAV cấp cao: tách biệt tuyệt đối tiền thật (REAL) và tiền mô phỏng/testnet (DEMO). */
export type AccountEnvironment = "REAL" | "DEMO";

/** Phân loại chi tiết nguồn NAV cho nhóm DEMO. */
export type DemoAccountSubtype = "EXCHANGE_TESTNET" | "MT5_DEMO" | "PAPER_SANDBOX";

export type PnlDataSource =
  | "EXCHANGE_API_LIVE"
  | "METAAPI_CLOUD_LIVE"
  | "MARK_TO_MARKET_LIVE"
  | "EA_REPORTED";

export interface LiveOpenPosition {
  positionId: string;
  orderId?: string;
  accountId: string;
  accountName: string;
  platform: BrokerPlatform;
  accountTier: AccountTier;
  environment: AccountEnvironment;
  symbol: string;
  assetType: "CRYPTO" | "FOREX";
  direction: "BUY" | "SELL";
  qtyOrLots: number;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  stopLossPrice: number | null;
  takeProfit1: number | null;
  unrealizedPnlUsd: number;
  roePct: number;
  liquidationPrice: number | null;
  source: "EXCHANGE_LIVE" | "MARK_TO_MARKET_WS" | "METAAPI_CLOUD" | "EA_TRACKED";
  openedAt: number;
  canCloseInApp: boolean;
}

export interface AccountPnlTelemetry {
  accountId: string;
  name: string;
  platform: BrokerPlatform;
  accountNumberMasked: string;
  accountTier: AccountTier;
  /** Phân nhóm môi trường NAV cấp 1: REAL (tiền thật) hoặc DEMO (testnet / MT5 demo / paper). */
  environment: AccountEnvironment;
  /** Phân loại chi tiết nếu là tài khoản DEMO; null nếu là tài khoản REAL. */
  demoSubtype: DemoAccountSubtype | null;
  isTestnet: boolean;
  isActive: boolean;
  autoExecuteEnabled: boolean;
  killSwitched: boolean;
  connectionStatus: ConnectionStatus;
  pnlSource: PnlDataSource;
  /** Vốn NAV gốc ban đầu của tài khoản. */
  initialNavUsd: number;
  /** Alias tương thích ngược cho initialNavUsd. */
  startingCapitalUsd: number;
  walletBalanceUsd: number;
  /** NAV hiện tại của tài khoản (= walletBalanceUsd + unrealizedPnlUsd). */
  navUsd: number;
  /** NAV tiền thật của tài khoản (= navUsd nếu environment === "REAL", ngược lại = 0). */
  realNavUsd: number;
  /** NAV demo của tài khoản (= navUsd nếu environment === "DEMO", ngược lại = 0). */
  demoNavUsd: number;
  /** Biến động NAV ròng (= realizedPnlUsd + unrealizedPnlUsd). */
  navChangeUsd: number;
  /** % tăng trưởng NAV so với NAV gốc. */
  navChangePct: number;
  /** % tỷ trọng NAV của tài khoản trong đúng nhóm của nó (REAL pool hoặc DEMO pool). */
  navShareInPoolPct: number;
  /** Alias tương thích ngược cho navUsd. */
  equityUsd: number;
  availableMarginUsd: number;
  marginUsedUsd: number;
  marginUtilizationPct: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  dailyRealizedPnlUsd: number;
  totalNetPnlUsd: number;
  totalRoiPct: number;
  dailyRoiPct: number;
  maxDailyLossUsd: number;
  dailyLossUsedPct: number;
  openPositionsCount: number;
  totalTrades: number;
  closedTradesCount: number;
  winningTradesCount: number;
  winratePct: number | null;
  lastSyncedAt: number;
  syncError: string | null;
}

export interface TierPnlAggregate {
  environment?: AccountEnvironment;
  accountCount: number;
  activeAutoCount: number;
  /** Tổng NAV gốc của nhóm. */
  initialNavUsd: number;
  startingCapitalUsd: number;
  walletBalanceUsd: number;
  /** Tổng NAV hiện tại của nhóm (không bao giờ trộn REAL với DEMO). */
  totalNavUsd: number;
  equityUsd: number;
  availableMarginUsd: number;
  marginUsedUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  navChangeUsd: number;
  totalNetPnlUsd: number;
  navChangePct: number;
  totalRoiPct: number;
  dailyRealizedPnlUsd: number;
  openPositionsCount: number;
}

export interface BotActivityEvent {
  id: string;
  ts: number;
  level: "info" | "ok" | "warn" | "error";
  category: "WORKER" | "EXECUTION" | "SYNC" | "GUARDRAIL" | "CLOSE";
  message: string;
  symbol?: string;
  accountName?: string;
  platform?: BrokerPlatform;
}

export interface BotWorkerTelemetry {
  started: boolean;
  isTickRunning: boolean;
  pollIntervalMs: number;
  lastTickAt: number | null;
  nextTickAt: number | null;
  lastDispatchedCount: number;
  lastScannedSignalsCount: number;
  lastScanStatus: string;
}

export interface BotLiveTelemetrySnapshot {
  generatedAt: number;
  streamIntervalMs: number;
  /** Tổng hợp kỹ thuật (chỉ giữ để tương thích ngược; UI bắt buộc hiển thị tách bạch realNav & demoNav). */
  summary: TierPnlAggregate;
  /** Nhóm NAV Tiền Thật (REAL) — tách biệt hoàn toàn khỏi Demo/Testnet/Paper. */
  realNav: TierPnlAggregate;
  /** Nhóm NAV Demo (Testnet · MT5 Demo · Paper Sandbox). */
  demoNav: TierPnlAggregate;
  /** Alias tương thích ngược cho realNav. */
  liveRealSummary: TierPnlAggregate;
  /** Alias tương thích ngược cho demoNav. */
  demoSummary: TierPnlAggregate;
  /** Danh sách tài khoản REAL (chỉ tiền thật). */
  realAccounts: AccountPnlTelemetry[];
  /** Danh sách tài khoản DEMO (Testnet / MT5 Demo / Paper). */
  demoAccounts: AccountPnlTelemetry[];
  accounts: AccountPnlTelemetry[];
  openPositions: LiveOpenPosition[];
  recentEvents: BotActivityEvent[];
  worker: BotWorkerTelemetry;
}

/* ------------------------- Pure SSOT Financial Math ------------------------- */

export function classifyAccountTier(params: {
  isTestnet?: boolean;
  hasApiKey?: boolean;
  hasEaToken?: boolean;
  connectionStatus?: ConnectionStatus;
}): AccountTier {
  const hasRealCredentials = Boolean(params.hasApiKey || params.hasEaToken);
  if (!hasRealCredentials || params.connectionStatus === "PAPER_SIMULATED") {
    return "PAPER_SANDBOX";
  }
  return params.isTestnet === false ? "LIVE_REAL" : "TESTNET_DEMO";
}

/**
 * SSOT phân loại tài khoản sang 2 luồng NAV tách biệt tuyệt đối: REAL vs DEMO.
 */
export function classifyAccountEnvironment(params: {
  isTestnet?: boolean;
  hasApiKey?: boolean;
  hasEaToken?: boolean;
  connectionStatus?: ConnectionStatus;
  platform?: BrokerPlatform;
}): {
  environment: AccountEnvironment;
  accountTier: AccountTier;
  demoSubtype: DemoAccountSubtype | null;
} {
  const accountTier = classifyAccountTier(params);
  if (accountTier === "LIVE_REAL") {
    return { environment: "REAL", accountTier, demoSubtype: null };
  }
  if (accountTier === "PAPER_SANDBOX") {
    return { environment: "DEMO", accountTier, demoSubtype: "PAPER_SANDBOX" };
  }
  const isMt5 =
    params.platform === "MT5_EXNESS" ||
    params.platform === "MT5_XM" ||
    params.platform === "MT5_EA";
  return {
    environment: "DEMO",
    accountTier,
    demoSubtype: isMt5 ? "MT5_DEMO" : "EXCHANGE_TESTNET",
  };
}

/**
 * Tính % tỷ trọng NAV cho từng tài khoản trong ĐÚNG nhóm của nó (REAL pool hoặc DEMO pool).
 * Đảm bảo REAL NAV không bao giờ chia trên mẫu số có dính tiền DEMO và ngược lại.
 */
export function assignPoolNavShares(accounts: AccountPnlTelemetry[]): AccountPnlTelemetry[] {
  const realTotalNav = accounts
    .filter((a) => a.environment === "REAL")
    .reduce((sum, a) => sum + Math.max(0, a.navUsd), 0);
  const demoTotalNav = accounts
    .filter((a) => a.environment === "DEMO")
    .reduce((sum, a) => sum + Math.max(0, a.navUsd), 0);

  return accounts.map((a) => {
    const poolTotal = a.environment === "REAL" ? realTotalNav : demoTotalNav;
    const share = poolTotal > 0 ? Number(((Math.max(0, a.navUsd) / poolTotal) * 100).toFixed(1)) : 0;
    return {
      ...a,
      navShareInPoolPct: share,
    };
  });
}

export function getForexContractUnits(symbol: string): number {
  const upper = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (upper.startsWith("XAU")) return 100;
  if (upper.startsWith("XAG")) return 5_000;
  if (upper.includes("OIL") || upper.startsWith("WTI") || upper.startsWith("BRENT")) return 1_000;
  return 100_000;
}

/**
 * Exact Mark-to-Market Unrealized PnL in USD.
 * - Crypto: (mark - entry) * qty * dir
 * - Forex/Metals: (mark - entry) * lots * contractUnits * quoteToUsdFactor * dir
 */
export function calculateMarkToMarketPnlUsd(params: {
  symbol: string;
  assetType: "CRYPTO" | "FOREX";
  direction: "BUY" | "SELL";
  entryPrice: number;
  markPrice: number;
  qtyOrLots: number;
}): number {
  const { symbol, assetType, direction, entryPrice, markPrice, qtyOrLots } = params;
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(markPrice) ||
    !Number.isFinite(qtyOrLots) ||
    entryPrice <= 0 ||
    markPrice <= 0 ||
    qtyOrLots <= 0
  ) {
    return 0;
  }

  const sign = direction === "BUY" ? 1 : -1;
  const delta = (markPrice - entryPrice) * sign;

  if (assetType === "CRYPTO") {
    return Number((delta * qtyOrLots).toFixed(4));
  }

  const upper = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const units = qtyOrLots * getForexContractUnits(upper);
  const rawQuotePnl = delta * units;

  // Quote currency USD (EURUSD, GBPUSD, AUDUSD, NZDUSD, XAUUSD, XAGUSD, USOIL...)
  if (upper.endsWith("USD") || upper.startsWith("XAU") || upper.startsWith("XAG") || upper.includes("OIL")) {
    return Number(rawQuotePnl.toFixed(2));
  }
  // Base currency USD (USDJPY, USDCAD, USDCHF...) -> convert quote PnL to USD by dividing by markPrice
  if (upper.startsWith("USD")) {
    return Number((rawQuotePnl / markPrice).toFixed(2));
  }
  // Cross pairs (EURJPY, GBPJPY, EURGBP...) -> approximate USD conversion using markPrice when JPY (> 20)
  if (upper.endsWith("JPY")) {
    return Number((rawQuotePnl / Math.max(1, markPrice)).toFixed(2));
  }
  return Number(rawQuotePnl.toFixed(2));
}

export function calculatePositionRoePct(params: {
  unrealizedPnlUsd: number;
  entryPrice: number;
  qtyOrLots: number;
  leverage: number;
  assetType: "CRYPTO" | "FOREX";
  symbol: string;
}): number {
  const { unrealizedPnlUsd, entryPrice, qtyOrLots, leverage, assetType, symbol } = params;
  if (!Number.isFinite(unrealizedPnlUsd) || !Number.isFinite(entryPrice) || entryPrice <= 0 || qtyOrLots <= 0) {
    return 0;
  }
  const lev = Math.max(1, leverage || 1);
  let notionalUsd: number;
  if (assetType === "CRYPTO") {
    notionalUsd = entryPrice * qtyOrLots;
  } else {
    const upper = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const units = qtyOrLots * getForexContractUnits(upper);
    notionalUsd = upper.startsWith("USD") ? units : units * entryPrice;
  }
  const marginUsed = Math.max(1, notionalUsd / (assetType === "FOREX" ? Math.max(lev, 100) : lev));
  return Number(((unrealizedPnlUsd / marginUsed) * 100).toFixed(2));
}

export function calculateAccountRoiPct(totalNetPnlUsd: number, baseCapitalUsd: number): number {
  if (!Number.isFinite(totalNetPnlUsd) || !Number.isFinite(baseCapitalUsd) || baseCapitalUsd <= 0) {
    return 0;
  }
  return Number(((totalNetPnlUsd / baseCapitalUsd) * 100).toFixed(2));
}

export function aggregateTierSummary(
  accounts: AccountPnlTelemetry[],
  environment?: AccountEnvironment,
): TierPnlAggregate {
  let activeAutoCount = 0;
  let startingCapitalUsd = 0;
  let walletBalanceUsd = 0;
  let equityUsd = 0;
  let availableMarginUsd = 0;
  let marginUsedUsd = 0;
  let unrealizedPnlUsd = 0;
  let realizedPnlUsd = 0;
  let dailyRealizedPnlUsd = 0;
  let openPositionsCount = 0;

  for (const a of accounts) {
    if (a.isActive && a.autoExecuteEnabled && !a.killSwitched) activeAutoCount++;
    startingCapitalUsd += a.initialNavUsd ?? a.startingCapitalUsd;
    walletBalanceUsd += a.walletBalanceUsd;
    equityUsd += a.navUsd ?? a.equityUsd;
    availableMarginUsd += a.availableMarginUsd;
    marginUsedUsd += a.marginUsedUsd ?? Math.max(0, (a.navUsd ?? a.equityUsd) - a.availableMarginUsd);
    unrealizedPnlUsd += a.unrealizedPnlUsd;
    realizedPnlUsd += a.realizedPnlUsd;
    dailyRealizedPnlUsd += a.dailyRealizedPnlUsd;
    openPositionsCount += a.openPositionsCount;
  }

  const totalNetPnlUsd = Number((realizedPnlUsd + unrealizedPnlUsd).toFixed(2));
  const totalNavUsd = Number(equityUsd.toFixed(2));
  const initialNavUsd = Number(startingCapitalUsd.toFixed(2));
  const totalRoiPct = calculateAccountRoiPct(
    totalNetPnlUsd,
    initialNavUsd > 0 ? initialNavUsd : walletBalanceUsd,
  );

  return {
    ...(environment ? { environment } : {}),
    accountCount: accounts.length,
    activeAutoCount,
    initialNavUsd,
    startingCapitalUsd: initialNavUsd,
    walletBalanceUsd: Number(walletBalanceUsd.toFixed(2)),
    totalNavUsd,
    equityUsd: totalNavUsd,
    availableMarginUsd: Number(availableMarginUsd.toFixed(2)),
    marginUsedUsd: Number(marginUsedUsd.toFixed(2)),
    unrealizedPnlUsd: Number(unrealizedPnlUsd.toFixed(2)),
    realizedPnlUsd: Number(realizedPnlUsd.toFixed(2)),
    navChangeUsd: totalNetPnlUsd,
    totalNetPnlUsd,
    navChangePct: totalRoiPct,
    totalRoiPct,
    dailyRealizedPnlUsd: Number(dailyRealizedPnlUsd.toFixed(2)),
    openPositionsCount,
  };
}
