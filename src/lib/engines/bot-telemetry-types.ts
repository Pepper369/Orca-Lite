/**
 * Shared client/server types & pure PnL/ROI math for Real-Time Bot Trading Telemetry.
 * Pure module (zero server-only imports) so React components and Node services share one SSOT.
 */
import type { BrokerPlatform, ConnectionStatus, CopyExecutionOrder, FollowerAccount } from "@/lib/engines/copy-trade-engine";
import { getBrokerMeta } from "@/lib/engines/broker-registry";

export type TradingAccountAssetClass = "CRYPTO" | "FOREX" | "OTHER";

export interface LinkedTradingAccountItem {
  keyId: string;
  name: string;
  platform: BrokerPlatform;
  assetClass: TradingAccountAssetClass;
  credentialMasked: string;
  environments: AccountEnvironment[];
  verified: boolean;
  activeAuto: boolean;
  totalBalanceUsd: number;
  connectionIds: string[];
}

export interface LinkedTradingAccountSummary {
  /** Tổng số tài khoản giao dịch được chứng minh bằng bộ API Key / EA Token (1 bộ API key = 1 tài khoản). */
  totalApiAccounts: number;
  /** Số tài khoản giao dịch Crypto (Binance / OKX / Bybit có API Key). */
  cryptoAccountsCount: number;
  /** Số tài khoản giao dịch Forex (Exness / XM / MT5 có MetaApi Key hoặc EA Token). */
  forexAccountsCount: number;
  /** Số tài khoản Crypto đã xác minh API thành công. */
  cryptoVerifiedCount: number;
  /** Số tài khoản Forex đã xác minh kết nối thành công. */
  forexVerifiedCount: number;
  /** Danh sách chi tiết từng tài khoản giao dịch theo từng bộ API Key duy nhất. */
  accounts: LinkedTradingAccountItem[];
}

export function classifyBrokerAssetClass(platform: BrokerPlatform): TradingAccountAssetClass {
  const cat = getBrokerMeta(platform).category;
  if (cat === "CRYPTO") return "CRYPTO";
  if (cat === "FOREX") return "FOREX";
  return "OTHER";
}

/**
 * SSOT: Đếm và gom nhóm số lượng tài khoản giao dịch Crypto & Forex thuộc tài khoản Orca.
 * Quy tắc: Mỗi bộ API Key (hoặc EA Token MT5) duy nhất chứng minh cho 1 tài khoản giao dịch;
 * nếu 1 bộ API Key kết nối song song cả REAL & DEMO thì vẫn tính là 1 tài khoản có 2 môi trường.
 * Không đếm tài khoản Paper Sandbox mặc định chưa gắn API Key / EA Token.
 */
