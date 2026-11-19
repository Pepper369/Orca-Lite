# Feature Specification: Nâng cấp Tổng thể Hệ thống Lọc & Thuật toán Fundamental Analysis (Screener & FA 2.0)

**Feature Branch / Directory**: `specs/002-screener-fa-system-upgrade`  
**Created**: 2026-11-19  
**Status**: Planned — Ready for Review / Execution  
**Methodology**: GitHub Spec Kit (SDD) + Compound Engineering (Baseline Audit -> Orthogonal Consolidation -> Causal Math Calibration -> Point-in-Time Walk-Forward Verification -> Durable Learnings)

---

## 1. Executive Summary & User Value

Hệ thống lọc tài sản của Orca-Lite (`/screener` và các API `/api/v1/screener/*`, `/api/v1/stocks/screener`) hiện sở hữu hàng chục mô hình từ Price Action, Quant OU/Triple-Barrier đến các chiến lược Fundamental Analysis (Piotroski, Altman Z'', Beneish M-Score, Greenblatt Magic Formula, Buffett Compounder, Reverse DCF, Merton DD). Tuy nhiên, quá trình tích lũy tính năng qua nhiều giai đoạn đã dẫn đến 4 điểm nghẽn cốt lõi:

1. **Phân mảnh & Dư thừa Số lượng Bộ lọc**: `49 ScreenerPreset`, `32 Universe tabs`, `90+ query params`, và `21 API routes` chồng chéo mạnh (~55% preset FA và kỹ thuật lặp lại ngưỡng lẫn nhau), gây rối cho người dùng và làm phân tán công thức chấm điểm giữa 9 module khác nhau.
2. **Cold-Start Timeout & Nhiễu Dữ liệu Giả**: `fundTask` timeout `1,500ms` trong `produceMasterScreenerSnapshotInternal()` thường xuyên rơi về `INSTITUTIONAL_FUNDAMENTAL_SEEDS` hoặc `getSectorBaselineFundamentals()` (mỗi mã cùng ngành có cùng ROE/ROA/F-Score/Altman Z) kèm `pe`/`pb`/`marketCap` mặc định cứng — nhưng không gắn cờ `faProvenance` để chặn lọt bộ lọc FA.
3. **Sai số Thuật toán Tính toán Số liệu FA**: Nhiều công thức trong `fundamental-quant-matrix.ts` và `piotroski-altman.ts` thiếu lịch sử đa kỳ (`periods[1..N]`), tự bịa fallback làm méo kết quả (`BTD = 0`, `ROIIC = ROIC*(1+g)`, `Beneish` cố định `aqi=depi=sgai=1`, `Reverse DCF` dùng Vốn hóa thay EV và lấy `NetProfit*0.85` khi FCF âm, `CCC` đoán tuyến tính từ `CFO/NP`, `Merton` dùng `beta=1.0`), đồng thời áp dụng máy móc ngưỡng phi tài chính lên nhóm **Ngân hàng, Chứng khoán, Bảo hiểm**.
4. **Lỗi Thực thi Bộ lọc & Thiếu Backtest FA Nhân quả**: Bitmask 32-bit `SCREENER_BIT` đã cạn, nhánh `else` của `queryScreenerStocks` bị che khuất, 7 filter params FA mới không được parse ở HTTP API `route.ts`, và `screener-backtest-engine.ts` chưa kiểm định chiến lược FA theo độ trễ công bố BCTC (point-in-time).

Nâng cấp **Screener & FA 2.0** sẽ tinh gọn toàn diện kiến trúc bộ lọc (từ 49 → 20 presets trực giao, 32 → 12 workspaces UI), chuẩn hóa 1 lõi tính toán FA duy nhất (Single Source of Truth) với dữ liệu đa kỳ thực tế, phân tách chuẩn theo đặc thù ngành, gắn nhãn minh bạch nguồn dữ liệu, và kiểm chứng bằng backtest FA nhân quả.

