# Orca Financial Lite

<p align="center">
  <img src="https://raw.githubusercontent.com/Pepper369/Orca-Lite/main/public/icon.png" alt="Orca Financial Logo" width="100" height="100" style="border-radius: 20%;" onerror="this.style.display='none'"/>
</p>

<p align="center">
  <strong>Nền tảng Phân tích Tài chính Đa tài sản, Định lượng & Quản lý Tài chính Cá nhân Tinh gọn</strong>
  <br />
  <em>Tối ưu hóa cho Next.js 16 Turbopack • Google AI Studio (Gemini 2.0) • Đa thị trường Việt Nam & Quốc tế</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.4.3-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19.2-blue?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4.1-38bdf8?style=flat-square&logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Gemini_AI-2.0_Flash-orange?style=flat-square&logo=google" alt="Gemini AI" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

---

## Mục lục

1. [Giới thiệu](#giới-thiệu)
2. [Điểm nổi bật của bản Lite](#điểm-nổi-bật-của-bản-lite)
3. [Tính năng cốt lõi](#tính-năng-cốt-lõi)
   - [Thị trường Cổ phiếu Việt Nam (Equities)](#1-thị-trường-cổ-phiếu-việt-nam-equities)
   - [Định lượng & Bộ lọc Cổ phiếu (Quant & Screeners)](#2-định-lượng--bộ-lọc-cổ-phiếu-quant--screeners)
   - [Phái sinh, Ngoại hối & Hàng hóa (Multi-Asset)](#3-phái-sinh-ngoại-hối--hàng-hóa-multi-asset)
   - [Quản lý Tài chính Cá nhân (Personal Finance)](#4-quản-lý-tài-chính-cá-nhân-personal-finance)
   - [Trợ lý Trí tuệ Nhân tạo (Orca AI & Agents)](#5-trợ-lý-trí-tuệ-nhân-tạo-orca-ai--agents)
4. [Kiến trúc Thư mục & Dự án](#kiến-trúc-thư-mục--dự-án)
5. [Hệ thống Dữ liệu & Nhà cung cấp](#hệ-thống-dữ-liệu--nhà-cung-cấp)
6. [Bảo mật & Khả năng Chống chịu (Resilience)](#bảo-mật--khả-năng-chống-chịu-resilience)
7. [Hướng dẫn Cài đặt & Khởi chạy (Quick Start)](#hướng-dẫn-cài-đặt--khởi-chạy-quick-start)
8. [Cấu hình Biến môi trường (.env)](#cấu-hình-biến-môi-trường-env)
9. [Build & Triển khai Production](#build--triển-khai-production)
10. [Giấy phép](#giấy-phép)

---

## Giới thiệu

**Orca Financial Lite** là phiên bản kiến trúc siêu nhẹ, tối giản và hiệu năng cao của hệ sinh thái **Orca Financial Platform**. Hệ thống được xây dựng nhằm cung cấp giải pháp toàn diện cho nhà đầu tư cá nhân và tổ chức: từ theo dõi dữ liệu thị trường trực tiếp, phân tích kỹ thuật định lượng, nhận diện mô hình sóng - giá - khối lượng, lọc cổ phiếu đa tiêu chí, đến lập kế hoạch tài chính cá nhân độc lập và paper trading.

---

## Điểm nổi bật của bản Lite

- **Siêu gọn nhẹ (-85% dung lượng):** Tinh giản toàn bộ các module cồng kềnh, tập trung vào web runtime Next.js 16 (App Router + Turbopack).
- **Google AI Studio Ready:** Tích hợp trực tiếp `GEMINI_API_KEY` (Gemini 2.0 Flash / Pro) với chi phí tối ưu, độ trễ cực thấp.
- **Zero Database Friction:** Cơ chế Fallback thông minh: Tự động chạy với **In-Memory Mock / Public Data Feeds** khi chưa cấu hình PostgreSQL hoặc Redis, sẵn sàng khởi chạy ngay mà không phụ thuộc hạ tầng phức tạp.
- **TradingView Lightweight Charts v5:** Hệ thống biểu đồ tài chính tương tác mượt mà, hỗ trợ đa khung thời gian và phân tích đa chỉ báo.
- **Enterprise-Grade Security:** Tích hợp lớp phòng thủ Anti-SSRF đa tầng (DNS resolution validation, private IP filter) cho webhooks và whitelist host header tại Middleware.

---

## Tính năng cốt lõi

### 1. Thị trường Cổ phiếu Việt Nam (Equities)
- **Bảng giá & Dữ liệu thời gian thực:** Kết nối các nguồn dữ liệu tài chính Việt Nam (SSI iBoard/FCData, VNDIRECT, Vietcap, VPS, CafeF, Vietnambiz).
- **Hồ sơ chuyên sâu từng mã cổ phiếu:**
  - Báo cáo tài chính (Cân đối kế toán, Kết quả kinh doanh, Lưu chuyển tiền tệ) chi tiết nhiều quý/năm.
  - Bộ chỉ số tài chính toàn diện (P/E, P/B, ROE, ROA, Biên lợi nhuận, Đòn bẩy tài chính).
  - Giao dịch nội bộ, cơ cấu cổ đông, lịch sử cổ tức, sự kiện doanh nghiệp và công bố thông tin.
  - Phân tích đồng thuận giá mục tiêu của các công ty chứng khoán (Brokerage Consensus Upside).

### 2. Định lượng & Bộ lọc Cổ phiếu (Quant & Screeners)
- **TradingView Advanced Charts & UDF Engine:**
  - Triển khai đầy đủ giao thức **TradingView UDF API** (`/config`, `/time`, `/symbols`, `/history`, `/search`, `/marks`).
  - **Pine Script v5 Interpreter Engine:** Thực thi các chỉ báo kỹ thuật tùy biến (Golden Cross, SuperTrend, RSI) từ cú pháp Pine Script trực tiếp lên chuỗi nến OHLCV.
  - **Đồng hồ Đo lường Kỹ thuật (Technical Analysis Gauge):** Thuật toán tổng hợp 26 chỉ báo (11 bộ dao động + 15 đường MA) đánh giá áp lực Mua/Bán chuẩn TradingView.
  - **TradingView Vietnam Scanner:** Kết nối dữ liệu quét siêu tốc cho 1,700+ mã cổ phiếu Việt Nam.
  - **Ý tưởng Cộng đồng TradingView (Community Ideas):** Tổng hợp nhận định kỹ thuật, xu hướng Bullish/Bearish từ cộng đồng trader quốc tế & Việt Nam.
- **Super Confluence Screener:** Thuật toán chấm điểm hội tụ 4 trụ cột độc quyền:
  1. *Trend Pillar (25%):* MA Alignment, ADX 14 xác nhận xu hướng, SuperTrend.
  2. *Chart Pattern & VSA Pillar (25%):* Nhận diện tự động VCP (Volatility Contraction Pattern), Cup & Handle, Double Bottom, Bull Flag, Shakeout, No Supply, Pocket Pivot.
  3. *Volume & Momentum (25%):* Bùng nổ khối lượng, TTM Squeeze firing (nén biến động).
  4. *Fundamental Quality (25%):* Chất lượng cơ bản và biên an toàn.
- **15 Bộ lọc chuyên sâu:**
  - **CANSLIM:** Tiêu chí tăng trưởng doanh thu/lợi nhuận của William O'Neil.
  - **Minervini Trend Template:** Tiêu chuẩn đà tăng trưởng giai đoạn 2.
  - **4M Model (Phil Town):** Meaning, Moat, Management, Margin of Safety.
  - **Định giá đa phương pháp:** DCF, P/E, P/B, Định giá Benjamin Graham, Peter Lynch.
  - **Kỹ thuật & Phân kỳ:** Nhận diện phân kỳ thường/ẩn RSI, MACD, Stochastic.
  - **Wyckoff & Elliott Wave:** Nhận diện tích lũy/phân phối và đếm sóng xung lực.
  - **Screener Backtest:** Kiểm thử lịch sử hiệu suất của các tín hiệu lọc cổ phiếu.

### 3. Phái sinh, Ngoại hối & Hàng hóa (Multi-Asset)
- **Chứng khoán phái sinh (HNX Derivatives):**
  - Giám sát hợp đồng tương lai chỉ số VN30 (`VN30F1M`, `VN30F2M`,...).
  - Theo dõi Basis chênh lệch, Arbitrage Signal, Đường cong kỳ hạn (Term Structure Curve).
  - Tỷ lệ ký quỹ theo chuẩn VSDC.
- **Ngoại hối (Forex):** Tỷ giá liên ngân hàng, Phân tích cấu trúc thị trường (Market Structure), Order Flow, Bàn giao dịch lướt sóng (Forex Scalp Desk).
- **Hàng hóa (Commodities):** Dầu thô (Brent/WTI), Vàng, Bạc, Đồng, Nông sản; Ma trận tác động liên thị trường tới các nhóm ngành cổ phiếu Việt Nam.
- **Tiền mã hóa (Crypto):** Tích hợp dữ liệu Binance & CoinGecko, sổ lệnh thời gian thực và tín hiệu Scalp.

### 4. Quản lý Tài chính Cá nhân (Personal Finance)
- **Triết lý Quản lý Tài chính Khoa học:**
  - **6 Chiếc hũ tài chính (Jars System):** Phân bổ thu nhập tự động cho chi tiêu thiết yếu, đầu tư, giáo dục, hưởng thụ.
  - **YNAB (Zero-based Budgeting):** Gán mục đích cho từng đồng thu nhập.
  - **Tháp Tự do Tài chính (FIRE Pyramid):** Đo lường lộ trình độc lập tài chính và nghỉ hưu sớm.
- **Công cụ tính toán tài chính:**
  - Máy tính dòng tiền nhanh (Quick Cashflow Calculator).
  - Công cụ tính Thuế thu nhập cá nhân (TNCN) theo biểu thuế lũy tiến Việt Nam.
  - Dự phóng giá trị tài sản ròng theo thời gian (Projection Engine).

### 5. Trợ lý Trí tuệ Nhân tạo (Orca AI & Agents)
- **Ask Orca AI:** Chatbot tài chính thông minh tích hợp linh vật Orca Mascot, sẵn sàng giải đáp thắc mắc, phân tích cổ phiếu và tư vấn quản lý tài chính.
- **AI Stock Analysis:** Tự động tổng hợp dữ liệu vĩ mô, kỹ thuật và tài chính để đưa ra bản phân tích cô đọng, đánh giá chất xúc tác (Catalysts) và rủi ro (Risks).
- **Morning Brief & Market Bulletin:** Tự động sinh báo cáo tổng hợp thị trường đầu ngày.

---

## Kiến trúc Thư mục & Dự án

```text
Orca-Lite/
├── src/
│   ├── app/                      # Next.js App Router (Pages & API Endpoints)
│   │   ├── (auth)/               # Đăng nhập & Đăng ký tài khoản
│   │   ├── agent/                # Giao diện Agent tài chính
│   │   ├── commodities/          # Thị trường Hàng hóa & Tác động vĩ mô
│   │   ├── crypto/               # Thị trường Tiền mã hóa & Orderflow
│   │   ├── derivatives/          # Thị trường Phái sinh VN30F & Basis
│   │   ├── forex/                # Thị trường Ngoại hối & FX Scalp Desk
│   │   ├── heatmap/              # Bản đồ nhiệt thị trường
│   │   ├── journal/              # Nhật ký giao dịch
│   │   ├── personal-finance/     # Trung tâm Quản lý Tài chính Cá nhân
│   │   ├── portfolio/            # Danh mục đầu tư & Paper Trading
│   │   ├── quant/                # MiQuant Quant Studio (Bot & Chiến lược)
│   │   ├── screener/             # Bộ lọc cổ phiếu (Confluence, CANSLIM, 4M,...)
│   │   ├── stocks/               # Chi tiết & Báo cáo cổ phiếu Việt Nam
│   │   └── api/v1/               # Hệ thống RESTful API (>100 endpoints)
│   ├── components/               # React Components tái sử dụng
│   │   ├── portfolio/            # Bảng Paper Trading, Modal giao dịch nhanh
│   │   ├── stocks/               # Biểu đồ kỹ thuật, Thẻ đồng thuận, Báo cáo
│   │   └── orca-chart.tsx        # Component biểu đồ TradingView Lightweight
│   ├── db/                       # Tầng Cơ sở dữ liệu (Drizzle ORM)
│   │   ├── schema.ts             # Schema PostgreSQL (Users, Watchlist, Stocks,...)
│   │   └── index.ts              # Kết nối Database client & fallback
│   ├── features/                 # Các Module tính năng độc lập
│   │   └── personal-finance/     # Trọn bộ máy tính tài chính cá nhân & engines
│   ├── lib/                      # Thư viện dùng chung & Business Logic
│   │   ├── ai/                   # Tích hợp LLM (Gemini, OpenRouter, Groq)
│   │   ├── engines/              # Các Engine tính toán tài chính & chỉ báo
│   │   │   ├── chart-patterns.ts # Nhận diện mô hình biểu đồ (VCP, Cup & Handle,...)
│   │   │   ├── oscillators.ts    # ADX, TTM Squeeze, SuperTrend, Keltner, RSI
│   │   │   ├── trade-signal.ts   # Tạo tín hiệu giao dịch tổng hợp
│   │   │   ├── canslim.ts        # Thuật toán lọc CANSLIM
│   │   │   └── valuation.ts      # Mô hình định giá tài chính (DCF, Graham,...)
│   │   ├── providers/            # Data Feed Connectors (SSI, VNDIRECT, Binance,...)
│   │   ├── services/             # Application Services (Snapshot, Discord notify,...)
│   │   └── types.ts              # TypeScript Type Definitions
│   └── middleware.ts             # Next.js Proxy/Middleware (Auth & Host verification)
├── public/                       # Static Assets & Icons
├── .env.example                  # Biến môi trường mẫu
└── package.json                  # Dependencies & Scripts
```

---

## Hệ thống Dữ liệu & Nhà cung cấp

Orca-Lite hỗ trợ kết nối linh hoạt tới nhiều nguồn cấp dữ liệu khác nhau:

| Nhà cung cấp | Loại dữ liệu cung cấp | Chế độ mặc định |
| :--- | :--- | :--- |
| **SSI (iBoard / FCData)** | Giá Real-time, Sổ lệnh, Thống kê khớp lệnh | Tích hợp sẵn / Cần API Key nếu dùng dữ liệu chuyên sâu |
| **VNDIRECT** | Báo cáo tài chính, Chỉ số cơ bản, Sự kiện doanh nghiệp | Public Feed / Tự động |
| **Vietcap / VPS / CafeF** | Tin tức, Khuyến nghị, Dữ liệu ngành | Public Scraping / RSS |
| **Binance** | Giá Spot / Futures Crypto, Orderbook micro-structure | Public REST API |
| **CoinGecko** | Danh sách coin, Vốn hóa, Biến động giá toàn cầu | Public API / Pro API |
| **World Bank / Vietnambiz**| Chỉ số kinh tế vĩ mô (Lãi suất, GDP, CPI) | Public Feed |
| **Google Sheets** | Đồng bộ danh mục và ghi chép giao dịch cá nhân | Service Account / API Key |

---

## Bảo mật & Khả năng Chống chịu (Resilience)

1. **Phòng thủ SSRF (Server-Side Request Forgery) tại Webhooks:**
   - Kiểm tra định dạng URL nguồn tin cậy (Discord, Slack).
   - Tự động phân giải DNS động (`dns/promises`) trước khi gửi request để chặn triệt để kỹ thuật **DNS Rebinding**.
   - Chặn toàn bộ IP riêng tư (RFC 1918), IP Loopback (`127.0.0.1`, `::1`), Link-Local (`169.254.0.0/16`) và Cloud Metadata Endpoint.
2. **Xác thực Host Header tại Middleware:**
   - Loại bỏ nguy cơ **Host Header Poisoning** bằng cơ chế whitelist chỉ chấp nhận hostname hợp lệ của hệ thống.
3. **Cơ chế Graceful Fallback:**
   - Mọi API gọi ra bên ngoài đều được bọc bởi wrapper `safeApi` kèm theo timeout và giới hạn ngân sách thời gian xử lý (`WORKERS_BUDGET`).
   - Nếu bất kỳ nhà cung cấp dữ liệu nào gặp sự cố hoặc timeout, hệ thống tự động suy thoái sang cache hoặc dữ liệu mô phỏng chuẩn mực mà không làm gián đoạn trải nghiệm người dùng.

---

## Hướng dẫn Cài đặt & Khởi chạy (Quick Start)

### Yêu cầu hệ thống
- **Node.js**: Phiên bản `>= 20.9.0` (Khuyên dùng Node 20 LTS hoặc 22).
- **npm** hoặc **pnpm**.

### 1. Clone repository
```bash
git clone https://github.com/Pepper369/Orca-Lite.git
cd Orca-Lite
```

### 2. Cài đặt các gói phụ thuộc
```bash
npm install
```

### 3. Cấu hình biến môi trường
Tạo file `.env` từ file mẫu:
```bash
cp .env.example .env
```
Mở `.env` và thêm ít nhất `GEMINI_API_KEY` (hoàn toàn miễn phí tại [Google AI Studio](https://aistudio.google.com/)).

### 4. Khởi chạy môi trường phát triển (Dev)
```bash
npm run dev
```
Mở trình duyệt tại: **[http://localhost:3000](http://localhost:3000)**

---

## Cấu hình Biến môi trường (.env)

Tất cả các biến đều có cơ chế fallback tự động. Bạn chỉ cần cấu hình những dịch vụ mình có nhu cầu:

```env
# --- AI Engine (Khuyên dùng Google AI Studio) ---
GEMINI_API_KEY=AIzaSy...              # Khóa API Gemini 2.0 Flash / Pro
OPENROUTER_API_KEY=                   # (Tùy chọn) Khóa OpenRouter
GROQ_API_KEY=                         # (Tùy chọn) Khóa Groq Llama 3

# --- Cơ sở dữ liệu & Cache (Tùy chọn, tự động dùng In-Memory nếu để trống) ---
DATABASE_URL=postgresql://...         # Chuỗi kết nối PostgreSQL (Neon, Supabase,...)
REDIS_URL=rediss://...                # (Tùy chọn) Upstash hoặc TCP Redis

# --- Dữ liệu Thị trường Chuyên sâu (Tùy chọn) ---
SSI_CONSUMER_ID=                      # SSI FastConnect Data ID
SSI_CONSUMER_SECRET=                  # SSI FastConnect Secret
VNSTOCK_API_KEY=                      # (Tùy chọn) Khóa VnStock
POLYGON_API_KEY=                      # (Tùy chọn) Khóa Polygon FX/Commodities
COINGECKO_PRO_API_KEY=                # (Tùy chọn) Khóa CoinGecko Pro

# --- Hệ thống & Bảo mật ---
JWT_SECRET=your-super-secret-key-32-chars   # Khóa ký Session JWT
CRON_SECRET=your-cron-secret-key            # Khóa bảo vệ các tác vụ nền Cron
```

---

## Build & Triển khai Production

Dự án được cấu hình `output: "standalone"` trong `next.config.ts`, tạo ra artifact tối ưu cho Docker, Google Cloud Run, Vercel hoặc VPS.

```bash
# 1. Kiểm tra Type-Safety
npm run typecheck

# 2. Biên dịch Production Build
npm run build

# 3. Khởi chạy ứng dụng Production
npm run start
```

---

## Giấy phép

Dự án được phân phối dưới giấy phép **[MIT License](LICENSE)**. Toàn quyền sử dụng, chỉnh sửa và triển khai cho mục đích học tập hoặc thương mại.

<p align="center">
  Phát triển với sự đồng hành của <strong>Orca Financial Team</strong>
</p>
