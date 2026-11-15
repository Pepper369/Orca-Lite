# Concept: Nâng cấp Toàn diện Hệ thống Trí tuệ Nhân tạo Orca AI

- **Slug**: orca-ai-system-upgrade
- **Created**: 2026-11-15
- **Recommended option**: Option A — Lite SSE Native Streaming & ReAct Stepper Engine

## Options

### Option A — Lite SSE Native Streaming & ReAct Stepper Engine (Khuyên dùng)
- **Sketch**:
  - Tận dụng chuẩn Web Streams API (`ReadableStream` & `TextEncoder`) nguyên bản của Node.js / Next.js App Router mà không cần cài thêm bất kỳ thư viện bên ngoài nào.
  - Biến đổi `src/app/api/v1/agent/route.ts` thành streaming endpoint gửi chuỗi sự kiện SSE:
    1. `event: step` (truyền suy nghĩ `thought`, tên công cụ `toolCall` và kết quả `observation`).
    2. `event: token` (stream từng từ của câu trả lời phân tích tổng hợp cuối cùng).
    3. `event: done` (truyền thông số hoàn tất: độ trễ `latencyMs`, model thực thi, confidence).
  - Thêm cơ chế `checkLocalGgufHeartbeat()` với timeout ngắn 500ms: Tự động ping `http://127.0.0.1:8080/health`. Nếu `llama-server` online, ưu tiên suy luận nội bộ; nếu offline, tự động fallback mượt mà sang Google AI Studio Gemini 2.0 Flash.
  - Bổ sung 2 công cụ ReAct mới trong `fa-tools.ts` bằng cách kết nối trực tiếp các engine có sẵn: `tool_get_orderbook_flow` (từ `stock-orderbook.ts`) và `tool_get_wyckoff_vsa_signals` (từ `wyckoff-elliott.ts` & `vsa-engine.ts`).
  - Nâng cấp giao diện `src/app/agent/page.tsx`: Hiển thị khối tiến trình suy luận (Reasoning Stepper) có thể bấm mở rộng/thu gọn và hỗ trợ nút bấm "Dừng tạo phản hồi" (AbortController).
- **Appetite**: `small` (3 - 5 ngày làm việc).
- **Trade-offs**: Giữ trọn vẹn triết lý "Lite (-85% dung lượng)" và Zero Database Friction; không phát sinh dependencies mới; hiệu năng tối đa. Không có tính năng kéo thả phức tạp của các framework nặng.
- **Rabbit holes**: Cần đảm bảo xử lý ngắt stream sạch sẽ (`req.signal.aborted`) để không rò rỉ bộ nhớ khi người dùng thoát trang hoặc đóng tab giữa chừng.

---

### Option B — Chuyển Đổi Sang Vercel AI SDK 4.x & Generative React Components
- **Sketch**: Cài đặt `@ai-sdk/react` và package `ai`. Viết lại toàn bộ 7+ công cụ trong `fa-tools.ts` theo định dạng `tool()` và schema `zod`. Sử dụng `streamText` và hook `useChat`. Trả về các React Component động trực tiếp từ server.
- **Appetite**: `medium` (2 - 3 tuần).
- **Trade-offs**: Sử dụng hệ sinh thái chuẩn hóa của Vercel, nhưng phải tái cấu trúc lại toàn bộ hệ thống schema, phát sinh thêm nhiều thư viện phụ thuộc, và có nguy cơ xung đột với phiên bản Next.js 16 và React 19 trong dự án.
- **Rabbit holes**: Khả năng tương thích giữa Turbopack, React 19 và các bản cập nhật nhanh của Vercel AI SDK dễ gây lỗi đóng gói chunk (chunk desync).

---

### Option C — Tách Riêng Thành Microservice Python Copilot (FastAPI + LangGraph)
- **Sketch**: Tách toàn bộ module AI thành một dịch vụ backend độc lập viết bằng Python, sử dụng LangGraph để xây dựng đồ thị trạng thái Agent, chạy trên cổng 8000. Next.js chỉ làm nhiệm vụ proxy.
- **Appetite**: `large` (1 - 2 tháng).
- **Trade-offs**: Dễ dàng tích hợp các thư viện Python chuyên sâu, nhưng phá vỡ hoàn toàn cam kết kiến trúc gọn nhẹ, làm tăng gấp đôi độ phức tạp khi deploy và quản lý tiến trình.
- **Rabbit holes**: Quản lý đa tiến trình trên máy người dùng (Next.js + Python Uvicorn + Llama-server), nguy cơ xung đột môi trường Python và độ trễ truyền dữ liệu liên dịch vụ.

---

## Recommendation

**Chọn Option A (Lite SSE Native Streaming & ReAct Stepper Engine)**.
- **Lý do**: Đây là phương án hiện thực hóa trọn vẹn triết lý **Ponytail (Pragmatic Senior Dev Engine)**:
  1. *Giải quyết triệt để bài toán*: Đưa thời gian phản hồi đầu tiên (TTFT) từ 15-20s xuống < 800ms.
  2. *Tận dụng tối đa tài nguyên có sẵn*: Hệ thống đã có sẵn 30+ engine định lượng (`wyckoff-elliott.ts`, `stock-orderbook.ts`, `financial-calculation-suite.ts`) và mô hình Local GGUF `orca-fa-qwen2.5-3b-q4_k_m.gguf`. Việc kết nối chúng bằng chuẩn Web Streams nguyên bản là con đường ngắn nhất, an toàn nhất và ít rủi ro nhất.
  3. *Không bloat mã nguồn*: Không thêm thư viện thừa, giữ vững tính cơ động và tốc độ khởi chạy tức thì của bản Lite.

## Out of Scope (for the recommended option)

- Không xây dựng cơ chế quản lý đa workspace hoặc đa tổ chức phức tạp.
- Không thay thế các định dạng lưu trữ hiện hữu (vẫn ưu tiên in-memory và LocalStorage cho trải nghiệm Zero Database Friction).
- Không tự động download các model LLM khổng lồ (> 7B parameters) gây quá tải phần cứng máy cá nhân.

## Assumptions to Validate

1. Trình duyệt client và môi trường serverless Node.js của Next.js 16 hỗ trợ trơn tru Web Streams API (`ReadableStream`) mà không bị đệm buffer (buffer buffering).
2. Llama-server cục bộ hỗ trợ streaming OpenAI-compatible endpoint `/v1/chat/completions` với cờ `stream: true`.
