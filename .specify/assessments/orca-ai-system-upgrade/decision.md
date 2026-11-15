# Decision: Nâng cấp Toàn diện Hệ thống Trí tuệ Nhân tạo Orca AI

- **Slug**: orca-ai-system-upgrade
- **Decided**: 2026-11-15
- **Verdict**: go
- **Artifacts reviewed**: intake.md | research.md | problem.md | concept.md

## Scorecard

| Criterion | Rating | Justification |
| :--- | :--- | :--- |
| **Problem validity** | `strong` | Điểm nghẽn độ trễ phản hồi đóng khối (15-25s) là rào cản lớn nhất đối với trải nghiệm người dùng trong tương tác AI; nhu cầu theo dõi từng bước tư duy của Agent và trực quan hóa BCTC/biểu đồ là thực tế và cấp thiết. |
| **Evidence strength** | `strong` | Dữ liệu được bóc tách trực tiếp từ mã nguồn thực tế (`agent-runner.ts`, `gateway.ts`, `local-gguf.ts`, `ask-orca/route.ts`), thời gian xử lý và lưu lượng bộ nhớ đã được kiểm chứng bằng thực nghiệm. |
| **Value vs. inaction** | `strong` | Đưa TTFT từ 15-25s xuống < 800ms mà không phát sinh thêm chi phí hạ tầng hay chi phí API mới; khai phóng 100% sức mạnh của 30+ engine định lượng có sẵn. |
| **Feasibility / appetite** | `strong` | Phương án được chọn (Option A) có quy mô `small` (3-5 ngày), sử dụng Web Streams API nguyên bản của Next.js 16/Node.js, không thêm dependencies bên ngoài. |
| **Strategic fit** | `strong` | Hoàn toàn đồng nhất với triết lý của Orca-Lite: Siêu nhẹ (-85% dung lượng), Zero Database Friction, tự chủ công nghệ bằng Local GGUF kết hợp Google AI Studio. |
| **Risk posture** | `strong` | Rủi ro được kiểm soát tối đa: Nếu client ngắt kết nối hoặc không hỗ trợ SSE, hệ thống tự động suy thoái về dạng JSON thông thường một cách an toàn. |

## Verdict & Rationale

**QUYẾT ĐỊNH: GO (Phê duyệt triển khai nâng cấp)**.
Hệ thống Orca AI đã có một nền tảng vững chắc về chiều sâu phân tích tài chính và hạ tầng mô hình lai (Hybrid Local GGUF + Cloud Gemini). Điểm yếu duy nhất là trải nghiệm giao tiếp blocking cũ kỹ. Việc nâng cấp lên **Lite SSE Native Streaming & ReAct Stepper Engine** sẽ giải quyết triệt để điểm nghẽn về tốc độ và tính minh bạch trong tư duy của AI, biến Orca AI thành một trợ lý tài chính thế hệ mới sắc sảo, tốc độ cao và đáng tin cậy.

## If go — Handoff to `/speckit-specify` & Implementation Plan

- **Problem**: Chuyển đổi cơ chế giao tiếp blocking JSON (độ trễ 15-25s) sang chuẩn Native SSE Streaming mượt mà (TTFT < 800ms), trực quan hóa từng bước tư duy ReAct (Thought / Tool / Observation), và tự động hóa cơ chế điều hướng tải giữa Local GGUF và Cloud Gemini.
- **Chosen approach**: Option A — Lite SSE Native Streaming & ReAct Stepper Engine.
- **In scope**:
  1. Xây dựng SSE Streaming Handler trong `src/app/api/v1/agent/route.ts` hỗ trợ 3 loại event: `step`, `token`, `done`.
  2. Nâng cấp `src/lib/ai/local-gguf.ts` với hàm `checkLocalGgufHeartbeat()` tự động phát hiện `llama-server` online/offline trong 500ms.
  3. Bổ sung 2 công cụ CFA mới vào `src/lib/ai/tools/fa-tools.ts`: `tool_get_orderbook_flow` và `tool_get_wyckoff_vsa_signals`.
  4. Cập nhật giao diện `src/app/agent/page.tsx`: Khối Stepper hiển thị tiến trình tư duy có thể thu gọn/mở rộng, hỗ trợ KaTeX công thức toán học và nút Abort Request.
- **Out of scope**:
  - Không thay đổi kiến trúc Next.js App Router hoặc thêm framework AI bên thứ ba (LangChain/CrewAI).
  - Không phá vỡ nguyên lý Zero Database Friction.
- **Success metrics**: TTFT < 800ms; Tỷ lệ timeout = 0%; Trải nghiệm trực quan hóa đạt điểm xuất sắc.
- **Carried-forward open questions**:
  - Đảm bảo kiểm tra cẩn thận cờ `req.signal.aborted` trong các vòng lặp bất đồng bộ để giải phóng tài nguyên CPU/RAM khi người dùng đóng kết nối sớm.
