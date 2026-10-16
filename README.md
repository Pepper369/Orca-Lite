# Orca Financial Lite 🚀

Phiên bản siêu nhẹ, tối giản và tối ưu hóa của hệ thống **Orca Financial Platform**, được thiết kế để thử nghiệm nhanh và deploy mượt mà trên **Google AI Studio (Gemini 2.0 Flash)** và **Google Cloud Run / Firebase App Hosting**.

## ✨ Điểm nổi bật của phiên bản Lite:
- ⚡ **Siêu nhẹ (-85% dung lượng):** Đã loại bỏ hoàn toàn mã nguồn native Android (Gradle, Capacitor), OpenNext/Wrangler và các bộ dữ liệu nặng.
- 🧠 **Google AI Studio Ready:** Hỗ trợ trực tiếp `GEMINI_API_KEY` (Gemini 2.0 Flash / 1.5 Flash) từ [Google AI Studio](https://aistudio.google.com/) với Free Tier cực lớn.
- 🛡️ **Zero Database Friction:** Tự động fallback về In-Memory Mock nếu chưa cấu hình PostgreSQL hoặc Redis, giúp bạn khởi chạy ngay lập tức mà không cần cài đặt hạ tầng database.
- 📊 **Full Web Capabilities:** Giữ nguyên toàn bộ giao diện bảng điện, phân tích cổ phiếu, biểu đồ kỹ thuật TradingView và hệ thống AI Chat.

## 🚀 Khởi chạy nhanh (Quick Start)

### 1. Cài đặt thư viện
```bash
npm install
```

### 2. Cấu hình biến môi trường
Tạo file `.env` từ file mẫu:
```bash
cp .env.example .env
```
Điền `GEMINI_API_KEY` lấy từ [Google AI Studio](https://aistudio.google.com/):
```env
GEMINI_API_KEY=AIzaSy...
```

### 3. Khởi động môi trường phát triển
```bash
npm run dev
```
Truy cập: [http://localhost:3000](http://localhost:3000)

## 📦 Build & Deploy Production
```bash
npm run build
npm run start
```
Dự án được cấu hình `output: "standalone"` nên có thể deploy trực tiếp lên Google Cloud Run hoặc Docker một cách dễ dàng.

## 📄 Bản quyền
Phát hành theo giấy phép [MIT](LICENSE).
