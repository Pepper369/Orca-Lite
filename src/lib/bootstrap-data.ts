import type { IndexQuote, Quote } from "./types";
import type { CryptoMarketRow, CryptoSummary } from "./services/crypto";
import type { ForexRow } from "./services/forex";
import type { CommodityMarket } from "./services/commodities";
import type { EconomicSnapshot } from "./economic-data";
import type { WorldBankMacroBundle } from "./providers/worldbank";
import { VN_MACRO_INDICATORS } from "./providers/worldbank";

export const BOOTSTRAP_INDICES: IndexQuote[] = [
  { code: "VNINDEX", name: "VN-Index", value: 1286.5, change: 5.2, changePercent: 0.41, volume: 720000000, updatedAt: null },
  { code: "VN30", name: "VN30-Index", value: 1342.8, change: 7.1, changePercent: 0.53, volume: 290000000, updatedAt: null },
  { code: "HNX", name: "HNX-Index", value: 237.2, change: -0.4, changePercent: -0.17, volume: 68000000, updatedAt: null },
  { code: "UPCOM", name: "UPCoM-Index", value: 92.4, change: 0.15, changePercent: 0.16, volume: 45000000, updatedAt: null },
];

const RAW_VN30 = [
  { symbol: "VCB", name: "Vietcombank", price: 92.5, change: 0.7, changePercent: 0.76, referencePrice: 91.8, ceilingPrice: 98.2, floorPrice: 85.4, volume: 1850000, quoteVolume: 171125000 },
  { symbol: "FPT", name: "FPT Corporation", price: 138.2, change: 2.1, changePercent: 1.54, referencePrice: 136.1, ceilingPrice: 145.6, floorPrice: 126.6, volume: 3420000, quoteVolume: 472644000 },
  { symbol: "HPG", name: "Hòa Phát Group", price: 28.45, change: 0.35, changePercent: 1.25, referencePrice: 28.1, ceilingPrice: 30.05, floorPrice: 26.15, volume: 22400000, quoteVolume: 637280000 },
  { symbol: "MBB", name: "MBBank", price: 25.1, change: 0.3, changePercent: 1.21, referencePrice: 24.8, ceilingPrice: 26.5, floorPrice: 23.1, volume: 14200000, quoteVolume: 356420000 },
  { symbol: "TCB", name: "Techcombank", price: 24.6, change: 0.2, changePercent: 0.82, referencePrice: 24.4, ceilingPrice: 26.1, floorPrice: 22.7, volume: 11800000, quoteVolume: 290280000 },
  { symbol: "ACB", name: "ACB", price: 25.4, change: 0.15, changePercent: 0.59, referencePrice: 25.25, ceilingPrice: 27.0, floorPrice: 23.5, volume: 8900000, quoteVolume: 226060000 },
  { symbol: "VPB", name: "VPBank", price: 19.85, change: 0.1, changePercent: 0.51, referencePrice: 19.75, ceilingPrice: 21.1, floorPrice: 18.4, volume: 16500000, quoteVolume: 327525000 },
  { symbol: "CTG", name: "VietinBank", price: 36.8, change: 0.4, changePercent: 1.10, referencePrice: 36.4, ceilingPrice: 38.9, floorPrice: 33.9, volume: 6200000, quoteVolume: 228160000 },
  { symbol: "BID", name: "BIDV", price: 50.2, change: 0.5, changePercent: 1.01, referencePrice: 49.7, ceilingPrice: 53.1, floorPrice: 46.3, volume: 2100000, quoteVolume: 105420000 },
  { symbol: "STB", name: "Sacombank", price: 34.1, change: 0.45, changePercent: 1.34, referencePrice: 33.65, ceilingPrice: 36.0, floorPrice: 31.3, volume: 15400000, quoteVolume: 525140000 },
  { symbol: "SSI", name: "Chứng khoán SSI", price: 32.5, change: 0.6, changePercent: 1.88, referencePrice: 31.9, ceilingPrice: 34.1, floorPrice: 29.7, volume: 18900000, quoteVolume: 614250000 },
  { symbol: "VND", name: "VNDirect", price: 15.65, change: 0.25, changePercent: 1.62, referencePrice: 15.4, ceilingPrice: 16.45, floorPrice: 14.35, volume: 12300000, quoteVolume: 192495000 },
  { symbol: "MWG", name: "Thế Giới Di Động", price: 68.4, change: 0.9, changePercent: 1.33, referencePrice: 67.5, ceilingPrice: 72.2, floorPrice: 62.8, volume: 7600000, quoteVolume: 519840000 },
  { symbol: "MSN", name: "Masan Group", price: 78.5, change: 1.2, changePercent: 1.55, referencePrice: 77.3, ceilingPrice: 82.7, floorPrice: 71.9, volume: 5400000, quoteVolume: 423900000 },
  { symbol: "VNM", name: "Vinamilk", price: 67.8, change: -0.2, changePercent: -0.29, referencePrice: 68.0, ceilingPrice: 72.7, floorPrice: 63.3, volume: 3800000, quoteVolume: 257640000 },
  { symbol: "VIC", name: "Vingroup", price: 42.1, change: 0.3, changePercent: 0.72, referencePrice: 41.8, ceilingPrice: 44.7, floorPrice: 38.9, volume: 4600000, quoteVolume: 193660000 },
  { symbol: "VHM", name: "Vinhomes", price: 43.8, change: 0.5, changePercent: 1.15, referencePrice: 43.3, ceilingPrice: 46.3, floorPrice: 40.3, volume: 8200000, quoteVolume: 359160000 },
  { symbol: "VRE", name: "Vincom Retail", price: 18.9, change: 0.15, changePercent: 0.80, referencePrice: 18.75, ceilingPrice: 20.05, floorPrice: 17.45, volume: 5100000, quoteVolume: 96390000 },
  { symbol: "GAS", name: "PV Gas", price: 71.5, change: 0.2, changePercent: 0.28, referencePrice: 71.3, ceilingPrice: 76.2, floorPrice: 66.4, volume: 1100000, quoteVolume: 78650000 },
  { symbol: "PLX", name: "Petrolimex", price: 41.2, change: 0.35, changePercent: 0.86, referencePrice: 40.85, ceilingPrice: 43.7, floorPrice: 38.0, volume: 1450000, quoteVolume: 59740000 },
  { symbol: "BSR", name: "Lọc hóa dầu Bình Sơn", price: 23.4, change: 0.3, changePercent: 1.30, referencePrice: 23.1, ceilingPrice: 26.5, floorPrice: 19.7, volume: 9200000, quoteVolume: 215280000 },
  { symbol: "POW", name: "PV Power", price: 12.85, change: 0.1, changePercent: 0.78, referencePrice: 12.75, ceilingPrice: 13.6, floorPrice: 11.9, volume: 6800000, quoteVolume: 87380000 },
  { symbol: "DGC", name: "Hóa chất Đức Giang", price: 114.5, change: 2.0, changePercent: 1.78, referencePrice: 112.5, ceilingPrice: 120.3, floorPrice: 104.7, volume: 2900000, quoteVolume: 332050000 },
  { symbol: "DCM", name: "Đạm Cà Mau", price: 38.2, change: 0.4, changePercent: 1.06, referencePrice: 37.8, ceilingPrice: 40.4, floorPrice: 35.2, volume: 3400000, quoteVolume: 129880000 },
  { symbol: "DPM", name: "Đạm Phú Mỹ", price: 35.6, change: 0.3, changePercent: 0.85, referencePrice: 35.3, ceilingPrice: 37.7, floorPrice: 32.9, volume: 2800000, quoteVolume: 99680000 },
  { symbol: "PNJ", name: "Vàng bạc Đá quý Phú Nhuận", price: 98.4, change: 0.8, changePercent: 0.82, referencePrice: 97.6, ceilingPrice: 104.4, floorPrice: 90.8, volume: 1200000, quoteVolume: 118080000 },
  { symbol: "GMD", name: "Gemadept", price: 82.3, change: 1.1, changePercent: 1.35, referencePrice: 81.2, ceilingPrice: 86.8, floorPrice: 75.6, volume: 1900000, quoteVolume: 156370000 },
  { symbol: "VHC", name: "Vĩnh Hoàn", price: 72.8, change: 0.7, changePercent: 0.97, referencePrice: 72.1, ceilingPrice: 77.1, floorPrice: 67.1, volume: 1650000, quoteVolume: 120120000 },
  { symbol: "REE", name: "Cơ Điện Lạnh REE", price: 65.4, change: 0.6, changePercent: 0.93, referencePrice: 64.8, ceilingPrice: 69.3, floorPrice: 60.3, volume: 980000, quoteVolume: 64092000 },
  { symbol: "KDH", name: "Nhà Khang Điền", price: 37.5, change: 0.4, changePercent: 1.08, referencePrice: 37.1, ceilingPrice: 39.65, floorPrice: 34.55, volume: 3100000, quoteVolume: 116250000 },
  { symbol: "DXG", name: "Đất Xanh", price: 16.2, change: 0.3, changePercent: 1.89, referencePrice: 15.9, ceilingPrice: 17.0, floorPrice: 14.8, volume: 8400000, quoteVolume: 136080000 },
  { symbol: "PDR", name: "Phát Đạt", price: 22.8, change: 0.35, changePercent: 1.56, referencePrice: 22.45, ceilingPrice: 24.0, floorPrice: 20.9, volume: 5600000, quoteVolume: 127680000 },
];

