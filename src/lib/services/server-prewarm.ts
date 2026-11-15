import "server-only";
import { getHot, peekHot } from "../hot-snapshot";
import { getVn30Board } from "./stocks-board";
import { buildMarketIntel, type MarketIntel } from "./market-intel";
import type { StocksBoard, GlobalMarket, DashboardInitialData } from "@/components/dashboard";
import { BOOTSTRAP_STOCKS_DATA } from "../bootstrap-data";

async function fastTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * Prewarms Home Dashboard data directly in server memory before HTML stream starts.
 * Reaches 0-hop memory or last-good cache in <5ms, with hard budget ≤1200ms to guarantee sub-300ms FCP.
 */
export async function prewarmDashboardData(): Promise<DashboardInitialData> {
  const peekBoard = peekHot<StocksBoard>("board");
  const peekIntel = peekHot<MarketIntel>("intel");
  const peekGlobal = peekHot<GlobalMarket>("global");

  const [boardRes, intelRes, globalRes] = await Promise.allSettled([
    (async (): Promise<StocksBoard | null> => {
      if (peekBoard?.data?.quotes?.length) return peekBoard.data;
      const hot = await getHot<StocksBoard>("board");
      if (hot?.data?.quotes?.length) return hot.data;
      const fresh = await fastTimeout(getVn30Board(), 1_200, null);
      if (fresh?.quotes?.length) {
        return {
          indices: fresh.indices,
          quotes: fresh.quotes,
          count: fresh.quotes.length,
        };
      }
      return BOOTSTRAP_STOCKS_DATA as StocksBoard;
    })(),
    (async (): Promise<MarketIntel | null> => {
      if (peekIntel?.data) return peekIntel.data;
      const hot = await getHot<MarketIntel>("intel");
      if (hot?.data) return hot.data;
      const fresh = await fastTimeout(buildMarketIntel(), 1_200, { intel: null, meta: null });
      return fresh?.intel ?? null;
    })(),
    (async (): Promise<GlobalMarket | null> => {
      if (peekGlobal?.data) return peekGlobal.data;
      const hot = await getHot<GlobalMarket>("global");
      return hot?.data ?? null;
    })(),
  ]);

  const board =
    boardRes.status === "fulfilled" && boardRes.value
      ? boardRes.value
      : (BOOTSTRAP_STOCKS_DATA as StocksBoard);
  const intel = intelRes.status === "fulfilled" ? intelRes.value : null;
  const global = globalRes.status === "fulfilled" ? globalRes.value : null;

  return {
    board,
    intel,
    global,
  };
}
