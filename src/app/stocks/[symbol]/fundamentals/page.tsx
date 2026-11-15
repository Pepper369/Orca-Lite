"use client";

import { useEffect, useState } from "react";
import { StockKeepAliveWorkspace } from "@/components/stocks/stock-keep-alive-workspace";
import { Loading } from "@/components/ui";

export default function StockFundamentalsPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const [symbol, setSymbol] = useState("");

  useEffect(() => {
    params.then((p) => setSymbol(p.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")));
  }, [params]);

  if (!symbol) return <Loading rows={6} label="Đang mở phân tích cơ bản…" />;

  return <StockKeepAliveWorkspace symbol={symbol} initialTab="fundamentals" />;
}
