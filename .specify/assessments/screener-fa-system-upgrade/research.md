# Codebase & Quantitative Research: Hệ thống Lọc & Fundamental Analysis (Orca-Lite)

- **Slug**: `screener-fa-system-upgrade`
- **Date**: 2026-11-19
- **Baseline Verified Against**: `src/app/screener/*`, `src/app/api/v1/screener/*`, `src/app/api/v1/stocks/screener/route.ts`, `src/lib/services/*`, `src/lib/engines/*`, `src/lib/financial/*`

---

## 1. Kiểm kê Hiện trạng Hệ thống Lọc (Baseline Inventory)

| Lớp hệ thống | File chính | Số lượng hiện tại | Vấn đề thực nghiệm phát hiện |
|---|---|---|---|
| **UI Tabs (`Universe`)** | `src/app/screener/page.tsx` | **32** tabs trong `SCREENER_GROUPS` (`quant_alpha`: 14, `growth_trend`: 8, `macro_sector`: 6, `fundamental_val`: 3 + `miquant-quant`) | Quá tải nhận thức; nhiều tab trỏ chung về `VnScreener` chỉ đổi `defaultPreset` (`apex-buy-now`, `apex-quant`, `historical-edge`, `orca-master`, `four-m`, `piotroski`, `rs-leaders`) hoặc trùng chức năng giữa Studio và Matrix. |
| **Strategy Presets** | `src/lib/services/screener-snapshot-service.ts`, `src/app/screener/screener-constants.ts` | **49** `ScreenerPreset` / **47** `PRESET_TABS` | ~55% preset chồng chéo điều kiện (ví dụ 17 preset FA riêng lẻ chia mảnh các điều kiện tương đương nhau; `fa_fortress` vs `merton_safe`, `buffett_compounder` vs `super_compounder`, `earnings_quality` vs `beneish_safe` vs `book_tax_clean`). |
| **Query Parameters** | `ScreenerFilterParams` (`screener-snapshot-service.ts`) & `route.ts` | **90+** fields | Trùng lặp 2 chiều giữa boolean flag và enum gộp; 7 tham số mới (`superCompounderOnly`, `bookTaxSafeOnly`, `minRoiic`, `maxImpliedGrowth`, `minReverseDcfMargin`, `mertonSafeOnly`, `minMertonDd`) không được parse ở `/api/v1/stocks/screener/route.ts`. |
| **API Routes** | `src/app/api/screener`, `src/app/api/v1/screener/*`, `src/app/api/v1/stocks/screener` | **21** route files | `/api/screener` và `/api/v1/screener` chỉ chạy Crypto và trả shell rỗng cho VN; `four-m/route.ts` bịa `pe`/`pb` từ `roe`; `fundamental` và `valuation` và `stocks/screener` tự tính lại điểm khác nhau. |
| **FA & Valuation Engines** | `fundamental.ts`, `fundamental-metrics.ts`, `ratio-engine.ts`, `piotroski-altman.ts`, `fundamental-quant-matrix.ts`, `industry-specific-valuation.ts`, `valuation.ts`, `four-m.ts`, `canslim.ts` | **9** module tính chỉ số FA | Công thức phân tán, chuẩn đơn vị không đồng nhất (tỷ lệ `0.18` vs phần trăm `18`, VND vs nghìn VND), và không chia sẻ chung một hàm chuẩn hóa ngành. |

---

## 2. Phân tích Chi tiết Các Lỗi Thuật Toán & Dữ Liệu FA

### 2.1. Sai lệch Dữ liệu Đầu vào & Cold-Start Poisoning
- **`screener-snapshot-service.ts` (line 2331–2336)**: `fundTask` giới hạn `1,500ms` cho `getFundamentalSnapshots(symbols, { concurrency: 6 })`. Khi cache `fin:snap:v3:*` chưa ấm trên toàn universe, timeout `1.5s` kích hoạt -> `fundMap` rỗng -> toàn bộ cổ phiếu chuyển sang `INSTITUTIONAL_FUNDAMENTAL_SEEDS` (dữ liệu tĩnh cứng) hoặc `getSectorBaselineFundamentals()` (mọi mã cùng ngành nhận y hệt 1 bộ chỉ số).
- **Thiếu cờ `faProvenance` & `isSynthetic`**: Hiện chưa có trường đánh dấu độ tin cậy nguồn (`LIVE_BCTC`, `CACHED_BCTC`, `SEED_CALIBRATED`, `SECTOR_FALLBACK`). Các bộ lọc FA khắt khe vẫn trả về cổ phiếu dùng `SECTOR_FALLBACK` hoặc `pe = 12.0` / `pb = 1.65` giả lập.
- **`snapshots.ts` (`buildSnapshotFromBundle`)**: Đã có `FinancialPackage.periods` từ `hubFinancialPackage`, nhưng chỉ trích xuất kỳ đầu tiên (`ttm ?? periods[0]`). Các dữ liệu chuỗi $t-1, t-2, t-3$ bị bỏ lại, làm hỏng mọi phép tính động lượng cơ bản ($\Delta\text{ROA}, \Delta\text{GM}, \text{ROIIC}_{3Y}, \text{Beneish 8-var}$).

