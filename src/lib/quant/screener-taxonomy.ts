/**
 * Screener & Fundamental Analysis 2.0 — Canonical Orthogonal Taxonomy
 *
 * Consolidates 49 overlapping ScreenerPresets -> 20 canonical presets (8 FA + 12 Core/Price/Quant)
 * and 32 Universe UI tabs -> 12 clean workspaces, while preserving 100% backward-compatible
 * alias resolution for legacy URLs, API queries, and test suites.
 *
 * Pure module (zero "server-only") — safe for both Server APIs and Client UI.
 */

export type CanonicalStrategyGroup = "core" | "price_action" | "quant" | "fundamental";

export type CanonicalScreenerPreset =
  // 1. Core Execution (4)
  | "all"
  | "apex_buy_now"
  | "orca_master_elite"
  | "near_buy_point"
  // 2. Price Action & Smart Money Flow (5)
  | "smart_money_inflow"
  | "reversal_confluence"
  | "smc_structure"
  | "volatility_breakout"
  | "trend_alignment"
  // 3. Quant & Risk (3)
  | "quant_mean_revert"
  | "quant_low_beta"
  | "quant_asymmetric"
  // 4. Fundamental & Valuation (8)
  | "fa_fortress"
  | "earnings_quality"
  | "buffett_compounder"
  | "garp_growth"
  | "deep_value"
  | "piotroski_diamonds"
  | "dividend_aristocrat"
  | "consensus_upside";

export type LegacyOnlyPreset =
  | "quant_kelly_edge"
  | "orca_apex_quant"
  | "historical_edge"
  | "sector_leading"
  | "vsa_no_supply"
  | "rs_leaders"
  | "mtf_confluence"
  | "bottom_confluence"
  | "smc_golden_pocket"
  | "flip_zone_retest"
  | "quant_edge"
  | "confluence"
  | "vcp"
  | "ttm_squeeze"
  | "canslim"
  | "dividend"
  | "growth"
  | "value"
  | "breakout"
  | "ma_cross"
  | "magic_formula"
  | "tight_closes_vdu"
  | "wyckoff_spring"
  | "vcp_vdu"
  | "canslim_accel"
  | "triple_confluence"
  | "swing_divergence"
  | "beneish_safe"
  | "lynch_fast_grower"
  | "graham_ncav"
  | "cash_conversion_cycle"
  | "super_compounder"
  | "book_tax_clean"
  | "mispriced_growth"
  | "merton_safe"
  | "mtf_candle_cluster";

export type AnyScreenerPreset = CanonicalScreenerPreset | LegacyOnlyPreset;

export interface CanonicalPresetMeta {
  id: CanonicalScreenerPreset;
  category: CanonicalStrategyGroup;
  label: string;
  dotColor: string;
  desc: string;
  absorbs: LegacyOnlyPreset[];
}