export const BOOTSTRAP_VN30_QUOTES: Quote[] = RAW_VN30.map((q) => ({
  ...q,
  assetClass: "stock" as const,
}));

export const BOOTSTRAP_STOCKS_DATA = {
  indices: BOOTSTRAP_INDICES,
  quotes: BOOTSTRAP_VN30_QUOTES,
  count: BOOTSTRAP_VN30_QUOTES.length,
  universeSize: BOOTSTRAP_VN30_QUOTES.length,
  sessionDate: new Date().toISOString().slice(0, 10),
  boardTier: "vn30" as const,
};

export const BOOTSTRAP_CRYPTO_ROWS: CryptoMarketRow[] = [
  { symbol: "BTCUSDT", baseAsset: "BTC", assetClass: "crypto", price: 96850.5, change: 1950.5, changePercent: 2.05, open: 94900, high: 97500, low: 94200, volume: 42500, quoteVolume: 4085000000, trades24h: 2150000, updatedAt: new Date().toISOString() },
  { symbol: "ETHUSDT", baseAsset: "ETH", assetClass: "crypto", price: 2780.2, change: 54.2, changePercent: 1.99, open: 2726, high: 2820, low: 2690, volume: 310000, quoteVolume: 855600000, trades24h: 1250000, updatedAt: new Date().toISOString() },
  { symbol: "SOLUSDT", baseAsset: "SOL", assetClass: "crypto", price: 192.45, change: 7.85, changePercent: 4.25, open: 184.6, high: 196.2, low: 182.1, volume: 2950000, quoteVolume: 562000000, trades24h: 890000, updatedAt: new Date().toISOString() },
  { symbol: "BNBUSDT", baseAsset: "BNB", assetClass: "crypto", price: 652.8, change: 8.5, changePercent: 1.32, open: 644.3, high: 660.0, low: 640.5, volume: 480000, quoteVolume: 312000000, trades24h: 420000, updatedAt: new Date().toISOString() },
  { symbol: "XRPUSDT", baseAsset: "XRP", assetClass: "crypto", price: 2.45, change: 0.12, changePercent: 5.15, open: 2.33, high: 2.55, low: 2.28, volume: 380000000, quoteVolume: 925000000, trades24h: 980000, updatedAt: new Date().toISOString() },
  { symbol: "DOGEUSDT", baseAsset: "DOGE", assetClass: "crypto", price: 0.265, change: 0.012, changePercent: 4.74, open: 0.253, high: 0.278, low: 0.248, volume: 1450000000, quoteVolume: 382000000, trades24h: 620000, updatedAt: new Date().toISOString() },
  { symbol: "ADAUSDT", baseAsset: "ADA", assetClass: "crypto", price: 0.785, change: 0.025, changePercent: 3.29, open: 0.760, high: 0.810, low: 0.750, volume: 185000000, quoteVolume: 145000000, trades24h: 310000, updatedAt: new Date().toISOString() },
  { symbol: "AVAXUSDT", baseAsset: "AVAX", assetClass: "crypto", price: 34.2, change: 1.15, changePercent: 3.48, open: 33.05, high: 35.4, low: 32.6, volume: 3800000, quoteVolume: 129000000, trades24h: 280000, updatedAt: new Date().toISOString() },
  { symbol: "SUIUSDT", baseAsset: "SUI", assetClass: "crypto", price: 3.25, change: 0.18, changePercent: 5.86, open: 3.07, high: 3.38, low: 3.02, volume: 75000000, quoteVolume: 242000000, trades24h: 520000, updatedAt: new Date().toISOString() },
  { symbol: "NEARUSDT", baseAsset: "NEAR", assetClass: "crypto", price: 5.42, change: 0.22, changePercent: 4.23, open: 5.20, high: 5.65, low: 5.12, volume: 24000000, quoteVolume: 129500000, trades24h: 290000, updatedAt: new Date().toISOString() },
  { symbol: "LINKUSDT", baseAsset: "LINK", assetClass: "crypto", price: 18.75, change: 0.45, changePercent: 2.46, open: 18.30, high: 19.20, low: 18.05, volume: 6800000, quoteVolume: 126800000, trades24h: 210000, updatedAt: new Date().toISOString() },
  { symbol: "PEPEUSDT", baseAsset: "PEPE", assetClass: "crypto", price: 0.0000108, change: 0.0000005, changePercent: 4.85, open: 0.0000103, high: 0.0000115, low: 0.0000101, volume: 18500000000000, quoteVolume: 198000000, trades24h: 410000, updatedAt: new Date().toISOString() },
  { symbol: "SHIBUSDT", baseAsset: "SHIB", assetClass: "crypto", price: 0.0000185, change: 0.0000006, changePercent: 3.35, open: 0.0000179, high: 0.0000192, low: 0.0000176, volume: 6200000000000, quoteVolume: 114000000, trades24h: 240000, updatedAt: new Date().toISOString() },
  { symbol: "DOTUSDT", baseAsset: "DOT", assetClass: "crypto", price: 7.25, change: 0.15, changePercent: 2.11, open: 7.10, high: 7.45, low: 7.02, volume: 12000000, quoteVolume: 86800000, trades24h: 180000, updatedAt: new Date().toISOString() },
  { symbol: "LTCUSDT", baseAsset: "LTC", assetClass: "crypto", price: 104.5, change: 2.8, changePercent: 2.75, open: 101.7, high: 106.8, low: 100.5, volume: 1100000, quoteVolume: 114200000, trades24h: 195000, updatedAt: new Date().toISOString() },
];