---

## 2. User Scenarios & Testing

### Scenario 1: Nhà đầu tư Cơ bản (FA Value / Quality / Compounder Investor)
- **Actor**: Nhà đầu tư tìm cổ phiếu tích sản hoặc tăng trưởng bền vững tại `/screener?universe=fundamental` hoặc tab Cơ bản.
- **Flow**: Chọn bộ lọc *Buffett Compounder*, *Earnings Quality*, hoặc *Deep Value* và lọc theo nhóm ngành (ví dụ: Ngân hàng vs Sản xuất vs Bất động sản).
- **Expected Outcome**:
  - Chỉ các cổ phiếu có dữ liệu BCTC thực (`VERIFIED_BCTC` / `PARTIAL_BCTC`) mới lọt vào top kết quả của bộ lọc FA khắt khe; các mã đang dùng `SECTOR_FALLBACK` bị gắn badge cảnh báo và mặc định bị loại trừ khỏi các preset FA tinh khiết.
  - Cổ phiếu Ngân hàng (`VCB`, `ACB`, `MBB`…) được đánh giá qua **ROE, P/B vs Fair Gordon P/B, Equity/Assets, NIM/NPL/LLR** thay vì bị chấm điểm sai bằng `Current Ratio`, `Gross Margin`, `Altman Z''`, hay `ROIC` phi tài chính.
  - Chỉ số `Piotroski F-Score`, `Beneish M-Score`, `BTD`, `3Y ROIIC`, `CCC`, `Reverse DCF` phản ánh đúng biến thiên BCTC đa kỳ thật (hoặc trả về `null` / "Thiếu dữ liệu" khi thiếu cấu phần, tuyệt đối không bịa bằng `0` hay `1.0`).

### Scenario 2: Nhà đầu tư Đa chiến lược (Quant + FA + Technical Confluence)
- **Actor**: Trader/Analyst sử dụng `VnScreener` + `ScreenerMatrixToolbar` + `CustomScreenerBuilder`.
- **Flow**: Kết hợp bộ lọc kỹ thuật (điểm mua, dòng tiền, squeeze) với điều kiện FA (`minRoic`, `minRoiic`, `bookTaxSafeOnly`, `mertonSafeOnly`, `minReverseDcfMargin`, `sectorRoePercentile`).
- **Expected Outcome**:
  - Giao diện chỉ còn **12 workspaces** rõ ràng và **20 canonical presets** không trùng lặp; bộ lọc nâng cao `ScreenerMatrixToolbar` gom thành 4 tầng trực quan không lặp field.
  - Mọi tham số HTTP (`minRoiic`, `maxImpliedGrowth`, `minReverseDcfMargin`, `bookTaxSafeOnly`, `superCompounderOnly`, `mertonSafeOnly`, `minMertonDd`) hoạt động chính xác qua `/api/v1/stocks/screener` với tốc độ lọc < 5ms nhờ vectorized TypedArray + 64-bit Dual Bitmask.

### Scenario 3: Kiểm định Định lượng & Độ tin cậy (Quant Researcher)
- **Actor**: Analyst bấm "Backtest Mô Phỏng (OQuant)" hoặc kiểm tra độ tin cậy của preset FA.
- **Flow**: Chạy backtest cho chiến lược FA (`piotroski_diamonds`, `buffett_compounder`, `deep_value`, `earnings_quality`).
- **Expected Outcome**:
  - Kết quả backtest áp dụng độ trễ công bố BCTC (45 ngày sau quý, 90 ngày sau BCTC năm) — không rò rỉ dữ liệu tương lai (zero look-ahead bias).
  - Các chỉ số hiệu suất (`winRatePct`, `profitFactor`, `alphaPct`) phản ánh kết quả Walk-Forward Calibration vs Out-of-Sample Holdout thay vì số liệu ghi cứng tĩnh.

---

