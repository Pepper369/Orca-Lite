/**
 * ORCA-FINANCIAL: COMPREHENSIVE INSTITUTIONAL SFT DOMAIN CASES
 *
 * Expands Orca AI training dataset to cover the entire Orca-Financial ecosystem:
 * 1. Macro & Central Bank Policy (SBV, Fed, DXY, OMO, M2, CPI)
 * 2. Derivatives & Portfolio Hedging (VN30F1M, Basis Spread, Expiration Dynamics)
 * 3. Global Commodities & Industry Value Chains (Gold SJC/World, Logistics BDI/WCI, Fertilizer, Agri/Seafood)
 * 4. Forensic CPA & Accounting Anomaly Detection (Accruals, CFO Divergence, Related Parties, Bond Default)
 * 5. Quant Screener & Microstructure (CANSLIM, VCP, Wyckoff Spring, Smart Money, RS Rating)
 * 6. Crypto & Digital Asset Risk (Bitcoin Halving, MVRV, Stablecoin Peg, Liquidation Cascades)
 * 7. Real-world Personal Wealth & Housing Finance (Floating Mortgage, FIRE, Debt Snowball/Avalanche)
 */

export interface DomainFinancialCase {
  id: string;
  domain:
    | "macro_central_bank"
    | "derivatives_hedging"
    | "commodity_supply_chain"
    | "forensic_accounting"
    | "quant_screener_technicals"
    | "crypto_digital_assets"
    | "personal_wealth_mortgage";
  category: string;
  systemRole:
    | "macroCentralBank"
    | "derivativesHedging"
    | "commodityMacro"
    | "forensicRisk"
    | "screenerQuant"
    | "cryptoRisk"
    | "personalFinance";
  q: string;
  a: string;
}