### 2.2. Sai số Toán học trong `fundamental-quant-matrix.ts`
1. **Book-Tax Difference (`calculateBookTaxDifference`, lines 114–154)**:
   - Khi thiếu `pretaxIncome`/`taxExpense`, gán `pretax = netProfit / 0.8` và `tax = pretax * 0.2`, dẫn tới `BTD ≡ 0.000` -> tự động đánh dấu `isBookTaxSafe = true` cho doanh nghiệp thiếu minh bạch số liệu thuế!
   - Khi thiếu `totalAssets`, gán cứng `1000` tỷ VND làm mẫu số, gây méo nghiêm trọng với doanh nghiệp vốn nhỏ (<500 tỷ) hoặc vốn lớn (>50,000 tỷ).
2. **ROIIC 3Y (`calculateRoiic`, lines 182–208)**:
   - Công thức fallback `roic * (1 + growth / 100)` không phải Incremental ROIC ($\text{ROIIC} = \frac{\Delta \text{NOPAT}}{\Delta \text{Invested Capital}}$); nếu `ROIC = 20%` và `niYoy = 50%`, nó phóng đại thành `ROIIC = 30%` ngay cả khi doanh nghiệp tăng vốn đầu tư ồ ạt kém hiệu quả.
3. **Reverse DCF (`solveReverseDcfImpliedGrowth`, lines 210–278)**:
   - Dùng `marketCapBillion` (Equity Value) khớp với `fcfBillion` mà không điều chỉnh Net Debt ($EV = \text{MarketCap} + \text{Debt} - \text{Cash}$) nếu FCF là FCFF; khi `fcfBillion <= 0`, tự thay bằng `netProfitBillion * 0.85` khiến doanh nghiệp đốt tiền (FCF âm nặng) vẫn đạt điểm `mispriced_growth`.
   - Cố định `WACC = 10.0%` và `expectedGrowth = 12.0%` thay vì dùng Cost of Capital theo Beta/ngành từ `valuation-capm.ts` và lịch sử tăng trưởng/ROE tái đầu tư ($g_{\text{sustainable}} = \text{ROE} \times b$).
4. **Beneish M-Score (`lines 578–602`)**:
   - Cố định `aqi = 1.0`, `depi = 1.0`, `sgai = 1.0`, bỏ qua 3 biến trọng yếu nhất phát hiện vốn hóa chi phí và phình chi phí quản lý; tính `dsri` và `gmi` bằng step-function rời rạc từ `cfoToNetProfit` và `grossMargin >= 20` thay vì tỷ số kỳ $t$ so với $t-1$.
5. **Graham NCAV (`lines 667–688`)**:
   - Dùng `currentAssetsEst = equity * 0.7 + cash` trừ `totalDebt`, bỏ qua toàn bộ `totalLiabilities` phi nợ vay (phải trả người bán, người mua trả tiền trước, thuế) và làm phồng NCAV ở các công ty có nhiều tài sản cố định.
6. **Cash Conversion Cycle (`lines 689–701`)**:
   - Không tính $\text{DIO} + \text{DSO} - \text{DPO}$ từ tồn kho, phải thu, phải trả, mà gán công thức heuristic `55 - cfoToNetProfit * 15` hoặc `75 + debtEquity * 10`.
7. **Merton Distance-to-Default (`lines 280–358`)**:
   - Ước lượng $\sigma_E = \text{clamp}(0.18, 0.65, \beta \times 0.25)$ với $\beta$ mặc định `1.0` (tức $\sigma_E = 25\%$ cho mọi cổ phiếu thiếu Beta) thay vì tính realized volatility $\sigma_E$ từ chuỗi log-return OHLCV 60–120 phiên.

