import { Suspense } from "react";
import { getVnStockDetail, type VnStockDetail } from "@/lib/services/stocks";
import type { Meta } from "@/lib/types";
import { StockDetailClient } from "./stock-detail-client";
import { PageSkeleton } from "@/components/page-skeleton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }) {
  const resolved = await params;
  const sym = (resolved?.symbol ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return {
    title: sym ? `${sym} - Phân tích kỹ thuật & Tài chính` : "Chi tiết cổ phiếu",
    description: `Phân tích chuyên sâu cổ phiếu ${sym}: biểu đồ kỹ thuật, BCTC, định giá AI, dòng tiền và hợp lưu.`,
  };
}

export default async function StockDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const resolved = await params;
  const symbol = (resolved?.symbol ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  let initialDetail: VnStockDetail | null = null;
  let initialMeta: Meta | null = null;

  if (symbol) {
    try {
      const pack = await Promise.race([
        getVnStockDetail(symbol),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_800)),
      ]);
      if (pack?.detail) {
        initialDetail = pack.detail;
        initialMeta = pack.meta ?? null;
      }
    } catch {
      // Fallback gracefully to client hydration
    }
  }

  return (
    <Suspense fallback={<PageSkeleton />}>
      <StockDetailClient symbol={symbol} initialDetail={initialDetail} initialMeta={initialMeta} />
    </Suspense>
  );
}
