/**
 * COMMODITY → STOCK IMPACT & SENTIMENT ENGINE
 *
 * Maps domestic & global commodities to impacted Vietnamese stocks (HOSE, HNX, UPCoM),
 * calculates transmission sentiment (TÍCH CỰC, TIÊU CỰC, PHÂN HÓA), and explains
 * business mechanisms (upstream producers vs downstream consumers).
 */

export type SentimentLabel = "TÍCH CỰC" | "TIÊU CỰC" | "PHÂN HÓA";
export type ImpactTone = "benefit" | "headwind" | "mixed";

export interface StockImpactDetail {
  symbol: string;
  impact: "positive" | "negative" | "neutral";
  role: string;
  reason: string;
}

export interface CommodityStockImpact {
  sector: string;
  stocks: string[];
  mechanism: string;
  sentiment: SentimentLabel;
  sentimentScore: number; // -1.0 (very negative) to +1.0 (very positive)
  impactType: ImpactTone;
  beneficiaryStocks: string[];
  headwindStocks: string[];
  detail: StockImpactDetail[];
}

interface CommodityRule {
  match: RegExp;
  sector: string;
  allStocks: string[];
  mechanism: string;
  // If price increases:
  whenUp: {
    sentiment: SentimentLabel;
    impactType: ImpactTone;
    beneficiaries: string[];
    headwinds: string[];
    detail: StockImpactDetail[];
  };
  // If price decreases:
  whenDown: {
    sentiment: SentimentLabel;
    impactType: ImpactTone;
    beneficiaries: string[];
    headwinds: string[];
    detail: StockImpactDetail[];
  };
  // If price flat or unknown:
  neutral: {
    sentiment: SentimentLabel;
    impactType: ImpactTone;
    beneficiaries: string[];
    headwinds: string[];
    detail: StockImpactDetail[];
  };
}