export const CANONICAL_PRESETS: CanonicalPresetMeta[] = [
  // Core Execution (4)
  {
    id: "all",
    category: "core",
    label: "Tất cả",
    dotColor: "bg-text-muted",
    desc: "Toàn bộ thị trường niêm yết",
    absorbs: [],
  },
  {
    id: "apex_buy_now",
    category: "core",
    label: "Điểm Mua Kích Hoạt",
    dotColor: "bg-emerald-400",
    desc: "Kích hoạt điểm mua tức thời: Chạm vùng mua + Bùng nổ dòng tiền + Dư địa cản >= 3.5% + R:R >= 1.6x",
    absorbs: [],
  },
  {
    id: "orca_master_elite",
    category: "core",
    label: "Orca Master & Edge",
    dotColor: "bg-amber-400",
    desc: "Top đa trụ cột Orca Master >= 74 kết hợp lợi thế xác suất lịch sử (Historical Edge)",
    absorbs: ["historical_edge"],
  },
  {
    id: "near_buy_point",
    category: "core",
    label: "Sát Điểm Mua",
    dotColor: "bg-emerald-400",
    desc: "Cổ phiếu sát vùng mua chuẩn (|Lệch| <= 2.2%), thanh khoản ổn định, rủi ro cắt lỗ thấp",
    absorbs: [],
  },

  // Price Action & Flow (5)
  {
    id: "smart_money_inflow",
    category: "price_action",
    label: "Cá Mập & VSA Cạn Cung",
    dotColor: "bg-purple-400",
    desc: "Dấu chân dòng tiền tổ chức: Pocket Pivot, Mua chủ động cao, Stopping Volume & VSA No Supply",
    absorbs: ["vsa_no_supply"],
  },
  {
    id: "reversal_confluence",
    category: "price_action",
    label: "Đảo Chiều Chân Sóng",
    dotColor: "bg-cyan-400",
    desc: "Hợp lưu đảo chiều sớm tại đáy: Wyckoff Spring / Swing Đáy + Phân kỳ dương + Nến đảo chiều đa khung",
    absorbs: ["orca_apex_quant", "bottom_confluence", "triple_confluence", "swing_divergence", "mtf_candle_cluster"],
  },
  {
    id: "smc_structure",
    category: "price_action",
    label: "Cấu Trúc SMC & Flip Zone",
    dotColor: "bg-blue-400",
    desc: "Hợp lưu cấu trúc thanh khoản: Order Block / Golden Pocket Fibo 0.618-0.65 & Retest Flip Zone",
    absorbs: ["smc_golden_pocket", "flip_zone_retest"],
  },
  {
    id: "volatility_breakout",
    category: "price_action",
    label: "Nén Biến Động & Bùng Nổ",
    dotColor: "bg-teal-400",
    desc: "Co hẹp độ biến động (VCP, Tight Closes, TTM Squeeze, VDU) & bùng nổ thanh khoản / Spring",
    absorbs: ["vcp", "vcp_vdu", "tight_closes_vdu", "ttm_squeeze", "breakout", "wyckoff_spring"],
  },
  {
    id: "trend_alignment",
    category: "price_action",
    label: "Xu Hướng & Ngành Dẫn Dắt",
    dotColor: "bg-emerald-400",
    desc: "Đồng thuận đa khung H1-D1-W1, trật tự MA tăng (Golden Cross) & Ngành dẫn dắt RRG",
    absorbs: ["ma_cross", "mtf_confluence", "confluence", "sector_leading"],
  },

  // Quant & Risk (3)
  {
    id: "quant_mean_revert",
    category: "quant",
    label: "Quant Mean Reversion",
    dotColor: "bg-cyan-400",
    desc: "Mô hình Ornstein-Uhlenbeck (Z-Score <= -1.4, bán rã t½ <= 35P) & Quant Edge tổng hợp",
    absorbs: ["quant_edge"],
  },
  {
    id: "quant_low_beta",
    category: "quant",
    label: "Low-Beta Chất Lượng",
    dotColor: "bg-blue-400",
    desc: "Bất thường Low-Beta AQR: Beta <= 0.88 kết hợp chất lượng BCTC cao",
    absorbs: [],
  },
  {
    id: "quant_asymmetric",
    category: "quant",
    label: "Triple-Barrier R/R Cao",
    dotColor: "bg-amber-400",
    desc: "Tỷ lệ Lợi nhuận / Rủi ro bất đối xứng >= 1.8x theo mô hình biến động Triple-Barrier",
    absorbs: ["quant_kelly_edge"],
  },

  // Fundamental & Valuation (8 orthogonal FA Archetypes)
  {
    id: "fa_fortress",
    category: "fundamental",
    label: "Pháo Đài Tài Chính",
    dotColor: "bg-emerald-400",
    desc: "Tiền mặt ròng Net Cash / ICR >= 4.0x / Đòn bẩy an toàn & Merton Distance-to-Default vững",
    absorbs: ["merton_safe"],
  },
  {
    id: "earnings_quality",
    category: "fundamental",
    label: "Chất Lượng Dòng Tiền & BCTC",
    dotColor: "bg-cyan-400",
    desc: "Lợi nhuận tiền mặt thật (CFO/LNST >= 0.95, FCF > 0), Beneish M-Score & BTD sạch, CCC tối ưu",
    absorbs: ["beneish_safe", "book_tax_clean", "cash_conversion_cycle"],
  },
  {
    id: "buffett_compounder",
    category: "fundamental",
    label: "Siêu Tích Lũy (ROIC/ROIIC)",
    dotColor: "bg-amber-400",
    desc: "Compounder chuẩn Buffett: ROIC >= 15%, ROIIC 3Y thực tế cao, Moat biên lợi nhuận bền vững",
    absorbs: ["super_compounder"],
  },
  {
    id: "garp_growth",
    category: "fundamental",
    label: "Tăng Trưởng GARP & CANSLIM",
    dotColor: "bg-purple-400",
    desc: "Tăng tốc doanh thu & LNST (>= 15%), PEG hấp dẫn <= 1.0, ROE >= 13% & RS O'Neil dẫn dắt",
    absorbs: ["lynch_fast_grower", "growth", "canslim", "canslim_accel", "rs_leaders"],
  },
  {
    id: "deep_value",
    category: "fundamental",
    label: "Định Giá Giá Trị & Magic Formula",
    dotColor: "bg-blue-400",
    desc: "P/E, EV/EBITDA, P/B rẻ theo phân vị ngành, Magic Formula, Graham NCAV hoặc Reverse DCF chiết khấu",
    absorbs: ["value", "magic_formula", "graham_ncav", "mispriced_growth"],
  },
  {
    id: "piotroski_diamonds",
    category: "fundamental",
    label: "Piotroski & Sức Khỏe Ngành",
    dotColor: "bg-cyan-400",
    desc: "Động lượng BCTC đa kỳ Piotroski F-Score >= 7 kết hợp Altman Z'' (hoặc Gordon P/B & ROE cho Ngân hàng)",
    absorbs: [],
  },
  {
    id: "dividend_aristocrat",
    category: "fundamental",
    label: "Cổ Tức Tiền Mặt Bền Vững",
    dotColor: "bg-emerald-400",
    desc: "Tỷ suất cổ tức >= 5% được bảo chứng bởi FCF dương và tỷ lệ chi trả an toàn",
    absorbs: ["dividend"],
  },
  {
    id: "consensus_upside",
    category: "fundamental",
    label: "Đồng Thuận Định Giá CTCK",
    dotColor: "bg-indigo-400",
    desc: "Upside tới giá mục tiêu đồng thuận CTCK >= 20% kèm nền tảng cơ bản đạt chuẩn",
    absorbs: [],
  },
];

