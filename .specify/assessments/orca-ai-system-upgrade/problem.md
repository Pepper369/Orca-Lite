# Problem Definition: Nâng cấp Toàn diện Hệ thống Trí tuệ Nhân tạo Orca AI

- **Slug**: orca-ai-system-upgrade
- **Created**: 2026-11-15
- **Inputs used**: intake.md | research.md | codebase analysis

## Problem Statement

Hệ thống Orca AI trong Orca-Lite sở hữu chiều sâu phân tích tài chính vượt trội (17 domain ngữ cảnh, 7 công cụ CFA, mô hình định giá DCF, phân tích BCTC red flags, và mô hình local fine-tuned Qwen2.5-3B). Tuy nhiên, toàn bộ giao tiếp giữa Client và Server vẫn bị nghẽn ở kiến trúc đóng khối (Blocking JSON), khiến độ trễ phản hồi ban đầu (TTFT) kéo dài từ 12-25s, thiếu cơ chế streaming hiển thị từng bước tư duy (Step-by-step Chain-of-Thought), và việc kiểm soát vòng đời của mô hình Local GGUF còn mang tính thủ công rời rạc.

## Affected Users & Stakeholders

- **Nhà đầu tư cá nhân & Trader**: Trải nghiệm bị gián đoạn vì phải chờ đợi lâu khi gửi câu hỏi chuyên sâu; không thể theo dõi tiến trình Agent đang làm gì (đang đọc BCTC hay đang tính DCF); thiếu các bảng biểu & mini-chart tương tác trực tiếp trong luồng chat.
- **Chuyên gia Phân tích Tài chính (CFA / Analyst)**: Cần công cụ thẩm định tin đồn (Verify Mode) trích dẫn văn bản BCTC tức thời, và có khả năng tương tác điều chỉnh trực tiếp các giả định định giá (WACC, tốc độ tăng trưởng dài hạn g).
- **Kỹ sư Hệ thống / Nhà phát triển**: Cần cơ chế tự động nhận diện trạng thái Local GGUF (`llama-server`) để tự động chuyển tiếp mềm (fallback) sang Cloud Gemini 2.0 mà không gây lỗi kết nối cho người dùng.

## Goals

1. **Streaming Real-time (TTFT < 800ms)**: Chuyển đổi luồng xử lý của Agent sang giao thức Server-Sent Events (SSE / NDJSON), truyền trực tiếp các token chữ và các bước tư duy (Thoughts / Tool Calls / Observations) về UI tức thì.
2. **Hiển thị Quy trình ReAct Trực quan**: Biến các bước thực thi công cụ trong `agent-runner.ts` thành các khối Accordion / Stepper trực quan trên giao diện `src/app/agent/page.tsx`.
3. **Quản lý Vòng đời Local GGUF Thông minh**: Tự động ping heartbeat `http://127.0.0.1:8080/health`, tự động phát hiện khi `llama-server` bật/tắt để điều hướng tải mượt mà.
4. **Mở rộng Công cụ CFA Chuyên sâu**: Bổ sung 2 công cụ quan trọng còn thiếu vào `fa-tools.ts`:
   - `tool_get_orderbook_flow`: Phân tích bước giá, độ sâu sổ lệnh và dòng tiền khớp lệnh chủ động (chủ động mua vs chủ động bán).
   - `tool_get_wyckoff_vsa_signals`: Trích xuất pha Wyckoff (Tích lũy / Phân phối / Spring / Upthrust) và tín hiệu VSA (No Supply, Shakeout).
5. **Interactive Generative UI**: Trình diễn các công thức KaTeX toán học sắc nét và nhúng các thẻ tương tác (Mini TradingView Chart, Thẻ Định giá DCF tương tác) ngay trong đoạn chat.

## Non-Goals

- Không thay thế framework Next.js App Router hoặc cài đặt các framework AI cồng kềnh của bên thứ ba (LangChain, CrewAI, AutoGen).
- Không bắt buộc người dùng phải có card đồ họa GPU hoặc phải bật Local GGUF (hệ thống vẫn hoàn toàn độc lập và miễn phí 100% với Google AI Studio Gemini 2.0 Flash).
- Không phá vỡ nguyên lý kiến trúc "Zero Database Friction" (tiếp tục duy trì cơ chế in-memory fallback mượt mà).

## Success Metrics

- **Thời gian phản hồi ban đầu (TTFT)**: Giảm từ 12s - 25s xuống **< 800ms** (với Cloud Gemini) và **< 1500ms** (với Local GGUF).
- **Tỷ lệ Timeout Serverless**: Giảm về **0%** nhờ việc stream dữ liệu liên tục giữ kết nối HTTP luôn sống.
- **Tỷ lệ giải đáp chính xác**: Đạt **100%** đối với các câu hỏi kiểm tra BCTC red flags và tính toán thuế TNCN / định giá WACC-DCF thông qua bộ công cụ định lượng đã kiểm thử.

## Cost of Inaction

Nếu không nâng cấp, người dùng sẽ đánh giá hệ sinh thái Orca AI là nặng nề và chậm chạp so với các đối thủ trên thị trường; toàn bộ kho tàng 30+ engine định lượng xuất sắc của dự án sẽ bị che lấp bởi trải nghiệm chờ đợi JSON khô cứng.

## Open Questions

- [NEEDS CLARIFICATION: Sử dụng Web Streams API nguyên bản của Next.js hay dùng thư viện `@ai-sdk/react` để tối ưu hóa việc quản lý hook `useChat`?]
- [NEEDS CLARIFICATION: Có nên lưu trữ lịch sử hội thoại nhiều phiên (Multi-session Chat History) vào IndexedDB của trình duyệt để giữ tính chất Zero Database Friction?]
