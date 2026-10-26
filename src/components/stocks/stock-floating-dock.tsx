"use client";

import { useEffect, useState, memo } from "react";
import {
  ArrowUp,
  BarChart3,
  BookOpen,
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
  Sparkles,
} from "lucide-react";
import { Chg, fmtNum } from "@/components/ui";
import { QuickPaperTradeButton } from "@/components/portfolio/quick-paper-trade-modal";
import { AddToWatchlist } from "@/components/watchlist-button";

interface StockFloatingDockProps {
  symbol: string;
  price?: number | null;
  changePercent?: number | null;
  ceilingPrice?: number | null;
  floorPrice?: number | null;
}

const SECTIONS = [
  { id: "sec-chart", label: "Biểu đồ", icon: BarChart3 },
  { id: "sec-orderbook", label: "Sổ lệnh", icon: BookOpen },
  { id: "sec-quant", label: "OQuant", icon: BrainCircuit },
  { id: "sec-audit", label: "AI Audit", icon: Bot },
  { id: "sec-deep", label: "Báo cáo", icon: FileSpreadsheet },
];

export const StockFloatingDock = memo(function StockFloatingDock({
  symbol,
  price,
  changePercent,
  ceilingPrice,
  floorPrice,
}: StockFloatingDockProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Hiển thị dock khi người dùng cuộn qua 250px
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      setIsVisible(scrollY > 250);

      // Nhận diện section đang đọc
      for (let i = SECTIONS.length - 1; i >= 0; i--) {
        const sec = document.getElementById(SECTIONS[i].id);
        if (sec) {
          const rect = sec.getBoundingClientRect();
          if (rect.top <= 200) {
            setActiveSection(SECTIONS[i].id);
            return;
          }
        }
      }
      setActiveSection(null);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (!isVisible) return null;

  // Trạng thái thu gọn nhỏ gọn (Pill)
  if (isMinimized) {
    return (
      <aside aria-label="Bảng điều khiển nhanh cổ phiếu thu gọn" className="fixed bottom-16 md:bottom-5 right-4 z-40 animate-fade-in">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-3 py-2 rounded-full border border-border-default bg-surface-elevated/95 backdrop-blur-md text-text-primary shadow-xl hover:border-accent-primary transition-all text-xs"
          title="Mở rộng thanh điều hướng nhanh"
        >
          <span className="font-bold text-accent-primary">{symbol}</span>
          {price != null && (
            <span className="num font-semibold">{fmtNum(price, 2)}</span>
          )}
          {changePercent != null && <Chg value={changePercent} className="text-[11px]" />}
          <Maximize2 className="h-3.5 w-3.5 text-text-muted hover:text-text-primary ml-1" />
        </button>
      </aside>
    );
  }

  return (
    <aside aria-label="Bảng điều khiển nhanh cổ phiếu" className="fixed bottom-16 md:bottom-5 inset-x-3 md:inset-x-auto md:right-6 z-40 flex justify-center md:justify-end animate-fade-in pointer-events-none">
      <div className="pointer-events-auto flex items-center flex-wrap gap-2 p-1.5 rounded-2xl border border-border-default bg-surface-elevated/95 backdrop-blur-md shadow-2xl text-xs max-w-full">
        {/* Tóm tắt mã & giá */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-surface-base border border-border-subtle shrink-0">
          <span className="font-bold text-text-primary">{symbol}</span>
          {price != null && (
            <span className="num font-semibold text-text-primary">
              {fmtNum(price, 2)}
            </span>
          )}
          {changePercent != null && <Chg value={changePercent} className="text-[11px]" />}
        </div>

        {/* Mục lục điều hướng trang */}
        <div className="hidden sm:flex items-center gap-1 border-x border-border-subtle px-2">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => scrollToSection(sec.id)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg transition-all ${
                  isActive
                    ? "bg-accent-primary/15 text-accent-primary font-bold shadow-sm"
                    : "text-text-muted hover:text-text-primary hover:bg-surface-base"
                }`}
              >
                <Icon className="h-3 w-3" />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Nút hành động Đặt lệnh ảo 500M & Watchlist */}
        <div className="flex items-center gap-1.5 shrink-0">
          <QuickPaperTradeButton
            symbol={symbol}
            currentPrice={price}
            ceilingPrice={ceilingPrice}
            floorPrice={floorPrice}
          />
          <AddToWatchlist assetType="stock" symbol={symbol} />
        </div>

        {/* Tiện ích Lên đầu trang & Thu nhỏ */}
        <div className="flex items-center gap-1 border-l border-border-subtle pl-1.5 shrink-0">
          <button
            type="button"
            onClick={scrollToTop}
            title="Cuộn lên đầu trang"
            className="p-1.5 rounded-lg bg-surface-base hover:bg-surface-elevated border border-border-subtle text-text-muted hover:text-text-primary transition-all"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            title="Thu nhỏ thanh công cụ"
            className="p-1.5 rounded-lg bg-surface-base hover:bg-surface-elevated border border-border-subtle text-text-muted hover:text-text-primary transition-all"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
});