export const BOOTSTRAP_CRYPTO_SUMMARY: CryptoSummary = {
  marketCount: BOOTSTRAP_CRYPTO_ROWS.length,
  advancers: 14,
  decliners: 1,
  avgChangePercent: 3.25,
  totalQuoteVolume: 9140000000,
  btcChangePercent: 2.05,
  ethChangePercent: 1.99,
  fetchedAt: new Date().toISOString(),
};

export const BOOTSTRAP_CRYPTO_DATA = {
  rows: BOOTSTRAP_CRYPTO_ROWS,
  summary: BOOTSTRAP_CRYPTO_SUMMARY,
};

const RAW_FOREX: Array<{
  pair: string;
  base: string;
  quote: string;
  symbol: string;
  group: "major" | "cross" | "vnd" | "metal" | "energy";
  price: number;
  changePercent: number;
  updatedAt: string;
}> = [
  { pair: "EURUSD", base: "EUR", quote: "USD", symbol: "EUR/USD", group: "major", price: 1.0852, changePercent: 0.12, updatedAt: new Date().toISOString() },
  { pair: "GBPUSD", base: "GBP", quote: "USD", symbol: "GBP/USD", group: "major", price: 1.2985, changePercent: 0.24, updatedAt: new Date().toISOString() },
  { pair: "USDJPY", base: "USD", quote: "JPY", symbol: "USD/JPY", group: "major", price: 152.45, changePercent: -0.18, updatedAt: new Date().toISOString() },
  { pair: "AUDUSD", base: "AUD", quote: "USD", symbol: "AUD/USD", group: "major", price: 0.6582, changePercent: 0.35, updatedAt: new Date().toISOString() },
  { pair: "USDCAD", base: "USD", quote: "CAD", symbol: "USD/CAD", group: "major", price: 1.3865, changePercent: -0.08, updatedAt: new Date().toISOString() },
  { pair: "USDCHF", base: "USD", quote: "CHF", symbol: "USD/CHF", group: "major", price: 0.8845, changePercent: -0.05, updatedAt: new Date().toISOString() },

  { pair: "EURGBP", base: "EUR", quote: "GBP", symbol: "EUR/GBP", group: "cross", price: 0.8358, changePercent: -0.10, updatedAt: new Date().toISOString() },
  { pair: "EURJPY", base: "EUR", quote: "JPY", symbol: "EUR/JPY", group: "cross", price: 165.42, changePercent: -0.06, updatedAt: new Date().toISOString() },
  { pair: "GBPJPY", base: "GBP", quote: "JPY", symbol: "GBP/JPY", group: "cross", price: 197.95, changePercent: 0.05, updatedAt: new Date().toISOString() },

  { pair: "USDVND", base: "USD", quote: "VND", symbol: "USD/VND", group: "vnd", price: 25450, changePercent: 0.08, updatedAt: new Date().toISOString() },
  { pair: "EURVND", base: "EUR", quote: "VND", symbol: "EUR/VND", group: "vnd", price: 27618, changePercent: 0.20, updatedAt: new Date().toISOString() },
  { pair: "JPYVND", base: "JPY", quote: "VND", symbol: "JPY/VND", group: "vnd", price: 166.9, changePercent: 0.26, updatedAt: new Date().toISOString() },
  { pair: "GBPVND", base: "GBP", quote: "VND", symbol: "GBP/VND", group: "vnd", price: 33046, changePercent: 0.32, updatedAt: new Date().toISOString() },

  { pair: "XAUUSD", base: "XAU", quote: "USD", symbol: "XAU/USD (Vàng)", group: "metal", price: 2684.5, changePercent: 0.65, updatedAt: new Date().toISOString() },
  { pair: "XAGUSD", base: "XAG", quote: "USD", symbol: "XAG/USD (Bạc)", group: "metal", price: 31.85, changePercent: 1.15, updatedAt: new Date().toISOString() },
  { pair: "XPTUSD", base: "XPT", quote: "USD", symbol: "XPT/USD (Bạch kim)", group: "metal", price: 985.2, changePercent: 0.42, updatedAt: new Date().toISOString() },

  { pair: "USOIL", base: "USO", quote: "USD", symbol: "Dầu WTI", group: "energy", price: 74.85, changePercent: -0.42, updatedAt: new Date().toISOString() },
  { pair: "UKOIL", base: "UKO", quote: "USD", symbol: "Dầu Brent", group: "energy", price: 78.45, changePercent: -0.35, updatedAt: new Date().toISOString() },
  { pair: "NATGAS", base: "NG", quote: "USD", symbol: "Khí tự nhiên Gas", group: "energy", price: 2.85, changePercent: 2.45, updatedAt: new Date().toISOString() },
];

