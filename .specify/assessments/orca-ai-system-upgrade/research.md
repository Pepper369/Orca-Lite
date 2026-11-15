# Idea Research: Nâng cấp Toàn diện Hệ thống Trí tuệ Nhân tạo Orca AI

- **Slug**: orca-ai-system-upgrade
- **Created**: 2026-11-15
- **Evidence confidence (overall)**: high

## Users & Demand

- **Độ trễ phản hồi (TTFT - Time To First Token)**: Hiện tại các endpoint `/api/ask-orca` và `/api/v1/agent` trả lời bằng JSON đóng khối (blocking response). Với các câu hỏi phức tạp kích hoạt ReAct loop (gọi 2-3 tools) hoặc tính toán định giá đa kịch bản, thời gian chờ là 12s - 25s. Người dùng thường xuyên cảm giác hệ thống bị đơ nếu không có tín hiệu token streaming. — [source: `src/app/api/v1/agent/route.ts` & `src/app/agent/page.tsx`] (confidence: high)
- **Nhu cầu Thẩm định Tin đồn (Verify Mode)**: Thị trường chứng khoán Việt Nam có đặc thù lan truyền thông tin qua mạng xã hội (F247, Facebook, Zalo). Tính năng `tool_verify_claims_and_rumors` và `fact-check-engine.ts` được người dùng đánh giá cao nhất vì vạch trần các chiêu trò "lãi trên giấy", "thoát lỗ nhờ bán tài sản", "P/E ảo". — [source: `src/lib/ai/fact-check-engine.ts`] (confidence: high)
- **Nhu cầu Trực quan hóa Biểu đồ Mini (Generative Chart Widgets)**: Người dùng khi hỏi về xu hướng cổ phiếu muốn thấy trực tiếp mô hình nến, đường MA hoặc đồng hồ kỹ thuật (Technical Gauge) ngay trong khung chat thay vì chỉ đọc văn bản thuần túy. — [source: `src/components/ai-assistant-widget.tsx` & `src/app/agent/page.tsx`] (confidence: medium)

## Prior Art

- **Nội bộ Orca-Lite**:
  - `gateway.ts`: Đã có hạ tầng cascade đa tầng (Local GGUF <-> Gemini 2.0 <-> OpenRouter <-> Groq).
  - `orca-contextual-reasoning-engine.ts`: Có sẵn thư viện toán học tài chính thuần túy (`financial-calculation-suite.ts`) không phụ thuộc LLM (tính thuế TNCN, WACC, DCF, kịch bản Base/Bull/Bear).
  - `DualAiConsensusEngine`: Đã kết nối MIQuant AI và FireAnt Answer AI qua kỹ thuật Reverse Engineering chuẩn xác.
- **Bên ngoài (Thị trường & Đối thủ)**:
  - **Perplexity Finance**: Nổi bật nhờ trích dẫn số liệu theo thời gian thực (Citations) và tốc độ stream tức thì qua SSE.
  - **FireAnt Answer AI**: Có trích dẫn văn bản PDF nhưng không hỗ trợ suy luận ngoại tuyến (Offline Local LLM) và không có công cụ tính toán tài chính cá nhân.
  - **FinChat.io**: Chuyên sâu BCTC toàn cầu nhưng thiếu dữ liệu vĩ mô và đặc thù kế toán VAS của Việt Nam.

## Market & Context

- **Chi phí vận hành**: Việc kết hợp Gemini 2.0 Flash (miễn phí hoặc chi phí siêu rẻ qua Google AI Studio) cùng mô hình cục bộ `Qwen2.5-3B-Instruct` QLoRA giúp chi phí vận hành AI gần như bằng 0 ($0 Infra Cost).
- **Chi phí nếu không nâng cấp (Cost of doing nothing)**: Nếu giữ nguyên giao tiếp blocking JSON, người dùng sẽ bỏ sang các công cụ AI khác có tính năng streaming mượt mà; các phân tích định lượng dù chính xác nhưng thiếu tính trực quan sẽ không phát huy hết tiềm năng.

## Data & Constraints

- **Ràng buộc thời gian máy chủ (Timeout Budget)**: Vercel serverless functions có trần 30s - 60s (`maxDuration = 60`). Bắt buộc luồng ReAct không được vượt quá số bước tối đa (capped at `maxSteps = 3`).
- **Tài nguyên phần cứng cục bộ**: Mô hình `orca-fa-qwen2.5-3b-q4_k_m.gguf` chiếm 1.84 GB dung lượng ổ đĩa và khoảng 2.2 GB RAM khi chạy `llama-server`. Cần cơ chế phát hiện tự động (Auto-ping Health Check) để biết server nội bộ có đang bật hay không.
- **Ràng buộc Triết lý Lite & Ponytail**: Không cài thêm các thư viện wrapper cồng kềnh như LangChain, LlamaIndex; giữ mã nguồn trực tiếp, mạch lạc và tối thiểu số lượng dependencies mới.

## Evidence Against the Idea

- **Rủi ro Streaming với JSON Tool-Calling**: Khi chuyển sang streaming, nếu model sinh ra dữ liệu tool gọi dở dang hoặc gặp lỗi cú pháp JSON, việc khôi phục và tự sửa sai (Self-Correction) trên client-side sẽ phức tạp hơn so với xử lý trọn vẹn ở server-side.
  *Giải pháp giảm thiểu*: Tách biệt 2 pha — Pha 1: Chạy vòng lặp ReAct tools ngầm trên server, truyền trạng thái bước (Step Events qua SSE); Pha 2: Stream câu trả lời tổng hợp cuối cùng (`final_answer`) tới client.

## Gaps & Open Questions

- [NEEDS CLARIFICATION: Định dạng giao thức SSE stream: Chuẩn NDJSON tùy biến hay tích hợp Vercel AI SDK `ai/rsc` / `streamText`?]
- [NEEDS CLARIFICATION: Cơ chế ghi nhớ ngữ cảnh hội thoại nhiều phiên (Chat Persistence): lưu trong LocalStorage hay lưu vào DB Drizzle?]

## Sources

- `src/lib/ai/gateway.ts` (hạ tầng LLM đa nguồn)
- `src/lib/ai/agent-runner.ts` (ReAct reasoning loop)
- `src/lib/ai/fact-check-engine.ts` (bộ thẩm định BCTC & tin đồn)
- `src/lib/engines/orca-contextual-reasoning-engine.ts` (bộ máy suy luận 17 domain)
- `src/scripts/model/start_gguf_server.ps1` (kịch bản chạy llama-server)
- `models/orca-fa-qwen2.5-3b-q4_k_m.gguf` (mô hình GGUF nội bộ)