const COMMODITY_RULES: CommodityRule[] = [
  // 1. Dầu thô & Xăng dầu & Khí đốt
  {
    match: /dầu|wti|brent|crude|xăng|ron95|ron92|diesel|khí|gas|lpg|lng|cng/i,
    sector: "Dầu khí & Năng lượng",
    allStocks: ["GAS", "PVD", "PVS", "BSR", "PLX", "OIL", "PVC", "PVB", "CNG"],
    mechanism:
      "Giá năng lượng điều tiết toàn chuỗi giá trị: Thượng nguồn (PVD, PVS) hưởng lợi từ giá thuê giàn khoan và dự án mới; Trung nguồn (GAS, BSR) mở rộng crack spread lọc dầu & giá bán khí; Hạ nguồn (PLX, OIL) giảm rủi ro trích lập giảm giá tồn kho. Ngược lại, giá nhiên liệu cao làm tăng chi phí vận tải (HAH, VOS) và sản xuất.",
    whenUp: {
      sentiment: "TÍCH CỰC",
      impactType: "benefit",
      beneficiaries: ["PVD", "PVS", "BSR", "GAS", "PLX"],
      headwinds: ["HAH", "VOS"],
      detail: [
        { symbol: "PVD", impact: "positive", role: "Khoan & Thăm dò", reason: "Giá thuê giàn khoan tự nâng tăng, công suất hoạt động tối đa." },
        { symbol: "PVS", impact: "positive", role: "Xây lắp EPCI & Căn cứ", reason: "Khối lượng công việc dự án dầu khí thượng nguồn tăng vọt." },
        { symbol: "BSR", impact: "positive", role: "Lọc hóa dầu", reason: "Biên lọc dầu (crack spread) nới rộng khi giá sản phẩm tăng." },
        { symbol: "GAS", impact: "positive", role: "Vận chuyển & Phân phối khí", reason: "Giá khí thương phẩm neo theo giá dầu FO/Brent quốc tế." },
        { symbol: "PLX", impact: "positive", role: "Phân phối xăng dầu", reason: "Tăng giá bán lẻ, giảm trích lập dự phòng giảm giá hàng tồn kho." },
      ],
    },
    whenDown: {
      sentiment: "TIÊU CỰC",
      impactType: "headwind",
      beneficiaries: ["HAH", "VOS"],
      headwinds: ["PVD", "PVS", "BSR", "GAS"],
      detail: [
        { symbol: "BSR", impact: "negative", role: "Lọc hóa dầu", reason: "Crack spread thu hẹp, áp lực trích lập tồn kho dầu thô mua giá cao." },
        { symbol: "PVD", impact: "negative", role: "Khoan dầu khí", reason: "Nhu cầu thuê giàn chậm lại nếu giá dầu dưới ngưỡng hòa vốn khai thác." },
        { symbol: "HAH", impact: "positive", role: "Vận tải biển", reason: "Hưởng lợi nhờ chi phí nhiên liệu chiếm 30-40% chi phí vận hành giảm." },
      ],
    },
    neutral: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["GAS", "PVS"],
      headwinds: [],
      detail: [
        { symbol: "GAS", impact: "neutral", role: "Phân phối khí", reason: "Sản lượng khí ổn định theo hợp đồng bao tiêu dài hạn." },
        { symbol: "PVS", impact: "neutral", role: "Dịch vụ dầu khí", reason: "Duy trì backlog các dự án điện gió ngoài khơi và dầu khí." },
      ],
    },
  },

  // 2. Thép & Quặng sắt & Kim loại xây dựng
  {
    match: /thép|hrc|quặng sắt|iron ore|rebar|phôi thép|cuộn cán nóng/i,
    sector: "Thép & Vật liệu xây dựng",
    allStocks: ["HPG", "HSG", "NKG", "VGS", "TLH"],
    mechanism:
      "Giá thép thành phẩm & HRC quyết định trực tiếp biên lợi nhuận toàn ngành: HPG hưởng lợi nhất nhờ mô hình lò cao BOF tự chủ thượng nguồn; HSG và NKG phụ thuộc giá đầu vào HRC và giá xuất khẩu tôn mạ sang Mỹ/EU.",
    whenUp: {
      sentiment: "TÍCH CỰC",
      impactType: "benefit",
      beneficiaries: ["HPG", "HSG", "NKG", "VGS"],
      headwinds: [],
      detail: [
        { symbol: "HPG", impact: "positive", role: "Sản xuất tích hợp BOF", reason: "Biên lợi nhuận gộp nới rộng, tiêu thụ thép xây dựng & HRC tăng." },
        { symbol: "HSG", impact: "positive", role: "Tôn mạ & Ống thép", reason: "Giải phóng hàng tồn kho giá thấp, tăng giá bán xuất khẩu." },
        { symbol: "NKG", impact: "positive", role: "Tôn mạ xuất khẩu", reason: "Cải thiện biên lãi xuất khẩu sang thị trường Bắc Mỹ & châu Âu." },
      ],
    },
    whenDown: {
      sentiment: "TIÊU CỰC",
      impactType: "headwind",
      beneficiaries: [],
      headwinds: ["HPG", "HSG", "NKG"],
      detail: [
        { symbol: "HPG", impact: "negative", role: "Sản xuất tích hợp", reason: "Áp lực giảm giá bán đầu ra và cạnh tranh thép giá rẻ nhập khẩu." },
        { symbol: "HSG", impact: "negative", role: "Tôn mạ", reason: "Nguy cơ trích lập dự phòng giảm giá tồn kho HRC nguyên liệu." },
      ],
    },
    neutral: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["HPG"],
      headwinds: [],
      detail: [
        { symbol: "HPG", impact: "neutral", role: "Sản xuất tích hợp", reason: "Thị phần vững chắc nội địa cân bằng biến động giá nguyên liệu." },
      ],
    },
  },

  // 3. Vàng & Bạc & Kim loại quý
  {
    match: /vàng|sjc|gold|xau|bạc|silver|xag|bạch kim|platinum|xpt/i,
    sector: "Trang sức & Kim loại quý",
    allStocks: ["PNJ"],
    mechanism:
      "Giá vàng tăng kích thích nhu cầu tích trữ tài sản an toàn và làm tăng giá trị hàng tồn kho vàng của PNJ; tuy nhiên biên lợi nhuận vàng miếng thấp hơn vàng trang sức bán lẻ thời trang.",
    whenUp: {
      sentiment: "TÍCH CỰC",
      impactType: "benefit",
      beneficiaries: ["PNJ"],
      headwinds: [],
      detail: [
        { symbol: "PNJ", impact: "positive", role: "Bán lẻ trang sức đầu ngành", reason: "Tăng định giá tồn kho vàng và kích cầu giao dịch tài sản quý." },
      ],
    },
    whenDown: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["PNJ"],
      headwinds: [],
      detail: [
        { symbol: "PNJ", impact: "neutral", role: "Bán lẻ trang sức", reason: "Giá vàng ổn định kích thích khách hàng mua sắm trang sức thời trang biên lãi cao." },
      ],
    },
    neutral: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["PNJ"],
      headwinds: [],
      detail: [{ symbol: "PNJ", impact: "neutral", role: "Bán lẻ trang sức", reason: "Tập trung tăng trưởng chuỗi bán lẻ bán hàng." }],
    },
  },

  // 4. Phân bón & Hóa chất (Ure, NPK, DAP, Phốt pho, Xút)
  {
    match: /phân|ure|urea|dap|npk|hóa chất|phốt pho|phosphorus|xút|lưu huỳnh|kali/i,
    sector: "Hóa chất & Phân bón",
    allStocks: ["DPM", "DCM", "BFC", "DGC", "CSV", "LAS", "PAT"],
    mechanism:
      "Giá phân bón Ure/DAP thế giới tăng kéo theo giá bán trong nước, trong khi chi phí nguyên liệu khí (DPM, DCM) hoặc quặng apatit (DGC) có độ trễ lớn, tạo ra mức biên lợi nhuận vượt trội.",
    whenUp: {
      sentiment: "TÍCH CỰC",
      impactType: "benefit",
      beneficiaries: ["DPM", "DCM", "DGC", "CSV", "BFC"],
      headwinds: [],
      detail: [
        { symbol: "DPM", impact: "positive", role: "Sản xuất Ure Phú Mỹ", reason: "Biên lợi nhuận gộp nới rộng đột biến theo giá Ure thế giới." },
        { symbol: "DCM", impact: "positive", role: "Đạm Cà Mau", reason: "Hưởng lợi kép từ giá xuất khẩu Ure và thị trường Tây Nam Bộ." },
        { symbol: "DGC", impact: "positive", role: "Phốt pho vàng (P4)", reason: "Giá P4 tăng theo chu kỳ bùng nổ chip bán dẫn và pin xe điện." },
      ],
    },
    whenDown: {
      sentiment: "TIÊU CỰC",
      impactType: "headwind",
      beneficiaries: [],
      headwinds: ["DPM", "DCM", "DGC"],
      detail: [
        { symbol: "DPM", impact: "negative", role: "Sản xuất Ure", reason: "Giá bán sụt giảm, cạnh tranh nguồn phân bón nhập khẩu giá rẻ." },
        { symbol: "DCM", impact: "negative", role: "Sản xuất Ure", reason: "Biên gộp thu hẹp khi giá bán điều chỉnh giảm nhanh hơn chi phí khí." },
      ],
    },
    neutral: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["DPM", "DCM"],
      headwinds: [],
      detail: [{ symbol: "DPM", impact: "neutral", role: "Phân bón", reason: "Duy trì cổ tức tiền mặt cao và tiền ròng dồi dào." }],
    },
  },

  // 5. Chăn nuôi & Heo hơi & Thịt
  {
    match: /heo|lợn|thịt heo|hogg?|pork|thịt bò|gia súc|thức ăn chăn nuôi/i,
    sector: "Chăn nuôi & Chế biến thịt",
    allStocks: ["DBC", "BAF", "HAG", "MML"],
    mechanism:
      "Giá heo hơi vượt điểm hòa vốn (50.000 - 55.000 đ/kg) tác động trực tiếp lên lợi nhuận các doanh nghiệp mô hình 3F khép kín; nông hộ bỏ đàn giúp doanh nghiệp quy mô lớn gia tăng thị phần.",
    whenUp: {
      sentiment: "TÍCH CỰC",
      impactType: "benefit",
      beneficiaries: ["DBC", "BAF", "HAG", "MML"],
      headwinds: [],
      detail: [
        { symbol: "DBC", impact: "positive", role: "Tập đoàn Dabaco (3F)", reason: "Lợi nhuận mảng heo thương phẩm tăng vọt, biên gộp hồi phục mạnh." },
        { symbol: "BAF", impact: "positive", role: "Nông nghiệp BAF", reason: "Hưởng lợi từ chuỗi chăn nuôi hiện đại và giá heo hơi neo cao." },
        { symbol: "HAG", impact: "positive", role: "Hoàng Anh Gia Lai", reason: "Mảng heo ăn chuối đóng góp dòng tiền trả nợ ngân hàng." },
      ],
    },
    whenDown: {
      sentiment: "TIÊU CỰC",
      impactType: "headwind",
      beneficiaries: [],
      headwinds: ["DBC", "BAF", "HAG"],
      detail: [
        { symbol: "DBC", impact: "negative", role: "Chăn nuôi 3F", reason: "Giá bán dưới điểm hòa vốn trong khi giá thức ăn chăn nuôi neo cao." },
      ],
    },
    neutral: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["DBC", "BAF"],
      headwinds: [],
      detail: [{ symbol: "DBC", impact: "neutral", role: "Chăn nuôi", reason: "Tái đàn an toàn sinh học và duy trì sản lượng." }],
    },
  },

  // 6. Cao su tự nhiên & Nhựa hạt (PVC, PP, PE)
  {
    match: /cao su|rubber|tsr20|rss3|mủ|nhựa|pvc|pp|pe|pet/i,
    sector: "Cao su & Sản phẩm nhựa",
    allStocks: ["GVR", "PHR", "DPR", "DRI", "DRC", "CSM", "BMP", "NTP", "AAA"],
    mechanism:
      "Giá cao su tự nhiên tăng là tin cực tốt cho các công ty trồng & khai thác mủ (GVR, PHR, DPR), nhưng là chi phí đầu vào tăng cho các công ty săm lốp (DRC, CSM). Giá hạt nhựa PVC giảm giúp công ty ống nhựa (BMP, NTP) hưởng biên lợi nhuận kỷ lục.",
    whenUp: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["GVR", "PHR", "DPR", "DRI"],
      headwinds: ["DRC", "CSM", "BMP", "NTP"],
      detail: [
        { symbol: "GVR", impact: "positive", role: "Tập đoàn Cao su VN", reason: "Giá mủ cao su tăng cải thiện trực tiếp doanh thu mảng mủ cốt lõi." },
        { symbol: "PHR", impact: "positive", role: "Cao su Phước Hòa", reason: "Doanh thu xuất khẩu mủ tăng song song chuyển đổi khu công nghiệp." },
        { symbol: "DRC", impact: "negative", role: "Săm lốp Đà Nẵng", reason: "Cao su thiên nhiên chiếm 30% chi phí nguyên liệu đầu vào sản xuất lốp." },
      ],
    },
    whenDown: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["BMP", "NTP", "DRC"],
      headwinds: ["GVR", "PHR", "DPR"],
      detail: [
        { symbol: "BMP", impact: "positive", role: "Nhựa Bình Minh", reason: "Giá hạt nhựa PVC đầu vào giảm giúp biên lợi nhuận gộp vượt 40%." },
        { symbol: "NTP", impact: "positive", role: "Nhựa Tiền Phong", reason: "Hạ giá thành sản xuất, củng cố vị thế dẫn đầu thị phần miền Bắc." },
        { symbol: "GVR", impact: "negative", role: "Tập đoàn Cao su", reason: "Biên lãi khai thác mủ giảm theo chu kỳ hàng hóa thế giới." },
      ],
    },
    neutral: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["GVR", "BMP"],
      headwinds: [],
      detail: [{ symbol: "BMP", impact: "neutral", role: "Nhựa xây dựng", reason: "Duy trì vị thế thống lĩnh thị phần và biên lợi nhuận ổn định." }],
    },
  },

  // 7. Nông sản: Gạo, Lúa, Cà phê, Đường, Tiêu
  {
    match: /gạo|lúa|rice|cà phê|coffee|robusta|arabica|đường|sugar|mía|tiêu|tiêu đen|hạt điều/i,
    sector: "Nông sản & Lương thực",
    allStocks: ["LTG", "TAR", "PAN", "QNS", "SBT", "SLS", "VCF"],
    mechanism:
      "Giá nông sản quốc tế neo cao thúc đẩy kim ngạch xuất khẩu gạo (LTG, TAR, PAN) và cà phê (PAN, VCF). Giá đường tăng bảo hộ các công ty mía đường trong nước (QNS, SBT, SLS) trước đường nhập lậu.",
    whenUp: {
      sentiment: "TÍCH CỰC",
      impactType: "benefit",
      beneficiaries: ["QNS", "SBT", "SLS", "PAN", "LTG"],
      headwinds: [],
      detail: [
        { symbol: "QNS", impact: "positive", role: "Đường & Sữa đậu nành", reason: "Mảng đường hưởng lợi từ giá bán cao và hiệu suất vùng mía Quảng Ngãi." },
        { symbol: "SBT", impact: "positive", role: "TTC AgriS", reason: "Dẫn đầu thị phần đường nội địa, mở rộng xuất khẩu quốc tế." },
        { symbol: "PAN", impact: "positive", role: "Tập đoàn PAN", reason: "Hưởng lợi từ chuỗi giá trị gạo sạch, tôm và cà phê Robusta." },
      ],
    },
    whenDown: {
      sentiment: "TIÊU CỰC",
      impactType: "headwind",
      beneficiaries: [],
      headwinds: ["QNS", "SBT", "LTG"],
      detail: [
        { symbol: "QNS", impact: "negative", role: "Mía đường", reason: "Áp lực điều chỉnh giá bán đường thành phẩm giảm theo thế giới." },
      ],
    },
    neutral: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["QNS"],
      headwinds: [],
      detail: [{ symbol: "QNS", impact: "neutral", role: "Mía đường", reason: "Cân bằng lợi nhuận giữa mảng đường và mảng sữa đậu nành Vinasoy." }],
    },
  },

  // 8. Vật liệu xây dựng: Xi măng, Cát, Đá, Nhựa đường
  {
    match: /xi măng|cement|đá xây dựng|stone|cát|nhựa đường|asphalt|bê tông/i,
    sector: "Vật liệu xây dựng & Đầu tư công",
    allStocks: ["KSB", "VLB", "DHA", "PLC", "HT1", "BCC"],
    mechanism:
      "Giá đá xây dựng và nhựa đường gắn trực tiếp với làn sóng giải ngân đầu tư công các dự án sân bay Long Thành, cao tốc Bắc - Nam và Vành đai 3/4. Doanh nghiệp sở hữu mỏ đá trữ lượng lớn (KSB, VLB, DHA) hưởng lợi biên gộp cao.",
    whenUp: {
      sentiment: "TÍCH CỰC",
      impactType: "benefit",
      beneficiaries: ["KSB", "VLB", "DHA", "PLC"],
      headwinds: ["HT1"],
      detail: [
        { symbol: "KSB", impact: "positive", role: "Khai thác đá xây dựng", reason: "Mỏ đá Tân Mỹ, Thiện Tân hưởng lợi từ nhu cầu đá hạ tầng miền Đông." },
        { symbol: "VLB", impact: "positive", role: "Đá xây dựng Biên Hòa", reason: "Trữ lượng đá lớn gần sân bay Long Thành, biên lợi nhuận gộp cao." },
        { symbol: "PLC", impact: "positive", role: "Hóa dầu Quân đội (Nhựa đường)", reason: "Thống lĩnh thị phần nhựa đường rải thảm cao tốc." },
      ],
    },
    whenDown: {
      sentiment: "TIÊU CỰC",
      impactType: "headwind",
      beneficiaries: [],
      headwinds: ["KSB", "VLB", "PLC"],
      detail: [
        { symbol: "KSB", impact: "negative", role: "Đá xây dựng", reason: "Áp lực cạnh tranh giá bán mỏ đá nếu tiến độ thi công hạ tầng chậm lại." },
      ],
    },
    neutral: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["KSB", "VLB"],
      headwinds: [],
      detail: [{ symbol: "KSB", impact: "neutral", role: "Vật liệu XD", reason: "Cung ứng đều đặn cho các nhà thầu thi công hạ tầng." }],
    },
  },

  // 9. Thủy sản: Cá tra, Tôm
  {
    match: /thủy sản|tôm|shrimp|cá tra|pangasius|basa|mực|bạch tuộc/i,
    sector: "Thủy sản & Xuất khẩu",
    allStocks: ["VHC", "ANV", "FMC", "IDI"],
    mechanism:
      "Giá cá tra và tôm nguyên liệu xuất khẩu phục hồi giúp cải thiện biên lợi nhuận của các doanh nghiệp chế biến xuất khẩu (VHC, ANV, FMC) tại các thị trường Mỹ, EU và Trung Quốc.",
    whenUp: {
      sentiment: "TÍCH CỰC",
      impactType: "benefit",
      beneficiaries: ["VHC", "ANV", "FMC", "IDI"],
      headwinds: [],
      detail: [
        { symbol: "VHC", impact: "positive", role: "Nữ hoàng cá tra Vĩnh Hoàn", reason: "Hưởng lợi giá bán fillet cá tra xuất khẩu cao cấp sang Mỹ." },
        { symbol: "ANV", impact: "positive", role: "Thủy sản Nam Việt", reason: "Tăng trưởng thị phần xuất khẩu cá tra sang Trung Quốc & châu Âu." },
        { symbol: "FMC", impact: "positive", role: "Thực phẩm Sao Ta", reason: "Xuất khẩu tôm chế biến sâu sang thị trường Nhật Bản & Mỹ." },
      ],
    },
    whenDown: {
      sentiment: "TIÊU CỰC",
      impactType: "headwind",
      beneficiaries: [],
      headwinds: ["VHC", "ANV", "FMC"],
      detail: [
        { symbol: "VHC", impact: "negative", role: "Xuất khẩu cá tra", reason: "Tồn kho nhà phân phối đối tác cao, áp lực cạnh tranh giảm giá bán." },
      ],
    },
    neutral: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["VHC"],
      headwinds: [],
      detail: [{ symbol: "VHC", impact: "neutral", role: "Thủy sản", reason: "Duy trì chuỗi tự chủ vùng nuôi và sản phẩm collagen/gelatin." }],
    },
  },

  // 10. Than đá
  {
    match: /than|coal|coking coal|than nhiệt|antracit/i,
    sector: "Khai khoáng Than & Năng lượng",
    allStocks: ["CST", "NBC", "TC6"],
    mechanism:
      "Giá than tăng giúp cải thiện doanh thu khai thác của các mỏ than thuộc TKV (CST, NBC, TC6); tuy nhiên lại gây áp lực chi phí nhiên liệu đầu vào lên nhiệt điện than (QTP, HND) và xi măng.",
    whenUp: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["CST", "NBC", "TC6"],
      headwinds: ["QTP", "HND", "HT1"],
      detail: [
        { symbol: "CST", impact: "positive", role: "Than Cao Sơn", reason: "Sản lượng than sạch xuất bán cho tập đoàn TKV tăng giá trị." },
        { symbol: "QTP", impact: "negative", role: "Nhiệt điện Quảng Ninh", reason: "Chi phí than trộn đầu vào tăng làm giảm biên phát điện." },
      ],
    },
    whenDown: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["QTP", "HND", "HT1"],
      headwinds: ["CST", "NBC"],
      detail: [
        { symbol: "QTP", impact: "positive", role: "Nhiệt điện", reason: "Chi phí nguyên liệu than giảm cải thiện biên lợi nhuận gộp." },
        { symbol: "CST", impact: "negative", role: "Khai thác than", reason: "Doanh thu bán than chịu chiết khấu nếu giá ký hợp đồng giảm." },
      ],
    },
    neutral: {
      sentiment: "PHÂN HÓA",
      impactType: "mixed",
      beneficiaries: ["CST"],
      headwinds: [],
      detail: [{ symbol: "CST", impact: "neutral", role: "Khai thác than", reason: "Khai thác theo chỉ tiêu kế hoạch năm của TKV." }],
    },
  },
];