export function summarizeLinkedTradingAccounts(
  accounts: Array<
    Pick<
      FollowerAccount,
      | "id"
      | "name"
      | "platform"
      | "accountNumberMasked"
      | "balanceUsd"
      | "isTestnet"
      | "isActive"
      | "autoExecuteEnabled"
      | "killSwitched"
      | "connectionStatus"
      | "hasApiKey"
      | "hasEaToken"
    >
  >,
): LinkedTradingAccountSummary {
  const byKey = new Map<string, LinkedTradingAccountItem>();

  for (const acc of accounts) {
    const hasCredentialProof = Boolean(acc.hasApiKey || acc.hasEaToken);
    if (!hasCredentialProof) continue;

    const assetClass = classifyBrokerAssetClass(acc.platform);
    const credMasked = (acc.accountNumberMasked || "").trim();
    const keyId = acc.hasApiKey && credMasked
      ? `${acc.platform}:API:${credMasked}`
      : `${acc.platform}:EA:${acc.id}`;

    const env = classifyAccountEnvironment({
      isTestnet: acc.isTestnet,
      hasApiKey: acc.hasApiKey,
      hasEaToken: acc.hasEaToken,
      connectionStatus: acc.connectionStatus,
      platform: acc.platform,
    }).environment;

    const isVerified = acc.connectionStatus === "CONNECTED_VERIFIED";
    const isAutoRunning = Boolean(acc.isActive && acc.autoExecuteEnabled && !acc.killSwitched);
    const cleanName = acc.name.replace(/\s*\((REAL|DEMO)\)\s*$/i, "").trim() || acc.name;

    const existing = byKey.get(keyId);
    if (!existing) {
      byKey.set(keyId, {
        keyId,
        name: cleanName,
        platform: acc.platform,
        assetClass,
        credentialMasked: credMasked || acc.id.slice(-8),
        environments: [env],
        verified: isVerified,
        activeAuto: isAutoRunning,
        totalBalanceUsd: Number.isFinite(acc.balanceUsd) ? Number(acc.balanceUsd.toFixed(2)) : 0,
        connectionIds: [acc.id],
      });
    } else {
      if (!existing.environments.includes(env)) {
        existing.environments.push(env);
        existing.environments.sort((a, b) => (a === "REAL" ? -1 : b === "REAL" ? 1 : 0));
      }
      existing.verified = existing.verified || isVerified;
      existing.activeAuto = existing.activeAuto || isAutoRunning;
      if (Number.isFinite(acc.balanceUsd)) {
        existing.totalBalanceUsd = Number((existing.totalBalanceUsd + acc.balanceUsd).toFixed(2));
      }
      if (!existing.connectionIds.includes(acc.id)) {
        existing.connectionIds.push(acc.id);
      }
    }
  }

  const list = Array.from(byKey.values());
  const crypto = list.filter((x) => x.assetClass === "CRYPTO");
  const forex = list.filter((x) => x.assetClass === "FOREX");

  return {
    totalApiAccounts: list.length,
    cryptoAccountsCount: crypto.length,
    forexAccountsCount: forex.length,
    cryptoVerifiedCount: crypto.filter((x) => x.verified).length,
    forexVerifiedCount: forex.filter((x) => x.verified).length,
    accounts: list,
  };
}

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
  initialQtyOrLots?: number;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  stopLossPrice: number | null;
  takeProfit1: number | null;
  takeProfit2?: number | null;
  takeProfit3?: number | null;
  positionStage?: "INITIAL" | "TP1_BE" | "TP2_TRAIL";
  realizedPnlUsd?: number;
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
  /** True nếu tài khoản Forex đang tự động tạm nghỉ theo Timeline Thứ 7 & Chủ Nhật giờ Việt Nam (GMT+7). */
  timelinePaused?: boolean;
  timelinePauseReason?: string | null;
}

