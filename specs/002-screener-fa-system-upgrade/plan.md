# Implementation Plan: Nâng cấp Tổng thể Hệ thống Lọc & Fundamental Analysis (Screener & FA 2.0)

**Feature**: `specs/002-screener-fa-system-upgrade`  
**Created**: 2026-11-19  
**Prerequisites**: `.specify/assessments/screener-fa-system-upgrade/research.md`, `spec.md`

---

## 1. Kiến trúc Hợp nhất Hệ thống Lọc (Consolidation Blueprint)

### 1.1. Tinh gọn Bộ lọc: Từ 49 Presets → 20 Canonical Presets (Trực giao)

| Nhóm trụ cột | Canonical Preset (`20`) | Gộp từ Legacy Presets (`49` cũ) | Bản chất & Độ trực giao |
|---|---|---|---|
| **1. Core Execution (4)** | `all` | `all` | Toàn bộ thị trường |
| | `apex_buy_now` | `apex_buy_now` | Điểm mua tức thời (Confluence + Vol Ignition + R:R >= 1.6 + Anti-chase) |
| | `orca_master_elite` | `orca_master_elite`, `historical_edge` | Top đa trụ cột (Master Score >= 74 + Historical Edge >= 60) |
| | `near_buy_point` | `near_buy_point` | Sát vùng mua chuẩn (`absBuyDiff <= 2.2%`, `isLiquid`) |
| **2. Price Action & Flow (5)** | `smart_money_inflow` | `smart_money_inflow`, `vsa_no_supply` | Dòng tiền tổ chức, Pocket Pivot, Absorption / No Supply VSA |
| | `reversal_confluence` | `orca_apex_quant`, `bottom_confluence`, `triple_confluence`, `swing_divergence` | Hợp lưu đảo chiều chân sóng (Swing Low + Fresh Bull Divergence + MA/Sweet Zone) |
| | `smc_structure` | `smc_golden_pocket`, `flip_zone_retest` | Cấu trúc SMC Order Block / Golden Pocket / Flip Zone Retest |
| | `volatility_breakout` | `vcp`, `vcp_vdu`, `tight_closes_vdu`, `ttm_squeeze`, `breakout`, `wyckoff_spring` | Nén biến động (VCP/TTM/Ribbon/Tight Closes/VDU) & Bùng nổ / Spring |
| | `trend_alignment` | `ma_cross`, `mtf_confluence`, `confluence`, `sector_leading` | Xu hướng đồng thuận đa khung (MTF H1+D1+W1 + MA Bullish + RRG Leading) |
| **3. Quant & Risk (3)** | `quant_mean_revert` | `quant_mean_revert`, `quant_edge` | Ornstein-Uhlenbeck (`Z <= -1.4`, `t½ <= 35`) & Quant Edge Score |
| | `quant_low_beta` | `quant_low_beta` | AQR Low-Beta (`Beta <= 0.88`, `Quality >= 68`) |
| | `quant_asymmetric` | `quant_asymmetric` | Triple-Barrier Asymmetric R:R (`>= 1.8x`) |
| **4. Fundamental & Valuation (8)** | `fa_fortress` | `fa_fortress`, `merton_safe` | Pháo đài bảng cân đối: Net Cash / ICR cao / Realized-Vol Merton DD >= 2.5 |
| | `earnings_quality` | `earnings_quality`, `beneish_safe`, `book_tax_clean`, `cash_conversion_cycle` | Lợi nhuận tiền mặt thật: `CFO/NI >= 0.95`, `FCF > 0`, Beneish 8-var sạch, BTD minh bạch, CCC tối ưu |
| | `buffett_compounder` | `buffett_compounder`, `super_compounder` | Tích lũy vốn bền vững: `ROIC >= 15%`, `ROIIC 3Y >= 20%`, Moat biên LN, nợ thấp |
| | `garp_growth` | `lynch_fast_grower`, `growth`, `canslim`, `canslim_accel`, `rs_leaders` | Tăng trưởng hợp lý (GARP / CANSLIM): `PEG <= 1.0`, tăng tốc EPS/DT YoY & QoQ, `ROE >= 13%` |
| | `deep_value` | `value`, `magic_formula`, `graham_ncav`, `mispriced_growth` | Định giá rẻ có biên an toàn: EV/EBITDA & P/E rẻ theo ngành, Magic Formula, NCAV hoặc Reverse DCF dương |
| | `piotroski_diamonds` | `piotroski_diamonds` | Sức khỏe biến thiên BCTC 2 kỳ: Piotroski F-Score >= 7 + Altman Z'' >= 2.6 (hoặc Bank Health tương đương) |
| | `dividend_aristocrat` | `dividend`, `dividend_aristocrat` | Cổ tức tiền mặt >= 5% được bảo chứng bởi FCF payout ratio an toàn (<= 85%) |
| | `consensus_upside` | `consensus_upside` | Định giá mục tiêu đồng thuận CTCK upside >= 20% + chất lượng cơ bản tối thiểu |