export const BOOTSTRAP_FOREX_ROWS: ForexRow[] = RAW_FOREX.map((f) => ({
  ...f,
  assetClass: "forex" as const,
  change: f.price * (f.changePercent / 100),
}));

export const BOOTSTRAP_FOREX_DATA = {
  rows: BOOTSTRAP_FOREX_ROWS,
  usdStrengthNote: "Chỉ số DXY dao động 103.5. Tỷ giá USD/VND giữ quanh 25,450 VND với thanh khoản ổn định.",
};

export const BOOTSTRAP_COMMODITIES_CATALOG = [
  {
    key: "kim-vang-the-gioi",
    name: "Gold Spot",
    nameVi: "Vàng quốc tế",
    group: "kim_loai_phi_kim",
    symbol: "GOLD",
    unit: "USD/oz",
    vnImpact: {
      sentiment: "TÍCH CỰC",
      sector: "Bán lẻ & Trang sức",
      stocks: ["PNJ"],
      beneficiaryStocks: ["PNJ"],
      headwindStocks: [],
      mechanism: "Giá vàng tăng thúc đẩy biên lợi nhuận và doanh thu mảng vàng miếng, trang sức.",
    },
  },
  {
    key: "kim-bac-the-gioi",
    name: "Silver Spot",
    nameVi: "Bạc quốc tế",
    group: "kim_loai_phi_kim",
    symbol: "SILVER",
    unit: "USD/oz",
    vnImpact: {
      sentiment: "TÍCH CỰC",
      sector: "Kim loại quý & Linh kiện",
      stocks: ["PNJ"],
      beneficiaryStocks: ["PNJ"],
      headwindStocks: [],
      mechanism: "Nhu cầu kim loại quý và công nghiệp điện tử tăng trưởng.",
    },
  },
  {
    key: "nan-dau-wti",
    name: "WTI Crude Oil",
    nameVi: "Dầu thô WTI",
    group: "nang_luong",
    symbol: "WTI",
    unit: "USD/thùng",
    vnImpact: {
      sentiment: "TÍCH CỰC",
      sector: "Dầu khí",
      stocks: ["GAS", "PVD", "PVS", "BSR", "PLX"],
      beneficiaryStocks: ["PVD", "PVS", "BSR", "GAS"],
      headwindStocks: ["VJC", "HVN"],
      mechanism: "Giá dầu duy trì cao mở rộng cơ hội khoan thăm dò PVD/PVS và crack spread BSR.",
    },
  },
  {
    key: "nan-dau-brent",
    name: "Brent Crude Oil",
    nameVi: "Dầu Brent",
    group: "nang_luong",
    symbol: "BRENT",
    unit: "USD/thùng",
    vnImpact: {
      sentiment: "TÍCH CỰC",
      sector: "Dầu khí",
      stocks: ["BSR", "PLX", "PVS", "PVD"],
      beneficiaryStocks: ["BSR", "PVS", "PVD"],
      headwindStocks: [],
      mechanism: "Hợp đồng xuất khẩu dầu thô và chế biến lọc dầu hưởng lợi.",
    },
  },
  {
    key: "vat-thep-xay-dung",
    name: "Steel Rebar",
    nameVi: "Thép xây dựng",
    group: "vat_lieu_xay_dung",
    symbol: "STEEL",
    unit: "VND/kg",
    vnImpact: {
      sentiment: "TÍCH CỰC",
      sector: "Thép & Xây dựng",
      stocks: ["HPG", "HSG", "NKG"],
      beneficiaryStocks: ["HPG", "HSG", "NKG"],
      headwindStocks: ["CTD", "HBC"],
      mechanism: "Giá bán thép tăng phục hồi biên gộp ngành sản xuất thép HPG/HSG.",
    },
  },
  {
    key: "hoa-ure",
    name: "Urea Fertilizer",
    nameVi: "Phân bón Urê",
    group: "hoa_chat",
    symbol: "UREA",
    unit: "USD/tấn",
    vnImpact: {
      sentiment: "TÍCH CỰC",
      sector: "Hóa chất & Phân bón",
      stocks: ["DCM", "DPM", "BFC"],
      beneficiaryStocks: ["DCM", "DPM"],
      headwindStocks: [],
      mechanism: "Giá phân bón thế giới tăng hỗ trợ giá bán bình quân của Đạm Cà Mau và Đạm Phú Mỹ.",
    },
  },
  {
    key: "han-heo-hoi",
    name: "Live Hog",
    nameVi: "Heo hơi",
    group: "hang_tieu_dung",
    symbol: "PORK",
    unit: "VND/kg",
    vnImpact: {
      sentiment: "TÍCH CỰC",
      sector: "Nông nghiệp & Chăn nuôi",
      stocks: ["DBC", "BAF", "HAG"],
      beneficiaryStocks: ["DBC", "BAF"],
      headwindStocks: [],
      mechanism: "Giá heo hơi nội địa phục hồi mạnh cải thiện trực tiếp lợi nhuận các trang trại 3F.",
    },
  },
  {
    key: "han-ca-phe-robusta",
    name: "Robusta Coffee",
    nameVi: "Cà phê Robusta",
    group: "hang_tieu_dung",
    symbol: "COFFEE",
    unit: "USD/tấn",
    vnImpact: {
      sentiment: "TÍCH CỰC",
      sector: "Nông nghiệp & Xuất khẩu",
      stocks: ["PAN"],
      beneficiaryStocks: ["PAN"],
      headwindStocks: [],
      mechanism: "Việt Nam là nước xuất khẩu Robusta số 1 thế giới; giá cao kỷ lục tạo nguồn thu lớn.",
    },
  },
  {
    key: "nhu-cao-su-tu-nhien",
    name: "Natural Rubber",
    nameVi: "Cao su tự nhiên",
    group: "nhua_va_cao_su",
    symbol: "RUBBER",
    unit: "USD/kg",
    vnImpact: {
      sentiment: "TÍCH CỰC",
      sector: "Cao su & Khu công nghiệp",
      stocks: ["GVR", "PHR", "DPR"],
      beneficiaryStocks: ["GVR", "PHR", "DPR"],
      headwindStocks: ["DRC", "CSM"],
      mechanism: "Giá mủ cao su thiên nhiên tăng hỗ trợ dòng tiền mảng nông nghiệp của GVR/PHR.",
    },
  },
];