export const PRESET_ALIASES: Record<AnyScreenerPreset, CanonicalScreenerPreset> = (() => {
  const map = {} as Record<AnyScreenerPreset, CanonicalScreenerPreset>;
  for (const meta of CANONICAL_PRESETS) {
    map[meta.id] = meta.id;
    for (const legacy of meta.absorbs) {
      map[legacy] = meta.id;
    }
  }
  return map;
})();

export function resolveCanonicalPreset(raw: string | null | undefined): CanonicalScreenerPreset {
  if (!raw) return "all";
  const key = raw.trim().toLowerCase() as AnyScreenerPreset;
  return PRESET_ALIASES[key] ?? "all";
}

/**
 * Dedicated 32-bit Fundamental Analysis orthogonal register (`faBitFlags`).
 * Kept separate from `SCREENER_BIT` (technical/legacy 32-bit register) so neither overflows.
 */
export const FA_BIT = {
  VERIFIED_BCTC: 1 << 0,
  EXEMPT_FINANCIAL: 1 << 1,
  NET_CASH: 1 << 2,
  SAFE_DEBT: 1 << 3,
  MERTON_SAFE: 1 << 4,
  QUALITY_EARNINGS: 1 << 5,
  BENEISH_SAFE: 1 << 6,
  BOOK_TAX_CLEAN: 1 << 7,
  HIGH_ROIC: 1 << 8,
  SUPER_COMPOUNDER: 1 << 9,
  BUFFETT_COMPOUNDER: 1 << 10,
  GARP_GROWTH: 1 << 11,
  DEEP_VALUE: 1 << 12,
  DIVIDEND_ARISTOCRAT: 1 << 13,
  WORKING_CAP_CHAMP: 1 << 14,
  PIOTROSKI_STRONG: 1 << 15,
  QUARTERLY_INFLECTION: 1 << 16,
  CONSENSUS_UPSIDE: 1 << 17,
  MISPRICED_GROWTH: 1 << 18,
  GRAHAM_NCAV: 1 << 19,
  LOW_SECTOR_PE: 1 << 20,
  HIGH_SECTOR_ROE: 1 << 21,
  HIGH_SECTOR_ROIC: 1 << 22,
  REAL_ESTATE_TRACK: 1 << 23,
  BANKING_TRACK: 1 << 24,
} as const;

