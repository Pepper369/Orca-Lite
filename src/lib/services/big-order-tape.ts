import type { VnTrade } from "./stock-orderbook";

/**
 * ============================================================================
 * TRỤ CỘT 1: BIG ORDER TAPE & WHALE DETECTOR (THEO DÕI LỆNH LỚN CÁ MẬP)
 * ============================================================================
 * Tiêu chí nhận diện lệnh tổ chức / cá mập vi cấu trúc TTCK Việt Nam:
 * - Giá trị giao dịch: >= 1.000.000.000 VND (1 tỷ VND)
 *   HOẶC
 * - Khối lượng giao dịch: >= 100.000 cổ phiếu
 */

export const BIG_ORDER_VALUE_THRESHOLD = 1_000_000_000; // 1 Tỷ VND
export const BIG_ORDER_VOLUME_THRESHOLD = 100_000; // 100.000 cổ phiếu

export interface BigOrderDetection {
  trade: VnTrade;
  valueVnd: number;
  isBigOrder: boolean;
  reason: "value_ge_1b" | "volume_ge_100k" | "both" | "none";
  side: "buy" | "sell" | "unknown";
  formattedValue: string;
}

export interface BigOrderTapeSummary {
  totalTradesCount: number;
  bigTradesCount: number;
  bigBuyVol: number;
  bigSellVol: number;
  bigBuyValVnd: number;
  bigSellValVnd: number;
  netBigValVnd: number; // Tiền ròng cá mập = Mua lớn - Bán lớn
  whaleDominancePct: number; // Tỷ trọng thanh khoản cá mập chiếm trên tổng khớp lệnh
  recentBigTrades: BigOrderDetection[];
}

/** Định dạng số tiền VND gọn gàng: Ví dụ "1.45 tỷ", "850 tr" */
export function formatVndShort(val: number): string {
  if (val >= 1_000_000_000) {
    return `${(val / 1_000_000_000).toFixed(2)} tỷ`;
  }
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1)} tr`;
  }
  return val.toLocaleString("vi-VN") + " đ";
}

/** Kiểm tra và bóc tách một lệnh khớp có phải là lệnh cá mập hay không */
export function analyzeTrade(trade: VnTrade): BigOrderDetection {
  const valueVnd = (trade.price || 0) * (trade.volume || 0);
  const byVal = valueVnd >= BIG_ORDER_VALUE_THRESHOLD;
  const byVol = trade.volume >= BIG_ORDER_VOLUME_THRESHOLD;

  let reason: BigOrderDetection["reason"] = "none";
  if (byVal && byVol) reason = "both";
  else if (byVal) reason = "value_ge_1b";
  else if (byVol) reason = "volume_ge_100k";

  return {
    trade,
    valueVnd,
    isBigOrder: byVal || byVol,
    reason,
    side: trade.side,
    formattedValue: formatVndShort(valueVnd),
  };
}

/** Phân tích toàn bộ danh sách lệnh khớp để xuất thống kê dòng tiền cá mập */
export function analyzeBigOrderTape(trades: VnTrade[]): BigOrderTapeSummary {
  let bigBuyVol = 0;
  let bigSellVol = 0;
  let bigBuyValVnd = 0;
  let bigSellValVnd = 0;
  let totalValVnd = 0;
  const recentBigTrades: BigOrderDetection[] = [];

  for (const tr of trades) {
    const analysis = analyzeTrade(tr);
    const val = analysis.valueVnd;
    totalValVnd += val;

    if (analysis.isBigOrder) {
      recentBigTrades.push(analysis);
      if (tr.side === "buy") {
        bigBuyVol += tr.volume;
        bigBuyValVnd += val;
      } else if (tr.side === "sell") {
        bigSellVol += tr.volume;
        bigSellValVnd += val;
      }
    }
  }

  const netBigValVnd = bigBuyValVnd - bigSellValVnd;
  const totalBigVal = bigBuyValVnd + bigSellValVnd;
  const whaleDominancePct = totalValVnd > 0 ? (totalBigVal / totalValVnd) * 100 : 0;

  return {
    totalTradesCount: trades.length,
    bigTradesCount: recentBigTrades.length,
    bigBuyVol,
    bigSellVol,
    bigBuyValVnd,
    bigSellValVnd,
    netBigValVnd,
    whaleDominancePct: Math.round(whaleDominancePct * 10) / 10,
    recentBigTrades,
  };
}