> **Backward Compatibility**: Xuất `PRESET_ALIASES: Record<ScreenerPresetLegacy, ScreenerPresetCanonical>` trong `src/lib/quant/screener-taxonomy.ts` để `queryScreenerStocks` tự động ánh xạ các preset cũ (hoặc giữ `presetsPassed` phát đủ canonical + legacy alias flag nếu API caller yêu cầu `legacyAliases=true`).

### 1.2. Tinh gọn UI Workspaces: Từ 32 Tabs → 12 Workspaces

| Group mới (4 nhóm) | Workspace IDs (`12`) | Gom từ 32 tabs cũ |
|---|---|---|
| **1. Chiến lược Tổng hợp (3)** | `master-matrix`, `multi-source`, `oquant-studio` | Gộp `apex-buy-now`, `apex-quant`, `historical-edge`, `orca-master`, `smart-money`, `buy-point`, `stocks` vào `master-matrix` (chuyển bằng Preset Pill bar bên trong!) |
| **2. Kỹ thuật & Hành vi Giá (4)** | `trend-breakout`, `wyckoff-smc`, `patterns-candles`, `fireant-presets` | Gộp `rs-leaders`, `minervini`, `ma-cross` -> `trend-breakout`; `wyckoff`, `elliott`, `divergence` -> `wyckoff-smc`; `candlestick`, `ma-confluence`, `confluence` -> `patterns-candles` |
| **3. Cơ bản & Định giá FA (3)** | `fa-screener`, `valuation-studio`, `growth-canslim-4m` | Gộp `fundamental` + `piotroski` -> `fa-screener`; `valuation` -> `valuation-studio`; `canslim` + `four-m` -> `growth-canslim-4m` (có Studio/Matrix toggle) |
| **4. Vĩ mô, Ngành & Crypto (2)** | `macro-sector-flow`, `crypto` | Gộp `systemic-radar`, `macro-radar`, `rrg-rotation`, `sector-flow` thành workspace có sub-tabs nội bộ, giữ `crypto` riêng |

> *Ghi chú*: Toàn bộ `?universe=<legacy-id>` được map qua `resolveUniverseRoute()` để giữ link cũ không lỗi 404.

---

## 2. Nâng cấp Đường ống Dữ liệu & Kiến trúc FA Core

### 2.1. Khắc phục Cold-Start Timeout & Gắn Provenance (`snapshots.ts` & `screener-snapshot-service.ts`)
1. **Multi-period `FundamentalSnapshotV2`** (`src/lib/financial/snapshots.ts`):
   - Giữ lại mảng `periods` rút gọn (`annualHistory`: 4 năm gần nhất; `quarterlyHistory`: 8 quý gần nhất) chứa `MetricsSnapshotPeriod` (`revenue`, `grossProfit`, `ebit`, `ebitda`, `netProfit`, `taxExpense`, `profitBeforeTax`, `totalAssets`, `currentAssets`, `inventory`, `receivables`, `payables`, `currentLiabilities`, `totalLiabilities`, `shortDebt`, `longDebt`, `equity`, `retainedEarnings`, `cash`, `ocf`, `capex`, `shares`, `depreciation`, `sgaExpense`).