/**
 * UI Workspace Consolidation: 32 Universe tabs -> 12 canonical workspaces
 */
export type CanonicalWorkspaceId =
  | "master-matrix"
  | "multi-source"
  | "oquant-studio"
  | "trend-breakout"
  | "wyckoff-smc"
  | "patterns-candles"
  | "fireant-presets"
  | "fa-screener"
  | "valuation-studio"
  | "growth-canslim-4m"
  | "macro-sector-flow"
  | "crypto";

export interface WorkspaceGroupDef {
  id: "strategy_hub" | "price_action" | "fundamental_val" | "macro_crypto";
  title: string;
  badge: string;
  items: { id: CanonicalWorkspaceId; label: string }[];
}

export const WORKSPACE_GROUPS: WorkspaceGroupDef[] = [
  {
    id: "strategy_hub",
    title: "Chiến lược Tổng hợp",
    badge: "Master Hub",
    items: [
      { id: "master-matrix", label: "Bảng Lọc Đa Yếu Tố (20 Chiến lược)" },
      { id: "multi-source", label: "Đa Nguồn Pro (Khối ngoại & CTCK)" },
      { id: "oquant-studio", label: "OQuant AI Studio & Bots" },
    ],
  },
  {
    id: "price_action",
    title: "Kỹ thuật & Hành vi Giá",
    badge: "Price & Flow",
    items: [
      { id: "trend-breakout", label: "Minervini VCP · RS · MA" },
      { id: "wyckoff-smc", label: "Wyckoff · Elliott · Phân kỳ" },
      { id: "patterns-candles", label: "Hợp lưu Nến & Mô hình" },
      { id: "fireant-presets", label: "Bộ lọc Kỹ thuật FireAnt" },
    ],
  },
  {
    id: "fundamental_val",
    title: "Cơ bản & Định giá FA",
    badge: "FA 2.0",
    items: [
      { id: "fa-screener", label: "Sức khỏe Tài chính & F-Score" },
      { id: "valuation-studio", label: "Định giá Ngành & Chiết khấu" },
      { id: "growth-canslim-4m", label: "CANSLIM & 4M Phil Town" },
    ],
  },
  {
    id: "macro_crypto",
    title: "Vĩ mô, Ngành & Crypto",
    badge: "Macro & Multi-Asset",
    items: [
      { id: "macro-sector-flow", label: "Vĩ mô · RRG · Dòng tiền Ngành" },
      { id: "crypto", label: "Tiền mã hóa Crypto" },
    ],
  },
];

export interface UniverseAliasResolution {
  workspace: CanonicalWorkspaceId;
  defaultPreset?: CanonicalScreenerPreset;
  subTab?: string;
}

