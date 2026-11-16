import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "@/app/api/v1/screener/synthesize/route";

test("Screener AI Synthesis - Rejects empty stocks payload", async () => {
  const req = new Request("http://localhost:3000/api/v1/screener/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stocks: [] }),
  });

  const res = await POST(req);
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.ok(json.error);
});

test("Screener AI Synthesis - Generates comprehensive quantitative trade plan", async () => {
  const dummyStocks = [
    {
      symbol: "MBB",
      name: "Ngân hàng Quân Đội",
      sector: "Ngân hàng",
      price: 25400,
      changePercent: 2.1,
      volume: 18500000,
      rsRating: 88,
      compositeScore: 92,
      buyPoint: 25200,
      buyPointDiffPct: 0.8,
      buyZoneStatus: "SWEET_SPOT",
      vsaSignal: "Absorption Volume Spike",
      setupGrade: "A+",
      tripleBarrierLower: 23800,
      tripleBarrierUpper: 28500,
    },
    {
      symbol: "TCB",
      name: "Ngân hàng Kỹ Thương",
      sector: "Ngân hàng",
      price: 36200,
      changePercent: 1.8,
      volume: 12000000,
      rsRating: 85,
      compositeScore: 89,
      buyPoint: 35800,
      buyPointDiffPct: 1.1,
      buyZoneStatus: "SWEET_SPOT",
      vsaSignal: "VSA No Supply Test",
      setupGrade: "A",
      tripleBarrierLower: 34000,
      tripleBarrierUpper: 41000,
    },
    {
      symbol: "HPG",
      name: "Tập đoàn Hòa Phát",
      sector: "Thép & Vật liệu",
      price: 28900,
      changePercent: 1.2,
      volume: 24000000,
      rsRating: 82,
      compositeScore: 86,
      buyPoint: 28500,
      buyPointDiffPct: 1.4,
      buyZoneStatus: "SWEET_SPOT",
      vsaSignal: "Pocket Pivot",
      setupGrade: "A",
      tripleBarrierLower: 27100,
      tripleBarrierUpper: 32500,
    },
  ];

  const req = new Request("http://localhost:3000/api/v1/screener/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      preset: "apex_buy_now",
      totalMatched: 3,
      stocks: dummyStocks,
    }),
  });

  const res = await POST(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.ok(json.data);
  assert.equal(json.data.stockCount, 3);
  assert.ok(json.data.synthesis);
  assert.ok(json.data.model);

  const text = json.data.synthesis;

  // Check 4 required analytical pillars
  assert.ok(text.includes("TỔNG QUAN TƯƠNG QUAN NGÀNH"));
  assert.ok(text.includes("HỢP LƯU ĐIỂM MUA & VÙNG VÀNG"));
  assert.ok(text.includes("KẾ HOẠCH ĐI VỐN ĐỊNH LƯỢNG & MA TRẬN GIAO DỊCH"));
  assert.ok(text.includes("CẢNH BÁO RỦI RO & BẪY KÉO XẢ T+"));

  // Check trade plan table contains target symbols
  assert.ok(text.includes("MBB"));
  assert.ok(text.includes("TCB"));
  assert.ok(text.includes("HPG"));

  // Check Risk:Reward column exists
  assert.ok(text.includes("Tỷ Lệ R:R") || text.includes("R:R"));
});