## 3. Functional Requirements

### A. Tối ưu Số lượng & Kiến trúc Bộ lọc (Consolidation & Taxonomy)
- **FR-001 (Canonical Preset Consolidation — 49 → 20)**: Tinh gọn `ScreenerPreset` từ 49 xuống **20 canonical presets** trực giao thuộc 4 nhóm (*Core Execution* 4, *Price Action & Flow* 5, *Quant & Risk* 3, *Fundamental & Valuation* 8). Giữ nguyên bảng ánh xạ ngược `PRESET_ALIASES` để mọi legacy preset ID vẫn hoạt động 100% ở API và URL.
- **FR-002 (UI Workspace Consolidation — 32 → 12)**: Giảm `Universe` tabs trên `src/app/screener/page.tsx` từ 32 xuống **12 workspaces** (gộp các tab trùng lặp như `apex-buy-now`/`apex-quant`/`historical-edge`/`orca-master` vào các preset chuẩn trong Matrix chính, gộp `four-m`/`piotroski`/`fundamental`/`valuation` về 2 workspace *FA & Định giá Studio* và *Ma trận Cơ bản*, giữ alias redirect cho `?universe=` cũ).
- **FR-003 (Canonical Filter Schema & API Parity)**: Hợp nhất `ScreenerFilterParams` sang `ScreenerFilterParamsV2` (loại bỏ các cặp param trùng lặp giữa enum và boolean rời), đồng bộ 100% giữa `src/app/api/v1/stocks/screener/route.ts`, `ScreenerMatrixToolbar`, và `CustomScreenerBuilder` — bao gồm cả 7 filter FA Phase 1–3 từng bị thiếu ở `route.ts`.
- **FR-004 (Unified 64-bit / Dual-Register Bitmask + Vector Engine)**: Thay thế `SCREENER_BIT` 32-bit đã bão hòa bằng `techBitFlags` (32-bit tương thích ngược) + `faBitFlags` (32-bit, hợp nhất `QUANT_FA_BIT`), xóa bỏ nhánh `else` chết trong `queryScreenerStocks()`, và kích hoạt `QuantFaVectorStore` (`Float32Array` + `Uint32Array`) cho range filter đa yếu tố.

### B. Truth-in-Data & Pipeline BCTC Đa kỳ (Data Integrity)
- **FR-005 (Multi-Period Snapshot & Non-Poisoning Hydration)**: Mở rộng `FundamentalSnapshot` (`src/lib/financial/snapshots.ts`) thành `FundamentalSnapshotV2` mang theo lịch sử `annualHistory` (tối đa 4 năm) và `quarterlyHistory` (tối đa 8 quý) từ `FinancialPackage.periods`. Khắc phục nút thắt `fundTask` timeout `1,500ms` trong `screener-snapshot-service.ts` bằng cách đọc trước L2 pre-warmed snapshots (`market-screener-snapshots.ts` / `fin:snap:v3:*`) và cập nhật nền không chặn, loại bỏ hardcoded `pe=12.0`, `pb=1.65`, `marketCap=350M*price`.
- **FR-006 (Strict Data Provenance & No-Synthetic Guard)**: Gắn trường `faProvenance: "LIVE_BCTC" | "CACHED_BCTC" | "SEED_CALIBRATED" | "SECTOR_FALLBACK" | "MISSING"` và `faCoverage: number (0..1)` cho mọi mã cổ phiếu. Mặc định `excludeSyntheticFa = true` trên mọi preset FA chuyên sâu và studio `/api/v1/screener/fundamental`, `/api/v1/screener/valuation`, `/api/v1/screener/four-m` (xóa bỏ công thức bịa `pe`/`pb` trong `four-m/route.ts`).

