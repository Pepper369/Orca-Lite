# Decision Record: Nâng cấp Tổng thể Hệ thống Lọc & Fundamental Analysis (Screener & FA 2.0)

- **Slug**: `screener-fa-system-upgrade`
- **Decided**: 2026-11-19
- **Verdict**: `go`
- **Next Spec Directory**: `specs/002-screener-fa-system-upgrade`

## Scorecard

| Criterion | Rating | Justification |
|---|---|---|
| **Problem validity** | `strong` | Kiểm tra mã nguồn xác nhận 49 presets / 32 UI tabs / 90+ params phân mảnh nặng, timeout `1.5s` ép fallback về dữ liệu ngành đồng nhất, và 7+ công thức FA cốt lõi (BTD, ROIIC, Beneish, Reverse DCF, CCC, Piotroski, Altman) đang dùng fallback tự bịa hoặc bỏ qua đặc thù ngành Ngân hàng/BĐS. |
| **Evidence strength** | `strong` | Mọi khiếm khuyết được đối chiếu trực tiếp từ mã nguồn thực tế (`screener-snapshot-service.ts`, `fundamental-quant-matrix.ts`, `piotroski-altman.ts`, `fundamental-screener.ts`, `snapshots.ts`, `route.ts`). |
| **Value vs. inaction** | `strong` | Loại bỏ hàng loạt tín hiệu giả "BCTC sạch / Siêu tích lũy" do data timeout, giảm >55% độ phức tạp giao diện lọc cho nhà đầu tư, và thống nhất 1 nguồn sự thật (Single Source of Truth) giữa Screener Pro, Fundamental Screener, Valuation Screener và Stock Detail. |
| **Backward compatibility** | `strong` | Duy trì alias map cho tất cả 49 preset IDs, 32 universe query params, và các test contracts hiện có (`screener-fa-enhancements.test.ts`, `piotroski-altman.test.ts`, `fundamental-quant-matrix.test.ts`). |

## Architectural Decisions

1. **Canonical Consolidation + Alias Preservation**: Tinh gọn xuống **20 Presets chuẩn hóa** (8 FA + 12 Technical/Quant/Core) và **12 UI Workspaces**, nhưng giữ toàn bộ legacy IDs trong `PRESET_ALIASES` / `UNIVERSE_ALIASES` để không làm gãy link/bookmark hay test suite cũ.
2. **No Silent Fabrication Rule (Nguyên tắc Trung thực Dữ liệu FA)**: Khi thiếu dữ liệu BCTC bắt buộc (ví dụ `taxExpense`, `capex`, `receivables` kỳ trước), thuật toán PHẢI trả về `null` và hạ điểm `faCoverage`, tuyệt đối không bịa `pretax = np/0.8`, `ebitda = np*1.25`, `ROIC*(1+g)`, hay `pe = 12.0`.
3. **Dual-Engine Bitmask + TypedArray Vector Filtering**: Nâng cấp lọc bitmask lên 2 thanh ghi chuẩn hóa (`techBitFlags` 32-bit giữ nguyên tương thích `SCREENER_BIT` + `faBitFlags` 32-bit kết hợp `QuantFaVectorStore` thực sự trong `queryScreenerStocks`), sửa triệt để nhánh `else` bị che khuất.
4. **Industry-Aware FA Dispatch**: Tách biệt rõ 3 nhóm chuẩn đánh giá: `FINANCIAL_BANK_SEC_INS` (Ngân hàng/Chứng khoán/Bảo hiểm), `REAL_ESTATE` (BĐS/Xây dựng dự án), và `NON_FINANCIAL` (Sản xuất/Bán lẻ/Công nghệ/Năng lượng).
5. **Point-in-Time Causal FA Backtesting**: Mọi benchmark hiệu suất FA phải chạy trên dữ liệu có mô phỏng độ trễ công bố BCTC (45–90 ngày) tách biệt **Calibration** và **Out-of-Sample Holdout**.