export interface BotTradingTimelineStatus {
  timezone: "Asia/Ho_Chi_Minh (GMT+7)";
  vnDayOfWeek: number; // 0 = CN, 1 = T2, ..., 6 = T7
  vnDayLabelVi: string;
  vnTimeLabel: string;
  isVnWeekend: boolean;
  cryptoBotActive: boolean;
  forexBotActive: boolean;
  forexPauseReasonVi: string | null;
  scheduleSummaryVi: string;
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

export interface QuantEngineFeedItem {
  id: string;
  symbol: string;
  assetType: "FOREX" | "CRYPTO";
  direction: "BUY" | "SELL";
  setupGrade: "A+" | "A" | "B" | "NO_TRADE";
  winrateScore: number;
  calibratedWinRatePct: number;
  expectancyR: number;
  entryMode: "LIMIT_PULLBACK" | "MARKET_CONFIRMED" | "WAIT";
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1: number;
  takeProfit2: number | null;
  takeProfit3: number | null;
  recommendedLeverage: number;
  masterLotsOrQty: number;
  ictSetup: string;
  regimeState: string;
  liquiditySweepDetected: boolean;
  summaryVi: string;
  updatedAt: number;
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
  quantFeed?: QuantEngineFeedItem[];
}

export interface ExecutionQualityTelemetry {
  trackedOrdersCount: number;
  resolvedOrdersCount: number;
  limitPullbackCount: number;
  avgEntrySlippageR: number | null;
  tp1HitCount: number;
  tp1HitRatePct: number | null;
  runnerConvertedCount: number;
  runnerConversionPct: number | null;
  profitLockStopsCount: number;
  fullSlStopsCount: number;
  activeRunnersCount: number;
}

export interface BotQuantIntelligenceSummary {
  predictionRadar: {
    dataSource: "LIVE_POLYMARKET" | "BASELINE_FALLBACK" | "CUSTOM_INPUT";
    riskRegime: "RISK_ON" | "RISK_OFF" | "NEUTRAL_CHOP";
    fedRateCutOdds: number;
    inflationSurpriseOdds: number;
    cryptoBullishRangeOdds: number;
    geopoliticalStressOdds: number;
    cryptoLeadingBiasScore: number;
    summaryVi: string;
  };
  alphaDecaySummary: {
    trackedSymbols: number;
    topEmergingFactors: string[];
    prunedDecayedFactors: string[];
  };
  thesisEventsCount: number;
  roiDecayExitsCount: number;
  executionQuality?: ExecutionQualityTelemetry;
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
  quantFeed?: QuantEngineFeedItem[];
  timeline?: BotTradingTimelineStatus;
  quantIntelligence?: BotQuantIntelligenceSummary;
}

const VN_DAY_NAMES: Record<number, string> = {
  0: "Chủ Nhật",
  1: "Thứ Hai",
  2: "Thứ Ba",
  3: "Thứ Tư",
  4: "Thứ Năm",
  5: "Thứ Sáu",
  6: "Thứ Bảy",
};

/**
 * SSOT Timeline Lịch Vận Hành Bot theo Giờ Việt Nam (Asia/Ho_Chi_Minh, GMT+7):
 * - Thứ 2 -> Thứ 6 (GMT+7): Cả Bot Crypto (24/7) và Bot Forex đều hoạt động tự động.
 * - Thứ 7 & Chủ Nhật (00:00 Thứ 7 -> 23:59 Chủ Nhật GMT+7): Tự động tạm dừng toàn bộ Bot tài khoản Forex,
 *   chỉ duy trì Bot tài khoản Crypto chạy 24/7.
 */
export function evaluateBotTradingTimeline(nowMs = Date.now()): BotTradingTimelineStatus {
  const safeMs = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : Date.now();
  const vnShifted = new Date(safeMs + 7 * 3600 * 1000);
  const vnDayOfWeek = vnShifted.getUTCDay();
  const vnDayLabelVi = VN_DAY_NAMES[vnDayOfWeek] ?? "Hôm nay";
  const hh = String(vnShifted.getUTCHours()).padStart(2, "0");
  const mm = String(vnShifted.getUTCMinutes()).padStart(2, "0");
  const vnTimeLabel = `${hh}:${mm} GMT+7`;

  const isVnWeekend = vnDayOfWeek === 6 || vnDayOfWeek === 0;
  const cryptoBotActive = true;
  const forexBotActive = !isVnWeekend;
  const forexPauseReasonVi = isVnWeekend
    ? `Timeline GMT+7 (${vnDayLabelVi} ${vnTimeLabel}): Tự động nghỉ giao dịch Forex vào Thứ 7 & Chủ Nhật giờ Việt Nam — chỉ chạy Bot Crypto 24/7.`
    : null;
  const scheduleSummaryVi = isVnWeekend
    ? `Timeline ${vnDayLabelVi} (${vnTimeLabel}): Bot Forex TẠM NGHỈ T7 & CN · Chỉ chạy Bot Crypto 24/7`
    : `Timeline ${vnDayLabelVi} (${vnTimeLabel}): Bot Crypto (24/7) & Bot Forex (T2–T6) ĐANG HOẠT ĐỘNG`;

  return {
    timezone: "Asia/Ho_Chi_Minh (GMT+7)",
    vnDayOfWeek,
    vnDayLabelVi,
    vnTimeLabel,
    isVnWeekend,
    cryptoBotActive,
    forexBotActive,
    forexPauseReasonVi,
    scheduleSummaryVi,
  };
}

export function isAccountPausedByTimeline(
  platform: BrokerPlatform,
  nowMs = Date.now(),
): { paused: boolean; reasonVi: string | null; timeline: BotTradingTimelineStatus } {
  const timeline = evaluateBotTradingTimeline(nowMs);
  const assetClass = classifyBrokerAssetClass(platform);
  if (assetClass === "FOREX" && !timeline.forexBotActive) {
    return {
      paused: true,
      reasonVi: timeline.forexPauseReasonVi,
      timeline,
    };
  }
  return {
    paused: false,
    reasonVi: null,
    timeline,
  };
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
    if (a.isActive && a.autoExecuteEnabled && !a.killSwitched && !a.timelinePaused) activeAutoCount++;
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

/**
 * SSOT: Pure execution-quality & runner-conversion analytics from tracked CopyExecutionOrders.
 * Enforces Truth-in-Data: returns null for slippage/conversion rates whenever sample count is 0.
 */
export function computeExecutionQualityTelemetry(
  orders: ReadonlyArray<
    Pick<
      CopyExecutionOrder,
      | "status"
      | "direction"
      | "entryPrice"
      | "executionPrice"
      | "stopLossPrice"
      | "takeProfit1"
      | "positionStage"
      | "realizedPnlUsd"
      | "message"
      | "entryMode"
    >
  >,
  openPositions: ReadonlyArray<Pick<LiveOpenPosition, "positionStage">> = [],
): ExecutionQualityTelemetry {
  const filled = orders.filter((o) => o.status === "FILLED");
  let limitPullbackCount = 0;
  let slipSumR = 0;
  let slipSamples = 0;
  let resolvedOrdersCount = 0;
  let tp1HitCount = 0;
  let runnerConvertedCount = 0;
  let profitLockStopsCount = 0;
  let fullSlStopsCount = 0;

  for (const o of filled) {
    if (o.entryMode === "LIMIT_PULLBACK") {
      limitPullbackCount++;
    }

    const isBuy = o.direction === "BUY";
    const entry = Number(o.entryPrice);
    const exec = Number(o.executionPrice);
    const sl = Number(o.stopLossPrice);
    const tp1 = Number(o.takeProfit1);
    const isRunnerStage = o.positionStage === "TP1_BE" || o.positionStage === "TP2_TRAIL";

    // Infer original 1R risk safely even after SL has been trailed past entry into profit lock
    const slOnLossSide = sl > 0 && entry > 0 && (isBuy ? sl < entry : sl > entry);
    let risk1R = 0;
    if (!isRunnerStage && slOnLossSide) {
      risk1R = Math.abs(entry - sl);
    } else if (tp1 > 0 && entry > 0 && (isBuy ? tp1 > entry : tp1 < entry)) {
      risk1R = Math.abs(tp1 - entry) / 0.72;
    } else if (slOnLossSide) {
      risk1R = Math.abs(entry - sl);
    }

    if (entry > 0 && exec > 0 && risk1R > 1e-12) {
      const slipR = Math.abs(exec - entry) / risk1R;
      if (Number.isFinite(slipR) && slipR <= 2.0) {
        slipSumR += slipR;
        slipSamples++;
      }
    }

    const msg = (o.message || "").toUpperCase();
    const isClosed = o.positionStage === "CLOSED";
    const pnl = Number.isFinite(o.realizedPnlUsd) ? Number(o.realizedPnlUsd) : 0;

    const hitTp2Or3 =
      o.positionStage === "TP2_TRAIL" ||
      msg.includes("AUTO TP2") ||
      msg.includes("AUTO TP3") ||
      msg.includes("TP2 30%");
    const isProfitLock =
      msg.includes("TRAILING PROFIT LOCK") ||
      (isClosed && pnl > 0 && (msg.includes("TP1") || msg.includes("BE LOCK")));
    const isFullSl =
      msg.includes("AUTO SL GUARD") ||
      (isClosed && pnl < 0 && !isRunnerStage && !hitTp2Or3);
    const hitTp1 =
      isRunnerStage ||
      hitTp2Or3 ||
      isProfitLock ||
      msg.includes("AUTO TP1") ||
      msg.includes("TP1 50%") ||
      (isClosed && pnl > 0 && !msg.includes("ROI EXIT"));

    if (isClosed || isRunnerStage) {
      resolvedOrdersCount++;
    }
    if (hitTp1) {
      tp1HitCount++;
    }
    if (hitTp2Or3) {
      runnerConvertedCount++;
    }
    if (isProfitLock) {
      profitLockStopsCount++;
    }
    if (isFullSl) {
      fullSlStopsCount++;
    }
  }

  const activeRunnersCount = openPositions.filter(
    (p) => p.positionStage === "TP1_BE" || p.positionStage === "TP2_TRAIL",
  ).length;

  return {
    trackedOrdersCount: filled.length,
    resolvedOrdersCount,
    limitPullbackCount,
    avgEntrySlippageR:
      slipSamples > 0 ? Number((slipSumR / slipSamples).toFixed(3)) : null,
    tp1HitCount,
    tp1HitRatePct:
      resolvedOrdersCount > 0
        ? Number(((tp1HitCount / resolvedOrdersCount) * 100).toFixed(1))
        : null,
    runnerConvertedCount,
    runnerConversionPct:
      tp1HitCount > 0
        ? Number(((runnerConvertedCount / tp1HitCount) * 100).toFixed(1))
        : null,
    profitLockStopsCount,
    fullSlStopsCount,
    activeRunnersCount,
  };
}