export const BOOTSTRAP_COMMODITIES_ROWS = [
  { symbol: "GOLD", name: "Vàng quốc tế", price: 2684.5, change: 17.3, changePercent: 0.65, currency: "USD", unit: "USD/oz", sourceRecords: [{ source: "COMEX Spot", price: 2684.5, timestamp: Date.now() }] },
  { symbol: "SILVER", name: "Bạc quốc tế", price: 31.85, change: 0.36, changePercent: 1.15, currency: "USD", unit: "USD/oz", sourceRecords: [{ source: "COMEX Spot", price: 31.85, timestamp: Date.now() }] },
  { symbol: "WTI", name: "Dầu thô WTI", price: 74.85, change: -0.32, changePercent: -0.42, currency: "USD", unit: "USD/thùng", sourceRecords: [{ source: "NYMEX", price: 74.85, timestamp: Date.now() }] },
  { symbol: "BRENT", name: "Dầu Brent", price: 78.45, change: -0.28, changePercent: -0.35, currency: "USD", unit: "USD/thùng", sourceRecords: [{ source: "ICE", price: 78.45, timestamp: Date.now() }] },
  { symbol: "STEEL", name: "Thép xây dựng", price: 14250, change: 150, changePercent: 1.06, currency: "VND", unit: "VND/kg", sourceRecords: [{ source: "Hòa Phát DOM", price: 14250, timestamp: Date.now() }] },
  { symbol: "UREA", name: "Phân bón Urê", price: 385, change: 8, changePercent: 2.12, currency: "USD", unit: "USD/tấn", sourceRecords: [{ source: "Middle East FOB", price: 385, timestamp: Date.now() }] },
  { symbol: "PORK", name: "Heo hơi", price: 68500, change: 1500, changePercent: 2.24, currency: "VND", unit: "VND/kg", sourceRecords: [{ source: "Miền Bắc/Trung/Nam", price: 68500, timestamp: Date.now() }] },
  { symbol: "COFFEE", name: "Cà phê Robusta", price: 4620, change: 45, changePercent: 0.98, currency: "USD", unit: "USD/tấn", sourceRecords: [{ source: "London Futures", price: 4620, timestamp: Date.now() }] },
  { symbol: "RUBBER", name: "Cao su tự nhiên", price: 2.15, change: 0.04, changePercent: 1.89, currency: "USD", unit: "USD/kg", sourceRecords: [{ source: "TSR20 SGX", price: 2.15, timestamp: Date.now() }] },
];

