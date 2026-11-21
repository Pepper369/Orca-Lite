import { getEconomyBundle } from "../services/economy";
import { getForexMarkets } from "../services/forex";
import { getWorldBankMacro } from "../services/macro-worldbank";
import { normalizeEconomicText, type EconomicIndicator } from "../economic-data";

export type EconomicCyclePhase =
  | "EARLY_EXPANSION"    // Phục hồi sớm (Lãi suất thấp, thanh khoản dồi dào, lợi nhuận bắt đầu tăng)
  | "LATE_EXPANSION"     // Tăng trưởng mạnh (Lợi nhuận đạt đỉnh, tín dụng tăng nhanh, lạm phát nhen nhóm)
  | "EARLY_CONTRACTION"  // Thắt chặt (Lãi suất tăng, tín dụng kiểm soát, định giá cổ phiếu chịu áp lực)
  | "LATE_CONTRACTION";  // Tạo đáy suy thoái (Kinh tế suy giảm, chính sách nới lỏng trở lại)

export interface MacroIndicator {
  name: string;
  category: "INTEREST_RATE" | "CURRENCY" | "INFLATION" | "GROWTH" | "LIQUIDITY";
  currentValue: number;
  previousValue: number;
  change: number;
  unit: string;
  trend: "RISING" | "FALLING" | "STABLE";
  assessment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  comment: string;
  updatedAt: string;
}

export interface AssetAllocationAdvice {
  assetClass: string;
  weightPct: number;
  stance: "OVERWEIGHT" | "NEUTRAL" | "UNDERWEIGHT";
  rationale: string;
}

export interface MacroRadarSnapshot {
  currentPhase: EconomicCyclePhase;
  phaseNameVi: string;
  phaseDescription: string;
  overallScore: number; // 0 - 100 (điểm sức khỏe môi trường vĩ mô cho TTCK)
  overallVerdict: "VERY_FAVORABLE" | "FAVORABLE" | "NEUTRAL" | "CHALLENGING" | "DEFENSIVE";
  provenance: "LIVE_MACRO_FEED" | "BOOTSTRAP_CACHED";
  indicators: MacroIndicator[];
  allocationMatrix: AssetAllocationAdvice[];
  leadingSectors: string[];
  laggingSectors: string[];
  generatedAt: string;
}

function findEconRow(rows: EconomicIndicator[], patterns: string[]): EconomicIndicator | null {
  for (const r of rows) {
    const norm = normalizeEconomicText(r.name);
    if (patterns.some((p) => norm.includes(p)) && r.current.value != null) {
      return r;
    }
  }
  return null;
}

function inferTrend(change: number, eps = 0.05): "RISING" | "FALLING" | "STABLE" {
  if (change > eps) return "RISING";
  if (change < -eps) return "FALLING";
  return "STABLE";
}