/**
 * Fallback mapping based on commodity group when no specific rule matches.
 */
function fallbackByGroup(group: string, changePercent: number | null): CommodityStockImpact {
  const isUp = (changePercent ?? 0) > 0;
  const isDown = (changePercent ?? 0) < 0;

  switch (group) {
    case "nang_luong":
      return {
        sector: "Năng lượng & Dầu khí",
        stocks: ["GAS", "PVD", "PVS", "BSR", "PLX"],
        mechanism: "Biến động giá năng lượng ảnh hưởng chuỗi cung ứng xăng dầu và các dự án thăm dò khai thác dầu khí.",
        sentiment: isUp ? "TÍCH CỰC" : isDown ? "TIÊU CỰC" : "PHÂN HÓA",
        sentimentScore: isUp ? 0.6 : isDown ? -0.6 : 0,
        impactType: isUp ? "benefit" : isDown ? "headwind" : "mixed",
        beneficiaryStocks: isUp ? ["GAS", "PVD", "PVS", "BSR"] : ["HAH"],
        headwindStocks: isUp ? ["HAH"] : ["PVD", "BSR"],
        detail: [],
      };
    case "kim_loai_phi_kim":
      return {
        sector: "Kim loại & Khai khoáng",
        stocks: ["HPG", "HSG", "NKG", "PNJ"],
        mechanism: "Giá kim loại quyết định chi phí đầu vào và doanh số các doanh nghiệp chế biến và tiêu thụ kim loại.",
        sentiment: isUp ? "TÍCH CỰC" : isDown ? "TIÊU CỰC" : "PHÂN HÓA",
        sentimentScore: isUp ? 0.5 : isDown ? -0.5 : 0,
        impactType: isUp ? "benefit" : isDown ? "headwind" : "mixed",
        beneficiaryStocks: isUp ? ["HPG", "HSG"] : [],
        headwindStocks: isDown ? ["HPG"] : [],
        detail: [],
      };
    case "hoa_chat":
      return {
        sector: "Hóa chất & Phân bón",
        stocks: ["DPM", "DCM", "DGC", "CSV"],
        mechanism: "Giá hóa chất thế giới tác động mạnh đến biên lợi nhuận xuất khẩu và cung ứng nội địa.",
        sentiment: isUp ? "TÍCH CỰC" : isDown ? "TIÊU CỰC" : "PHÂN HÓA",
        sentimentScore: isUp ? 0.7 : isDown ? -0.7 : 0,
        impactType: isUp ? "benefit" : isDown ? "headwind" : "mixed",
        beneficiaryStocks: isUp ? ["DPM", "DCM", "DGC"] : [],
        headwindStocks: isDown ? ["DPM", "DCM"] : [],
        detail: [],
      };
    case "vat_lieu_xay_dung":
      return {
        sector: "Vật liệu xây dựng & Hạ tầng",
        stocks: ["HPG", "KSB", "VLB", "HT1", "PLC"],
        mechanism: "Giá vật liệu xây dựng ảnh hưởng đến tiến độ dự án hạ tầng đầu tư công và bất động sản.",
        sentiment: isUp ? "TÍCH CỰC" : isDown ? "TIÊU CỰC" : "PHÂN HÓA",
        sentimentScore: isUp ? 0.5 : isDown ? -0.5 : 0,
        impactType: isUp ? "benefit" : isDown ? "headwind" : "mixed",
        beneficiaryStocks: isUp ? ["HPG", "KSB", "VLB"] : [],
        headwindStocks: isDown ? ["HPG"] : [],
        detail: [],
      };
    case "nhua_va_cao_su":
      return {
        sector: "Nhựa & Cao su",
        stocks: ["GVR", "PHR", "BMP", "NTP", "DRC"],
        mechanism: "Phân hóa giữa nhóm khai thác mủ cao su tự nhiên và nhóm sản xuất sản phẩm nhựa hạ nguồn.",
        sentiment: "PHÂN HÓA",
        sentimentScore: 0,
        impactType: "mixed",
        beneficiaryStocks: isUp ? ["GVR", "PHR"] : ["BMP", "NTP"],
        headwindStocks: isUp ? ["DRC"] : ["GVR"],
        detail: [],
      };
    case "hang_tieu_dung":
    default:
      return {
        sector: "Hàng tiêu dùng & Nông nghiệp",
        stocks: ["DBC", "BAF", "PAN", "QNS", "LTG"],
        mechanism: "Giá nông sản và thực phẩm tác động trực tiếp lên doanh thu của các công ty nông nghiệp và chăn nuôi.",
        sentiment: isUp ? "TÍCH CỰC" : isDown ? "TIÊU CỰC" : "PHÂN HÓA",
        sentimentScore: isUp ? 0.5 : isDown ? -0.5 : 0,
        impactType: isUp ? "benefit" : isDown ? "headwind" : "mixed",
        beneficiaryStocks: isUp ? ["DBC", "BAF", "QNS"] : [],
        headwindStocks: isDown ? ["DBC"] : [],
        detail: [],
      };
  }
}

