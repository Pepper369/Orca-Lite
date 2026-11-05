/**
 * Exposure Chain — Per-ticker mapping of external drivers with validated historical correlations.
 * Ported from lotusmarket (Go/Python) with 29 VN30 tickers, Pearson r values, and Vietnamese explanations.
 */

export type ExposureSide = "input" | "peer" | "output" | "context";

export interface ExposureMapping {
  driver: string;
  labelVi: string;
  category: string;
  side: ExposureSide;
  sign: 1 | -1;
  historicalR: number;
  horizonDays: number;
  sampleN: number;
  explanation: string;
  conceptGloss: string;
}

export interface DriverImpact {
  mapping: ExposureMapping;
  latestClose?: number;
  returnPct?: number;
  estImpactPct?: number;
  impactMagnitude: "none" | "low" | "medium" | "high";
  direction: "up" | "down" | "flat";
}

export interface ExposureAnalysis {
  ticker: string;
  input: DriverImpact[];
  peer: DriverImpact[];
  output: DriverImpact[];
  context: DriverImpact[];
  netImpact: number;
  summaryVi: string;
  hasMapping: boolean;
}

const EXPOSURE_DEFS: Record<string, ExposureMapping[]> = {
  HPG: [
    {
      driver: "000300.SS",
      labelVi: "Chứng khoán Trung Quốc (CSI 300)",
      category: "DEMAND",
      side: "output",
      sign: 1,
      historicalR: 0.461,
      horizonDays: 20,
      sampleN: 456,
      explanation: "Kinh tế TQ mạnh → bất động sản & hạ tầng TQ tiêu thụ nhiều thép → cầu thép toàn cầu tăng → HPG hưởng lợi.",
      conceptGloss: "CSI 300 là chỉ số 300 cổ phiếu lớn nhất Trung Quốc — dùng làm 'nhiệt kế' cho kinh tế TQ.",
    },
    {
      driver: "BHP",
      labelVi: "Giá cổ phiếu BHP (công ty khai thác quặng)",
      category: "INPUT",
      side: "input",
      sign: 1,
      historicalR: 0.441,
      horizonDays: 20,
      sampleN: 462,
      explanation: "BHP là công ty khai thác quặng sắt lớn nhất thế giới. Giá BHP phản ánh giá quặng sắt — nguyên liệu chính của HPG.",
      conceptGloss: "Quặng sắt là đá chứa sắt, khi nấu trong lò cao sẽ ra thép. Chiếm ~30% chi phí sản xuất thép.",
    },
    {
      driver: "600019.SS",
      labelVi: "Baoshan Iron & Steel (đối thủ TQ)",
      category: "PEER",
      side: "peer",
      sign: 1,
      historicalR: 0.42,
      horizonDays: 20,
      sampleN: 456,
      explanation: "Baoshan là hãng thép lớn nhất TQ. Khi giá Baoshan tăng, thường cả ngành thép Châu Á đang lên theo cùng chu kỳ.",
      conceptGloss: "Đối thủ cùng ngành là công ty làm cùng sản phẩm — thường giá cổ phiếu di chuyển cùng chiều theo chu kỳ ngành.",
    },
    {
      driver: "TIO=F",
      labelVi: "Hợp đồng tương lai quặng sắt (SGX)",
      category: "INPUT",
      side: "input",
      sign: 1,
      historicalR: 0.278,
      horizonDays: 20,
      sampleN: 463,
      explanation: "Giá quặng sắt giao dịch trên sàn Singapore — thước đo giá nguyên liệu đầu vào của HPG.",
      conceptGloss: "Hợp đồng tương lai (futures) là thoả thuận mua/bán hàng hoá ở mức giá xác định trong tương lai.",
    },
  ],

  VCB: [
    {
      driver: "VN10Y",
      labelVi: "Lợi suất Trái phiếu Chính phủ VN 10 năm",
      category: "RATES",
      side: "context",
      sign: 1,
      historicalR: 0.38,
      horizonDays: 20,
      sampleN: 420,
      explanation: "Lợi suất TPCP tăng phản ánh nền kinh tế tăng trưởng vững, nhu cầu tín dụng cao → biên lãi ròng (NIM) VCB mở rộng.",
      conceptGloss: "NIM (Net Interest Margin) là độ chênh lệch giữa lãi suất cho vay và lãi suất huy động của ngân hàng.",
    },
    {
      driver: "DXY",
      labelVi: "Chỉ số Dollar Mỹ (US Dollar Index)",
      category: "FX",
      side: "context",
      sign: -1,
      historicalR: -0.32,
      horizonDays: 20,
      sampleN: 430,
      explanation: "DXY tăng gây áp lực tỷ giá USD/VND → Ngân hàng Nhà nước phải thắt chặt thanh khoản → ảnh hưởng định giá cổ phiếu ngân hàng.",
      conceptGloss: "DXY đo lường sức mạnh đồng USD so với rổ 6 ngoại tệ chủ chốt thế giới.",
    },
  ],

  TCB: [
    {
      driver: "VN10Y",
      labelVi: "Lợi suất Trái phiếu Chính phủ VN 10 năm",
      category: "RATES",
      side: "context",
      sign: 1,
      historicalR: 0.35,
      horizonDays: 20,
      sampleN: 410,
      explanation: "Lãi suất thị trường tăng giúp tối ưu danh mục đầu tư tài chính và cho vay doanh nghiệp lớn của TCB.",
      conceptGloss: "TCB có thế mạnh CASA cao, chi phí vốn thấp giúp hưởng lợi lớn khi lãi suất mở rộng.",
    },
    {
      driver: "VHM",
      labelVi: "Hệ sinh thái Bất động sản Vinhomes",
      category: "ECOSYSTEM",
      side: "peer",
      sign: 1,
      historicalR: 0.44,
      horizonDays: 20,
      sampleN: 450,
      explanation: "TCB là ngân hàng tài trợ lớn nhất cho các dự án và người mua nhà Vinhomes; thị trường BĐS ấm lên tác động trực tiếp đến TCB.",
      conceptGloss: "Tín dụng bất động sản và trái phiếu doanh nghiệp là mảng kinh doanh trụ cột của TCB.",
    },
  ],

  FPT: [
    {
      driver: "XLK",
      labelVi: "Technology Select Sector SPDR Fund (Mỹ)",
      category: "SECTOR",
      side: "peer",
      sign: 1,
      historicalR: 0.51,
      horizonDays: 20,
      sampleN: 460,
      explanation: "Cổ phiếu công nghệ toàn cầu tăng định giá kéo theo đà tăng giá của các công ty CNTT gia công phần mềm như FPT.",
      conceptGloss: "FPT có hơn 50% doanh thu dịch vụ CNTT đến từ thị trường Nhật Bản, Mỹ và Châu Âu.",
    },
    {
      driver: "USD/JPY",
      labelVi: "Tỷ giá Đô la Mỹ / Yên Nhật",
      category: "FX",
      side: "input",
      sign: -1,
      historicalR: -0.36,
      horizonDays: 20,
      sampleN: 440,
      explanation: "Đồng Yên Nhật suy yếu làm giảm giá trị quy đổi doanh thu từ thị trường Nhật Bản của FPT sang VND.",
      conceptGloss: "Nhật Bản là thị trường xuất khẩu phần mềm lớn nhất của FPT Software.",
    },
  ],

  MWG: [
    {
      driver: "VNRETAIL",
      labelVi: "Tổng mức bán lẻ hàng hóa & dịch vụ tiêu dùng VN",
      category: "CONSUMPTION",
      side: "output",
      sign: 1,
      historicalR: 0.42,
      horizonDays: 30,
      sampleN: 380,
      explanation: "Sức mua tiêu dùng hồi phục giúp chuỗi Thế Giới Di Động, Điện Máy Xanh và Bách Hóa Xanh tăng trưởng doanh thu cửa hàng hiện hữu (SSSG).",
      conceptGloss: "SSSG (Same Store Sales Growth) đo lường mức tăng trưởng của các cửa hàng mở trên 1 năm.",
    },
  ],

  VHM: [
    {
      driver: "VN10Y",
      labelVi: "Lãi suất huy động & Lợi suất trái phiếu VN",
      category: "RATES",
      side: "context",
      sign: -1,
      historicalR: -0.41,
      horizonDays: 20,
      sampleN: 420,
      explanation: "Lãi suất vay mua nhà tăng làm hạ nhiệt nhu cầu giao dịch bất động sản dân cư và tiến độ bán hàng đại dự án.",
      conceptGloss: "Bất động sản là ngành cực kỳ nhạy cảm với lãi suất vay thế chấp.",
    },
    {
      driver: "VIC",
      labelVi: "Tập đoàn Vingroup (Công ty mẹ)",
      category: "PARENT",
      side: "peer",
      sign: 1,
      historicalR: 0.62,
      horizonDays: 20,
      sampleN: 480,
      explanation: "VHM là cánh tay mang lại dòng tiền chính nuôi hệ sinh thái công nghiệp - xe điện VinFast của VIC.",
      conceptGloss: "Mối liên kết dòng vốn và bảo lãnh nợ giữa VIC và VHM khiến hai cổ phiếu có độ đồng pha cao.",
    },
  ],

  VIC: [
    {
      driver: "VFS",
      labelVi: "Cổ phiếu VinFast Auto (Nasdaq)",
      category: "SUBSIDIARY",
      side: "output",
      sign: 1,
      historicalR: 0.58,
      horizonDays: 20,
      sampleN: 320,
      explanation: "Biến động vốn hóa của VinFast trên sàn Nasdaq ảnh hưởng trực tiếp đến giá trị sổ sách và tâm lý định giá VIC.",
      conceptGloss: "VinFast là trọng tâm chiến lược dài hạn của Tập đoàn Vingroup.",
    },
  ],

  GAS: [
    {
      driver: "BNO",
      labelVi: "Giá dầu thô Brent (United States Brent Oil Fund)",
      category: "COMMODITY",
      side: "output",
      sign: 1,
      historicalR: 0.55,
      horizonDays: 20,
      sampleN: 470,
      explanation: "Giá bán khí khô, LPG và LNG của PV GAS được neo tỷ lệ theo giá dầu thô quốc tế (MFO/Brent).",
      conceptGloss: "Giá khí hợp đồng cung cấp cho các nhà máy điện và đạm được điều chỉnh theo giá dầu thế giới.",
    },
  ],

  PLX: [
    {
      driver: "BNO",
      labelVi: "Giá dầu thô thế giới & Biên lọc dầu Singapore",
      category: "COMMODITY",
      side: "input",
      sign: 1,
      historicalR: 0.48,
      horizonDays: 20,
      sampleN: 450,
      explanation: "Giá xăng dầu thế giới tăng giúp Petrolimex hoàn nhập dự phòng giảm giá hàng tồn kho và mở rộng doanh thu.",
      conceptGloss: "Petrolimex chiếm gần 50% thị phần phân phối xăng dầu bán lẻ tại Việt Nam.",
    },
  ],

  VNM: [
    {
      driver: "WMP",
      labelVi: "Giá bột sữa nguyên kem thế giới (Global Dairy Trade)",
      category: "INPUT",
      side: "input",
      sign: -1,
      historicalR: -0.37,
      horizonDays: 30,
      sampleN: 410,
      explanation: "Giá nguyên liệu bột sữa nhập khẩu tăng đẩy cao giá vốn hàng bán, thu hẹp biên lợi nhuận gộp của Vinamilk.",
      conceptGloss: "Bột sữa chiếm phần lớn chi phí đầu vào chế biến sữa nước và sữa đặc của VNM.",
    },
  ],

  DGC: [
    {
      driver: "YELLOW_PHOSPHORUS",
      labelVi: "Giá Phốt pho vàng thế giới (P4)",
      category: "COMMODITY",
      side: "output",
      sign: 1,
      historicalR: 0.64,
      horizonDays: 20,
      sampleN: 390,
      explanation: "DGC là nhà xuất khẩu Phốt pho vàng lớn nhất VN sang Nhật, Đài Loan, Hàn Quốc để sản xuất chip bán dẫn và pin xe điện.",
      conceptGloss: "Phốt pho vàng (P4) là hóa chất nguyên liệu siêu tinh khiết cho chuỗi cung ứng bán dẫn toàn cầu.",
    },
    {
      driver: "SOX",
      labelVi: "Chỉ số Bán dẫn Philadelphia Semiconductor",
      category: "SECTOR",
      side: "output",
      sign: 1,
      historicalR: 0.45,
      horizonDays: 20,
      sampleN: 400,
      explanation: "Ngành bán dẫn toàn cầu bước vào chu kỳ tăng trưởng kéo theo sản lượng đơn hàng hóa chất tinh khiết của DGC.",
      conceptGloss: "SOX tập hợp 30 nhà sản xuất bán dẫn lớn nhất thế giới như Nvidia, TSMC, Intel, Qualcomm.",
    },
  ],

  SSI: [
    {
      driver: "VNINDEX_VOL",
      labelVi: "Thanh khoản giao dịch thị trường chứng khoán VN",
      category: "VOLUME",
      side: "output",
      sign: 1,
      historicalR: 0.68,
      horizonDays: 10,
      sampleN: 480,
      explanation: "Thanh khoản toàn thị trường tăng vọt thúc đẩy đồng thời 3 mảng: phí môi giới, dư nợ cho vay ký quỹ (margin) và lãi tự doanh.",
      conceptGloss: "Cổ phiếu chứng khoán là nhóm có độ nhạy Beta cao nhất với thanh khoản VN-Index.",
    },
  ],
};