2. **Non-Blocking Hydration trong `produceMasterScreenerSnapshotInternal()`**:
   - **Tầng 1 (Instant)**: Đọc từ `readLatestMarketScan("fundamental")` (Postgres pre-warmed scan) và L2 `fin:snap:v4:*` cache trước khi gọi external HTTP.
   - **Tầng 2 (Live Bounded)**: Tăng budget live fetch cho nhóm mã thiếu hoặc hết hạn với concurrency pool phù hợp (`WORKERS_BUDGET.snapshotConcurrency`), không cắt ngang bằng `1,500ms` cố định gây rỗng toàn bộ snapshot.
   - **Tầng 3 (Explicit Provenance)**: Không bao giờ điền thầm `pe = 12.0`, `pb = 1.65`, `marketCap = price * 1000 * 350_000_000`. Nếu thiếu thực sự, giữ `null` và đánh dấu `faProvenance = "MISSING"` hoặc `"SECTOR_FALLBACK"` (chỉ hiển thị tham khảo khi `excludeSyntheticFa = false`).

### 2.2. Chuẩn hóa 100% Công thức FA (Unified `src/lib/financial/fa-core.ts`)

1. **Piotroski F-Score 2-Period True Delta (`piotroski-altman.ts`)**:
   - $\Delta\text{ROA} = \text{ROA}_t - \text{ROA}_{t-1} > 0$ (nếu không có $t-1$ thì kiểm tra điều kiện có sẵn và trừ trọng số `availableCriteria` thay vì chấm `0 ?? 0`).
   - $\Delta\text{Leverage} = (\text{LTD}_t / \text{Assets}_t) - (\text{LTD}_{t-1} / \text{Assets}_{t-1}) \le 0$ (hoặc `totalDebt == 0` với `totalDebt != null`). Tuyệt đối **không** dùng `debtEquity ?? 0 <= 1.2`.
   - $\Delta\text{CurrentRatio} > 0$, $\text{Shares}_t \le \text{Shares}_{t-1}$ (thay vì `shares > 0`), $\Delta\text{GrossMargin} > 0$, $\Delta\text{AssetTurnover} > 0$.
   - Xuất kèm `fScoreCoverage: number` (`criteriaEvaluated / 9`) để biết điểm F-Score dựa trên bao nhiêu tiêu chí thật.

2. **Altman Z''-Score & Financial-Sector Exemption (`piotroski-altman.ts`)**:
   - Với `BANKING | SECURITIES | INSURANCE`: trả về `zScore: null, zone: "EXEMPT_FINANCIAL"`, chuyển sang `BankHealthScore` (ROE, Equity/Assets, P/B vs Gordon Fair P/B, NIM/NPL/LLR nếu có).
   - Với doanh nghiệp phi tài chính: dùng `totalAssets`, `totalLiabilities`, `currentAssets - currentLiabilities`, `retainedEarnings`, `ebit` thực từ BCTC; chỉ trả điểm khi đủ tối thiểu `X1, X3, X4` thật.