export function getOrcaFinancialDomainCases(): DomainFinancialCase[] {
  return [
    // =========================================================================
    // TRỤ CỘT 1: VĨ MÔ & CHÍNH SÁCH TIỀN TỆ (SBV, FED, TỶ GIÁ, TÍN PHIẾU, M2)
    // =========================================================================
    {
      id: "ORCA-MACRO-SBV-01",
      domain: "macro_central_bank",
      category: "sbv_omo_bill_issuance",
      systemRole: "macroCentralBank",
      q: "Ngân hàng Nhà nước (NHNN) mở lại kênh phát hành tín phiếu hút tiền trên thị trường mở (OMO) khi tỷ giá USD/VND vượt trần. Tác động của động thái này đến thanh khoản hệ thống liên ngân hàng, lãi suất qua đêm và thị trường chứng khoán ra sao?",
      a: `### 🏛️ CƠ CHẾ TRUYỀN DẪN CHÍNH SÁCH TIỀN TỆ: NHNN HÚT TÍN PHIẾU → TTCK VIỆT NAM

Khi chỉ số đồng USD (DXY) neo cao khiến áp lực tỷ giá USD/VND tiệm cận biên độ trần $\\pm 5\\%$, Ngân hàng Nhà nước (NHNN) kích hoạt công cụ hút thanh khoản VND thông qua **phát hành tín phiếu OMO**. Đây là nghiệp vụ bình thường hóa thanh khoản nhằm thu hẹp chênh lệch lãi suất USD - VND, kiềm chế áp lực đầu cơ tỷ giá.

$$\\Delta \\text{Lãi suất LNH} = f(-\\text{Thanh khoản VND dư thừa}, \\text{Khối lượng Tín phiếu Trúng thầu})$$

---

### 📊 BẢNG THEO DÕI CƠ CHẾ TRUYỀN DẪN VÀ TÁC ĐỘNG ĐỊNH LƯỢNG:

| Giai đoạn | Thị trường Tác động | Cơ chế Vận hành Cụ thể | Mức độ Biến động Ước tính |
| :--- | :--- | :--- | :---: |
| **Pha 1 (1 - 3 ngày)** | **Thị trường 2 (Liên ngân hàng - LNH)** | Hút bớt lượng tiền đồng dư thừa cục bộ tại các NHTM lớn (Big 4), kéo lãi suất cho vay qua đêm (ON) từ vùng $0.5\\% - 1.5\\%$ lên $3.5\\% - 5.0\\%$. | 🔴 Lãi suất ON tăng $+200 - 350\\text{ bps}$ |
| **Pha 2 (1 - 2 tuần)** | **Tỷ giá USD/VND (Thị trường tự do & Ngân hàng)** | Chênh lệch lãi suất âm $(\\text{Lãi suất USD} - \\text{Lãi suất VND})$ bị co hẹp, làm giảm động cơ nắm giữ USD (Carry trade đảo chiều), giải tỏa áp lực bán can thiệp ngoại tệ. | 🟢 Giảm áp lực đầu cơ tỷ giá |
| **Pha 3 (2 - 4 tuần)** | **Tâm lý Thị trường Chứng khoán (HOSE/HNX)** | Dòng tiền rẻ bị thận trọng; các CTCK có thể nâng nhẹ chi phí vốn vay ngắn hạn, nhà đầu tư lo ngại kịch bản tăng lãi suất điều hành. | 🟡 Tâm lý giằng co, thanh khoản giảm $20\\% - 35\\%$ |

---

### ⚠️ PHÂN BIỆT RÕ RÀNG: HÚT TÍN PHIẾU VS NÂNG LÃI SUẤT ĐIỀU HÀNH
1. **Hút tín phiếu KHÔNG PHẢI là đảo chiều chính sách sang thắt chặt tiền tệ:** Đây chỉ là biện pháp kỹ thuật tạm thời nhằm điều tiết thanh khoản ngắn hạn trong hệ thống ngân hàng (Thị trường 2), không làm tăng lãi suất cho vay sản xuất kinh doanh (Thị trường 1).
2. **Kịch bản rủi ro cực đoan (Bear Trigger):** Chỉ khi NHNN hút tín phiếu với quy mô lớn liên tục (>150.000 tỷ) nhưng tỷ giá vẫn không hạ nhiệt, buộc phải **bán can thiệp dự trữ ngoại hối (Spot FX)** kèm theo **nâng lãi suất tái cấp vốn/tái chiết khấu**, khi đó mới là tín hiệu đảo chiều vĩ mô gây áp lực bán tháo lớn lên chứng khoán.

### 🛡️ CHIẾN LƯỢC HÀNH ĐỘNG CHO DANH MỤC:
- **Ngắn hạn T+2.5:** Hạ tỷ trọng đòn bẩy Margin về mức an toàn $\\le 0.5$, không mua đuổi khi thị trường mở Gap tăng đầu phiên.
- **Phân bổ ngành:** Ưu tiên nhóm doanh nghiệp có lượng tiền mặt ròng lớn, hưởng lợi từ lãi suất tiền gửi tăng, hạn chế nhóm doanh nghiệp vay nợ USD cao chưa phòng hộ rủi ro tỷ giá.`,
    },
    {
      id: "ORCA-MACRO-FED-DXY-02",
      domain: "macro_central_bank",
      category: "fed_pivot_cross_border_capital",
      systemRole: "macroCentralBank",
      q: "Cục Dự trữ Liên bang Mỹ (Fed) bước vào chu kỳ hạ lãi suất (Fed Pivot) sẽ tác động thế nào đến dòng vốn ngoại (FII/ETF) và biên độ điều hành chính sách tiền tệ của Việt Nam?",
      a: `### 🌐 VĨ MÔ TOÀN CẦU: FED PIVOT → DÒNG VỐN NGOẠI & DƯ ĐỊA CHÍNH SÁCH VIỆT NAM

Khi Fed chuyển từ chính sách tiền tệ thắt chặt (Higher for longer) sang chu kỳ cắt giảm lãi suất Fed Funds Rate, các yếu tố vĩ mô tác động trực tiếp lên kinh tế Việt Nam qua 3 kênh truyền dẫn chính:

$$\\Delta \\text{Áp lực Tỷ giá} = \\text{DXY} \\downarrow \\implies \\Delta \\text{Dư địa nới lỏng SBV} \\uparrow$$

---

### 📊 BẢNG SO SÁNH TRƯỚC VÀ SAU KHI FED HẠ LÃI SUẤT:

| Chỉ báo Vĩ mô | Trước khi Fed Hạ Lãi Suất (DXY > 105) | Sau khi Fed Pivot (DXY < 101) | Tác động tới Việt Nam |
| :--- | :--- | :--- | :--- |
| **Chỉ số DXY** | Căng thẳng, áp lực tỷ giá USD/VND mất giá $4\\% - 5\\%/năm$. | DXY hạ nhiệt, áp lực tỷ giá giảm rõ rệt. | 🟢 NHNN không còn áp lực bán dự trữ ngoại hối. |
| **Dòng vốn FII & ETF** | Rút ròng mạnh khỏi các thị trường mới nổi (Emerging Markets) về Mỹ. | Dòng vốn ngoại tái cơ cấu, giảm tốc bán ròng và quay lại mua ròng. | 🟢 Bổ sung thanh khoản lớn cho nhóm VN30. |
| **Dư địa Lãi suất SBV** | Bị kẹt biên: Muốn hạ lãi suất để kích thích kinh tế nhưng sợ tỷ giá bùng nổ. | Thoải mái duy trì môi trường lãi suất cho vay thấp để hỗ trợ doanh nghiệp. | 🟢 Lãi suất cho vay thấp kích thích tín dụng và đầu tư. |

---

### 💡 CƠ HỘI ĐẦU TƯ THEO CHU KỲ NỚI LỎNG TOÀN CẦU:
1. **Nhóm Cổ phiếu Hưởng lợi trực tiếp:** 
   - **Bất động sản Khu công nghiệp:** Dòng vốn FDI giải ngân tăng tốc khi chi phí tài trợ vốn toàn cầu rẻ đi.
   - **Ngân hàng Bán lẻ:** Tăng trưởng tín dụng hồi phục nhờ nhu cầu vay mua nhà và sản xuất tăng trở lại.
   - **Doanh nghiệp vay nợ USD lớn (như HPG, PC1, MSN):** Giảm bớt lỗ chênh lệch tỷ giá chưa thực hiện, cải thiện biên lợi nhuận ròng.
2. **Kế hoạch giải ngân:** Tích lũy các cổ phiếu đầu ngành trong rổ VN30 có mức định giá P/E dưới 12x và ROE trên 18% ngay khi khối ngoại có dấu hiệu ngừng bán ròng 5 phiên liên tiếp.`,
    },
    {
      id: "ORCA-MACRO-M2-CPI-03",
      domain: "macro_central_bank",
      category: "money_supply_m2_inflation_transmission",
      systemRole: "macroCentralBank",
      q: "Cung tiền M2 của Việt Nam tăng trưởng 12-14%/năm trong khi tăng trưởng tín dụng mục tiêu là 15%. Dòng tiền này chảy vào đâu và lạm phát CPI có bị đe dọa không?",
      a: `### 📈 ĐỊNH LƯỢNG VĨ MÔ: CUNG TIỀN M2, TĂNG TRƯỞNG TÍN DỤNG & CÂN BẰNG LẠM PHÁT

Tăng trưởng cung tiền M2 phản ánh lượng phương tiện thanh toán lưu thông trong toàn nền kinh tế (bao gồm tiền mặt lưu thông và toàn bộ tiền gửi thanh toán, tiền gửi tiết kiệm có kỳ hạn tại hệ thống ngân hàng).

$$\\text{Phương trình Số lượng Tiền tệ (Fisher)}: M \\times V = P \\times Y \\implies \\frac{\\Delta M}{M} + \\frac{\\Delta V}{V} \\approx \\pi (\\text{CPI}) + g (\\text{GDP})$$

---

### 📊 BẢNG CÂN ĐỐI DÒNG TIỀN M2 & CÁC KÊNH HẤP THỤ:

| Kênh Hấp Thụ Vốn | Tỷ Trọng Ước Tính | Cơ Chế Phân Bổ Thực Tế | Tác Động Tới Lạm Phát & Tài Sản |
| :--- | :---: | :--- | :--- |
| **1. Sản xuất & Kinh doanh cốt lõi** | ~55% - 60% | Tín dụng giải ngân cho doanh nghiệp chế biến chế tạo, xuất nhập khẩu, nông nghiệp và đầu tư công. | 🟢 Tạo ra hàng hóa thực tế, triệt tiêu áp lực lạm phát cầu kéo. |
| **2. Bất động sản & Cơ sở hạ tầng** | ~20% - 25% | Tín dụng tiêu dùng mua nhà và tài trợ dự án phát triển khu đô thị, khu công nghiệp. | 🟡 Đẩy giá đất và căn hộ trung tâm tăng khi nguồn cung pháp lý bị tắc nghẽn. |
| **3. Thị trường Vốn (Chứng khoán, TP)** | ~10% - 15% | Thanh khoản nhàn rỗi trong tài khoản nhà đầu tư cá nhân và margin của các CTCK. | 🟢 Giúp P/E thị trường mở rộng (Multiple Expansion). |

---

### 🔍 ĐÁNH GIÁ ÁP LỰC LẠM PHÁT CPI TẠI VIỆT NAM:
- **Đặc thù rổ CPI Việt Nam:** Nhóm Hàng ăn và dịch vụ ăn uống chiếm tỷ trọng lớn nhất (~33.56%), theo sau là Nhà ở và vật liệu xây dựng (~18.8%). Do đó, lạm phát Việt Nam chịu chi phối chủ yếu bởi **giá lương thực (thịt lợn, gạo)** và **giá năng lượng (xăng dầu, điện lực)** hơn là do mở rộng cung tiền M2 thuần túy.
- **Vòng quay tiền ($V$):** Sau đại dịch, vòng quay tiền mặt trong nền kinh tế chậm lại ($V < 1.0$), làm giảm đáng kể áp lực lạm phát tiền tệ.
- **Kết luận:** Mức tăng trưởng M2 $12\\% - 14\\%$ song hành cùng GDP $6.5\\% - 7.0\\%$ là mức mở rộng lành mạnh, duy trì lạm phát trong ngưỡng mục tiêu của Quốc hội ($<4.0\\% - 4.5\\%$).`,
    },

    // =========================================================================
    // TRỤ CỘT 2: PHÁI SINH & QUẢN TRỊ DANH MỤC (VN30F1M, BASIS, HEDGING)
    // =========================================================================
    {
      id: "ORCA-DERIV-BASIS-01",
      domain: "derivatives_hedging",
      category: "vn30f1m_basis_spread_arbitrage",
      systemRole: "derivativesHedging",
      q: "Độ lệch Basis giữa hợp đồng tương lai VN30F1M và chỉ số cơ sở VN30 âm sâu (-15 đến -20 điểm) phản ánh điều gì? Làm thế nào để dùng hợp đồng phái sinh để Hedging bảo vệ danh mục cơ sở?",
      a: `### ⚡ CHIẾN LƯỢC PHÁI SINH: GIẢI MÃ ĐỘ LỆCH BASIS & PHÒNG HỘ DANH MỤC (PORTFOLIO HEDGING)

Độ lệch Basis là chênh lệch điểm số giữa giá hợp đồng tương lai gần nhất (VN30F1M) và chỉ số cơ sở (VN30 Index):

$$\\text{Basis} = P_{\\text{VN30F1M}} - P_{\\text{VN30}}$$

---

### 1. Ý NGHĨA KINH TẾ KHI BASIS ÂM SÂU (DISCOUNT DƯỚI -15 ĐIỂM):
- **Tâm lý phòng vệ cực đoan:** Nhà đầu tư và các định chế đang ồ ạt mở vị thế **Short** để phòng hộ danh mục cơ sở hoặc cược rằng thị trường sẽ tiếp tục giảm điểm trong tương lai gần.
- **Rủi ro bẫy Short Squeeze (Bẻ phái sinh):** Càng gần ngày đáo hạn (thứ Năm tuần thứ 3 của tháng), theo luật sàn HNX, giá thanh toán cuối cùng của hợp đồng tương lai bắt buộc phải hội tụ về đúng giá trị trung bình 30 phút cuối của chỉ số VN30 ($Basis \\to 0$). Khi Basis âm quá sâu, bên cơ sở chỉ cần kéo một vài cổ phiếu trụ vốn hóa lớn (như VCB, VHM, BID) là bên Short phái sinh sẽ bị cháy tài khoản và buộc phải cắt lỗ hoảng loạn, đẩy chỉ số bật tăng dựng đứng.

---

### 2. CÔNG THỨC TÍNH SỐ HỢP ĐỒNG PHÒNG HỘ HEDGING CHUẨN XÁC:
Giả sử bạn đang nắm giữ danh mục cổ phiếu cơ sở trị giá $V_{\\text{portfolio}} = 1.500.000.000\\text{ VNĐ}$ với hệ số Beta danh mục so với VN30 là $\\beta = 1.15$. Thị giá hợp đồng VN30F1M hiện tại là $1.280\\text{ điểm}$.

$$\\text{Giá trị danh nghĩa 1 hợp đồng (Contract Notional)} = 1.280 \\times 100.000\\text{ VNĐ} = 128.000.000\\text{ VNĐ}$$

$$\\text{Số Hợp đồng Short cần mở } (N) = \\frac{V_{\\text{portfolio}} \\times \\beta}{\\text{Giá trị danh nghĩa}} = \\frac{1.500.000.000 \\times 1.15}{128.000.000} \\approx 13.48 \\implies \\mathbf{13 - 14\\text{ Hợp đồng Short}}$$

---

### 3. NGUYÊN TẮC THỰC THI HEDGING KỶ LUẬT:
1. **Mục tiêu Hedging là triệt tiêu biến động:** Khi danh mục cơ sở giảm, khoản lãi từ vị thế Short phái sinh sẽ bù đắp toàn bộ phần lỗ của cơ sở, giúp bảo toàn vốn mà không cần bán tháo cổ phiếu cơ sở mất phí giao dịch và thuế.
2. **Đóng vị thế phòng hộ:** Ngay khi thị trường chung xác nhận điểm cân bằng hoặc xuất hiện cây nến rút chân bùng nổ theo đà (Follow-through Day), lập tức chốt lời vị thế Short phái sinh để cổ phiếu cơ sở tiếp tục sinh lời.`,
    },
    {
      id: "ORCA-DERIV-EXPIRATION-02",
      domain: "derivatives_hedging",
      category: "expiration_week_pin_risk_atc",
      systemRole: "derivativesHedging",
      q: "Tại sao trong tuần đáo hạn phái sinh (thứ Năm tuần thứ 3 mỗi tháng), phiên ATC thị trường cơ sở thường có hiện tượng giật lắc mạnh, kéo hoặc đạp bất ngờ các trụ VN30?",
      a: `### 🎯 BÓC TÁCH VI CẤU TRÚC PHIÊN ĐÁO HẠN PHÁI SINH: HIỆN TƯỢNG 'KÉO/ĐẠP TRỤ' PHIÊN ATC

Theo quy chế giao dịch chứng khoán phái sinh của HNX và VSDC, **Giá thanh toán cuối cùng (Settlement Price)** của hợp đồng VN30 tương lai trong ngày đáo hạn được tính bằng:

$$\\text{Settlement Price} = \\text{Giá trị trung bình số học của chỉ số VN30 trong 30 phút cuối cùng (14:00 - 14:45)}$$

Trong đó bao gồm toàn bộ khớp lệnh liên tục từ 14:00 đến 14:30 và **phiên khớp lệnh định kỳ đóng cửa ATC (14:30 - 14:45)**.

---

### 📊 NGUYÊN NHÂN DẪN ĐẾN BIẾN ĐỘNG CỰC ĐOAN PHIÊN ATC:

| Tác nhân | Hành vi Giao dịch | Hệ quả lên Giá Cổ phiếu Trụ |
| :--- | :--- | :--- |
| **1. Khối Tự doanh & Tay to nắm giữ vị thế lớn** | Các bên nắm giữ khối lượng mở (OI) hàng chục nghìn hợp đồng Long hoặc Short cần tối ưu hóa mức giá thanh toán có lợi nhất cho vị thế của mình. | Dồn lệnh mua/bán đột biến vào các mã vốn hóa khủng có thanh khoản cô đặc (như VCB, BID, SAB, VIC, VHM) để nắn chỉ số VN30. |
| **2. Arbitrage Desk đóng vị thế phòng hộ** | Các quỹ giao dịch chênh lệch giá (Arbitrage) đồng loạt bán hoặc mua lại rổ cổ phiếu cơ sở VN30 để đối ứng với hợp đồng phái sinh đáo hạn. | Khối lượng khớp lệnh phiên ATC tăng vọt gấp 3 - 5 lần bình thường, tạo ra các cây nến rút chân hoặc sập sàn bất ngờ. |

---

### 🛡️ NGUYÊN TẮC PHÒNG THỦ DÀNH CHO NHÀ ĐẦU TƯ CƠ SỞ:
1. **Tuyệt đối KHÔNG mua đuổi hoặc bán tháo theo diễn biến ATC ngày đáo hạn:** Các biến động giật trần/sàn trong phiên ATC ngày thứ Năm đáo hạn thường mang tính chất kỹ thuật ngắn hạn. Đến sáng thứ Sáu (phiên kế tiếp), thị trường cơ sở hầu như luôn có xu hướng **trả điểm (Mean Reversion)** về đúng giá trị cung cầu tự nhiên.
2. **Quy tắc nắm giữ phái sinh:** Nếu bạn đang nắm giữ hợp đồng tương lai qua đêm, hãy chủ động **chuyển kỳ hạn (Rollover)** sang hợp đồng tháng sau (VN30F2M) trước ngày đáo hạn 1-2 phiên để tránh rủi ro biến động thanh toán cưỡng bức.`,
    },

    // =========================================================================
    // TRỤ CỘT 3: HÀNG HÓA TOÀN CẦU & CHUỖI GIÁ TRỊ DOANH NGHIỆP
    // =========================================================================
    {
      id: "ORCA-COMM-GOLD-SJC-03",
      domain: "commodity_supply_chain",
      category: "gold_sjc_world_arbitrage",
      systemRole: "commodityMacro",
      q: "Chênh lệch giá vàng miếng SJC và vàng thế giới Kitco nới rộng trên 10-15 triệu/lượng phản ánh rủi ro gì? Khi NHNN đấu thầu vàng hoặc bán can thiệp qua Big4, thị trường phản ứng thế nào?",
      a: `### 🥇 PHÂN TÍCH LIÊN THỊ TRƯỜNG: VÀNG SJC VS VÀNG THẾ GIỚI & CHÍNH SÁCH QUẢN LÝ THỊ TRƯỜNG VÀNG

Chênh lệch (Spread) giữa giá vàng miếng SJC trong nước và giá vàng thế giới quy đổi là phong vũ biểu đo lường **tâm lý trú ẩn rủi ro** và **cơn khát nắm giữ tài sản thực** của người dân Việt Nam.

$$\\text{Giá Vàng TG Quy Đổi (VND/Lượng)} = \\frac{\\text{Spot Gold (USD/oz)} \\times 1.20565 \\times \\text{Tỷ giá USD/VND}}{0.82945} + \\text{Thuế, Phí}$$

---

### 📊 BẢNG BÓC TÁCH NGUYÊN NHÂN & TÁC ĐỘNG ĐỊNH LƯỢNG:

| Hiện tượng | Nguyên nhân Cốt lõi | Tác động Kinh tế Vĩ mô |
| :--- | :--- | :--- |
| **Spread SJC > 12 triệu/lượng** | Nguồn cung vàng miếng SJC bị độc quyền theo Nghị định 24/2012; nhu cầu tích trữ tài sản an toàn bùng nổ khi lãi suất tiết kiệm ở vùng đáy. | 🔴 Kích hoạt dòng tiền gom USD trên thị trường tự do để buôn lậu vàng biên mậu, làm căng thẳng tỷ giá chợ đen. |
| **NHNN can thiệp bán vàng qua Big4/SJC** | NHNN trực tiếp bán vàng miếng từ nguồn dự trữ cho 4 NHTM Nhà nước và SJC để phân phối trực tiếp cho người dân theo giá can thiệp. | 🟢 Thu hẹp nhanh chóng khoảng cách giá SJC về dưới $3 - 5\\text{ triệu/lượng}$, triệt tiêu động cơ đầu cơ gom ngoại tệ. |

---

### ⚠️ LƯU Ý ĐỐI VỚI DÒNG TIỀN ĐẦU TƯ:
1. **Dòng tiền luân chuyển giữa Vàng và Chứng khoán:** Khi giá vàng trong nước neo ở đỉnh cao và khoảng cách với thế giới thu hẹp, dòng tiền thông minh thường có xu hướng hiện thực hóa lợi nhuận vàng để phân bổ lại vào các kênh có tỷ suất sinh lời cao hơn như cổ phiếu cơ bản và bất động sản phục hồi.
2. **Cảnh báo rủi ro đu đỉnh vàng miếng:** Tuyệt đối không mua tích trữ vàng miếng khi chênh lệch với giá thế giới vượt trên 15%, vì chỉ cần một quyết định điều chỉnh cơ chế quản lý thị trường vàng từ cơ quan chức năng là biên chênh lệch có thể bốc hơi trong 48 giờ.`,
    },
    {
      id: "ORCA-COMM-LOGISTICS-04",
      domain: "commodity_supply_chain",
      category: "container_shipping_rates_bdi_wci",
      systemRole: "commodityMacro",
      q: "Giá cước vận tải biển thế giới (World Container Index - WCI) tăng phi mã do căng thẳng Biển Đỏ. Chuỗi cổ phiếu vận tải biển HAH, VOS, GMD hưởng lợi hay chịu rủi ro ra sao?",
      a: `### 🚢 CƠ CHẾ TRUYỀN DẪN VẬN TẢI BIỂN: GIÁ CƯỚC CONTAINER THẾ GIỚI → HAH, VOS, GMD

Khi căng thẳng địa chính trị buộc các hãng tàu lớn phải định tuyến lại qua Mũi Hảo Vọng (vòng qua châu Phi), hành trình vận chuyển dài thêm 10 - 14 ngày, làm sụt giảm nguồn cung tàu container toàn cầu hiệu dụng từ $8\\% - 12\\%$. Tác động lên nhóm logistics Việt Nam có sự phân hóa cực kỳ rõ rệt:

---

### 📊 PHÂN TÍCH TÁC ĐỘNG CHI TIẾT TỪNG MÃ THEO MÔ HÌNH KINH DOANH:

| Mã CP | Mô hình Vận hành | Mức độ Hưởng lợi | Cơ chế Tác động Lợi nhuận | Độ trễ BCTC |
| :---: | :--- | :---: | :--- | :---: |
| **HAH** | Sở hữu đội tàu container tự vận hành + cho thuê tàu | 🟢 **HƯỞNG LỢI TRỰC TIẾP LỚN NHẤT** | - Giá cước vận tải nội địa và nội Á tăng theo giá thế giới.<br>- Ký lại các hợp đồng cho thuê định hạn (Time Charter) tàu mới đóng với giá thuê cao gấp 1.5 - 2.0 lần. | **1 Quý** (ký lại giá cước định kỳ) |
| **VOS** | Vận tải hàng khô (Bulk) & tàu dầu sản phẩm | 🟡 **HƯỞNG LỢI MỘT PHẦN** | Chỉ có 2-3 tàu container chạy tuyến nội Á; phụ thuộc nhiều hơn vào chỉ số tàu hàng rời Baltic Dry Index (BDI) và cước tàu dầu. | **1 - 2 Quý** |
| **GMD** | Khai thác Cảng biển nước sâu (Gemalink, Nam Đình Vũ) | 🟡 **TÁC ĐỘNG HỖN HỢP** | - Cảng hưởng phí bốc xếp và lưu bãi container tăng.<br>- Tuy nhiên nếu các hãng tàu hủy chuyến (Blank Sailing) do trễ lịch trình thì sản lượng thông qua cảng (Throughput) có thể bị nghẽn ngắn hạn. | **2 Quý** |

---

### 🛡️ NGUYÊN TẮC ĐẦU TƯ CỔ PHIẾU CHU KỲ VẬN TẢI BIỂN:
1. **Cổ phiếu nhóm này phản ánh trước giá cước:** Thị giá HAH thường tạo đỉnh trước hoặc cùng thời điểm với giá cước vận tải thế giới. Khi cước container bắt đầu đi ngang hoặc suy yếu, cần chủ động chốt lời bảo toàn thành quả.
2. **Kiểm soát rủi ro cung tàu mới:** Năm 2025 - 2026 là giai đoạn bàn giao hàng loạt tàu container đóng mới trên toàn cầu, nguồn cung tàu bổ sung có thể làm áp lực cước hạ nhiệt nhanh chóng.`,
    },
    {
      id: "ORCA-COMM-FERTILIZER-05",
      domain: "commodity_supply_chain",
      category: "fertilizer_urea_natural_gas_spread",
      systemRole: "commodityMacro",
      q: "Giá phân bón Ure thế giới và giá khí đầu vào biến động tác động thế nào tới biên lợi nhuận của Đạm Cà Mau (DCM) và Đạm Phú Mỹ (DPM)? Luật thuế VAT sửa đổi đối với phân bón tạo ra cú hích gì?",
      a: `### 🌾 CHUỖI GIÁ TRỊ PHÂN BÓN: URE TOÀN CẦU, GIÁ KHÍ TỰ NHIÊN & CÚ HÍCH THUẾ VAT

Ngành sản xuất phân bón Đạm (Ure) tại Việt Nam sử dụng nguyên liệu đầu vào chính là **Khí tự nhiên (Natural Gas)** từ các mỏ khí Nam Côn Sơn và Tây Nam Bộ:

$$\\text{Biên Lợi Nhuận Gộp (Gross Margin)} = \\text{Giá Bán Ure} - [\\alpha \\times \\text{Giá Khí Đầu Vào} + \\text{Chi Phí Vận Chuyển Pipeline}]$$

---

### 📊 BẢNG SO SÁNH VỊ THẾ CẠNH TRANH GIỮA DCM VÀ DPM:

| Tiêu chí | **DCM (Đạm Cà Mau)** | **DPM (Đạm Phú Mỹ)** |
| :--- | :--- | :--- |
| **Nguồn khí đầu vào** | Nguồn khí mỏ PM3-CAA và mỏ Sông Đốc (hợp đồng giá khí liên kết với giá dầu FO/Brent). | Nguồn khí bể Cửu Long và Nam Côn Sơn (chi phí khí cước vận chuyển cao hơn do các mỏ cũ cạn kiệt). |
| **Khấu hao nhà máy** | Nhà máy Đạm Cà Mau đã **hết khấu hao lớn từ cuối năm 2023**, giúp giảm chi phí cố định hàng nghìn tỷ mỗi năm. | Nhà máy đã hết khấu hao từ lâu, cấu trúc tài chính nhiều tiền gửi. |
| **Mở rộng chuỗi giá trị** | Đẩy mạnh xuất khẩu sang Campuchia, Ấn Độ, Mỹ La-tinh và thâu tóm Phân bón Hàn-Việt (NPK). | Tập trung thị trường nội địa Đông Nam Bộ và Tây Nguyên. |

---

### 💥 CÚ HÍCH BƯỚC NGOẶT: LUẬT THUẾ VAT PHÂN BÓN (5%)
- **Trước khi sửa đổi:** Mặt hàng phân bón thuộc đối tượng *"Không chịu thuế VAT"*. Doanh nghiệp không được khấu trừ thuế VAT đầu vào (khoảng $7\\% - 8\\%$ chi phí máy móc, nguyên vật liệu, điện khí), buộc phải hạch toán vào chi phí sản xuất làm giảm lợi nhuận.
- **Khi áp thuế VAT 5%:** Doanh nghiệp sản xuất trong nước được **hoàn lại toàn bộ thuế VAT đầu vào**, giúp DCM và DPM tiết kiệm ngay **$300 - 500\\text{ tỷ VNĐ chi phí/năm}**, trực tiếp cải thiện biên lợi nhuận ròng. Đồng thời tạo sân chơi bình đẳng trước phân bón nhập khẩu giá rẻ.`,
    },

    // =========================================================================
    // TRỤ CỘT 4: FORENSIC CPA & BÓC TÁCH BÁO CÁO TÀI CHÍNH (CỜ ĐỎ GIAN LẬN)
    // =========================================================================
    {
      id: "ORCA-FRN-RELATED-PARTY-02",
      domain: "forensic_accounting",
      category: "related_party_capital_extraction",
      systemRole: "forensicRisk",
      q: "Làm thế nào để nhận diện dấu hiệu rút ruột tiền của cổ đông qua các giao dịch ủy thác đầu tư, tạm ứng hợp tác kinh doanh với các bên liên quan trên BCTC?",
      a: `### 🚨 KIỂM TOÁN PHÁP Y: NHẬN DIỆN CHIÊU THỨC RÚT RUỘT QUA 'HỢP TÁC KINH DOANH' (BCC) & TẠM ỨNG

Rút ruột vốn chủ sở hữu thông qua các pháp nhân sân sau (Shell Companies / SPVs) là thủ đoạn tinh vi hàng đầu trên thị trường chứng khoán nhằm biến vốn huy động của cổ đông đại chúng thành tài sản cá nhân của nhóm cổ đông chi phối.

---

### 🔍 4 BƯỚC BÓC TÁCH CỜ ĐỎ TRÊN BẢNG CÂN ĐỐI KẾ TOÁN:

#### 1. Kiểm tra Khoản mục 'Phải thu ngắn hạn / dài hạn khác' (Other Receivables)
- **Tỷ trọng bất thường:** Khi khoản mục này chiếm trên **$25\\% - 40\\%$ tổng tài sản** của doanh nghiệp.
- **Thuyết minh mập mờ:** Thuyết minh BCTC ghi chung chung: *"Tạm ứng thực hiện dự án", "Ủy thác đầu tư kinh doanh", "Hợp đồng hợp tác kinh doanh (BCC) với Công ty A, B, C"*. Khi tra cứu mã số thuế thì các đối tác này đều mới thành lập 1-2 năm, vốn điều lệ mỏng và chung địa chỉ với lãnh đạo doanh nghiệp.

#### 2. Dòng tiền 'Chỉ đi một chiều'
- Doanh nghiệp liên tục phát hành tăng vốn cho cổ đông hiện hữu hoặc phát hành trái phiếu riêng lẻ huy động hàng nghìn tỷ đồng.
- Tiền vào tài khoản công ty chỉ lưu lại vài ngày, sau đó được kế toán lập ủy nhiệm chi chuyển sạch sang các bên liên quan dưới danh nghĩa đặt cọc mua cổ phần hoặc đặt cọc mua dự án chưa giải phóng mặt bằng.

#### 3. Tỷ suất sinh lời từ hợp tác kinh doanh thấp vô lý
- Đưa hàng nghìn tỷ đồng cho đối tác nắm giữ suốt 3 - 5 năm nhưng lợi nhuận thu về mỗi năm chỉ đạt $1\\% - 3\\%$, thậm chí không bằng lãi suất tiền gửi ngân hàng. 
- Nguy cơ trích lập dự phòng phải thu khó đòi lên tới $100\\%$ khi đối tác lâm vào tình trạng mất khả năng thanh toán.

---

### 🛡️ KHUYẾN NGHỊ HÀNH ĐỘNG DỨT KHOÁT:
- **Nguyên tắc số 1:** Loại bỏ vĩnh viễn khỏi danh mục đầu tư bất kỳ doanh nghiệp nào có khoản Phải thu liên quan >30% tổng tài sản mà không có tài sản bảo đảm khả thi.
- **Khi đã lỡ nắm giữ:** Lập tức hạ tỷ trọng trong các nhịp hồi phục thanh khoản; tuyệt đối không trung bình giá xuống với các mã có cờ đỏ pháp y này.`,
    },
    {
      id: "ORCA-FRN-BOND-PRESSURE-03",
      domain: "forensic_accounting",
      category: "corporate_bond_refinancing_risk",
      systemRole: "forensicRisk",
      q: "Doanh nghiệp bất động sản có lượng trái phiếu đến hạn lớn trong năm nay. Làm thế nào để tính toán áp lực thanh toán và rủi ro tái tài trợ (Refinancing Risk)?",
      a: `### 💣 ĐỊNH LƯỢNG RỦI RO TRÁI PHIẾU DOANH NGHIỆP: ÁP LỰC ĐÁO HẠN & KHẢ NĂNG TÁI TÀI TRỢ

Rủi ro tái tài trợ (Refinancing Risk) bùng nổ khi doanh nghiệp có lượng nợ vay ngắn hạn và trái phiếu đến hạn lớn hơn rất nhiều so với lượng tiền mặt sẵn có và dòng tiền hoạt động kinh doanh (CFO) tạo ra trong kỳ.

---

### 1. CÔNG THỨC ĐO LƯỜNG HỆ SỐ ĐỆM THANH KHOẢN TRÁI PHIẾU (BOND COVERAGE BUFFER)

$$\\text{Liquidity Buffer} = \\frac{\\text{Tiền mặt & Tiền gửi ngắn hạn} + \\text{CFO dự phóng 12 tháng}}{\\text{Trái phiếu đáo hạn trong 12 tháng} + \\text{Nợ vay ngân hàng ngắn hạn}}$$

- **Vùng An toàn Cao:** $\\text{Liquidity Buffer} \\ge 1.2x$ (Doanh nghiệp đủ tiền mặt tự chủ thanh toán không cần vay mới).
- **Vùng Thận trọng:** $0.8x \\le \\text{Liquidity Buffer} < 1.2x$ (Phải phụ thuộc vào việc đàm phán gia hạn trái phiếu hoặc bán tài sản).
- **Vùng Báo động Đỏ (Vỡ nợ kỹ thuật):** $\\text{Liquidity Buffer} < 0.5x$ kèm tỷ lệ $\\text{D/E} > 2.0x$.

---

### 2. MA TRẬN 3 LỐI THOÁT VÀ NGUY CƠ ĐỐI VỚI CỔ ĐÔNG:
1. **Gia hạn kỳ hạn trái phiếu thêm 2 năm (theo Nghị định 08/2023):** Giúp doanh nghiệp hoãn áp lực trả nợ gốc nhưng bù lại phải nâng lãi suất trái phiếu lên cao hơn (thường từ $12\\% - 14.5\\%/năm$), làm chi phí tài chính các năm sau phình to và bào mòn toàn bộ lợi nhuận ròng.
2. **Hoán đổi nợ lấy sản phẩm bất động sản:** Buộc phải chiết khấu sâu sản phẩm dự án để cấn trừ cho trái chủ.
3. **Phát hành cổ phiếu hoán đổi nợ / Chào bán giá rẻ:** Làm pha loãng nghiêm trọng EPS và giá trị sổ sách của cổ đông hiện hữu.

### 🛡️ CHIẾN LƯỢC CRO CHO NHÀ ĐẦU TƯ:
Chỉ mở vị thế đầu tư vào nhóm doanh nghiệp đã tái cấu trúc xong toàn bộ nợ trái phiếu và đưa tỷ lệ Nợ vay/Vốn chủ sở hữu về dưới ngưỡng an toàn $1.0x$.`,
    },
    {
      id: "ORCA-FRN-INVENTORY-CAPITALIZED-04",
      domain: "forensic_accounting",
      category: "inventories_capitalized_interest_trap",
      systemRole: "forensicRisk",
      q: "Chiêu thức vốn hóa chi phí lãi vay vào hàng tồn kho và chi phí xây dựng cơ bản dở dang giúp doanh nghiệp làm đẹp lợi nhuận như thế nào? Cách bóc tách để thấy bức tranh thực?",
      a: `### 🏗️ PHÁP Y KẾ TOÁN: BẪY VỐN HÓA LÃI VAY (CAPITALIZED INTEREST) VÀO HÀNG TỒN KHO DỞ DANG

Theo chuẩn mực kế toán Việt Nam (VAS 16 - Chi phí đi vay), chi phí lãi vay liên quan trực tiếp đến việc đầu tư xây dựng hoặc sản xuất tài sản dở dang cần một thời gian dài (thường trên 12 tháng) để có thể đưa vào sử dụng hoặc bán thì được phép **vốn hóa vào giá trị tài sản đó** (thay vì hạch toán vào Chi phí tài chính trong kỳ).

---

### 🔍 CƠ CHẾ 'PHÙ PHÉP' LỢI NHUẬN CỦA DOANH NGHIỆP ĐÒN BẨY CAO:

Giả sử Doanh nghiệp X vay nợ 5.000 tỷ với lãi suất $10\\%/năm$, tổng tiền lãi thực tế phải trả ngân hàng trong năm là **500 tỷ VNĐ**:

| Khoản mục trên BCTC | Doanh Nghiệp Hạch Toán Trung Thực | Doanh Nghiệp Lạm Dụng Vốn Hóa Lãi Vay |
| :--- | :---: | :---: |
| **Chi phí Tài chính (Lãi vay)** | Trừ thẳng **-500 tỷ** vào Báo cáo KQKD | Chỉ ghi nhận **-50 tỷ**, đem **450 tỷ vốn hóa vào Hàng tồn kho dự án** |
| **Lợi nhuận trước thuế (EBT)** | **Âm -200 tỷ (Lỗ thực tế)** | **Dương +250 tỷ (Lãi trên giấy)** |
| **Giá trị Hàng Tồn kho** | Phản ánh đúng chi phí xây dựng thực tế | Bị thổi phồng thêm 450 tỷ tiền lãi vay nhập gốc |

---

### 🚨 RỦI RO BOM NỔ CHẬM CHO CỔ ĐÔNG:
1. **Lợi nhuận ảo nhưng tiền mặt cạn thật:** Dù báo lãi hàng trăm tỷ nhưng doanh nghiệp vẫn phải cắn răng trả tiền lãi thật cho ngân hàng (dòng tiền CFO âm nặng).
2. **Nguy cơ trích lập giảm giá tồn kho đột biến:** Khi dự án bất động sản vướng mắc pháp lý kéo dài 5-7 năm, số tiền lãi vay tích lũy đã vượt quá giá trị thị trường thực tế của dự án. Doanh nghiệp buộc phải trích lập dự phòng giảm giá hàng tồn kho hàng nghìn tỷ trong một quý, thổi bay toàn bộ vốn chủ sở hữu.

### 🛡️ CÁCH BÓC TÁCH NHANH:
Mở phần **Thuyết minh BCTC** mục *"Chi phí đi vay trong kỳ"* và đối chiếu với dòng *"Chi phí lãi vay đã trả"* trên **Báo cáo Lưu chuyển Tiền tệ (Mã số 08)**. Nếu số tiền lãi vay thực trả lớn gấp 3 - 5 lần chi phí tài chính trên Báo cáo KQKD, hãy hết sức cảnh giác.`,
    },

    // =========================================================================
    // TRỤ CỘT 5: QUANT SCREENER & VI CẤU TRÚC THỊ TRƯỜNG (CANSLIM, VCP, SMART MONEY)
    // =========================================================================
    {
      id: "ORCA-QNT-VCP-MINERVINI-01",
      domain: "quant_screener_technicals",
      category: "vcp_pattern_volatility_contraction",
      systemRole: "screenerQuant",
      q: "Mô hình Thu hẹp Độ biến động (VCP - Volatility Contraction Pattern) của Mark Minervini hoạt động thế nào trên cổ phiếu Việt Nam? Cách xác định điểm mua Pivot và Stop-Loss chuẩn?",
      a: `### 📈 ĐỊNH LƯỢNG MÔ HÌNH VCP (VOLATILITY CONTRACTION PATTERN) TRÊN THỊ TRƯỜNG VIỆT NAM

Mô hình VCP bóc tách quá trình **hấp thụ nguồn cung lỏng lẻo** của các nhà đầu tư tổ chức (Smart Money) trước khi cổ phiếu bước vào pha bứt phá tăng tốc.

---

### 1. ĐẶC TRƯNG HÌNH THÁI CỦA MÔ HÌNH VCP ĐẠT CHUẨN:
- **Chuỗi nhịp điều chỉnh thu hẹp dần (2 đến 4 nhịp co thắt):**
  - Nhịp 1 (T1): Biên độ giảm từ đỉnh quanh $-15\\% \\text{ đến } -20\\%$.
  - Nhịp 2 (T2): Biên độ co lại chỉ còn $-8\\% \\text{ đến } -10\\%$.
  - Nhịp 3 (T3): Biên độ cực kỳ chặt chẽ chỉ $-3\\% \\text{ đến } -5\\%$.
- **Hành vi Khối lượng (Volume Footprint):** Tại đáy của mỗi nhịp co thắt, khối lượng giao dịch phải cạn kiệt rõ rệt (**Volume Dry Up - VDU**), thấp hơn $50\\%$ mức bình quân 20 phiên, chứng tỏ lượng hàng trôi nổi bị ép bán đã được gom sạch.

---

### 2. CÔNG THỨC XÁC ĐỊNH ĐIỂM VÀO LỆNH (PIVOT BUY POINT) & QUẢN TRỊ RỦI RO:

$$\\text{Điểm Mua Pivot} = \\text{Đỉnh ngắn hạn của nhịp co thắt cuối cùng (T3)} + 1\\text{ bước giá}$$

- **Điều kiện Xác nhận Breakout:**
  - Khối lượng khớp lệnh trong phiên nổ vọt tối thiểu gấp $\\ge 1.5 - 2.0\\text{x}$ bình quân 20 phiên ($V/V_{20} \\ge 1.8$).
  - Giá đóng cửa phiên vượt dứt khoát mốc Pivot, tốt nhất là đóng cửa ở mức cao nhất phiên ($>90\\%$ biên độ nến ngày).
- **Mức Cắt Lỗ Kỷ luật (Hard Stop-Loss):**
  - Đặt ngưỡng cắt lỗ ngay dưới đáy của nhịp co thắt gần nhất (thường chỉ cách điểm Pivot từ $-4.0\\% \\text{ đến } -5.5\\%$).
- **Tỷ lệ R:R Mục tiêu:** Với mức chịu rủi ro $5\\%$, mục tiêu chốt lời tối thiểu phải đạt $+12\\% \\text{ đến } +18\\%$, đảm bảo tỷ lệ Risk/Reward $\\ge 2.5x$.

> 💡 **Mẹo thực chiến tại TTCK Việt Nam (T+2.5):** Nên giải ngân $30\\% - 40\\%$ vị thế thăm dò ngay tại nền siết chặt của nhịp T3 trước khi nổ von; $60\\%$ còn lại gia tăng ngay khi cổ phiếu vượt Pivot trong phiên để có sẵn lượng hàng T+0 phòng hộ.`,
    },
    {
      id: "ORCA-QNT-RS-RATING-02",
      domain: "quant_screener_technicals",
      category: "relative_strength_rs_rating",
      systemRole: "screenerQuant",
      q: "Chỉ số Sức mạnh Giá Tương đối (RS Rating) 3 tháng và 6 tháng tính như thế nào? Vì sao nên tập trung vào các mã có RS Rating > 80 khi thị trường chung điều chỉnh?",
      a: `### 🎯 ĐỊNH LƯỢNG SỨC MẠNH GIÁ TƯƠNG ĐỐI (RS RATING) TRONG PHÂN TÍCH ĐỊNH CHẾ

Chỉ số Sức mạnh Tương đối (Relative Strength Rating - RS) xếp hạng hiệu suất giá của một cổ phiếu so với toàn bộ các mã niêm yết trên 3 sàn (HOSE, HNX, UPCOM) trên thang điểm từ **1 đến 99**.

---

### 1. CÔNG THỨC TÍNH RS RATING THEO CHUẨN O'NEIL (TRỌNG SỐ QUÝ GẦN NHẤT CAO HƠN):

$$R_{\\text{stock}} = 0.40 \\times \\Delta P_{\\text{3 tháng}} + 0.30 \\times \\Delta P_{\\text{6 tháng}} + 0.15 \\times \\Delta P_{\\text{9 tháng}} + 0.15 \\times \\Delta P_{\\text{12 tháng}}$$

$$\\text{RS Rating} = \\text{Percentile Rank}(R_{\\text{stock}}, \\text{Toàn bộ cổ phiếu trên thị trường})$$

- **RS $\\ge 80$:** Cổ phiếu nằm trong Top $20\\%$ mã tăng giá mạnh nhất thị trường.
- **RS $\\ge 90$:** Siêu cổ phiếu dẫn dắt thị trường (True Market Leader).

---

### 2. TẠI SAO PHẢI SOI RS KHI VN-INDEX ĐIỀU CHỈNH GIẢM SÂU?
- **Quy luật phân hóa tự nhiên:** Khi chỉ số chung giảm $-5\\% \\text{ đến } -10\\%$, đa số cổ phiếu thị trường sẽ giảm $-15\\% \\text{ đến } -20\\%$. Tuy nhiên, những cổ phiếu dẫn dắt thực sự sẽ **giữ giá đi ngang, thậm chí lập đỉnh mới**.
- **Dấu chân tổ chức:** Dòng tiền lớn phải liên tục hấp thụ toàn bộ lực bán cắt lỗ thì cổ phiếu mới không bị giảm theo thị trường.
- **Kịch bản bung nổ:** Ngay khi VN-Index ngừng rơi và phục hồi phiên đầu tiên, những cổ phiếu có $\\text{RS} \\ge 85$ sẽ là những mã tím trần đầu tiên và mở ra chu kỳ tăng giá dẫn dắt 30% - 50%.`,
    },
    {
      id: "ORCA-QNT-WYCKOFF-SPRING-03",
      domain: "quant_screener_technicals",
      category: "wyckoff_spring_liquidity_sweep",
      systemRole: "screenerQuant",
      q: "Hành vi Wyckoff Spring (quét thanh khoản đáy) nhận diện thế nào trên đồ thị giá và khối lượng tại HOSE/HNX?",
      a: `### 🔍 BÓC TÁCH VI CẤU TRÚC: HÀNH VI 'WYCKOFF SPRING' & QUÉT THANH KHOẢN (LIQUIDITY SWEEP)

Hành vi **Spring (Pha C theo phương pháp Wyckoff)** là cú rũ bỏ quyết định nhằm bẫy toàn bộ các nhà đầu tư nhỏ lẻ đặt lệnh cắt lỗ dưới vùng hỗ trợ cứng, đồng thời kiểm tra xem còn nguồn cung bán tháo nào tồn đọng hay không.

---

### 📊 BẢNG NHẬN DIỆN 3 DẠNG SPRING ĐIỂN HÌNH:

| Dạng Spring | Hành vi Giá (Price Action) | Hành vi Khối lượng (Volume) | Hành động Thực chiến Khuyến nghị |
| :--- | :--- | :--- | :--- |
| **Spring Loại 1 (Terminal Shakeout)** | Giá xuyên thủng hỗ trợ sâu với **khối lượng cực lớn**, không rút chân được ngay trong phiên. | Rất lớn ($V/V_{20} > 2.0x$), nguồn cung vẫn còn dồi dào. | 🔴 Đứng ngoài quan sát, chưa mua; cần chờ cổ phiếu tái tích lũy lại nền. |
| **Spring Loại 2 (Chuẩn mực)** | Giá đâm thủng hỗ trợ trong phiên rồi rút chân mạnh đóng cửa trở lại **bên trên đường hỗ trợ**. | Khối lượng trung bình hoặc hơi cao; sau đó có phiên kiểm định lại (**Test**) với volume cạn kiệt. | 🟢 **MUA THĂM DÒ TẠI NHỊP TEST:** Mua $50\\%$ khi nhịp test giữ vững đáy Spring với vol cạn. |
| **Spring Loại 3 (Nhỏ nhẹ / Pin-bar)** | Giá chỉ nhúng nhẹ qua hỗ trợ vài bước giá rồi rút chân pin-bar thần tốc. | Khối lượng cực kỳ thấp (**VDU**), chứng tỏ bên bán đã hoàn toàn kiệt sức. | 🟢 **MUA NGAY:** Vào lệnh thăm dò ngay phiên rút chân, gia tăng vị thế khi vượt đỉnh Trading Range. |

---

### 🛡️ CHIẾN LƯỢC QUẢN TRỊ RỦI RO TRIPLE-BARRIER:
- **Điểm vào lệnh (Entry):** Mua khi giá đóng cửa ngày quay trở lại bên trong biên dưới của Trading Range ($P > \\text{Support}$).
- **Điểm dừng lỗ (Stop-Loss):** Đặt ngay dưới râu nến thấp nhất của cây nến Spring (mức chịu lỗ tối đa $-3.5\\% \\text{ đến } -4.5\\%$).
- **Mục tiêu chốt lời (Take Profit):** Biên trên của vùng tích lũy Trading Range (Target $+12\\% \\text{ đến } +18\\%$, tỷ số $R:R > 3.0x$).`,
    },

    // =========================================================================
    // TRỤ CỘT 6: CRYPTO & TÀI SẢN SỐ (HALVING, ON-CHAIN, MVRV, STABLECOIN)
    // =========================================================================
    {
      id: "ORCA-CRYPTO-MVRV-01",
      domain: "crypto_digital_assets",
      category: "bitcoin_onchain_mvrv_zscore",
      systemRole: "cryptoRisk",
      q: "Chỉ số On-chain MVRV Z-Score của Bitcoin hoạt động thế nào để xác định đỉnh và đáy chu kỳ dài hạn?",
      a: `### 🪙 ĐỊNH LƯỢNG ON-CHAIN BITCOIN: CHỈ SỐ MVRV Z-SCORE & CHU KỲ DÒNG TIỀN DÀI HẠN

Chỉ số **MVRV Z-Score** đo lường sự chênh lệch giữa Giá trị Vốn hóa Thị trường (Market Cap) và Giá trị Vốn hóa Thực tế (Realized Cap) được chuẩn hóa theo độ lệch chuẩn lịch sử:

$$\\text{MVRV} = \\frac{\\text{Market Value (Thị giá)}}{\\text{Realized Value (Giá vốn trung bình on-chain)}}$$

$$\\text{Z-Score} = \\frac{\\text{Market Cap} - \\text{Realized Cap}}{\\sigma_{\\text{Market Cap}}}$$

---

### 📊 MA TRẬN PHÂN VÙNG ĐỊNH GIÁ CHU KỲ BITCOIN:

| Vùng MVRV Z-Score | Trạng thái Chu kỳ | Tâm lý Thị trường | Khuyến nghị Hành động Định lượng |
| :--- :---: | :--- | :--- | :--- |
| **Z-Score < 0.1 (Vùng Xanh)** | **Đáy chu kỳ vĩ mô (Macro Bottom)** | Cực kỳ hoảng loạn, đa số ví on-chain đang chịu lỗ chưa thực hiện. | 🟢 **TÍCH SẢN TỐI ĐA (DCA Heavy):** Vùng cơ hội lịch sử (tương tự tháng 12/2018, tháng 3/2020, tháng 11/2022). |
| **0.5 < Z-Score < 2.5** | **Pha Tích lũy & Tăng trưởng Bền vững** | Lạc quan có kiểm soát, thị trường vận động theo dòng vốn ETF và thanh khoản toàn cầu. | 🟡 **NẮM GIỮ & TỐI ƯU HÓA:** Tiếp tục nắm giữ, tái cân bằng danh mục theo khẩu vị rủi ro. |
| **Z-Score > 6.0 (Vùng Đỏ)** | **Đỉnh bong bóng chu kỳ (Macro Top Euphoria)** | Hưng phấn tột độ, Fomo diện rộng, lợi nhuận chưa thực hiện on-chain đạt cực đại. | 🔴 **CHỐT LỜI DỨT KHOÁT:** Bắt đầu chia bậc chốt lời ra Stablecoin/VND, không dùng đòn bẩy. |

---

### 🛡️ NGUYÊN TẮC QUẢN TRỊ RỦI RO THANH KHOẢN TÀI SẢN SỐ:
1. **Rủi ro bẫy đòn bẩy phái sinh (Liquidation Cascade):** Trong thị trường Crypto, khi tỷ lệ tài trợ vốn (Funding Rate) dương quá cao kèm theo Open Interest (OI) lập đỉnh, các sàn giao dịch thường kích hoạt các đợt quét râu nến (Flash Crash) thanh lý hàng tỷ USD vị thế Long.
2. **Quy tắc an toàn danh mục:** Tối đa không quá $10\\% - 15\\%$ tổng tài sản tài chính cá nhân vào nhóm tài sản số biến động cao, và ưu tiên nắm giữ ở ví lạnh (Cold Wallet) thay vì để trên sàn tập trung.`,
    },
    {
      id: "ORCA-CRYPTO-STABLECOIN-02",
      domain: "crypto_digital_assets",
      category: "stablecoin_peg_arbitrage_risk",
      systemRole: "cryptoRisk",
      q: "Làm thế nào để nhận diện rủi ro mất chốt giá (Depeg) của một đồng Stablecoin và phòng ngừa rủi ro mất trắng tài sản?",
      a: `### ⚖️ QUẢN TRỊ RỦI RO THANH KHOẢN: CẢNH BÁO MẤT CHỐT GIÁ STABLECOIN (DEPEG DETECTION)

Stablecoin là huyết mạch thanh khoản của thị trường tiền mã hóa, nhưng không phải mọi đồng tiền ổn định đều có mức độ an toàn như nhau.

---

### 🔍 3 MÔ HÌNH BẢO CHỨNG STABLECOIN & RỦI RO TƯƠNG ỨNG:

1. **Bảo chứng bằng Tài sản Thực (Fiat-Backed: USDT, USDC):**
   - *Tài sản đối ứng:* Tiền gửi ngân hàng Mỹ, Tín phiếu Kho bạc Mỹ ngắn hạn (US T-Bills) và hợp đồng mua lại (Repo).
   - *Mức độ rủi ro:* Thấp nhất. Tuy nhiên USDC từng bị Depeg ngắn hạn xuống 0.88 USD khi ngân hàng Silicon Valley Bank (SVB) sụp đổ; USDT có rủi ro pháp lý về tính minh bạch của các đợt kiểm toán dự trữ.
2. **Thế chấp vượt mức bằng Crypto (Crypto-Collateralized: DAI/USDS, LUSD):**
   - *Tài sản đối ứng:* ETH, BTC được khóa vào Smart Contract với tỷ lệ thế chấp $\\ge 130\\% - 150\\%$.
   - *Mức độ rủi ro:* Trung bình; rủi ro phát sinh khi thị trường sụp đổ quá nhanh làm smart contract không kịp thanh lý tài sản thế chấp.
3. **Thuật toán không thế chấp (Algorithmic: Mô hình như UST/Terra LUNA trước đây):**
   - *Cơ chế:* Cân bằng cung cầu qua đồng tiền biến động thứ hai.
   - *Mức độ rủi ro:* **CỰC KỲ NGUY HIỂM (Vòng xoáy tử thần - Death Spiral)**. Khi niềm tin sụp đổ, áp lực bán tháo sẽ đẩy đồng tiền về 0 vĩnh viễn.

---

### 🚨 CÁC DẤU HIỆU CỜ ĐỎ CẢNH BÁO DEPEG TRONG 15 PHÚT ĐẦU TIÊN:
- **Mất cân bằng nghiêm trọng trong Curve 3Pool:** Tỷ lệ nắm giữ của đồng stablecoin đó trong bể thanh khoản Curve tăng vọt lên $>70\\% - 85\\%$ (chứng tỏ mọi người đang ồ ạt xả đồng coin đó để rút USDT/USDC).
- **Lãi suất vay (Borrowing Rate) trên Aave/Compound tăng vọt:** Các tay to ồ ạt vay đồng stablecoin đó để bán tháo ra thị trường giao ngay.
- **Thị giá lệch khỏi mốc 0.98 USD quá 2 giờ:** Nếu giá rớt xuống dưới 0.98 USD kèm thanh khoản rút cạn, hãy cắt lỗ ngay lập tức, tuyệt đối không bắt đáy ăn chênh lệch giá nhỏ.`,
    },

    // =========================================================================
    // TRỤ CỘT 7: TÀI CHÍNH CÁ NHÂN & BẤT ĐỘNG SẢN (LÃI THẢ NỔI, FIRE, TÁI CẤU TRÚC NỢ)
    // =========================================================================
    {
      id: "ORCA-PERS-MORTGAGE-01",
      domain: "personal_wealth_mortgage",
      category: "floating_mortgage_rate_stress_test",
      systemRole: "personalFinance",
      q: "Gia đình có thu nhập 50 triệu/tháng muốn vay mua căn hộ 2 tỷ đồng trong 20 năm. Lãi suất ưu đãi 2 năm đầu 7.5%/năm, sau đó thả nổi bằng lãi suất cơ sở + biên độ 3.8%. Hãy tính toán kịch bản khi lãi thả nổi lên 11.5% - 13.5% và đánh giá ngưỡng an toàn dòng tiền?",
      a: `### 🏠 BÓC TÁCH TÀI CHÍNH MUA NHÀ: STRESS-TEST KỊCH BẢN LÃI SUẤT THẢ NỔI (FLOATING RATE)

Khoản vay mua nhà là quyết định phân bổ dòng tiền lớn nhất của một gia đình. Bẫy tài chính phổ biến nhất là **chỉ nhìn vào mức lãi suất ưu đãi 1-2 năm đầu** mà không tính toán kịch bản lãi suất thả nổi khi thị trường thắt chặt thanh khoản.

---

### 1. BẢNG TÍNH LỊCH TRẢ NỢ GỐC & LÃI THEO DƯ NỢ GIẢM DẦN (Vốn vay: 2.0 Tỷ, Thời hạn: 240 Tháng)

- **Tiền gốc cố định mỗi tháng:** $\\frac{2.000.000.000\\text{ VNĐ}}{240\\text{ tháng}} = \\mathbf{8.333.333\\text{ VNĐ/tháng}}$.

| Kịch bản | Lãi suất/Năm | Tiền Lãi Tháng Đầu | Tổng Gốc + Lãi Tháng Đầu | Tỷ trọng trên Thu nhập 50 Tr | Trạng thái Dòng tiền |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Giai đoạn Ưu đãi (2 năm đầu)** | **7.5%/năm** | 12.500.000đ | **20.833.000đ** | **41.7%** | 🟢 Đạt chuẩn an toàn dòng tiền (DTI < 45%) |
| **Kịch bản Base (Thả nổi bình thường)** | **10.5%/năm** | 17.500.000đ | **25.833.000đ** | **51.7%** | 🟡 Ngưỡng cảnh báo, cần thắt chặt chi tiêu |
| **Kịch bản Stress-Test (Lãi suất căng)** | **12.5%/năm** | 20.833.000đ | **29.166.000đ** | **58.3%** | 🔴 Vùng nguy hiểm, dòng tiền sinh hoạt bị bóp nghẹt |
| **Kịch bản Khủng hoảng (Lãi trần)** | **14.0%/năm** | 23.333.000đ | **31.666.000đ** | **63.3%** | 🚨 Nguy cơ vỡ nợ kỹ thuật nếu có biến cố việc làm |

---

### 2. NGUYÊN TẮC VÀNG VỀ DTI (DEBT-TO-INCOME) CHO GIA ĐÌNH:
1. **Ngưỡng DTI an toàn tuyệt đối:** Tổng nghĩa vụ trả nợ ngân hàng (Gốc + Lãi) không bao giờ được vượt quá **$40\\% - 45\\%$ thu nhập thực nhận cố định** hàng tháng của cả hai vợ chồng.
2. **Chuẩn bị Đệm Quỹ Khẩn Cấp Bắt Buộc (Emergency Sinking Fund):**
   - Trước khi đặt bút ký hợp đồng tín dụng, gia đình bắt buộc phải giữ lại một khoản tiền gửi thanh khoản cao tương đương **tối thiểu 6 tháng tiền sinh hoạt + 6 tháng tiền trả nợ ngân hàng**:
   $$\\text{Quỹ khẩn cấp} = (20.000.000\\text{đ sinh hoạt} + 25.000.000\\text{đ trả nợ}) \\times 6 = \\mathbf{270.000.000\\text{ VNĐ}}$$
3. **Chiến lược trả nợ trước hạn thông minh:** Mỗi năm nếu có thưởng Tết hoặc thu nhập đột xuất, hãy ưu tiên trích $50\\% - 70\\%$ trả bớt vào nợ gốc để giảm dần số tiền lãi tính theo dư nợ giảm dần cho các năm sau, chấp nhận mức phí phạt trả nợ trước hạn (chỉ từ $1.0\\% - 1.5\\%$).`,
    },
    {
      id: "ORCA-PERS-FIRE-ROADMAP-02",
      domain: "personal_wealth_mortgage",
      category: "fire_financial_independence_vietnam",
      systemRole: "personalFinance",
      q: "Chiến lược Độc lập Tài chính & Nghỉ hưu Sớm (FIRE) tại Việt Nam cần bao nhiêu tiền? Quy tắc 4% (Trinity Study) cần điều chỉnh thế nào để phù hợp với lạm phát và chi phí y tế tại Việt Nam?",
      a: `### 🔥 LỘ TRÌNH FIRE (ĐỘC LẬP TÀI CHÍNH, NGHỈ HƯU SỚM) THỰC CHIẾN TẠI VIỆT NAM

Quy tắc $4\\%$ kinh điển của nghiên cứu Trinity (Mỹ) dựa trên giả định thị trường phát triển với lạm phát dài hạn $2\\% - 3\\%/năm$ và tỷ suất lợi nhuận đầu tư danh mục $7\\% - 8\\%/năm$. Tại thị trường mới nổi như Việt Nam với đặc thù lạm phát lối sống và chi phí y tế tuổi già tăng nhanh, quy tắc này cần được **hiệu chỉnh thận trọng**.

---

### 1. CÔNG THỨC TÍNH SỐ TIỀN FIRE CHUẨN XÁC TẠI VIỆT NAM:

Tại Việt Nam, tỷ lệ rút tiền an toàn (Safe Withdrawal Rate - SWR) khuyến nghị nên đưa về mức **$3.5\\% - 4.0\\%$** thay vì $4.0\\% - 5.0\\%$ để dự phòng trượt giá.

$$\\text{Con số Tự do Tài chính (FIRE Number)} = \\frac{\\text{Tổng chi phí sinh hoạt mong muốn 1 năm}}{\\text{Tỷ lệ rút vốn an toàn (SWR)}}$$

*Ví dụ thực tế:* Gia đình mong muốn mức sống thoải mái với chi phí sinh hoạt cố định **$25.000.000\\text{ VNĐ/tháng}$** ($300.000.000\\text{ VNĐ/năm}$):

$$\\text{FIRE Number} = \\frac{300.000.000\\text{ VNĐ}}{0.035} = \\mathbf{8.570.000.000\\text{ VNĐ (8.57 Tỷ VNĐ)}}$$

*(Lưu ý: Con số 8.57 tỷ VNĐ này là TÀI SẢN TẠO DÒNG TIỀN, hoàn toàn tách biệt với 01 căn nhà đang ở đã trả hết nợ).*

---

### 2. CƠ CẤU DANH MỤC ĐẦU TƯ TẠO DÒNG TIỀN CHO PHA NGHỈ HƯU:

| Lớp Tài Sản | Tỷ Trọng Phân Bổ | Tỷ Suất Sinh Lời Kỳ Vọng/Năm | Vai Trò & Mục Tiêu |
| :--- | :---: | :---: | :--- |
| **Cổ phiếu Cổ tức & Quỹ ETF VN30** | **45%** | $10\\% - 13\\%/năm$ | Tăng trưởng vốn dài hạn để đánh bại lạm phát; nhận dòng tiền cổ tức tiền mặt đều đặn. |
| **Bất động sản cho thuê dòng tiền** | **30%** | $3.5\\% - 4.5\\%\\text{ (Yield)} + 5\\%\\text{ (Capital Gain)}$ | Tạo dòng tiền thụ động ổn định hàng tháng như lương hưu. |
| **Tiền gửi tiết kiệm & Trái phiếu CP** | **15%** | $5.5\\% - 6.5\\%/năm$ | Đệm thanh khoản an toàn bảo đảm chi tiêu 3 năm không phải bán rẻ cổ phiếu khi thị trường sập. |
| **Vàng 9999 / Vàng miếng** | **10%** | Bảo toàn giá trị | Tài sản phòng thủ chống rủi ro mất giá tiền tệ và bất ổn địa chính trị. |

---

### 🛡️ 3 ĐIỀU KIỆN TIÊN QUYẾT TRƯỚC KHI BẤM NÚT NGHỈ HƯU SỚM:
1. **Phải có Bảo hiểm Sức khỏe Cao cấp (Health Insurance):** Tuyệt đối không để chi phí chữa bệnh đột ngột ăn mòn vào tài sản gốc FIRE.
2. **Sở hữu nhà ở riêng không còn nợ nần:** Loại bỏ hoàn toàn áp lực tiền thuê nhà hoặc lãi vay ngân hàng.
3. **Barbell FIRE / Coast FIRE:** Không cần nghỉ việc hoàn toàn; chuyển sang làm công việc tự do theo đam mê mang lại thu nhập vừa đủ bù đắp chi phí hàng ngày mà không cần chạm vào vốn đầu tư tích lũy.`,
    },
    {
      id: "ORCA-PERS-DEBT-STRATEGY-03",
      domain: "personal_wealth_mortgage",
      category: "debt_snowball_vs_avalanche",
      systemRole: "personalFinance",
      q: "Đang có 4 khoản nợ: Nợ thẻ tín dụng 30 triệu (lãi 32%/năm), Vay tiêu dùng tín chấp 80 triệu (lãi 22%/năm), Vay người thân 50 triệu (lãi 0%) và Vay mua xe 150 triệu (lãi 10%/năm). Nên trả theo phương pháp Tuyết lở (Debt Avalanche) hay Quả cầu tuyết (Debt Snowball)?",
      a: `### 🎯 CHIẾN LƯỢC XÓA SỔ NỢ NẦN: DEBT AVALANCHE (TOÁN HỌC) VS DEBT SNOWBALL (TÂM LÝ)

Khi rơi vào tình trạng đa khoản nợ với các mức lãi suất và kỳ hạn khác nhau, việc trả nợ không có kế hoạch sẽ khiến bạn kiệt quệ tài chính vì tiền lãi phạt và lãi kép.

---

### 1. BẢNG SO SÁNH 4 KHOẢN NỢ VÀ THỨ TỰ ƯU TIÊN THEO 2 CHIẾN LƯỢC:

| Khoản nợ | Số nợ gốc | Lãi suất/Năm | Trả tối thiểu/tháng | Thứ tự trả theo **Avalanche (Toán học)** | Thứ tự trả theo **Snowball (Tâm lý)** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1. Thẻ tín dụng** | 30.000.000đ | **32%/năm** | ~1.500.000đ | 🥇 **ƯU TIÊN SỐ 1** (Lãi cao nhất) | 🥇 **ƯU TIÊN SỐ 1** (Nợ nhỏ nhất) |
| **2. Vay tín chấp tiêu dùng** | 80.000.000đ | **22%/năm** | ~3.000.000đ | 🥈 **ƯU TIÊN SỐ 2** | 🥉 **ƯU TIÊN SỐ 3** |
| **3. Vay người thân** | 50.000.000đ | **0%/năm** | Tùy thỏa thuận | 4️⃣ **ƯU TIÊN CUỐI** (Không chịu lãi) | 🥈 **ƯU TIÊN SỐ 2** (Dễ xóa sổ thứ 2) |
| **4. Vay mua xe** | 150.000.000đ | **10%/năm** | ~4.500.000đ | 🥉 **ƯU TIÊN SỐ 3** | 4️⃣ **ƯU TIÊN CUỐI** (Nợ lớn nhất) |

---

### 2. PHÂN TÍCH ƯU - NHƯỢC ĐIỂM CỦA TỪNG PHƯƠNG PHÁP:

#### ⚡ Phương pháp Tuyết Lở (Debt Avalanche - Khuyên dùng tối ưu chi phí):
- **Cơ chế:** Trả mức tối thiểu cho tất cả các khoản nợ, dồn toàn bộ nguồn lực tiền mặt thặng dư để **tiêu diệt khoản nợ có lãi suất cao nhất trước** (Thẻ tín dụng 32% $\\to$ Vay tín chấp 22% $\\to$ Vay xe 10% $\\to$ Nợ người thân 0%).
- **Lợi ích:** Tiết kiệm tối đa số tiền lãi phải trả cho ngân hàng, rút ngắn thời gian thoát nợ nhanh nhất về mặt số học.

#### ⛄ Phương pháp Quả Cầu Tuyết (Debt Snowball - Phù hợp nếu đang khủng hoảng tâm lý):
- **Cơ chế:** Xếp các khoản nợ từ **nhỏ nhất đến lớn nhất** bất kể lãi suất. Tập trung thanh toán dứt điểm khoản 30 triệu trước, sau đó tới 50 triệu người thân.
- **Lợi ích:** Mang lại cảm giác chiến thắng tâm lý sớm khi gạch bỏ được từng chủ nợ, tạo động lực kiên trì tiếp tục.

---

### 🛡️ KẾ HOẠCH HÀNH ĐỘNG DỨT KHOÁT TRONG 48 GIỜ:
1. **Đóng băng toàn bộ thẻ tín dụng:** Cất thẻ vào két hoặc hủy tính năng thanh toán online, tuyệt đối không quẹt thẻ phát sinh thêm nợ mới.
2. **Cắt giảm ngân sách sinh hoạt khẩn cấp:** Chuyển sang chế độ chi tiêu thiết yếu tối thiểu (NEC $50\\%$), dồn toàn bộ tiền thưởng, tiền làm thêm ngoài giờ vào khoản nợ số 1.
3. **Đàm phán cơ cấu lại nợ:** Liên hệ ngân hàng chuyển đổi dư nợ thẻ tín dụng sang gói trả góp cố định có lãi suất thấp hơn ($15\\% - 18\\%/năm$) thay vì để lãi phạt lũy tiến $32\\%$.`,
    },
  ];
}