### 2.3. Sai số trong `piotroski-altman.ts` & Thiếu Phân tách Ngành
1. **Piotroski F-Score (`lines 64–141`)**:
   - Coalesce `?? 0` cho `roa`, `debtEquity`, `currentRatio`: nếu thiếu `debtEquity`, `0 <= 1.2` được cộng oan 1 điểm `lowerLeverage`; `noDilution` chỉ kiểm tra `shares > 0` thay vì so sánh số lượng cổ phiếu lưu hành qua 2 kỳ.
   - 5/9 tiêu chí (`increasingRoa`, `lowerLeverage`, `higherLiquidity`, `noDilution`, `higherGrossMargin`, `higherTurnover`) đang dùng ngưỡng tĩnh thay vì so sánh biến thiên YoY ($\Delta_t$).
2. **Altman Z''-Score (`lines 147–199`)**:
   - Ước lượng `totalAssets = equity + debt` (bỏ quên nợ phải trả thương mại), `workingCapital = max(0, cash - debt * 0.4)`, `retainedEarnings = netProfit`.
   - Áp dụng đồng nhất cho cả **Ngân hàng, Chứng khoán, Bảo hiểm**, trong khi các ngành tài chính có bảng cân đối đặc thù (tiền gửi khách hàng không phải nợ thương mại thông thường).

### 2.4. Lỗi Kỹ thuật trong Bộ máy Lọc (`screener-snapshot-service.ts`)
- `SCREENER_BIT` đã kín 32/32 bit (`1 << 0` đến `1 << 31`, trong đó `1 << 31` âm trên signed int32).
- `queryScreenerStocks` (lines 3836–3849) đặt nhầm điều kiện lọc FA Phase 1–3 vào bên trong nhánh `else` của `if (x.bitFlags != null)` (bị bỏ qua khi `bitFlags != null`, dù được lặp lại ở lines 4002–4014).
- `QuantFaVectorStore` đã viết sẵn (`TypedArray`) nhưng không được `queryScreenerStocks` dùng.

---

## 3. Chiến lược Tối ưu Đề xuất (Summary)

1. **Giảm nhiễu, Tăng trực giao (Filter & API Consolidation)**:
   - Giảm **49 presets → 20 canonical presets** (trong đó **8 FA Archetypes** trực giao), giữ bảng `PRESET_ALIASES` để tương thích ngược 100%.
   - Giảm **32 UI tabs → 12 workspaces** chuẩn hóa (Matrix hợp nhất + Studio chuyên sâu dạng drawer/mode).
   - Hợp nhất tham số truy vấn về `ScreenerFilterParamsV2` và sửa triệt để parser tại `/api/v1/stocks/screener/route.ts`.
2. **Chuẩn hóa Chuỗi Dữ liệu & Provenance (`FundamentalSnapshotV2`)**:
   - Bổ sung lịch sử 5 năm / 8 quý vào snapshot BCTC; tăng ngân sách hoặc đọc L2 pre-warmed snapshots trước khi fallback; gắn `faDataQuality` (`VERIFIED_BCTC`, `PARTIAL_BCTC`, `SEED_FALLBACK`, `SECTOR_PROXY`) và mặc định loại bỏ `SECTOR_PROXY` khỏi mọi bộ lọc FA chuyên sâu.
3. **Nâng cấp Toán học & Sector-Aware Scoring**:
   - Sửa toàn bộ 7 công thức FA bị lỗi giả lập (Piotroski, Altman, Beneish 8-var, BTD, 3Y ROIIC, CCC, Reverse DCF theo EV & CAPM WACC, Merton theo realized $\sigma_E$).
   - Phân nhánh đánh giá chuyên biệt cho **Banking** (Gordon P/B, ROE, Equity/Assets, NIM/NPL/LLR nếu có), **Real Estate** (RNAV, Backlog/Unearned Revenue, Net Debt/EBITDA), và **Non-Financial** (ROIC, FCF, Altman Z'', CCC).
   - Mở rộng chuẩn hóa tương đối theo ngành (**Sector Percentile Z-Score** cho cả P/E, P/B, EV/EBITDA, ROE, ROIC, Net Margin).
4. **Kiểm chứng Nhân quả (Point-in-Time FA Backtest)**:
   - Nâng cấp `screener-backtest-engine.ts` kiểm định Walk-Forward (Calibration vs Holdout) có tính độ trễ công bố BCTC (filing lag) cho các preset FA thay vì dùng số win-rate tĩnh.