export const UNIVERSE_ALIASES: Record<string, UniverseAliasResolution> = {
  // Canonical self-mappings
  "master-matrix": { workspace: "master-matrix", defaultPreset: "apex_buy_now" },
  "multi-source": { workspace: "multi-source" },
  "oquant-studio": { workspace: "oquant-studio" },
  "trend-breakout": { workspace: "trend-breakout", defaultPreset: "volatility_breakout" },
  "wyckoff-smc": { workspace: "wyckoff-smc", defaultPreset: "reversal_confluence" },
  "patterns-candles": { workspace: "patterns-candles", defaultPreset: "trend_alignment" },
  "fireant-presets": { workspace: "fireant-presets" },
  "fa-screener": { workspace: "fa-screener", defaultPreset: "fa_fortress" },
  "valuation-studio": { workspace: "valuation-studio", defaultPreset: "deep_value" },
  "growth-canslim-4m": { workspace: "growth-canslim-4m", defaultPreset: "garp_growth" },
  "macro-sector-flow": { workspace: "macro-sector-flow" },
  crypto: { workspace: "crypto" },

  // Legacy 32-tab aliases
  "apex-buy-now": { workspace: "master-matrix", defaultPreset: "apex_buy_now" },
  "apex-quant": { workspace: "master-matrix", defaultPreset: "reversal_confluence" },
  "historical-edge": { workspace: "master-matrix", defaultPreset: "orca_master_elite" },
  "orca-master": { workspace: "master-matrix", defaultPreset: "orca_master_elite" },
  "smart-money": { workspace: "master-matrix", defaultPreset: "smart_money_inflow" },
  "buy-point": { workspace: "master-matrix", defaultPreset: "near_buy_point" },
  "quant-edge": { workspace: "master-matrix", defaultPreset: "quant_mean_revert" },
  "alpha-beta": { workspace: "master-matrix", defaultPreset: "quant_low_beta", subTab: "alpha-beta" },
  stocks: { workspace: "master-matrix", defaultPreset: "all" },
  "oquant-quant": { workspace: "oquant-studio" },
  "miquant-quant": { workspace: "oquant-studio" },
  "fireant-screener": { workspace: "fireant-presets" },
  "rs-leaders": { workspace: "trend-breakout", defaultPreset: "garp_growth" },
  minervini: { workspace: "trend-breakout", defaultPreset: "volatility_breakout", subTab: "minervini" },
  "ma-cross": { workspace: "trend-breakout", defaultPreset: "trend_alignment", subTab: "ma-cross" },
  wyckoff: { workspace: "wyckoff-smc", defaultPreset: "reversal_confluence", subTab: "wyckoff" },
  elliott: { workspace: "wyckoff-smc", defaultPreset: "reversal_confluence", subTab: "elliott" },
  divergence: { workspace: "wyckoff-smc", defaultPreset: "reversal_confluence", subTab: "divergence" },
  candlestick: { workspace: "patterns-candles", subTab: "candlestick" },
  "ma-confluence": { workspace: "patterns-candles", subTab: "ma-confluence" },
  confluence: { workspace: "patterns-candles", defaultPreset: "trend_alignment" },
  fundamental: { workspace: "fa-screener", defaultPreset: "fa_fortress", subTab: "fundamental" },
  piotroski: { workspace: "fa-screener", defaultPreset: "piotroski_diamonds", subTab: "piotroski" },
  valuation: { workspace: "valuation-studio", defaultPreset: "deep_value", subTab: "valuation" },
  canslim: { workspace: "growth-canslim-4m", defaultPreset: "garp_growth", subTab: "canslim" },
  "four-m": { workspace: "growth-canslim-4m", defaultPreset: "buffett_compounder", subTab: "four-m" },
  "systemic-radar": { workspace: "macro-sector-flow", subTab: "systemic-radar" },
  "macro-radar": { workspace: "macro-sector-flow", subTab: "macro-radar" },
  "rrg-rotation": { workspace: "macro-sector-flow", subTab: "rrg-rotation" },
  "sector-flow": { workspace: "macro-sector-flow", subTab: "sector-flow" },
  "sector-leaders": { workspace: "macro-sector-flow", subTab: "sector-leaders" },
  "sector-screener": { workspace: "macro-sector-flow", subTab: "sector-leaders" },
};

export function resolveUniverseRoute(raw: string | null | undefined): UniverseAliasResolution {
  if (!raw) return { workspace: "master-matrix", defaultPreset: "apex_buy_now" };
  const key = raw.trim().toLowerCase();
  return UNIVERSE_ALIASES[key] ?? { workspace: "master-matrix", defaultPreset: "apex_buy_now" };
}
