# Intake Note: Nâng cấp Tổng thể Hệ thống Bộ lọc & Thuật toán Fundamental Analysis (Screener & FA 2.0)

- **Slug**: `screener-fa-system-upgrade`
- **Created**: 2026-11-19
- **Method**: Compound Engineering Assessment + GitHub Spec Kit (SDD)
- **Trigger**: Yêu cầu tối ưu hóa toàn diện hệ thống lọc cổ phiếu/tài sản của Orca-Lite — trọng tâm vào bộ lọc **Fundamental Analysis (FA)**, từ tinh gọn số lượng bộ lọc/API/tabs đến chuẩn hóa và nâng cấp thuật toán tính toán số liệu đầu vào và chấm điểm.

## Raw Scope & Problem Signals

1. **Phân mảnh & Dư thừa Số lượng Bộ lọc (Filter Bloat)**:
   - Giao diện `/screener` hiện có **32 `Universe` tabs** (`src/app/screener/page.tsx`), **49 `ScreenerPreset` values** (`src/lib/services/screener-snapshot-service.ts`), **47 `PRESET_TABS`** (`src/app/screener/screener-constants.ts`), **90+ `ScreenerFilterParams`**, và **21 API endpoints** (`/api/screener`, `/api/v1/screener`, `/api/v1/stocks/screener`, và 18 route con `/api/v1/screener/*`).
   - Nhiều preset FA và kỹ thuật chồng chéo ngữ nghĩa mạnh (`fa_fortress` vs `merton_safe`, `buffett_compounder` vs `super_compounder`, `earnings_quality` vs `book_tax_clean` vs `beneish_safe`, `value` vs `magic_formula` vs `graham_ncav`, `dividend` vs `dividend_aristocrat`).
   - Hàng loạt tham số filter bị trùng giữa boolean flags riêng lẻ và enum tổng hợp (`buyZoneStatus` vs `buyPosition`, `squeezeOnly`/`squeezeFiredOnly` vs `volatilityCoil`, `vsaNoSupplyOnly`/`absorptionSpikeOnly` vs `vsaPattern`, `tightClosesOnly`/`vduOnly` vs `techPattern`).

2. **Lỗi Đường ống Dữ liệu & Trộn Dữ liệu Giả (Cold-Start & Synthetic Poisoning)**:
   - `produceMasterScreenerSnapshotInternal()` trong `screener-snapshot-service.ts` giới hạn `fundTask` bằng `Promise.race(..., 1_500ms)`. Khi cold-start trên toàn universe (>100 mã), `fundTask` timeout và trả rỗng, đẩy toàn bộ cổ phiếu rơi xuống `INSTITUTIONAL_FUNDAMENTAL_SEEDS` tĩnh hoặc `getSectorBaselineFundamentals()` (mỗi mã cùng ngành nhận thông số ROE, ROA, F-Score, Altman Z y hệt nhau), kèm `pe`/`pb`/`marketCap` mặc định cứng.
   - `/api/v1/screener/four-m/route.ts` tự nội suy `pe = 12 + (20 / (r.roe || 10))` và `pb = Math.max(0.8, r.roe / 10)` thay vì đọc định giá thực.
   - `queryScreenerStocks` không phân biệt dữ liệu BCTC thật (`LIVE_BCTC`) với dữ liệu `SECTOR_FALLBACK`, khiến cổ phiếu thiếu BCTC vẫn lọt qua các preset FA khắt khe.

3. **Sai số Thuật toán Tính toán Số liệu Fundamental Analysis**:
   - `snapshots.ts` chỉ lấy 1 kỳ (`ttm` / `periods[0]`), không truyền lịch sử đa kỳ (`periods[1..N]`) xuống `FundamentalSnapshot`, buộc các engine downstream (`piotroski-altman.ts`, `fundamental-quant-matrix.ts`) phải dùng proxy tĩnh 1 kỳ hoặc hằng số bịa.
   - `fundamental-quant-matrix.ts`:
     - `calculateBookTaxDifference` tự đặt `pretax = netProfit / 0.8`, `tax = pretax * 0.2` (ép `BTD = 0`, luôn `isBookTaxSafe = true`) và `totalAssetsFallback = 1000` khi thiếu dữ liệu.
     - `calculateRoiic` dùng `roic * (1 + growth / 100)` khi thiếu `deltaNopat`/`deltaIc` (sai bản chất $\Delta\text{NOPAT}/\Delta\text{IC}$).
     - `solveReverseDcfImpliedGrowth` lấy `marketCapBillion` (Vốn hóa) đối chiếu trực tiếp với `fcfBillion` (chưa quy đổi EV hay phân biệt FCFF/FCFE), thay thế FCF âm bằng `netProfit * 0.85`, và cố định `WACC = 10%`, `expectedGrowth = 12%`.
     - `beneishMScore` cố định `aqi = 1.0`, `depi = 1.0`, `sgai = 1.0` và tính `dsri`/`gmi` theo ngưỡng tĩnh thay vì tỷ số biến động 2 kỳ $t / (t-1)$.
     - `cashConversionCycleDays` không tính từ `DIO + DSO - DPO` mà ước lượng tuyến tính theo `cfoToNetProfit` hoặc `debtEquity`.
     - `ncavPerShare` ước lượng `equity * 0.7 + cash - totalDebt` thay vì `currentAssets - totalLiabilities`.
     - `calculateMertonDistanceToDefault` dùng `beta * 0.25` (mặc định `beta = 1.0`) thay vì độ biến động thực $\sigma_E$ từ chuỗi giá lịch sử.
   - `piotroski-altman.ts`:
     - Dùng `roa ?? 0`, `debtEquity ?? 0` khiến cổ phiếu thiếu `debtEquity` được chấm `0 <= 1.2` (+1 điểm miễn phí); `noDilution` chỉ kiểm tra `shares > 0` thay vì $\text{Shares}_t \le \text{Shares}_{t-1}$.
     - Chạy `Altman Z''` và `Current Ratio` / `D/E` đồng loạt lên nhóm **Ngân hàng, Chứng khoán, Bảo hiểm** dù `industry-profiles.ts` và `industry-specific-valuation.ts` đã có mô hình riêng nhưng chưa được đấu nối vào screener.

4. **Lỗi Kỹ thuật Thực thi Bộ lọc & Thiếu Backtest FA Nhân quả**:
   - `queryScreenerStocks` bị saturate 32-bit `SCREENER_BIT`, có nhánh `else` chết (lines 3836–3849), và `src/app/api/v1/stocks/screener/route.ts` chưa parse 7 query params mới (`superCompounderOnly`, `bookTaxSafeOnly`, `minRoiic`, `maxImpliedGrowth`, `minReverseDcfMargin`, `mertonSafeOnly`, `minMertonDd`).
   - `screener-backtest-engine.ts` chưa kiểm định bộ lọc FA theo độ trễ công bố BCTC (point-in-time filing lag); `PRESET_EDGE_BENCHMARKS` trong `screener-constants.ts` đang ghi cứng win rate tĩnh.
