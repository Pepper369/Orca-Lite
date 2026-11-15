import app from "../server/index.ts";

async function testEndpoints() {
  console.log("=== KIỂM TRA TẤT CẢ ENDPOINTS VÀ DATA PROVIDERS ===");

  const testUrls = [
    "/api/health",
    "/api/v1/stocks",
    "/api/v1/stocks/HPG",
    "/api/v1/stocks/HPG/financials",
    "/api/v1/stocks/HPG/fundamentals",
    "/api/v1/stocks/HPG/valuation",
    "/api/v1/stocks/HPG/profile",
    "/api/v1/stocks/HPG/orderbook",
    "/api/v1/stocks/HPG/t2-risk",
    "/api/v1/stocks/HPG/tech-reco",
    "/api/v1/stocks/HPG/business-goals",
    "/api/v1/stocks/HPG/consensus",
    "/api/v1/stocks/HPG/dividends",
    "/api/v1/stocks/HPG/quant-flow",
    "/api/v1/chart/live-quote?symbol=HPG",
    "/api/v1/stocks/screener",
    "/api/v1/crypto/markets",
    "/api/v1/forex/markets",
    "/api/v1/commodities",
    "/api/v1/news",
  ];

  for (const path of testUrls) {
    const startTime = Date.now();
    try {
      const req = new Request(`http://localhost:8000${path}`);
      const res = await app.fetch(req);
      const elapsed = Date.now() - startTime;
      let text = await res.text();
      let preview = text.slice(0, 120).replace(/\s+/g, " ");
      console.log(`[${res.status}] ${path} (${elapsed}ms) -> ${preview}`);
    } catch (err: any) {
      console.error(`[ERROR] ${path} ->`, err.message);
    }
  }

  process.exit(0);
}

testEndpoints();