/**
 * Main export: Resolves stock impact and calculates transmission sentiment
 * for any commodity item based on its name, group, and recent price movement.
 */
export function resolveCommodityImpact(item: {
  nameVi: string;
  name?: string;
  group?: string;
  symbol?: string;
  changePercent?: number | null;
}): CommodityStockImpact {
  const query = `${item.nameVi} ${item.name ?? ""} ${item.symbol ?? ""}`;
  const chg = item.changePercent;
  const isUp = chg != null && chg > 0;
  const isDown = chg != null && chg < 0;

  for (const rule of COMMODITY_RULES) {
    if (rule.match.test(query)) {
      const state = isUp ? rule.whenUp : isDown ? rule.whenDown : rule.neutral;
      const score = isUp
        ? Math.min(1.0, 0.4 + Math.min(Math.abs(chg ?? 1) * 0.1, 0.6))
        : isDown
          ? Math.max(-1.0, -0.4 - Math.min(Math.abs(chg ?? 1) * 0.1, 0.6))
          : 0;

      return {
        sector: rule.sector,
        stocks: rule.allStocks,
        mechanism: rule.mechanism,
        sentiment: state.sentiment,
        sentimentScore: state.sentiment === "TÍCH CỰC" ? Math.abs(score) || 0.6 : state.sentiment === "TIÊU CỰC" ? -Math.abs(score) || -0.6 : 0,
        impactType: state.impactType,
        beneficiaryStocks: state.beneficiaries,
        headwindStocks: state.headwinds,
        detail: state.detail,
      };
    }
  }

  return fallbackByGroup(item.group ?? "hang_tieu_dung", chg ?? null);
}
