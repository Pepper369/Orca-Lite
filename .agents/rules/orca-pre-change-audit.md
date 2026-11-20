---
trigger: always_on
---

# Orca-Lite: Rule Bắt Buộc Rà Soát & Kiểm Thử Trước Khi Nâng Cấp / Thay Đổi

Áp dụng tự động cho mọi tác vụ chỉnh sửa code, nâng cấp tính năng, tinh chỉnh tham số/ngưỡng, refactor công thức, hoặc sửa pipeline dữ liệu trong dự án **Orca-Lite**.

> **Nguyên tắc tối thượng:** Tuyệt đối **KHÔNG** viết hoặc sửa code trước khi hoàn tất rà soát trùng lặp thuật toán (SSOT), rà soát luồng dữ liệu, và chạy kiểm thử baseline trên vùng mã bị ảnh hưởng.

---

## 1. Cổng Rà Soát Source Code Trước Khi Sửa (Pre-Edit Audit Gate)

Trước khi dùng `edit_file` / `write_file` lên mã nguồn nghiệp vụ (`src/`, `server/`, `scripts/`), bắt buộc thực hiện theo thứ tự:

1. **Quét trùng lặp & Chuỗi gọi (Caller/Callee Graph):**
   - Dùng `rg -n` tìm mọi hàm, công thức, hằng số, type, cache key, hoặc endpoint tương tự trong `src/lib/engines/`, `src/lib/quant/`, `src/lib/financial/`, `src/lib/services/`, `src/lib/data-engine/`, `src/app/api/`, `src/components/`.
   - Tham chiếu `graphify-out/GRAPH_REPORT.md` và các tài liệu hậu kiểm trong `docs/solutions/` khi đụng vào quant engine, FA, hoặc screener để không tái diễn lỗi cũ.
   - Nếu đã tồn tại hàm chuẩn (SSOT), **tái sử dụng hoặc mở rộng có kiểm soát tại nguồn duy nhất đó** — nghiêm cấm tạo bản sao cục bộ hoặc phiên bản song song gây lệch kết quả giữa Screener, Stock Detail, Signal Hub và AI Agent.

2. **Đối chiếu Sổ Đăng Ký SSOT (Single Source of Truth) của Orca-Lite:**
   - **Chỉ báo kỹ thuật & TA Kernel:** Dùng `src/lib/engines/oscillators.ts` (`sma`, `ema`, `rsi`, `macd`, `stochastic`, `adx`, `keltner`, `ttmSqueeze`, `superTrend`, `atrSeries`), `src/lib/technical.ts` (`bollinger`, `atr`, `supportResistance`), và `src/lib/engines/unified-ta-kernel.ts` (`buildSharedBarContext`, `scalarSmaAt`, `scalarEmaLast`). Không tự viết lại chỉ báo hoặc làm tròn trung gian (`.toFixed(2)`) trước bước hiển thị.
   - **Độ chính xác tài sản, Pip/Tick & MTF Resampling:** Dùng `src/lib/engines/asset-precision.ts` (`getAssetPipSize`, `roundPrice`, `computeEfficiencyRatio`, `estimateClvOrderFlowImbalance`, `resampleOhlcvBars`, `buildMtfConfluenceMatrix`). Cấm hardcode `0.0001`, `.toFixed(5)` hay `1e-5` cho JPY, XAU/XAG, OIL, VN stocks hoặc micro-cap crypto.
   - **FX / Crypto Precision & Quant Cross-Asset:** Dùng `src/lib/engines/fx-crypto-precision-engine.ts` (`evaluatePrecisionTradeSetup`), `src/lib/engines/unified-cross-asset-quant.ts` (`calculateCrossAssetKelly`, `evaluateForexSpreadSafety`), `src/lib/engines/advanced-quant-math.ts`, `src/lib/engines/high-winrate-gate.ts`, `src/lib/engines/ict-smc-liquidity-engine.ts`.
   - **Toán học Phân tích Cơ bản (FA) & Provenance:** Dùng `src/lib/financial/fa-core.ts` (`FaProvenance`, `IndustryEvalTrack`, `resolveIndustryEvalTrack`, `computeSectorPercentileMap`) và `src/lib/financial/validation.ts` (`scoreFinancialQuality`, `crossValidatePeriods`, `runFullCrossValidation`).
   - **Screener Taxonomy & Preset:** Mọi preset/filter/universe mới phải đi qua `src/lib/quant/screener-taxonomy.ts`, đồng bộ giữa API và UI, không sinh thêm preset chồng chéo.
   - **Data Hub, Quality, Freshness & Reconcile:** Dùng `src/lib/data-engine/hub.ts` (`runInDataHub`, `hubFinancialPackage`, `hubVnQuotes`, `hubCryptoDetail`, `hubForexDetail`), `src/lib/quality.ts` (`validateQuote`, `validateBars`, `combineQuality`), `src/lib/freshness.ts` (`computeFreshness`, `buildMeta`), và `src/lib/data-engine/reconcile.ts`.

3. **Kiểm tra Biên Client / Server (`vite build`):**
   - Mọi module pure math/taxonomy chia sẻ với React client (`fa-core.ts`, `screener-taxonomy.ts`, `asset-precision.ts`, `fx-crypto-precision-engine.ts`, `high-winrate-gate.ts`, `ict-smc-liquidity-engine.ts`) **tuyệt đối không** import `"server-only"` hay module Node/DB thuần server.

---

## 2. Cổng Kiểm Thử Baseline Trước Khi Sửa (Pre-Edit Verification Gate)

Trước khi thay đổi logic hoặc công thức, phải chạy kiểm tra hiện trạng để nắm baseline sạch (tránh nhầm lỗi có sẵn với regression mới):