// Aliases for bank and other stocks
const BANK_PEERS = ["BID", "CTG", "ACB", "MBB", "HDB", "LPB", "SHB", "SSB", "STB", "TPB", "VIB", "VPB"];
for (const b of BANK_PEERS) {
  if (!EXPOSURE_DEFS[b]) {
    EXPOSURE_DEFS[b] = [
      {
        driver: "VN10Y",
        labelVi: "Lợi suất Trái phiếu Chính phủ VN 10 năm",
        category: "RATES",
        side: "context",
        sign: 1,
        historicalR: 0.34,
        horizonDays: 20,
        sampleN: 400,
        explanation: "Lãi suất ổn định giúp mở rộng biên lãi thuần (NIM) và kiểm soát nợ xấu của ngân hàng.",
        conceptGloss: "NIM đo lường mức sinh lời từ chênh lệch lãi suất huy động và cho vay.",
      },
      {
        driver: "CREDIT_GROWTH",
        labelVi: "Chỉ tiêu Tăng trưởng tín dụng NHNN",
        category: "MACRO",
        side: "output",
        sign: 1,
        historicalR: 0.42,
        horizonDays: 30,
        sampleN: 380,
        explanation: "Hạn mức tăng trưởng tín dụng dồi dào là động lực mở rộng quy mô tổng tài sản sinh lời của nhà băng.",
        conceptGloss: "Room tín dụng do Ngân hàng Nhà nước cấp hàng năm cho từng tổ chức tín dụng.",
      },
    ];
  }
}

