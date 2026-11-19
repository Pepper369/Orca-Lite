# Data Model & Contracts: Screener & Fundamental Analysis 2.0

**Feature**: `specs/002-screener-fa-system-upgrade`  
**Created**: 2026-11-19

---

## 1. Data Provenance & Quality Contract

```ts
export type FaProvenance =
  | "LIVE_BCTC"        // Dữ liệu BCTC TTM/multi-period mới lấy trực tiếp từ provider
  | "CACHED_BCTC"      // Dữ liệu BCTC thật từ L2 Postgres/HotSnapshot
  | "SEED_CALIBRATED"  // Dữ liệu seed đã hiệu chuẩn cho mã thiếu BCTC live
  | "SECTOR_FALLBACK"  // Proxy trung bình ngành (chỉ tham khảo, cấm lọt preset FA)
  | "MISSING";         // Không có dữ liệu FA

export type IndustryEvalTrack =
  | "FINANCIAL_BANK_SEC_INS" // Ngân hàng, Chứng khoán, Bảo hiểm
  | "REAL_ESTATE"            // Bất động sản & phát triển dự án
  | "NON_FINANCIAL";         // Sản xuất, Bán lẻ, Công nghệ, Năng lượng, Khác
```

---

## 2. Multi-Period Snapshot (`FundamentalSnapshotV2`)

Mở rộng từ `FundamentalSnapshot` (`src/lib/financial/snapshots.ts`):

| Field | Type | Description |
|---|---|---|
| `faProvenance` | `FaProvenance` | Nguồn gốc dữ liệu FA thực tế |
| `faCoverage` | `number` (`0..1`) | Tỷ lệ chỉ tiêu cốt lõi có dữ liệu thật (không fallback) |
| `industryTrack` | `IndustryEvalTrack` | Nhánh đánh giá theo đặc thù ngành |
| `annualHistory` | `FaPeriodSlice[]` | Tối đa 4 năm tài chính liên tiếp (`[t, t-1, t-2, t-3]`) phục vụ Piotroski, Beneish 8-var, 3Y ROIIC |
| `quarterlyHistory` | `FaPeriodSlice[]` | Tối đa 8 quý liên tiếp phục vụ phát hiện điểm uốn (Quarterly Inflection) & tăng tốc EPS |
| `payables` | `number \| null` | Phải trả người bán ngắn hạn (phục vụ DPO & CCC thực) |
| `depreciation` | `number \| null` | Khấu hao TSCĐ (phục vụ DEPI trong Beneish & EBITDA thật) |
| `sgaExpense` | `number \| null` | Chi phí bán hàng + QLDN (phục vụ SGAI trong Beneish) |
| `fixedAssets` | `number \| null` | TSCĐ ròng PP&E (phục vụ AQI & DEPI trong Beneish) |
| `retainedEarnings` | `number \| null` | Lợi nhuận sau thuế chưa phân phối (phục vụ Altman X2) |
| `currentAssets` | `number \| null` | Tài sản ngắn hạn (phục vụ Altman X1, Graham NCAV, AQI) |
| `currentLiabilities` | `number \| null` | Nợ ngắn hạn |
| `totalLiabilities` | `number \| null` | Tổng nợ phải trả (phục vụ Altman X4 & Graham NCAV) |

---

## 3. Canonical Screener Taxonomy (`20` Presets)

```ts
export type CanonicalScreenerPreset =
  // Core Execution (4)
  | "all"
  | "apex_buy_now"
  | "orca_master_elite"
  | "near_buy_point"
  // Price Action & Flow (5)
  | "smart_money_inflow"
  | "reversal_confluence"
  | "smc_structure"
  | "volatility_breakout"
  | "trend_alignment"
  // Quant & Risk (3)
  | "quant_mean_revert"
  | "quant_low_beta"
  | "quant_asymmetric"
  // Fundamental & Valuation (8)
  | "fa_fortress"
  | "earnings_quality"
  | "buffett_compounder"
  | "garp_growth"
  | "deep_value"
  | "piotroski_diamonds"
  | "dividend_aristocrat"
  | "consensus_upside";
```

---

## 4. Upgraded FA Matrix Output (`FundamentalMatrixResultV2`)

Các thay đổi bổ sung / sửa chuẩn so với `FundamentalMatrixResult` hiện tại:

- `industryTrack: IndustryEvalTrack`
- `piotroskiFScore: number | null` + `piotroskiCriteriaEvaluated: number` (`0..9`)
- `altmanZScore: number | null` + `altmanZone: "SAFE" | "GREY" | "DISTRESS" | "EXEMPT_FINANCIAL" | "INSUFFICIENT_DATA"`
- `beneishMScore: number | null` + `beneishVarsAvailable: number` (`0..8`)
- `bookTaxDifference: number | null` + `isBookTaxSafe: boolean | null` (null thay vì giả `true` khi thiếu thuế/LNTT)
- `roiic3Y: number | null` (tính từ $\Delta\text{NOPAT}/\Delta\text{IC}$ thật, `null` nếu thiếu đa kỳ)
- `cashConversionCycleDays: number | null` + `dioDays`, `dsoDays`, `dpoDays`
- `reverseDcf: { impliedGrowthPct: number | null; waccUsedPct: number | null; marginPct: number | null; basis: "EV_FCFF" | "MCAP_FCFE" | "UNAVAILABLE" }`
- `merton: { distanceToDefault: number | null; pdPct: number | null; equityVolAnnualPct: number | null; isSafe: boolean | null }`
- `sectorPercentiles: { pe: number | null; pb: number | null; evEbitda: number | null; roe: number | null; roic: number | null; netMargin: number | null }`
- `bankSpecial?: { fairPbGordon: number | null; pbDiscountPct: number | null; equityToAssetsPct: number | null; nimPct: number | null; nplPct: number | null; llrPct: number | null }`
- `realEstateSpecial?: { rnavPerShare: number | null; rnavDiscountPct: number | null; backlogToRevenue: number | null; netDebtToEquity: number | null }`

---

## 5. Dual-Register Bitmask & Vectorized Filter Store

- **`SCREENER_BIT` (32-bit `Uint32Array`)**: Giữ nguyên 32 bit hiện tại để bảo toàn backward compatibility với `screener-fa-enhancements.test.ts`.
- **`FA_BIT` (32-bit `Uint32Array`)**: Hợp nhất toàn bộ cờ FA nâng cao (`VERIFIED_BCTC`, `EXEMPT_FINANCIAL`, `NET_CASH`, `SAFE_DEBT`, `MERTON_SAFE`, `QUALITY_EARNINGS`, `BENEISH_SAFE`, `BOOK_TAX_CLEAN`, `HIGH_ROIC`, `SUPER_COMPOUNDER`, `BUFFETT_COMPOUNDER`, `GARP_GROWTH`, `DEEP_VALUE`, `DIVIDEND_ARISTOCRAT`, `WORKING_CAP_CHAMP`, `PIOTROSKI_STRONG`, `QUARTERLY_INFLECTION`, `CONSENSUS_UPSIDE`).
- **`QuantFaVectorStore`**: Sử dụng `Float32Array` với `Number.NaN` làm sentinel thiếu dữ liệu (`Number.isNaN(val)` thay cho `-999`), thực thi trực tiếp trong `queryScreenerStocks()`.
