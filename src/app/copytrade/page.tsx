import { CopyTradePanel } from "@/components/copy-trade-panel";

export const metadata = {
  title: "Copy Trading & Winrate Confluence Hub — Orca-Lite",
  description: "Hệ thống sao chép vị thế tự động MetaTrader 5 EA & Binance Futures với bộ lọc Winrate cao ≥ 75%",
};

export default function CopyTradePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-1 border-b border-line/60 pb-3">
        <h1 className="text-xl font-black text-ink-1 sm:text-2xl">
          Hệ Thống Copy Trading & Quản Lý Sao Chép Tự Động
        </h1>
        <p className="text-[12.5px] text-ink-3">
          Sao chép tự động MetaTrader 4/5 EA & Binance/Bybit Futures API · Bộ lọc tối ưu Winrate 75% - 85%
        </p>
      </div>

      <CopyTradePanel />
    </div>
  );
}
