# Idea Intake: Nâng cấp Toàn diện Hệ thống Trí tuệ Nhân tạo Orca AI (Orca-Financial)

- **Slug**: orca-ai-system-upgrade
- **Created**: 2026-11-15
- **Source**: codebase pointer (`src/lib/ai/`, `src/app/api/ask-orca/`, `src/lib/engines/orca-contextual-reasoning-engine.ts`, `models/`)
- **Type**: improvement

## Idea (as captured)

"Dùng spec-kit để nghiên cứu hướng nâng cấp cho hệ thống Orca AI của dự án Orca-Lite này."
Mục tiêu là rà soát toàn bộ các thành phần AI hiện hữu trong hệ sinh thái Orca-Lite:
1. `gateway.ts` & `local-gguf.ts`: Hạ tầng suy luận lai (Local GGUF Qwen2.5-3B + Cloud Gemini 2.0 / OpenRouter).
2. `agent-runner.ts` & `fa-tools.ts`: Vòng lặp tư duy ReAct (Reasoning + Acting) chuẩn CFA.
3. `fact-check-engine.ts`: Thẩm định tin đồn & bóc tách báo cáo tài chính thật (Verify Mode).
4. `dual-ai-consensus.ts`: Đồng thuận trí tuệ kép MIQuant AI + FireAnt AI.
5. `orca-contextual-reasoning-engine.ts`: Bộ máy suy luận ngữ cảnh 17 domain, mô phỏng kịch bản đa chiều và tính toán toán học tài chính KaTeX.
Tìm ra các điểm nghẽn về trải nghiệm (TTFT, streaming, hội thoại đa lượt), độ chính xác định lượng, và đề xuất lộ trình nâng cấp kiến trúc tinh gọn, hiệu quả nhất.

## Restated

Nghiên cứu và hoạch định lộ trình nâng cấp toàn diện cho hệ thống Orca AI trong nền tảng Orca-Lite: chuyển dịch từ kiến trúc phản hồi khối (blocking JSON) sang Server-Sent Events (SSE Streaming), mở rộng bộ công cụ ReAct với tín hiệu vi cấu trúc lệnh/Wyckoff, tự động hóa heartbeat quản lý Local GGUF runtime, và tăng cường năng lực sinh trực quan tương tác (Visual Artifacts/KaTeX).

## Origin & Context

- **Raised by**: Lead Developer / Product Owner của dự án Orca Financial.
- **Trigger**: Dự án đã tích hợp thành công mô hình cục bộ `orca-fa-qwen2.5-3b-q4_k_m.gguf` và Gemini 2.0 Flash, nhưng các luồng phân tích phức tạp mất từ 10-25 giây để trả lời trọn vẹn dạng JSON đóng khối, tạo cảm giác chờ đợi cho người dùng; đồng thời các phân tích chuyên sâu cần thêm khả năng trực quan hóa biểu đồ ngay trong phiên chat.

## First-Glance Unknowns

- [NEEDS CLARIFICATION: SSE Streaming có làm đứt gãy quy trình kiểm tra lỗi JSON của vòng lặp ReAct `agent-runner` không?]
- [NEEDS CLARIFICATION: Mức tiêu thụ bộ nhớ và giới hạn phần cứng của máy cá nhân khi vừa chạy Next.js dev server vừa stream `llama-server` GGUF?]
- [NEEDS CLARIFICATION: Tần suất gọi API đồng thuận Dual-AI (MIQuant + FireAnt) có gặp nguy cơ bị chặn rate-limit nếu người dùng chat liên tục không?]
- [NEEDS CLARIFICATION: Cần cơ chế cache ngữ cảnh (Prompt Caching / Semantic Cache) ở tầng nào để tối ưu chi phí token Gemini và giảm độ trễ?]
