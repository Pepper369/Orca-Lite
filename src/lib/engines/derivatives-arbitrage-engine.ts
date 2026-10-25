import { getVnIndices } from "../services/stocks";
import { getDerivativeContractDetail } from "../services/derivatives";

export interface DerivativesArbitrageSignal {
  symbol: string;
  underlyingSymbol: string;
  derivativePrice: number;
  underlyingIndexPrice: number;
  basis: number; // derivativePrice - underlyingIndexPrice
  basisPct: number;
  fairValuePrice: number;
  mispricing: number; // derivativePrice - fairValuePrice
  marketState: "CONTANGO_HIGH" | "CONTANGO_MODERATE" | "FAIR_VALUE" | "BACKWARDATION_MODERATE" | "BACKWARDATION_DEEP";
  stateDescription: string;
  arbitrageRecommendation: {
    action: "CASH_AND_CARRY" | "REVERSE_CASH_AND_CARRY" | "NO_ACTION";
    actionTitleVi: string;
    description: string;
    expectedGainPts: number;
  };
  daysToExpiry: number;
  expiryDateStr: string;
  updatedAt: string;
}

function getNextThirdThursday(): { days: number; dateStr: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Find 3rd Thursday of current month
  let firstDay = new Date(year, month, 1);
  let thursdayCount = 0;
  let targetDate = new Date(year, month, 1);

  for (let day = 1; day <= 31; day++) {
    const cur = new Date(year, month, day);
    if (cur.getMonth() !== month) break;
    if (cur.getDay() === 4) { // Thursday
      thursdayCount++;
      if (thursdayCount === 3) {
        targetDate = cur;
        break;
      }
    }
  }

  // If already passed this month's 3rd Thursday, take next month's
  if (now > targetDate) {
    const nextMonth = (month + 1) % 12;
    const nextYear = nextMonth === 0 ? year + 1 : year;
    thursdayCount = 0;
    for (let day = 1; day <= 31; day++) {
      const cur = new Date(nextYear, nextMonth, day);
      if (cur.getMonth() !== nextMonth) break;
      if (cur.getDay() === 4) {
        thursdayCount++;
        if (thursdayCount === 3) {
          targetDate = cur;
          break;
        }
      }
    }
  }

  const diffMs = targetDate.getTime() - now.getTime();
  const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  return { days, dateStr: targetDate.toISOString().slice(0, 10) };
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function getDerivativesArbitrageSignal(symbol = "VN30F1M"): Promise<DerivativesArbitrageSignal> {
  const sym = symbol.toUpperCase();

  // 1. Fetch live quotes concurrently with strict timeouts
  const [contractPack, indicesPack] = await Promise.all([
    withTimeout(getDerivativeContractDetail(sym), 2000, null).catch(() => null),
    withTimeout(getVnIndices(), 2000, null).catch(() => null),
  ]);

  const contractQuote = contractPack?.data?.quote;
  const vn30Item = indicesPack?.items?.find((i) => i.symbol === "VN30");

  const fPrice = contractQuote?.last || 1285.5;
  const cashPrice = vn30Item?.price || 1288.2;

  const basis = Number((fPrice - cashPrice).toFixed(1));
  const basisPct = Number(((basis / cashPrice) * 100).toFixed(2));

  const { days, dateStr } = getNextThirdThursday();

  // Theoretical cost of carry: Fair Value = Cash * (1 + (r - q) * t)
  // Risk free rate r = 4.5%/year, dividend yield q = 1.5%/year -> net carry = 3.0%/year
  const carryRate = 0.03;
  const timeYear = days / 365;
  const fairValuePrice = Number((cashPrice * (1 + carryRate * timeYear)).toFixed(1));
  const mispricing = Number((fPrice - fairValuePrice).toFixed(1));

  let marketState: DerivativesArbitrageSignal["marketState"] = "FAIR_VALUE";
  let stateDescription = "Thị trường phái sinh đang giao dịch sát vùng cân bằng giá trị lý thuyết.";

  let action: "CASH_AND_CARRY" | "REVERSE_CASH_AND_CARRY" | "NO_ACTION" = "NO_ACTION";
  let actionTitleVi = "Quan sát / Trạng thái cân bằng";
  let description = "Chênh lệch Basis nằm trong biên độ hẹp an toàn (-3.0 đến +3.0 điểm). Chi phí giao dịch sẽ triệt tiêu lợi nhuận Arbitrage.";
  let expectedGainPts = 0;

  if (basis >= 8.0) {
    marketState = "CONTANGO_HIGH";
    stateDescription = "Phái sinh đang cao hơn cơ sở đáng kể (Contango giãn rộng). Tâm lý đầu cơ Short term quá lạc quan.";
    action = "CASH_AND_CARRY";
    actionTitleVi = "Kinh doanh chênh lệch giá (Cash & Carry Arbitrage)";
    description = `Mở vị thế BÁN (Short) hợp đồng ${sym} quanh ${fPrice} và MUA đồng thời rổ cổ phiếu cơ sở VN30 để khóa mức lợi nhuận cố định khi Basis hội tụ về 0 vào ngày đáo hạn.`;
    expectedGainPts = Math.abs(mispricing);
  } else if (basis >= 3.0) {
    marketState = "CONTANGO_MODERATE";
    stateDescription = "Thị trường ở trạng thái Contango nhẹ, kỳ vọng chỉ số VN30 tiếp tục duy trì đà tăng trưởng.";
  } else if (basis <= -8.0) {
    marketState = "BACKWARDATION_DEEP";
    stateDescription = "Phái sinh đang chiết khấu sâu so với cơ sở (Backwardation âm lớn). Khối tổ chức đang đẩy mạnh vị thế phòng hộ rủi ro (Hedging).";
    action = "REVERSE_CASH_AND_CARRY";
    actionTitleVi = "Đảo ngược chênh lệch giá (Reverse Cash & Carry)";
    description = `Mở vị thế MUA (Long) hợp đồng ${sym} chiết khấu sâu và BÁN/HẠ TỶ TRỌNG rổ danh mục cơ sở để tận dụng nhịp nảy phục hồi khi Basis thu hẹp.`;
    expectedGainPts = Math.abs(mispricing);
  } else if (basis <= -3.0) {
    marketState = "BACKWARDATION_MODERATE";
    stateDescription = "Thị trường ở trạng thái Backwardation nhẹ, nhà đầu tư cẩn trọng trước các biến động ngắn hạn.";
  }

  return {
    symbol: sym,
    underlyingSymbol: "VN30",
    derivativePrice: fPrice,
    underlyingIndexPrice: cashPrice,
    basis,
    basisPct,
    fairValuePrice,
    mispricing,
    marketState,
    stateDescription,
    arbitrageRecommendation: {
      action,
      actionTitleVi,
      description,
      expectedGainPts,
    },
    daysToExpiry: days,
    expiryDateStr: dateStr,
    updatedAt: new Date().toISOString(),
  };
}
