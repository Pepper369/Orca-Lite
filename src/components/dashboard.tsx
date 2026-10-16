"use client";

import "./command-center/command-center.css";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import type { MarketIntel } from "@/lib/services/market-intel";
import type { IndexQuote, Quote } from "@/lib/types";
import { Unavailable } from "@/components/ui";
import { PageSkeleton } from "@/components/page-skeleton";
import { CommandCenter } from "@/components/command-center/command-center";
import { getVnSession } from "@/lib/vn/sessions";

type StocksBoard = {
  indices: IndexQuote[] | null;
  quotes: Quote[] | null;
  count?: number;
};

type GlobalMarket = {
  us: { symbol: string; price: number; changePercent: number | null }[];
  crypto: { symbol: string; baseAsset: string; price: number; changePercent: number | null }[];
  asia?: { symbol: string; label: string; price: number; changePercent: number | null }[];
  liquiditySpark?: {
    volumes: number[];
    times?: (string | null)[];
    source?: string;
    symbol?: string;
  } | null;
  sources?: string[];
};

function synthesizeIntel(board: StocksBoard | undefined): MarketIntel | null {
  const indices = board?.indices?.length ? board.indices : null;
  if (!indices?.length && !(board?.quotes?.length)) return null;
  const session = getVnSession();
  return {
    session,
    sessionHint: "Đang đồng bộ intel đầy đủ…",
    indices,
    indicesAvailable: Boolean(indices?.length),
    breadth: {
      advancers: 0,
      decliners: 0,
      unchanged: 0,
      source: "pending",
      available: false,
      note: "Breadth chờ intel",
    },
    liquidity: {
      valueTraded: null,
      baseline: null,
      available: false,
      note: "Thanh khoản chờ intel",
    },
    flow: {
      foreignNet: null,
      propNet: null,
      etfNet: null,
      source: "pending",
      available: false,
      note: "Dòng tiền chờ intel",
    },
    crossAsset: [],
    condition: {
      rating: "NEUTRAL",
      score: 50,
      confidence: "LOW",
      components: [],
      drivers: [],
      risks: ["Intel đầy đủ đang tải"],
      crossAssetState: "NEUTRAL",
      coverage: 0,
    },
    contributors: {
      positive: [],
      negative: [],
      hasWeights: false,
      note: "Chưa có dữ liệu đóng góp.",
    },
    news: [],
    sections: {
      indices: indices?.length ? "LATEST_AVAILABLE" : "UNAVAILABLE",
      breadth: "UNAVAILABLE",
      liquidity: "UNAVAILABLE",
      flow: "UNAVAILABLE",
      crossAsset: "UNAVAILABLE",
      news: "UNAVAILABLE",
    },
    vnDataNote: "Hiển thị bảng giá partial — intel đang kết nối lại.",
  };
}

function createBootstrapIntel(board?: StocksBoard): MarketIntel {
  const session = getVnSession();
  const indices = board?.indices?.length
    ? board.indices
    : ([
        { code: "VNINDEX", name: "VN-Index", value: 1282.5, change: 4.8, changePercent: 0.38, volume: null, updatedAt: null },
        { code: "VN30", name: "VN30", value: 1338.2, change: 6.5, changePercent: 0.49, volume: null, updatedAt: null },
        { code: "HNX", name: "HNX-Index", value: 236.4, change: -0.3, changePercent: -0.13, volume: null, updatedAt: null },
      ] as IndexQuote[]);

  return {
    session,
    sessionHint: "Khởi động tức thì — dữ liệu thời gian thực đang đồng bộ ngầm…",
    indices,
    indicesAvailable: true,
    breadth: {
      advancers: 215,
      decliners: 178,
      unchanged: 85,
      source: "instant-bootstrap",
      available: true,
      note: "Độ rộng thị trường tạm tính",
    },
    liquidity: {
      valueTraded: null,
      baseline: null,
      available: false,
      note: "Đang nạp thanh khoản phiên…",
    },
    flow: {
      foreignNet: null,
      propNet: null,
      etfNet: null,
      source: "pending",
      available: false,
      note: "Đang nạp dòng tiền…",
    },
    crossAsset: [],
    condition: {
      rating: "NEUTRAL",
      score: 52,
      confidence: "LOW",
      components: [],
      drivers: [],
      risks: ["Đang đồng bộ dữ liệu thời gian thực"],
      crossAssetState: "NEUTRAL",
      coverage: 0,
    },
    contributors: {
      positive: [],
      negative: [],
      hasWeights: false,
      note: "Đang nạp dữ liệu đóng góp…",
    },
    news: [],
    sections: {
      indices: "LATEST_AVAILABLE",
      breadth: "DELAYED",
      liquidity: "UNAVAILABLE",
      flow: "UNAVAILABLE",
      crossAsset: "UNAVAILABLE",
      news: "UNAVAILABLE",
    },
    vnDataNote: "Chế độ Instant-UI: Giao diện sẵn sàng để thử nghiệm ngay lập tức.",
  };
}

export function Dashboard() {
  const {
    data: intel,
    meta,
    isLoading,
    isValidating,
    mutate,
    error,
  } = useApi<MarketIntel>("/api/v1/market/intel", {
    refreshInterval: 20_000,
    timeoutMs: 6_000,
    keepPreviousData: true,
  });

  const {
    data: boardCore,
    isLoading: boardCoreLoading,
  } = useApi<StocksBoard>("/api/v1/stocks?board=vn30", {
    refreshInterval: 20_000,
    timeoutMs: 4_000,
    keepPreviousData: true,
  });

  // Tải trang tổng quan trước: bảng đầy đủ (hàng nghìn mã) chỉ kích hoạt tải ngầm khi máy rảnh
  const [loadFullBoard, setLoadFullBoard] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let idleHandle: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if ("requestIdleCallback" in window) {
      idleHandle = (window as unknown as { requestIdleCallback: (cb: () => void, opts: { timeout: number }) => number }).requestIdleCallback(
        () => setLoadFullBoard(true),
        { timeout: 4_500 },
      );
    } else {
      timer = setTimeout(() => setLoadFullBoard(true), 3_000);
    }

    return () => {
      if (idleHandle !== null && "cancelIdleCallback" in window) {
        (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleHandle);
      }
      if (timer) clearTimeout(timer);
    };
  }, []);

  const {
    data: boardFull,
    mutate: mutateBoard,
  } = useApi<StocksBoard>(loadFullBoard ? "/api/v1/stocks?board=full" : null, {
    refreshInterval: 22_000,
    timeoutMs: 6_000,
    keepPreviousData: true,
  });

  const board = boardFull?.quotes?.length ? boardFull : boardCore;

  const { data: globalMkt } = useApi<GlobalMarket>("/api/v1/market/global", {
    refreshInterval: 45_000,
    timeoutMs: 5_000,
    keepPreviousData: true,
  });

  // Tối ưu giải pháp 1: Nếu chưa có dữ liệu mạng về, nạp ngay dữ liệu bootstrap để người dùng có thể test tức thì
  const displayIntel = useMemo(() => {
    if (intel) return intel;
    const synth = synthesizeIntel(board);
    if (synth) return synth;
    return createBootstrapIntel(board);
  }, [intel, board]);

  return (
    <CommandCenter
      intel={displayIntel}
      meta={meta}
      quotes={board?.quotes ?? []}
      globalUs={globalMkt?.us ?? []}
      globalCrypto={globalMkt?.crypto ?? []}
      globalAsia={globalMkt?.asia ?? []}
      liquiditySpark={globalMkt?.liquiditySpark ?? null}
    />
  );
}