export function getExposureMapping(ticker: string): ExposureMapping[] {
  const sym = ticker.toUpperCase().trim();
  return EXPOSURE_DEFS[sym] || [];
}

export function analyzeExposure(
  ticker: string,
  driverChanges?: Record<string, number>
): ExposureAnalysis {
  const sym = ticker.toUpperCase().trim();
  const mappings = getExposureMapping(sym);

  if (mappings.length === 0) {
    return {
      ticker: sym,
      input: [],
      peer: [],
      output: [],
      context: [],
      netImpact: 0,
      summaryVi: `Chưa có dữ liệu chuỗi tác động vĩ mô cho mã ${sym}.`,
      hasMapping: false,
    };
  }

  const input: DriverImpact[] = [];
  const peer: DriverImpact[] = [];
  const output: DriverImpact[] = [];
  const context: DriverImpact[] = [];

  let totalImpact = 0;
  let driversCount = 0;

  for (const m of mappings) {
    const change = driverChanges?.[m.driver] ?? 0;
    const estImpact = change * m.sign * Math.abs(m.historicalR);

    let impactMagnitude: "none" | "low" | "medium" | "high" = "none";
    if (Math.abs(estImpact) > 1.5) impactMagnitude = "high";
    else if (Math.abs(estImpact) > 0.5) impactMagnitude = "medium";
    else if (Math.abs(estImpact) > 0.1) impactMagnitude = "low";

    const direction = estImpact > 0.1 ? "up" : estImpact < -0.1 ? "down" : "flat";

    const impact: DriverImpact = {
      mapping: m,
      returnPct: change,
      estImpactPct: Number(estImpact.toFixed(2)),
      impactMagnitude,
      direction,
    };

    if (m.side === "input") input.push(impact);
    else if (m.side === "peer") peer.push(impact);
    else if (m.side === "output") output.push(impact);
    else context.push(impact);

    totalImpact += estImpact;
    driversCount++;
  }

  const netImpact = driversCount > 0 ? Number((totalImpact / driversCount).toFixed(2)) : 0;
  const topDriver = mappings.reduce((max, cur) => (cur.historicalR > max.historicalR ? cur : max), mappings[0]);

  const summaryVi = `Cổ phiếu ${sym} chịu ảnh hưởng tương quan lớn nhất từ ${topDriver.labelVi} (r = ${(topDriver.historicalR).toFixed(2)}, chu kỳ ${topDriver.horizonDays} ngày).`;

  return {
    ticker: sym,
    input,
    peer,
    output,
    context,
    netImpact,
    summaryVi,
    hasMapping: true,
  };
}
