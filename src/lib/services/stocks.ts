import "server-only";

/**
 * VN stocks service — barrel re-export.
 * Board/quotes/indices: stocks-board.ts (critical for / and /stocks)
 * Symbol detail: stocks-detail.ts
 */
export {
  getVnQuotes,
  getVnIndices,
  getVnOhlcv,
  getVnMarketBoard,
  getVn30Board,
  getVnUniverseList,
} from "./stocks-board";

export {
  getVnStockDetail,
  type VnStockDetail,
} from "./stocks-detail";

export {
  analyzeExposure,
  getExposureMapping,
  type ExposureAnalysis,
  type ExposureMapping,
} from "./exposure-chain";

export {
  attributeDrivers,
  type DriverAttribution,
  type DriverFeatures,
} from "./driver-attribution";

export {
  computeStarRatings,
  type StarRatings,
} from "./star-ratings";

export {
  classifyMarketRegime,
  type MarketRegimeResult,
  type MarketRegimeType,
} from "./market-regime";

export {
  clusterNewsTitles,
  extractFinancialIntent,
} from "./vietnamese-financial-nlu";

export {
  computeDomesticFlow,
  type DomesticFlowResult,
  type StockOrderData,
} from "./domestic-flow";

export {
  classifyVolumeSurge,
  type VolumeSurge,
} from "./volume-surge";

export {
  extractEarningsFromHeadline,
  detectReportingPeriod,
  getBCTCDeadlines,
  type BctcDeadline,
  type ExtractedEarnings,
} from "./earnings-intel";

export {
  computeMarketPulse,
  type MarketPulseResult,
  type MarketPulseBreakdown,
} from "./market-pulse";

export {
  rankSectorsByFlow,
  type SectorFlowItem,
  type StockFlowItem,
} from "./sector-flow";