### C. Tối ưu Thuật toán Tính toán Số liệu Fundamental Analysis
- **FR-007 (Single Source of Truth FA Core)**: Hợp nhất các công thức cốt lõi (ROE/ROA bình quân, ROIC NOPAT, OCF/FCF, P/E, P/B, EV/EBITDA, PEG) vào một thư viện thuần (`src/lib/financial/fa-core.ts`, không import `"server-only"` khi không cần I/O) được dùng chung bởi `fundamental.ts`, `fundamental-quant-matrix.ts`, `piotroski-altman.ts`, `fundamental-screener.ts`, `valuation-screener.ts`, và `screener-snapshot-service.ts`.
- **FR-008 (Multi-Period Forensic & Quality Algorithms)**: Nâng cấp chuẩn xác 7 mô hình FA trong `fundamental-quant-matrix.ts` & `piotroski-altman.ts`:
  1. **Piotroski F-Score**: Tính đủ 9 tiêu chí theo đúng biến thiên 2 kỳ ($\Delta\text{ROA}, \Delta\text{Leverage}, \Delta\text{CurrentRatio}, \Delta\text{Shares}, \Delta\text{GrossMargin}, \Delta\text{AssetTurnover}$); trả `null`/không cộng điểm oan cho tiêu chí thiếu dữ liệu.
  2. **Altman Z''-Score**: Dùng đúng `totalAssets`, `totalLiabilities`, `currentAssets - currentLiabilities`, `retainedEarnings`, `ebit` thực từ BCTC; tự động trả `Z = null (EXEMPT_FINANCIAL)` cho nhóm Ngân hàng/Chứng khoán/Bảo hiểm.
  3. **Beneish 8-Variable M-Score & Book-Tax Difference (BTD)**: Tính 8 biến số `DSRI`, `GMI`, `AQI`, `SGI`, `DEPI`, `SGAI`, `LVGI`, `TATA` trên 2 kỳ liên tiếp thực tế; bỏ việc tự gán `pretax = np/0.8` và `totalAssetsFallback = 1000` trong `calculateBookTaxDifference`.
  4. **True 3Y ROIIC & Cash Conversion Cycle (CCC)**: Tính `roiic3Y = ΔNOPAT / ΔIC` trên cửa sổ 2–3 năm thật (với ngưỡng $|\Delta\text{IC}|$ tối thiểu chống chia số nhỏ) và `CCC = DIO + DSO - DPO` từ tồn kho, phải thu, phải trả/giá vốn thật.
  5. **Enterprise-Consistent Reverse DCF**: Định chuẩn `Enterprise Value = MarketCap + TotalDebt - Cash` khi giải `impliedGrowthPct` từ `FCFF`, không dùng `netProfit * 0.85` che giấu FCF âm, và dùng WACC động theo Beta/ngành từ `valuation-capm.ts`.
  6. **Realized-Vol Merton DD**: Tính độ biến động cổ phiếu $\sigma_E$ thực nghiệm từ log-return OHLCV 60–120 phiên (thay `beta * 0.25`) trước khi giải $\sigma_A$ và Distance-to-Default.
  7. **True Graham NCAV**: Tính bằng `(currentAssets - totalLiabilities) / shares` trực tiếp từ Bảng cân đối kế toán.
- **FR-009 (Industry-Aware Scoring & Multi-Factor Sector Percentiles)**: Tích hợp `industry-profiles.ts` và `industry-specific-valuation.ts` vào luồng chấm điểm Screener: tách 3 nhánh đánh giá (**Financials: Bank/Sec/Ins**, **Real Estate**, **Non-Financial**). Tính phân vị tương đối trong ngành (`sectorPercentile` & Winsorized Z-Score) cho 6 trục: `P/E`, `P/B`, `EV/EBITDA`, `ROE`, `ROIC`, `NetMargin`.