3. **Beneish 8-Variable M-Score (`fundamental-quant-matrix.ts`)**:
   - Khi có kỳ $t$ và $t-1$ trong `annualHistory` (hoặc TTM vs TTM-4Q):
     $$\text{DSRI} = \frac{\text{Rec}_t / \text{Rev}_t}{\text{Rec}_{t-1} / \text{Rev}_{t-1}}, \quad \text{GMI} = \frac{\text{GM}_{t-1}}{\text{GM}_t}, \quad \text{AQI} = \frac{1 - (\text{CA}_t + \text{PP\&E}_t)/\text{TA}_t}{1 - (\text{CA}_{t-1} + \text{PP\&E}_{t-1})/\text{TA}_{t-1}}$$
     $$\text{SGI} = \frac{\text{Rev}_t}{\text{Rev}_{t-1}}, \quad \text{DEPI} = \frac{\text{Dep}_{t-1}/(\text{Dep}_{t-1}+\text{PP\&E}_{t-1})}{\text{Dep}_t/(\text{Dep}_t+\text{PP\&E}_t)}, \quad \text{SGAI} = \frac{\text{SGA}_t/\text{Rev}_t}{\text{SGA}_{t-1}/\text{Rev}_{t-1}}, \quad \text{LVGI} = \frac{\text{Debt}_t/\text{TA}_t}{\text{Debt}_{t-1}/\text{TA}_{t-1}}$$
     $$\text{TATA} = \frac{\text{NetIncome}_t - \text{OCF}_t}{\text{TotalAssets}_t}$$
   - Áp dụng đúng chuẩn Beneish 8-var: $M = -4.84 + 0.920\,\text{DSRI} + 0.528\,\text{GMI} + 0.404\,\text{AQI} + 0.892\,\text{SGI} + 0.115\,\text{DEPI} - 0.172\,\text{SGAI} + 4.679\,\text{TATA} - 0.327\,\text{LVGI}$ (lưu ý code cũ viết nhầm `+ 4.037 * tata + 0.0327 * lvgi` — sai cả hệ số TATA `4.679` và dấu LVGI `-0.327`!).
   - Các biến thiếu (ví dụ `DEPI`/`SGAI` nếu VNDirect không trả tách biệt) được đặt trung lập `1.0` nhưng **giảm `beneishVarsAvailable`**; nếu thiếu `< 4` biến cốt lõi (`DSRI, GMI, SGI, TATA`) thì trả `beneishMScore: null` thay vì gắn mác "an toàn".

4. **Book-Tax Difference (`calculateBookTaxDifference`)**:
   - Yêu cầu đủ `pretaxIncome`, `taxExpense`, và `totalAssets > 0` thật. Nếu thiếu một trong 3 -> trả `{ bookTaxDifference: null, isBookTaxSafe: false }` (hoặc `null` trên trạng thái thay vì giả `true`!). Xóa bỏ `pretax = np/0.8` và `totalAssetsFallback = 1000`.

5. **3Y ROIIC & Cash Conversion Cycle**:
   - **ROIIC**: Tính $\frac{\text{NOPAT}_t - \text{NOPAT}_{t-k}}{\text{IC}_t - \text{IC}_{t-k}}$ trên $k \in \{2, 3\}$ năm từ `annualHistory`, với điều kiện $|\Delta \text{IC}| \ge 0.05 \times \text{IC}_{t-k}$ (chống nổ mẫu số gần 0). Thiếu lịch sử -> `roiic3Y = null`.
   - **CCC**: Tính $\text{DIO} + \text{DSO} - \text{DPO}$ từ `inventory`, `receivables`, `payables` (hoặc `currentLiabilities - shortDebt` khi thiếu `payables` riêng), `cogs`, `revenue`. Thiếu cấu phần -> `cashConversionCycleDays = null`.

6. **Enterprise-Consistent Reverse DCF & Realized-Vol Merton DD**:
   - **Reverse DCF**: Khi `fcfBillion > 0`, dùng `EV = MarketCap + TotalDebt - Cash` nếu là FCFF (hoặc `MarketCap` nếu xác định FCFE sau lãi vay); nếu `fcfBillion <= 0`, trả `impliedGrowthPct: null, reverseDcfMarginPct: null` (không thay bằng `netProfit * 0.85`). Lấy WACC từ `valuation-capm.ts` theo Beta & rủi ro thị trường VN (`Rf + Beta * ERP`, kẹp `[8.5%, 16%]`) và `expectedGrowth` từ tăng trưởng lịch sử/sustainable growth ($\text{ROE} \times (1 - \text{payout})$).
   - **Merton DD**: Tính $\sigma_E$ annualized ($\text{std}(\ln(P_t / P_{t-1})) \times \sqrt{252}$) từ OHLCV 60–120 phiên (fallback sang `beta * marketVol` chỉ khi thiếu OHLCV), kẹp $\sigma_E \in [0.15, 0.90]$, và miễn trừ nhóm Ngân hàng/Chứng khoán.