export const BOOTSTRAP_COMMODITIES_DATA = {
  catalog: BOOTSTRAP_COMMODITIES_CATALOG,
  rows: BOOTSTRAP_COMMODITIES_ROWS,
};

export const BOOTSTRAP_MACRO_ECONOMIC: EconomicSnapshot = {
  dataset: "macro-economic",
  sourceUrl: "https://data.vietnambiz.vn/macro-economic",
  rows: [
    {
      id: "tang-truong-gdp",
      name: "Tăng trưởng GDP (YoY)",
      period: "Năm 2024",
      frequency: "year",
      current: { text: "7.09%", value: 7.09, isPercent: true },
      previous: { text: "5.05%", value: 5.05, isPercent: true },
      nextRelease: "Tháng 03/2025 (Ước tính Q1)",
    },
    {
      id: "lam-phat-cpi-binh-quan",
      name: "Chỉ số giá tiêu dùng CPI bình quân",
      period: "Tháng 12/2024",
      frequency: "month",
      current: { text: "3.63%", value: 3.63, isPercent: true },
      previous: { text: "3.25%", value: 3.25, isPercent: true },
      nextRelease: "29 hàng tháng (GSO)",
    },
    {
      id: "pmi-san-xuat",
      name: "Chỉ số Nhà quản trị Mua hàng (PMI)",
      period: "Tháng 01/2025",
      frequency: "month",
      current: { text: "51.2 điểm", value: 51.2, isPercent: false },
      previous: { text: "50.8 điểm", value: 50.8, isPercent: false },
      nextRelease: "01 hàng tháng (S&P Global)",
    },
    {
      id: "von-fdi-thuc-hien",
      name: "Vốn đầu tư trực tiếp nước ngoài (FDI thực hiện)",
      period: "Năm 2024",
      frequency: "year",
      current: { text: "23.2 tỷ USD", value: 23.2, isPercent: false },
      previous: { text: "22.4 tỷ USD", value: 22.4, isPercent: false },
      nextRelease: "29 hàng tháng (GSO)",
    },
    {
      id: "kim-ngach-xuat-khau",
      name: "Tổng kim ngạch xuất khẩu hàng hóa",
      period: "Năm 2024",
      frequency: "year",
      current: { text: "391.5 tỷ USD", value: 391.5, isPercent: false },
      previous: { text: "355.5 tỷ USD", value: 355.5, isPercent: false },
      nextRelease: "29 hàng tháng (Tổng cục Hải quan / GSO)",
    },
    {
      id: "kim-ngach-nhap-khau",
      name: "Tổng kim ngạch nhập khẩu hàng hóa",
      period: "Năm 2024",
      frequency: "year",
      current: { text: "368.5 tỷ USD", value: 368.5, isPercent: false },
      previous: { text: "327.5 tỷ USD", value: 327.5, isPercent: false },
      nextRelease: "29 hàng tháng",
    },
    {
      id: "thang-du-can-can-thuong-mai",
      name: "Cán cân thương mại hàng hóa (Xuất siêu)",
      period: "Năm 2024",
      frequency: "year",
      current: { text: "+23.0 tỷ USD", value: 23.0, isPercent: false },
      previous: { text: "+28.0 tỷ USD", value: 28.0, isPercent: false },
      nextRelease: "29 hàng tháng",
    },
    {
      id: "chi-so-san-xuat-cong-nghiep-iip",
      name: "Chỉ số sản xuất toàn ngành công nghiệp (IIP)",
      period: "Năm 2024",
      frequency: "year",
      current: { text: "8.3%", value: 8.3, isPercent: true },
      previous: { text: "1.5%", value: 1.5, isPercent: true },
      nextRelease: "29 hàng tháng",
    },
  ],
  fetchedAt: new Date().toISOString(),
  warnings: [],
};

