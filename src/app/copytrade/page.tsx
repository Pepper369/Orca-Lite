import { CopyTradePanel } from "@/components/copy-trade-panel";

export const metadata = {
  title: "Auto-Trade & Kết Nối API Sàn (Binance, OKX, Exness, XM) — Orca-Financial",
  description:
    "Gắn API Key Binance Futures, OKX Swap v5 và kết nối Forex Exness / XM (MetaApi Cloud hoặc MT5 EA) để hệ thống định lượng Orca tự động khớp lệnh với 5 lớp bảo vệ vốn.",
};

export default function CopyTradePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-2 sm:p-4 md:p-5">
      <div className="flex flex-col gap-1 border-b border-line/60 pb-3">
        <h1 className="text-lg font-black text-ink-1 sm:text-2xl">
          Trung Tâm Auto-Trade &amp; Kết Nối API Sàn (Binance · OKX · Exness · XM)
        </h1>
        <p className="text-[12px] sm:text-[12.5px] text-ink-3">
          Gắn API Key Crypto (Binance Futures, OKX v5) và Forex (Exness, XM qua MetaApi Cloud hoặc MT5 EA) · Mã hóa AES-256-GCM · Tự động vào lệnh chuẩn A+/A với Kill-Switch &amp; Daily Loss Guardrail.
        </p>
      </div>

      <CopyTradePanel />
    </div>
  );
}
