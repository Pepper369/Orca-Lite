import { Suspense } from "react";
import { StockKeepAliveWorkspace } from "@/components/stocks/stock-keep-alive-workspace";
import { PageSkeleton } from "@/components/page-skeleton";

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

  return (
    <Suspense fallback={<PageSkeleton />}>
      <StockKeepAliveWorkspace symbol={symbol} initialTab="overview" />
    </Suspense>
  );
}