export const BOOTSTRAP_CURRENCY_INTEREST_RATE: EconomicSnapshot = {
  dataset: "currency-interest-rate",
  sourceUrl: "https://data.vietnambiz.vn/currency-interest-rate",
  rows: [
    {
      id: "lai-suat-tai-cap-von-nhnn",
      name: "Lãi suất tái cấp vốn (NHNN)",
      period: "Hiện hành",
      frequency: "other",
      current: { text: "4.50%", value: 4.5, isPercent: true },
      previous: { text: "4.50%", value: 4.5, isPercent: true },
      nextRelease: null,
    },
    {
      id: "lai-suat-tai-chiet-khau-nhnn",
      name: "Lãi suất tái chiết khấu (NHNN)",
      period: "Hiện hành",
      frequency: "other",
      current: { text: "3.00%", value: 3.0, isPercent: true },
      previous: { text: "3.00%", value: 3.0, isPercent: true },
      nextRelease: null,
    },
    {
      id: "lai-suat-lien-ngan-hang-qua-dem",
      name: "Lãi suất liên ngân hàng qua đêm (Overnight)",
      period: "Phiên gần nhất",
      frequency: "day",
      current: { text: "4.25%", value: 4.25, isPercent: true },
      previous: { text: "3.85%", value: 3.85, isPercent: true },
      nextRelease: "Hàng ngày (NHNN)",
    },
    {
      id: "lai-suat-lien-ngan-hang-1-tuan",
      name: "Lãi suất liên ngân hàng kỳ hạn 1 tuần",
      period: "Phiên gần nhất",
      frequency: "day",
      current: { text: "4.45%", value: 4.45, isPercent: true },
      previous: { text: "4.10%", value: 4.1, isPercent: true },
      nextRelease: "Hàng ngày",
    },
    {
      id: "lai-suat-lien-ngan-hang-1-thang",
      name: "Lãi suất liên ngân hàng kỳ hạn 1 tháng",
      period: "Phiên gần nhất",
      frequency: "day",
      current: { text: "4.65%", value: 4.65, isPercent: true },
      previous: { text: "4.30%", value: 4.3, isPercent: true },
      nextRelease: "Hàng ngày",
    },
    {
      id: "ty-gia-trung-tam-usdvnd",
      name: "Tỷ giá trung tâm USD/VND (NHNN công bố)",
      period: "Hôm nay",
      frequency: "day",
      current: { text: "24,260 VND", value: 24260, isPercent: false },
      previous: { text: "24,250 VND", value: 24250, isPercent: false },
      nextRelease: "Đầu giờ mỗi ngày làm việc",
    },
    {
      id: "ty-gia-vcb-usdvnd",
      name: "Tỷ giá bán USD/VND tại Vietcombank",
      period: "Hôm nay",
      frequency: "day",
      current: { text: "25,450 VND", value: 25450, isPercent: false },
      previous: { text: "25,380 VND", value: 25380, isPercent: false },
      nextRelease: "Cập nhật liên tục trong phiên",
    },
    {
      id: "lai-suat-tiet-kiem-12-thang-big4",
      name: "Lãi suất huy động 12 tháng (Big 4 bình quân)",
      period: "Tháng này",
      frequency: "month",
      current: { text: "4.80%", value: 4.8, isPercent: true },
      previous: { text: "4.70%", value: 4.7, isPercent: true },
      nextRelease: null,
    },
    {
      id: "tang-truong-tin-dung-toan-he-thong",
      name: "Tăng trưởng tín dụng toàn hệ thống",
      period: "Năm 2024",
      frequency: "year",
      current: { text: "15.08%", value: 15.08, isPercent: true },
      previous: { text: "13.71%", value: 13.71, isPercent: true },
      nextRelease: "Báo cáo NHNN định kỳ",
    },
  ],
  fetchedAt: new Date().toISOString(),
  warnings: [],
};