1. **Kiểm tra kiểu dữ liệu:** Chạy `npm run typecheck` (`tsc --noEmit`). Lưu ý `tsconfig.json` đang exclude `src/lib/__tests__` và `**/*.test.ts`, nên typecheck không tự chạy code test.
2. **Chạy test `node:test` hiện có cho domain liên quan** bằng `npx tsx --conditions=react-server --test <file(s)>`:
   - *Core TA / Quant / Money-Flow:* `src/lib/__tests__/core-algorithm-purification.test.ts`, `src/lib/__tests__/cross-asset-quant-engines.test.ts`, `src/lib/__tests__/advanced-quant-math.test.ts`
   - *FX / Crypto / Order Flow / Scalp:* `src/lib/__tests__/fx-crypto-precision-backtest.test.ts`, `src/lib/__tests__/forex-order-flow-pro.test.ts`, `src/lib/__tests__/forex-quant-signals.test.ts`, `src/lib/__tests__/forex-pro-advanced.test.ts`
   - *FA / Valuation / Screener:* `src/lib/__tests__/fa-core-and-provenance.test.ts`, `src/lib/__tests__/screener-consolidation-parity.test.ts`, `src/lib/__tests__/stock-detail-screener-sync.test.ts`, `src/lib/__tests__/fundamental-quant-matrix.test.ts`, `src/lib/__tests__/piotroski-altman.test.ts`
   - *Data Quality / Reconcile / Security:* `src/lib/__tests__/data-quality.test.ts`, `src/lib/__tests__/data-reconcile.test.ts`, `src/lib/__tests__/security-audit.test.ts`, hoặc `npm test` / `npm run test:all` khi sửa diện rộng.
   - *(Lưu ý: `src/lib/engines/__tests__/ict-smc-liquidity-engine.test.ts` và `quant-reversal-pace.test.ts` dùng import `"vitest"` — kiểm tra runner trước khi dựa vào 2 file này).*
3. **Nếu vùng sắp sửa chưa có test hoặc test thiếu invariant quan trọng:** Đọc kỹ edge cases trong code hiện tại và chuẩn bị test tái hiện/bảo vệ invariant ngay cùng đợt thay đổi.

---

## 3. 6 Hàng Rào Chống Chồng Chéo Thuật Toán & Dữ Liệu Sai

Khi thiết kế hoặc nâng cấp bất kỳ thuật toán, công thức hay luồng dữ liệu nào, bắt buộc kiểm tra 6 bất biến sau:

1. **Truth-in-Data — Cấm bịa/ngụy tạo dữ liệu:** Không dùng `Math.sin`, `Math.random`, random walk, hằng số giả lập (`pe=12`, `qualityScore=50`, `volume=150_000`), hay biến `null` thành `0` (`?? 0`) khi thiếu BCTC/OHLCV. Thiếu dữ liệu phải giữ `null` (hoặc `Number.NaN` trong `Float32Array`), đánh dấu đúng `FaProvenance` / `QualityStatus`, và trả `NO_TRADE` / `UNAVAILABLE` thay vì ép tín hiệu.
2. **Causal Integrity — Cấm Look-Ahead Bias:** Mọi rolling window (`avgVolume`, `medianSpread`, swing confirmation, liquidity sweep, HTF resampling, FA filing lag, barrier backtest) chỉ được đọc lát cắt quá khứ `[0..t]`. Cấm lấy thống kê toàn mảng (như `bars.slice(-N)`) áp ngược cho nến cũ hoặc mở lệnh và kiểm SL/TP trên cùng 1 nến đóng cửa.
3. **Unit & Scale Parity — Đồng bộ đơn vị đo:** Xác minh rõ đơn vị trước mọi phép toán: VND vs nghìn VND (`1000x`), epoch `ms` vs `sec`, tỷ lệ thập phân (`0.15`) vs phần trăm (`15`), `volume` cổ phiếu vs giá trị giao dịch `totalVolumeVND`, `activeBuyRatio` toàn thị trường vs `foreignBuyRatioPct` khối ngoại, pip/tick theo từng asset class.
4. **Industry-Aware Math — Phân luồng đặc thù ngành:** Không áp công thức phi tài chính (COGS, Gross Margin, D/E, Current Ratio, Altman Z'') lên nhóm `FINANCIAL_BANK_SEC_INS` (`EXEMPT_FINANCIAL`) hoặc bỏ qua đặc thù `REAL_ESTATE`.
5. **Single Formula & Cache Consistency:** Mọi màn hình/API dùng chung 1 chỉ số phải gọi cùng 1 hàm SSOT và dùng chung cơ chế `runInDataHub`. Khi thay đổi schema hoặc công thức đầu ra có cache, bắt buộc nâng phiên bản cache key (ví dụ `v2` -> `v3`).
6. **Anti-Overfitting Verification:** Khi nâng cấp tham số hoặc ngưỡng lọc setup/backtest, phải đối chứng song song tập Calibration và Out-of-Sample Holdout (qua `fx-crypto-backtest-harness.ts` / `fa-backtest-harness.ts`) và đảm bảo bất biến khi dữ liệu tương lai thay đổi.

---

## 4. Kiểm Thử Hậu Thay Đổi & Minh Bạch Kết Quả (Post-Edit Gate)

Sau khi hoàn thành sửa đổi cuối cùng:
- Chạy lại bộ test liên quan + regression tests + `npm run typecheck` (+ `npm run lint` và `npm run build` nếu đụng code shared client/server hoặc UI).
- Bổ sung unit/invariant test cho mọi công thức mới hoặc lỗi vừa fix.
- Chỉ báo cáo những file, symbol, lệnh kiểm tra và số lượng test pass/fail thực tế đã quan sát được sau lần chỉnh sửa cuối cùng.
