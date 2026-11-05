import test from "node:test";
import assert from "node:assert/strict";
import {
  isAtoAtcRushWindow,
  recordSourceResult,
  getDataMeshHealth,
} from "../services/zero-failure-mesh";
import {
  analyzeTrade,
  analyzeBigOrderTape,
  formatVndShort,
} from "../services/big-order-tape";
import type { VnTrade } from "../services/stock-orderbook";

test("Trụ cột 1: Zero-Failure Data Mesh - Khởi tạo đủ 4 nguồn dữ liệu độc lập", () => {
  const health = getDataMeshHealth();
  assert.equal(health.length, 4);
  const ids = health.map((h) => h.id);
  assert.ok(ids.includes("vps"));
  assert.ok(ids.includes("entrade"));
  assert.ok(ids.includes("vndirect"));
  assert.ok(ids.includes("vietcap"));
});

test("Trụ cột 1: Zero-Failure Data Mesh - Ghi nhận kết quả thành công và cập nhật độ trễ", () => {
  recordSourceResult("entrade", 110, true);
  const health = getDataMeshHealth().find((h) => h.id === "entrade");
  assert.ok(health);
  assert.equal(health.isHealthy, true);
  assert.equal(health.lastLatencyMs, 110);
  assert.equal(health.consecutiveFailures, 0);
});

test("Trụ cột 1: Zero-Failure Data Mesh - Kích hoạt circuit breaker khi nguồn gặp lỗi 3 lần liên tiếp", () => {
  recordSourceResult("vietcap", 1500, false);
  recordSourceResult("vietcap", 1500, false);
  recordSourceResult("vietcap", 1500, false);

  const health = getDataMeshHealth().find((h) => h.id === "vietcap");
  assert.ok(health);
  assert.equal(health.isHealthy, false);
  assert.equal(health.consecutiveFailures, 3);
  assert.ok(health.circuitOpenUntil && health.circuitOpenUntil > Date.now());
});

test("Trụ cột 1: Zero-Failure Data Mesh - Logic nhận diện khung giờ cao điểm ATO/ATC", () => {
  // 09:05 Thứ Tư (Giờ ATO) -> true
  const atoDate = new Date("2026-11-04T02:05:00.000Z"); // 02:05 UTC = 09:05 VN
  assert.equal(isAtoAtcRushWindow(atoDate), true);

  // 14:35 Thứ Tư (Giờ ATC) -> true
  const atcDate = new Date("2026-11-04T07:35:00.000Z"); // 07:35 UTC = 14:35 VN
  assert.equal(isAtoAtcRushWindow(atcDate), true);

  // Chủ nhật -> false
  const sunDate = new Date("2026-11-08T02:05:00.000Z");
  assert.equal(isAtoAtcRushWindow(sunDate), false);
});

test("Trụ cột 1: Big Order Tape - Định dạng số tiền VND ngắn gọn chính xác", () => {
  assert.equal(formatVndShort(1_500_000_000), "1.50 tỷ");
  assert.equal(formatVndShort(850_000_000), "850.0 tr");
});

test("Trụ cột 1: Big Order Tape - Nhận diện chính xác lệnh cá mập theo giá trị >= 1 tỷ VND", () => {
  // 50.000 cp giá 25.000 VND = 1.25 tỷ VND
  const trade1: VnTrade = {
    price: 25_000,
    volume: 50_000,
    change: 500,
    changePercent: 2.0,
    side: "buy",
    time: "10:15:30",
    eventTime: Date.now(),
  };
  const res1 = analyzeTrade(trade1);
  assert.equal(res1.isBigOrder, true);
  assert.equal(res1.reason, "value_ge_1b");
  assert.equal(res1.valueVnd, 1_250_000_000);
});

test("Trụ cột 1: Big Order Tape - Nhận diện chính xác lệnh cá mập theo khối lượng >= 100.000 cp", () => {
  // 100.000 cp giá 8.000 VND = 800 triệu VND (< 1 tỷ nhưng >= 100k cp)
  const trade2: VnTrade = {
    price: 8_000,
    volume: 100_000,
    change: -200,
    changePercent: -2.4,
    side: "sell",
    time: "11:10:00",
    eventTime: Date.now(),
  };
  const res2 = analyzeTrade(trade2);
  assert.equal(res2.isBigOrder, true);
  assert.equal(res2.reason, "volume_ge_100k");
});

test("Trụ cột 1: Big Order Tape - Bỏ qua các lệnh nhỏ lẻ bình thường", () => {
  const smallTrade: VnTrade = {
    price: 30_000,
    volume: 2_000, // 60 triệu VND
    change: 0,
    changePercent: 0,
    side: "buy",
    time: "13:45:00",
    eventTime: Date.now(),
  };
  const res = analyzeTrade(smallTrade);
  assert.equal(res.isBigOrder, false);
  assert.equal(res.reason, "none");
});

test("Trụ cột 1: Big Order Tape - Bảng tổng hợp dòng tiền cá mập chuẩn xác", () => {
  const sampleTrades: VnTrade[] = [
    // Mua lớn 1: 50k cp x 30.000 = 1.5 tỷ
    {
      price: 30_000,
      volume: 50_000,
      change: 500,
      changePercent: 1.5,
      side: "buy",
      time: "09:30:00",
      eventTime: Date.now(),
    },
    // Bán lớn 1: 120k cp x 10.000 = 1.2 tỷ
    {
      price: 10_000,
      volume: 120_000,
      change: -100,
      changePercent: -1.0,
      side: "sell",
      time: "10:00:00",
      eventTime: Date.now(),
    },
    // Lệnh nhỏ: 1.000 cp x 30.000 = 30 tr
    {
      price: 30_000,
      volume: 1_000,
      change: 0,
      changePercent: 0,
      side: "buy",
      time: "10:05:00",
      eventTime: Date.now(),
    },
  ];

  const summary = analyzeBigOrderTape(sampleTrades);
  assert.equal(summary.totalTradesCount, 3);
  assert.equal(summary.bigTradesCount, 2);
  assert.equal(summary.bigBuyValVnd, 1_500_000_000);
  assert.equal(summary.bigSellValVnd, 1_200_000_000);
  assert.equal(summary.netBigValVnd, 300_000_000); // 1.5 tỷ - 1.2 tỷ = +300 tr
  assert.ok(summary.whaleDominancePct > 95);
});