export const BOOTSTRAP_WORLDBANK_VN: WorldBankMacroBundle = {
  country: "VN",
  series: [
    {
      id: "NY.GDP.MKTP.KD.ZG",
      name: "GDP growth (annual %)",
      unit: "%",
      country: "VN",
      countryName: "Vietnam",
      observations: [
        { date: "2024", value: 7.09 },
        { date: "2023", value: 5.05 },
        { date: "2022", value: 8.02 },
        { date: "2021", value: 2.56 },
        { date: "2020", value: 2.91 },
        { date: "2019", value: 7.36 },
        { date: "2018", value: 7.47 },
      ],
      lastUpdated: new Date().toISOString().slice(0, 10),
    },
    {
      id: "FP.CPI.TOTL.ZG",
      name: "Inflation, consumer prices (annual %)",
      unit: "%",
      country: "VN",
      countryName: "Vietnam",
      observations: [
        { date: "2024", value: 3.63 },
        { date: "2023", value: 3.25 },
        { date: "2022", value: 3.15 },
        { date: "2021", value: 1.84 },
        { date: "2020", value: 3.23 },
        { date: "2019", value: 2.80 },
      ],
      lastUpdated: new Date().toISOString().slice(0, 10),
    },
    {
      id: "BX.KLT.DINV.WD.GD.ZS",
      name: "Foreign direct investment, net inflows (% of GDP)",
      unit: "%",
      country: "VN",
      countryName: "Vietnam",
      observations: [
        { date: "2024", value: 4.45 },
        { date: "2023", value: 4.38 },
        { date: "2022", value: 4.42 },
        { date: "2021", value: 4.25 },
        { date: "2020", value: 4.62 },
      ],
      lastUpdated: new Date().toISOString().slice(0, 10),
    },
    {
      id: "SL.UEM.TOTL.ZS",
      name: "Unemployment, total (% of labor force)",
      unit: "%",
      country: "VN",
      countryName: "Vietnam",
      observations: [
        { date: "2024", value: 2.24 },
        { date: "2023", value: 2.28 },
        { date: "2022", value: 2.32 },
        { date: "2021", value: 2.38 },
        { date: "2020", value: 2.10 },
      ],
      lastUpdated: new Date().toISOString().slice(0, 10),
    },
    {
      id: "NE.EXP.GNFS.ZS",
      name: "Exports of goods and services (% of GDP)",
      unit: "%",
      country: "VN",
      countryName: "Vietnam",
      observations: [
        { date: "2024", value: 89.2 },
        { date: "2023", value: 87.5 },
        { date: "2022", value: 91.3 },
        { date: "2021", value: 93.3 },
        { date: "2020", value: 86.8 },
      ],
      lastUpdated: new Date().toISOString().slice(0, 10),
    },
  ],
  groups: VN_MACRO_INDICATORS,
  fetchedAt: new Date().toISOString(),
  warnings: [],
  latencyMs: 15,
};