export async function getMacroRadarSnapshot(): Promise<MacroRadarSnapshot> {
  const [economyPack, wbPack, fxPack] = await Promise.all([
    Promise.race([getEconomyBundle().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2_200))]),
    Promise.race([getWorldBankMacro("VN").catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2_200))]),
    Promise.race([getForexMarkets().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 1_800))]),
  ]);

  const rateRows = economyPack?.rate?.data?.rows ?? [];
  const macroRows = economyPack?.macro?.data?.rows ?? [];
  const wbSeries = wbPack?.data?.series ?? [];
  const usdVndFx = fxPack?.data?.rows?.find((r) => r.pair === "USDVND" && r.price > 0) ?? null;

  const isStaleEcon =
    Boolean(economyPack?.rate?.meta?.stale) &&
    Boolean(economyPack?.macro?.meta?.stale) &&
    !usdVndFx;
  const provenance: MacroRadarSnapshot["provenance"] =
    economyPack && !isStaleEcon ? "LIVE_MACRO_FEED" : "BOOTSTRAP_CACHED";

  const indicators: MacroIndicator[] = [];

  // 1) Refinancing Rate (NHNN)
  const refRow = findEconRow(rateRows, ["tai cap von", "dieu hanh"]);
  if (refRow && refRow.current.value != null) {
    const cur = refRow.current.value;
    const prev = refRow.previous.value ?? cur;
    const chg = Number((cur - prev).toFixed(2));
    indicators.push({
      name: refRow.name,
      category: "INTEREST_RATE",
      currentValue: cur,
      previousValue: prev,
      change: chg,
      unit: "%/năm",
      trend: inferTrend(chg, 0.01),
      assessment: cur <= 5.0 && chg <= 0 ? "POSITIVE" : chg > 0.25 || cur >= 6.0 ? "NEGATIVE" : "NEUTRAL",
      comment:
        cur <= 5.0
          ? "Mặt bằng lãi suất điều hành duy trì thấp, hỗ trợ chi phí vốn doanh nghiệp."
          : "Lãi suất điều hành cao tạo áp lực lên định giá và chi phí tài chính.",
      updatedAt: refRow.period,
    });
  }

  // 2) Overnight Interbank Rate
  const onRow = findEconRow(rateRows, ["qua dem", "overnight"]);
  if (onRow && onRow.current.value != null) {
    const cur = onRow.current.value;
    const prev = onRow.previous.value ?? cur;
    const chg = Number((cur - prev).toFixed(2));
    indicators.push({
      name: onRow.name,
      category: "INTEREST_RATE",
      currentValue: cur,
      previousValue: prev,
      change: chg,
      unit: "%/năm",
      trend: inferTrend(chg, 0.05),
      assessment: cur <= 4.5 && chg <= 0.3 ? "POSITIVE" : cur >= 5.5 ? "NEGATIVE" : "NEUTRAL",
      comment:
        chg <= 0
          ? "Thanh khoản hệ thống ngân hàng cải thiện, áp lực lãi suất ngắn hạn hạ nhiệt."
          : "Lãi suất liên ngân hàng nhích tăng phản ánh nhu cầu thanh khoản hoặc điều tiết T-bills.",
      updatedAt: onRow.period,
    });
  }

  // 3) USD/VND Exchange Rate (Live FX or VCB row)
  const fxRow = findEconRow(rateRows, ["vcb", "vietcombank", "trung tam", "usdvnd"]);
  if (usdVndFx || (fxRow && fxRow.current.value != null)) {
    const cur = Math.round(usdVndFx?.price ?? fxRow!.current.value!);
    const prev =
      usdVndFx?.change != null
        ? Math.round(cur - usdVndFx.change)
        : Math.round(fxRow?.previous?.value ?? cur);
    const chg = cur - prev;
    const chgPct = prev > 0 ? (chg / prev) * 100 : 0;
    indicators.push({
      name: usdVndFx ? "Tỷ giá USD/VND (Thị trường Live)" : fxRow!.name,
      category: "CURRENCY",
      currentValue: cur,
      previousValue: prev,
      change: chg,
      unit: "VND",
      trend: inferTrend(chgPct, 0.15),
      assessment: chgPct <= 0.1 ? "POSITIVE" : chgPct >= 0.8 ? "NEGATIVE" : "NEUTRAL",
      comment:
        chgPct <= 0.2
          ? "Áp lực tỷ giá tương đối ổn định, dư địa chính sách tiền tệ được bảo toàn."
          : "Tỷ giá tăng nóng gây áp lực lên khối ngoại và chi phí nhập khẩu.",
      updatedAt: usdVndFx?.updatedAt ? usdVndFx.updatedAt.slice(0, 10) : fxRow?.period ?? new Date().toISOString().slice(0, 10),
    });
  }

  // 4) Credit Growth
  const credRow = findEconRow(rateRows, ["tin dung"]);
  if (credRow && credRow.current.value != null) {
    const cur = credRow.current.value;
    const prev = credRow.previous.value ?? cur;
    const chg = Number((cur - prev).toFixed(2));
    indicators.push({
      name: credRow.name,
      category: "LIQUIDITY",
      currentValue: cur,
      previousValue: prev,
      change: chg,
      unit: "%",
      trend: inferTrend(chg, 0.1),
      assessment: cur >= 10 || chg > 0 ? "POSITIVE" : cur < 6 ? "NEGATIVE" : "NEUTRAL",
      comment: "Tăng trưởng tín dụng phản ánh tốc độ hấp thụ vốn vào sản xuất và tín dụng bán lẻ.",
      updatedAt: credRow.period,
    });
  }

  // 5) Inflation (CPI) from VietnamBiz or WorldBank
  const cpiEcon = findEconRow(macroRows, ["cpi", "lam phat", "gia tieu dung"]);
  const cpiWb = wbSeries.find((s) => s.id === "FP.CPI.TOTL.ZG");
  if (cpiEcon && cpiEcon.current.value != null) {
    const cur = cpiEcon.current.value;
    const prev = cpiEcon.previous.value ?? cur;
    const chg = Number((cur - prev).toFixed(2));
    indicators.push({
      name: cpiEcon.name,
      category: "INFLATION",
      currentValue: cur,
      previousValue: prev,
      change: chg,
      unit: "%",
      trend: inferTrend(chg, 0.05),
      assessment: cur < 4.2 ? "POSITIVE" : cur >= 4.8 ? "NEGATIVE" : "NEUTRAL",
      comment:
        cur < 4.2
          ? "Lạm phát được kiểm soát dưới mục tiêu 4.5%, tạo điều kiện duy trì mặt bằng lãi suất thấp."
          : "Áp lực lạm phát cận ngưỡng mục tiêu, cần theo dõi rủi ro thắt chặt tiền tệ.",
      updatedAt: cpiEcon.period,
    });
  } else if (cpiWb && cpiWb.observations.length > 0) {
    const obs0 = cpiWb.observations[0]!;
    const obs1 = cpiWb.observations[1] ?? obs0;
    const cur = obs0.value ?? 3.5;
    const prev = obs1.value ?? cur;
    const chg = Number((cur - prev).toFixed(2));
    indicators.push({
      name: "Lạm phát CPI thường niên (World Bank)",
      category: "INFLATION",
      currentValue: cur,
      previousValue: prev,
      change: chg,
      unit: "%",
      trend: inferTrend(chg, 0.1),
      assessment: cur < 4.2 ? "POSITIVE" : cur >= 5.0 ? "NEGATIVE" : "NEUTRAL",
      comment: `Chuỗi CPI thường niên công bố tới năm ${obs0.date}.`,
      updatedAt: obs0.date,
    });
  }

  // 6) GDP Growth from VietnamBiz or WorldBank
  const gdpEcon = findEconRow(macroRows, ["gdp", "tang truong kinh te"]);
  const gdpWb = wbSeries.find((s) => s.id === "NY.GDP.MKTP.KD.ZG");
  if (gdpEcon && gdpEcon.current.value != null) {
    const cur = gdpEcon.current.value;
    const prev = gdpEcon.previous.value ?? cur;
    const chg = Number((cur - prev).toFixed(2));
    indicators.push({
      name: gdpEcon.name,
      category: "GROWTH",
      currentValue: cur,
      previousValue: prev,
      change: chg,
      unit: "%",
      trend: inferTrend(chg, 0.1),
      assessment: cur >= 6.0 ? "POSITIVE" : cur < 4.5 ? "NEGATIVE" : "NEUTRAL",
      comment: "Tăng trưởng GDP thực quyết định biên lợi nhuận toàn thị trường niêm yết.",
      updatedAt: gdpEcon.period,
    });
  } else if (gdpWb && gdpWb.observations.length > 0) {
    const obs0 = gdpWb.observations[0]!;
    const obs1 = gdpWb.observations[1] ?? obs0;
    const cur = obs0.value ?? 6.5;
    const prev = obs1.value ?? cur;
    const chg = Number((cur - prev).toFixed(2));
    indicators.push({
      name: "Tăng trưởng GDP thực (World Bank)",
      category: "GROWTH",
      currentValue: cur,
      previousValue: prev,
      change: chg,
      unit: "%",
      trend: inferTrend(chg, 0.2),
      assessment: cur >= 6.0 ? "POSITIVE" : cur < 4.5 ? "NEGATIVE" : "NEUTRAL",
      comment: `Số liệu GDP thực cập nhật năm ${obs0.date}.`,
      updatedAt: obs0.date,
    });
  }

  let positiveCount = 0;
  let neutralCount = 0;
  let negativeCount = 0;
  for (const ind of indicators) {
    if (ind.assessment === "POSITIVE") positiveCount++;
    else if (ind.assessment === "NEUTRAL") neutralCount++;
    else negativeCount++;
  }

  const overallScore =
    indicators.length > 0
      ? Math.round((positiveCount * 100 + neutralCount * 60 + negativeCount * 20) / indicators.length)
      : 50;

  // Dynamic Economic Cycle Classification driven by observed policy rate, inflation & growth
  const rateInd = indicators.find((i) => i.category === "INTEREST_RATE");
  const inflInd = indicators.find((i) => i.category === "INFLATION");
  const growthInd = indicators.find((i) => i.category === "GROWTH" || i.category === "LIQUIDITY");

  const lowRates = rateInd ? rateInd.currentValue <= 5.0 && rateInd.trend !== "RISING" : true;
  const highGrowth = growthInd ? growthInd.currentValue >= 6.0 || growthInd.trend === "RISING" : true;
  const elevatedInfl = inflInd ? inflInd.currentValue >= 4.2 || inflInd.trend === "RISING" : false;

  let currentPhase: EconomicCyclePhase = "EARLY_EXPANSION";
  if (!lowRates && elevatedInfl) {
    currentPhase = "EARLY_CONTRACTION";
  } else if (!lowRates && !highGrowth) {
    currentPhase = "LATE_CONTRACTION";
  } else if (highGrowth && elevatedInfl) {
    currentPhase = "LATE_EXPANSION";
  }

  const phaseMeta: Record<
    EconomicCyclePhase,
    {
      nameVi: string;
      desc: string;
      allocationMatrix: AssetAllocationAdvice[];
      leadingSectors: string[];
      laggingSectors: string[];
    }
  > = {
    EARLY_EXPANSION: {
      nameVi: "Pha Phục hồi sớm & Mở rộng Tăng trưởng (Early Expansion)",
      desc: "Lãi suất thấp, thanh khoản và tăng trưởng tín dụng cải thiện giúp mở rộng biên định giá P/E và lợi nhuận doanh nghiệp chu kỳ.",
      allocationMatrix: [
        {
          assetClass: "Cổ phiếu Tăng trưởng & Chu kỳ (Equities)",
          weightPct: 55,
          stance: "OVERWEIGHT",
          rationale: "Lãi suất thấp kết hợp tín dụng mở rộng tạo đòn bẩy lợi nhuận cho nhóm tài chính, công nghệ và đầu tư công.",
        },
        {
          assetClass: "Cổ phiếu Cổ tức tiền mặt (High Dividend)",
          weightPct: 20,
          stance: "NEUTRAL",
          rationale: "Giữ dòng tiền ổn định cân bằng danh mục.",
        },
        {
          assetClass: "Tiền gửi & Trái phiếu ngắn hạn (Fixed Income)",
          weightPct: 15,
          stance: "UNDERWEIGHT",
          rationale: "Duy trì quỹ đệm thanh khoản tối thiểu khi mặt bằng lãi suất huy động thấp.",
        },
        {
          assetClass: "Vàng & Phòng thủ tỷ giá (Precious Metals)",
          weightPct: 10,
          stance: "NEUTRAL",
          rationale: "Phòng ngừa biến động tỷ giá và địa chính trị.",
        },
      ],
      leadingSectors: ["Chứng khoán & Dịch vụ tài chính", "Ngân hàng", "Công nghệ thông tin", "Thép & Vật liệu xây dựng", "Bán lẻ"],
      laggingSectors: ["Điện phòng thủ", "Nước & Tiện ích lãi cố định"],
    },
    LATE_EXPANSION: {
      nameVi: "Pha Tăng trưởng muộn & Lạm phát nhích tăng (Late Expansion)",
      desc: "Tăng trưởng GDP/tín dụng mạnh nhưng áp lực lạm phát và tỷ giá tăng dần; ưu tiên doanh nghiệp có quyền định giá và hàng hóa cơ bản.",
      allocationMatrix: [
        {
          assetClass: "Cổ phiếu Giá trị & Hàng hóa / Năng lượng",
          weightPct: 45,
          stance: "OVERWEIGHT",
          rationale: "Hưởng lợi trực tiếp từ cầu tiêu dùng thực và khả năng chuyển giá khi lạm phát nhích tăng.",
        },
        {
          assetClass: "Vàng & Phòng thủ tỷ giá (Precious Metals)",
          weightPct: 20,
          stance: "OVERWEIGHT",
          rationale: "Phòng hộ rủi ro mất giá tiền tệ và biến động lãi suất toàn cầu.",
        },
        {
          assetClass: "Cổ phiếu Cổ tức tiền mặt cao",
          weightPct: 20,
          stance: "NEUTRAL",
          rationale: "Giảm beta danh mục khi định giá thị trường chung bước vào vùng cao.",
        },
        {
          assetClass: "Tiền gửi & Trái phiếu ngắn hạn",
          weightPct: 15,
          stance: "NEUTRAL",
          rationale: "Sẵn sàng sức mua khi lãi suất có xu hướng điều chỉnh.",
        },
      ],
      leadingSectors: ["Dầu khí & Năng lượng", "Hóa chất & Phân bón", "Cảng biển & Logistics", "Ngân hàng NIM cao"],
      laggingSectors: ["Bất động sản đòn bẩy cao", "Xây lắp biên mỏng"],
    },
    EARLY_CONTRACTION: {
      nameVi: "Pha Thắt chặt & Phòng thủ Thanh khoản (Early Contraction)",
      desc: "Áp lực lãi suất/tỷ giá gia tăng làm thu hẹp bội số định giá; ưu tiên phòng thủ bảng cân đối sạch nợ và dòng tiền tiền mặt.",
      allocationMatrix: [
        {
          assetClass: "Tiền mặt, Tiền gửi & Trái phiếu ngắn hạn",
          weightPct: 45,
          stance: "OVERWEIGHT",
          rationale: "Bảo toàn vốn trước rủi ro thu hẹp định giá và hưởng lợi từ mặt bằng lãi suất huy động cao hơn.",
        },
        {
          assetClass: "Cổ phiếu Phòng thủ & Cổ tức cao",
          weightPct: 30,
          stance: "NEUTRAL",
          rationale: "Tập trung doanh nghiệp không vay nợ dài hạn (Net Cash) và dòng tiền ổn định.",
        },
        {
          assetClass: "Vàng & Phòng thủ tỷ giá",
          weightPct: 15,
          stance: "NEUTRAL",
          rationale: "Giảm rủi ro hệ thống và biến động USD/VND.",
        },
        {
          assetClass: "Cổ phiếu Đòn bẩy & Tăng trưởng cao",
          weightPct: 10,
          stance: "UNDERWEIGHT",
          rationale: "Hạn chế tiếp xúc với nhóm nhạy cảm lãi suất.",
        },
      ],
      leadingSectors: ["Điện, Nước & Tiện ích", "Công nghệ thiết yếu", "Dược phẩm & Y tế"],
      laggingSectors: ["Bất động sản", "Chứng khoán Beta cao", "Thép"],
    },
    LATE_CONTRACTION: {
      nameVi: "Pha Tạo đáy Chu kỳ & Chờ Nới lỏng (Late Contraction)",
      desc: "Tăng trưởng chậm lại nhưng áp lực lãi suất dần hạ nhiệt; chuẩn bị giải ngân từng phần vào cổ phiếu đầu ngành định giá chiết khấu sâu.",
      allocationMatrix: [
        {
          assetClass: "Tiền gửi & Trái phiếu",
          weightPct: 40,
          stance: "OVERWEIGHT",
          rationale: "Duy trì thanh khoản chủ động để gom cổ phiếu chất lượng ở vùng chiết khấu.",
        },
        {
          assetClass: "Cổ phiếu Chất lượng / Định giá rẻ (Deep Value)",
          weightPct: 35,
          stance: "OVERWEIGHT",
          rationale: "Tích lũy các doanh nghiệp đầu ngành có F-Score >= 7 và tiền mặt ròng cao.",
        },
        {
          assetClass: "Cổ phiếu Cổ tức cao",
          weightPct: 15,
          stance: "NEUTRAL",
          rationale: "Tạo đệm lợi suất cổ tức trong thời gian chờ chu kỳ phục hồi.",
        },
        {
          assetClass: "Vàng & Hàng hóa",
          weightPct: 10,
          stance: "UNDERWEIGHT",
          rationale: "Giảm dần khi kỳ vọng cắt giảm lãi suất dần hiện hữu.",
        },
      ],
      leadingSectors: ["Ngân hàng chất lượng tài sản sạch", "Bán lẻ thiết yếu", "Công nghệ thông tin"],
      laggingSectors: ["Hàng hóa đầu cơ chu kỳ muộn"],
    },
  };

  const chosen = phaseMeta[currentPhase];

  return {
    currentPhase,
    phaseNameVi: chosen.nameVi,
    phaseDescription: chosen.desc,
    overallScore,
    overallVerdict:
      overallScore >= 75
        ? "VERY_FAVORABLE"
        : overallScore >= 60
          ? "FAVORABLE"
          : overallScore >= 45
            ? "NEUTRAL"
            : overallScore >= 30
              ? "CHALLENGING"
              : "DEFENSIVE",
    provenance,
    indicators,
    allocationMatrix: chosen.allocationMatrix,
    leadingSectors: chosen.leadingSectors,
    laggingSectors: chosen.laggingSectors,
    generatedAt: new Date().toISOString(),
  };
}
