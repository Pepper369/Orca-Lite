import "server-only";
import { peekHot } from "../hot-snapshot";
import type { MarketIntel } from "./market-intel";
import type { StocksBoard, GlobalMarket, DashboardInitialData } from "@/components/dashboard";
import { BOOTSTRAP_STOCKS_DATA } from "../bootstrap-data";

/**
 * Prewarms Home Dashboard data directly in server memory before HTML stream starts.
 * Reaches 0-hop memory in <1ms without blocking the server thread on external fetches.
 */
export async function prewarmDashboardData(): Promise<DashboardInitialData> {
  const peekBoard = peekHot<StocksBoard>("board");
  const peekIntel = peekHot<MarketIntel>("intel");
  const peekGlobal = peekHot<GlobalMarket>("global");

  return {
    board: peekBoard?.data?.quotes?.length
      ? peekBoard.data
      : (BOOTSTRAP_STOCKS_DATA as StocksBoard),
    intel: peekIntel?.data ?? null,
    global: peekGlobal?.data ?? null,
  };
}