7. **Graham NCAV**:
   - Dùng `(currentAssets - totalLiabilities) / shares` trực tiếp từ BCTC. Thiếu `currentAssets` hoặc `totalLiabilities` -> `ncavPerShare: null, isGrahamNcav: false`.

---

## 3. Dual-Register Bitmask + TypedArray Vector Engine

1. **Giữ `SCREENER_BIT` (32-bit)** cho technical & core signals (bảo toàn test `screener-fa-enhancements.test.ts` assert 32 distinct non-zero bits).
2. **Bổ sung `FA_BIT` (32-bit)** trên trường `faBitFlags` (thay cho `QUANT_FA_BIT` bị rời rạc) gồm toàn bộ cờ FA trực giao:
   - `VERIFIED_BCTC`, `NON_FINANCIAL`, `NET_CASH`, `SAFE_DEBT`, `MERTON_SAFE`, `QUALITY_EARNINGS`, `BENEISH_SAFE`, `BOOK_TAX_CLEAN`, `HIGH_ROIC`, `SUPER_COMPOUNDER`, `BUFFETT_COMPOUNDER`, `GARP_GROWTH`, `DEEP_VALUE`, `DIVIDEND_ARISTOCRAT`, `WORKING_CAP_CHAMP`, `PIOTROSKI_STRONG`, `QUARTERLY_INFLECTION`, `CONSENSUS_UPSIDE`.
3. **Kích hoạt `QuantFaVectorStore` trong `queryScreenerStocks()`**:
   - Lưu song song chỉ số FA liên tục (`roic`, `roiic3Y`, `bookTaxDiff`, `cashRealizationRatio`, `reverseDcfMargin`, `mertonDD`, `pe`, `pb`, `evEbitda`, `sectorRoePct`, `sectorPePct`, `faBitFlags`) bằng `Float32Array` / `Uint32Array` (dùng `NaN` thay `-999` để tránh trùng với giá trị âm thực tế như `reverseDcfMargin = -999` hoặc `BookTaxDiff`), cho phép quét tổ hợp range + bitmask trên hàng nghìn mã trong < 2ms.
4. **Sửa lỗi HTTP API `src/app/api/v1/stocks/screener/route.ts`**:
   - Parse đầy đủ `excludeSyntheticFa` (mặc định `true` khi có FA filter/preset), `superCompounderOnly`, `bookTaxSafeOnly`, `minRoiic`, `maxImpliedGrowth`, `minReverseDcfMargin`, `mertonSafeOnly`, `minMertonDd`, `sectorFilter`, `minSectorRoicPercentile`, v.v.

---

## 4. Kế hoạch Kiểm chứng & Compound Engineering Loop

1. **Unit & Mathematical Invariants (`src/lib/__tests__/`)**:
   - Kiểm tra null-safety (thiếu dữ liệu -> `null`, tuyệt đối không bịa `0` hay `1.0`).
   - Kiểm tra đơn vị (VND vs nghìn VND, `%` vs thập phân) và phân tách ngành Ngân hàng (`EXEMPT_FINANCIAL`) vs Sản xuất vs BĐS.
   - Kiểm tra đầy đủ HTTP params & bitmask non-collision (`SCREENER_BIT` + `FA_BIT`).
2. **Point-in-Time Causal FA Backtest (`src/lib/engines/fa-backtest-harness.ts`)**:
   - Mô phỏng danh mục tái cân bằng theo quý/năm với **filing lag** (+45 ngày sau quý, +90 ngày sau năm) trên 2 giai đoạn tách biệt: **Calibration (2020–2023)** vs **Out-of-Sample Holdout (2024–2026)**.
   - Đo lường Hit Rate, Excess Alpha vs VN-Index, Sharpe, Max Drawdown, và **Fraud/Distress Avoidance Rate** (tỷ lệ né mã lỗ/hủy niêm yết/âm FCF).
3. **Durable Learnings Capture**:
   - Sau khi implement và pass 100% checks (`tsc`, `lint`, `tsx --test`, `vitest`, `vite build`), ghi nhận bài học vào `docs/solutions/fundamental-screener/fa-consolidation-and-anti-fabrication.md`.
