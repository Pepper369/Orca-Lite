import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stockSymbols } from "@/db/schema";
import { ilike, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/chart/tradingview/search?query=SSI&type=&exchange=&limit=30
 * TradingView UDF Symbol Search endpoint
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") || "").trim().toUpperCase();
  const limit = Math.min(Number(searchParams.get("limit") || "30"), 100);

  if (!query) {
    return NextResponse.json([], { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const results: Array<{
      symbol: string;
      full_name: string;
      description: string;
      exchange: string;
      ticker: string;
      type: string;
    }> = [];

    // Quick common crypto matches
    if (query === "BTC" || query.includes("BTC") || query === "ETH" || query.includes("ETH") || query.includes("USDT")) {
      results.push({
        symbol: `${query.includes("USDT") ? query : query + "USDT"}`,
        full_name: `BINANCE:${query.includes("USDT") ? query : query + "USDT"}`,
        description: `${query} Crypto Spot / Futures`,
        exchange: "BINANCE",
        ticker: `${query.includes("USDT") ? query : query + "USDT"}`,
        type: "crypto",
      });
    }

    // Search PostgreSQL stock universe if available
    try {
      const dbRows = await db
        .select()
        .from(stockSymbols)
        .where(
          or(
            ilike(stockSymbols.symbol, `%${query}%`),
            ilike(stockSymbols.name, `%${query}%`)
          )
        )
        .limit(limit);

      for (const row of dbRows) {
        results.push({
          symbol: row.symbol,
          full_name: `${row.exchange || "HOSE"}:${row.symbol}`,
          description: row.name || row.symbol,
          exchange: row.exchange || "HOSE",
          ticker: row.symbol,
          type: "stock",
        });
      }
    } catch {
      // Fallback if db table not seeded: return the queried symbol as HOSE stock
      results.push({
        symbol: query,
        full_name: `HOSE:${query}`,
        description: `Cổ phiếu ${query}`,
        exchange: "HOSE",
        ticker: query,
        type: "stock",
      });
    }

    return NextResponse.json(results.slice(0, limit), {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[TradingView UDF Search]", err);
    return NextResponse.json([], { headers: { "Access-Control-Allow-Origin": "*" } });
  }
}

