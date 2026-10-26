"use client";

import Link from "next/link";
import { memo } from "react";
import {
  ArrowUp,
  Award,
  Bot,
  BrainCircuit,
  CandlestickChart,
  Compass,
  FileText,
  FlaskConical,
  HelpCircle,
  Layers,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui";

interface StockDetailFooterProps {
  symbol: string;
  name?: string | null;
  floor?: string | null;
}

const VN30_PEERS = ["HPG", "SSI", "VNM", "FPT", "MWG", "TCB", "MBB", "DGC", "VHM", "VIC"];

export const StockDetailFooter = memo(function StockDetailFooter({
  symbol,
  name,
  floor,
}: StockDetailFooterProps) {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="mt-10 pt-8 pb-14 border-t border-border-subtle text-xs text-text-muted space-y-6">
      {/* Rổ cổ phiếu tham khảo cùng VN30 */}
      <div className="rounded-xl border border-border-subtle bg-surface-base p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-accent-primary" />
            <span className="font-bold text-text-primary">Chuyển nhanh sang các mã cổ phiếu nổi bật</span>
          </div>
          <span className="text-[11px] text-text-muted">Nhóm vốn hóa & thanh khoản hàng đầu thị trường</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {VN30_PEERS.map((peer) => {
            const isCurrent = peer === symbol;
            return isCurrent ? (
              <span
                key={peer}
                className="px-2.5 py-1 rounded-lg bg-accent-primary/20 text-accent-primary font-bold border border-accent-primary/40 text-xs"
              >
                {peer} (hiện tại)
              </span>
            ) : (
              <Link
                key={peer}
                href={`/stocks/${peer}`}
                className="px-2.5 py-1 rounded-lg bg-surface-elevated hover:bg-surface-elevated/80 border border-border-subtle text-text-primary hover:text-accent-primary font-semibold transition-all text-xs"
              >
                {peer}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Grid liên kết hệ sinh thái Orca */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-3.5 rounded-xl border border-border-subtle bg-surface-elevated space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-text-primary">
            <Sparkles className="h-4 w-4 text-accent-primary" />
            <span>Đấu trường 500M</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Thực hành đặt lệnh Mua/Bán ảo với vốn cấp 500 triệu, dữ liệu giá khớp lệnh live theo thời gian thực.
          </p>
          <Link
            href="/portfolio"
            className="inline-block text-[11px] text-accent-primary hover:underline font-semibold pt-1"
          >
            Vào đấu trường danh mục →
          </Link>
        </div>

        <div className="p-3.5 rounded-xl border border-border-subtle bg-surface-elevated space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-text-primary">
            <BrainCircuit className="h-4 w-4 text-positive" />
            <span>OQuant & AI Bots</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Chiến lược định lượng tự động, phát hiện dòng tiền Big Boys và bộ lọc đa khung thời gian.
          </p>
          <Link
            href="/quant"
            className="inline-block text-[11px] text-accent-primary hover:underline font-semibold pt-1"
          >
            Khám phá AI Quant →
          </Link>
        </div>

        <div className="p-3.5 rounded-xl border border-border-subtle bg-surface-elevated space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-text-primary">
            <FlaskConical className="h-4 w-4 text-warning" />
            <span>Bộ lọc OQuant Screener</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Lọc cổ phiếu theo tiêu chí CANSLIM, Minervini SEPA, 4M Phil Town, Phân kỳ kỹ thuật và BCTC.
          </p>
          <Link
            href="/screener"
            className="inline-block text-[11px] text-accent-primary hover:underline font-semibold pt-1"
          >
            Mở bộ lọc toàn thị trường →
          </Link>
        </div>

        <div className="p-3.5 rounded-xl border border-border-subtle bg-surface-elevated space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-text-primary">
            <CandlestickChart className="h-4 w-4 text-sky-400" />
            <span>Phái sinh & Arbitrage</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Theo dõi hợp đồng VN30F1M, độ lệch Basis, đường cong kỳ hạn và tín hiệu chênh lệch giá.
          </p>
          <Link
            href="/derivatives"
            className="inline-block text-[11px] text-accent-primary hover:underline font-semibold pt-1"
          >
            Xem bảng phái sinh →
          </Link>
        </div>
      </div>

      {/* Thông tin pháp lý & Nguồn dữ liệu */}
      <div className="pt-4 border-t border-border-subtle/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-positive shrink-0" />
          <span>
            Dữ liệu độ trễ 0s tiếp sóng từ HOSE / HNX / UPCoM qua cổng dữ liệu Vietcap & VPS. Nền tảng phục vụ mục đích nghiên cứu học thuật và mô phỏng giao dịch, không cấu thành lời mời chào mua bán chứng khoán.
          </span>
        </div>
        <button
          type="button"
          onClick={scrollToTop}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface-elevated hover:bg-surface-base text-text-primary font-medium shrink-0 transition-all shadow-sm"
        >
          <span>Lên đầu trang</span>
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </div>
    </footer>
  );
});