### D. Kiểm chứng Nhân quả & Anti-Overfit
- **FR-010 (Point-in-Time Causal FA Backtest Harness)**: Mở rộng `screener-backtest-engine.ts` (hoặc tạo module kiểm định chuyên biệt `fa-backtest-harness.ts`) hỗ trợ backtest kết hợp điều kiện FA với độ trễ công bố BCTC (`45d` quý / `90d` năm) trên tập Calibration vs Out-of-Sample Holdout, thay thế các con số win-rate tĩnh trong `PRESET_EDGE_BENCHMARKS`.

---

## 4. Non-Functional & Architectural Boundaries

- **Client/Server Boundary**: Các module toán học thuần (`fa-core.ts`, `piotroski-altman.ts`, `fundamental-quant-matrix.ts`, `industry-specific-valuation.ts`, `screener-taxonomy.ts`) không import `"server-only"` để tái sử dụng an toàn trên cả Node API và Vite client components.
- **Performance Latency Budget**: `queryScreenerStocks` phải thực thi < 10ms p95 trên universe ~400–1,600 mã; `getMasterScreenerSnapshot` không được block quá 4s nhờ L1/L2 cache + async background hydration.
- **Backward Compatibility**: Giữ tương thích ngược cho toàn bộ legacy preset IDs (`PRESET_ALIASES`), legacy URL `?universe=` params (`UNIVERSE_ALIASES`), và không phá vỡ các test hiện hành sau khi cập nhật kỳ vọng hợp lệ cho các trường hợp thiếu dữ liệu.

---

## 5. Success Criteria (Measurable Outcomes)

- **SC-001 (Filter & Surface Reduction)**: Số lượng Canonical Presets giảm từ **49 → 20 (-59%)**, FA Presets từ **17 → 8 (-53%)**, UI Tabs từ **32 → 12 (-62.5%)**, với **0** mất mát năng lực lọc biểu đạt (mọi tổ hợp lọc cũ đều biểu đạt được qua 20 presets + `ScreenerFilterParamsV2`).
- **SC-002 (Zero Synthetic Contamination)**: **0%** cổ phiếu có `faProvenance === "SECTOR_FALLBACK"` hoặc `"MISSING"` được lọt vào bất kỳ preset FA khắt khe nào (`piotroski_diamonds`, `fa_fortress`, `earnings_quality`, `buffett_compounder`, `deep_value`) khi `excludeSyntheticFa` bật (mặc định).
- **SC-003 (Mathematical Fidelity)**: 100% các hàm FA (`calculateBookTaxDifference`, `calculateRoiic`, `solveReverseDcfImpliedGrowth`, `calculatePiotroskiScore`, `calculateAltmanZScore`, `beneishMScore`, `ccc`) vượt qua suite kiểm thử bất biến đơn vị, null-safety (trả `null` khi thiếu cấu phần bắt buộc, không bịa `0` hoặc `1.0`), và miễn trừ ngành Tài chính (`EXEMPT_FINANCIAL`).
- **SC-004 (API & Bitmask Parity)**: 100% query params trong `ScreenerFilterParamsV2` (bao gồm 7 tham số FA nâng cao) được parse ở `/api/v1/stocks/screener`, khớp đồng nhất với `QuantFaVectorStore` & Dual-Register Bitmask (không còn nhánh chết).
- **SC-005 (Causal Out-of-Sample Lift)**: Trên bộ kiểm thử Walk-Forward FA có độ trễ công bố BCTC, các bộ lọc FA nâng cấp (đã loại bỏ `SECTOR_FALLBACK` và áp dụng sector-neutral percentile) đạt **Out-of-Sample Sharpe / Hit-Rate vượt trội hoặc không suy giảm** so với Calibration (không overfit), và nâng tỷ lệ giữ đúng các mã có chất lượng dòng tiền thật (`CFO/NI >= 1.0`, không gian lận sổ sách).
- **SC-006 (Zero Regressions)**: `npx tsc --noEmit`, `npm run lint`, `npm run build` (`vite build`), và toàn bộ test suites (`tsx --test` + `vitest run`) đạt 100% pass.
