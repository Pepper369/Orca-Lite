/**
 * ORCA-FA SFT DATASET V2 EXTENSION CASES
 * Curated Institutional Financial Scenarios for Screener, Commodities Macro, and Forensic Accounting.
 */

export interface ExtensionCase {
  id: string;
  category: string;
  q: string;
  a: string;
}

export function getScreenerFilterCases(): ExtensionCase[] {
  return [
    {
      id: "ORCA-SCR-GOLD-01",
      category: "screener_value_growth",
      q: "Hãy tìm cho tôi những cổ phiếu có tiêu chí ROE > 20%, P/E < 12 và nợ thấp.",
      a: `### 🎯 BỘ TIÊU CHÍ SÀNG LỌC ĐÃ CHUẨN HÓA:
• **ROE ≥ 20.0%:** Đo lường hiệu quả sinh lời trên mỗi đồng vốn chủ sở hữu, đảm bảo doanh nghiệp có lợi thế cạnh tranh con hào kinh tế (Moat).
• **P/E ≤ 12.0x:** Định giá tương đối rẻ, chiết khấu sâu so với trung bình 5 năm của chỉ số VN-Index (quanh mức 13.5 - 14.5x).
• **Nợ/Vốn CSH (D/E) ≤ 0.8:** Cơ cấu tài chính an toàn, đệm thanh khoản dồi dào, kháng cự tốt trước áp lực biến động lãi suất.
• **Thanh khoản tối thiểu:** Giá trị khớp lệnh trung bình 20 phiên $\\ge 5$ tỷ VNĐ/ngày (loại trừ hoàn toàn các mã penny thanh khoản thấp).

### 📊 BẢNG XẾP HẠNG TOP CỔ PHIẾU ĐẠT TIÊU CHÍ:
| Hạng | Mã CP | Tên Doanh Nghiệp | Ngành | Thị giá (VND) | P/E (x) | P/B (x) | ROE (%) | Cổ tức (%) | D/E | F-Score | Vị thế Vùng Vàng Apex |
| :---: | :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 🥇 1 | **MBB** | Ngân hàng Quân Đội | Ngân hàng | 24.100đ | 5.8x | 1.1x | 23.8% | 5.0% | — | 7/9 | 3.2% (Vùng Vàng) |
| 🥈 2 | **VNM** | Vinamilk | Thực phẩm & Đồ uống | 68.500đ | 14.2x | 3.1x | 22.4% | 6.2% | 0.28 | 8/9 | 1.8% (Tích lũy nền) |
| 🥉 3 | **TCB** | Techcombank | Ngân hàng | 24.500đ | 6.4x | 1.0x | 18.2% | 4.5% | — | 7/9 | 1.5% (Tích lũy nền) |
| 4 | **HPG** | Tập đoàn Hòa Phát | Thép | 27.800đ | 11.2x | 1.5x | 16.5% | 4.0% | 0.54 | 7/9 | 2.1% (Chân sóng Apex) |

---
### 🔬 PHÂN TÍCH ĐIỂM SÁNG ĐỘNG LỰC CỦA TOP 3 MÃ NỔI BẬT:

#### 🥇 **MBB - Ngân hàng TMCP Quân Đội (P/E 5.8x | ROE 23.8%)**
- **Con hào kinh tế:** Tỷ lệ tiền gửi không kỳ hạn CASA thuộc top đầu hệ thống (~40%), giúp ngân hàng tối ưu hóa chi phí vốn đầu vào (COF) vượt trội so với các NHTM cổ phần cùng quy mô.
- **Sức mạnh định giá:** P/B hiện tại 1.1x chiết khấu sâu so với ROE 23.8% và CAGR lợi nhuận ròng 15%/năm trong 5 năm qua.
- **Chất lượng tài sản:** Tỷ lệ bao phủ nợ xấu (LLR) duy trì trên 100%, trích lập dự phòng đầy đủ cho danh mục cho vay bán lẻ và doanh nghiệp vừa và nhỏ.

#### 🥈 **VNM - Công ty Cổ phần Sữa Việt Nam (P/E 14.2x | ROE 22.4%)**
- **Chất lượng dòng tiền:** Vị thế độc quyền tự nhiên ngành sữa với thị phần >50%. Dòng tiền thuần từ HĐKD (CFO) đạt hơn 10.000 tỷ/năm, tỷ lệ dồn tích Sloan Accrual âm thể hiện lợi nhuận bằng tiền thật 100%.
- **Chính sách cổ tức:** Chi trả cổ tức tiền mặt bền vững 3.500 - 4.000đ/cp đều đặn, tỷ suất cổ tức thực tế đạt 6.2%/năm, thay thế hoàn hảo cho lãi suất tiền gửi 12 tháng.
- **Đòn bẩy nợ:** Nợ vay ròng âm (Net Cash), cơ cấu tài sản an toàn bậc nhất thị trường niêm yết.

#### 🥉 **TCB - Ngân hàng TMCP Kỹ Thương Việt Nam (P/E 6.4x | P/B 1.0x)**
- **Nền tảng an toàn vốn:** Tỷ lệ an toàn vốn CAR đạt >15% (theo chuẩn Basel II), cao nhất hệ thống ngân hàng Việt Nam.
- **Xúc tác phục hồi:** Hưởng lợi lớn nhất từ sự phục hồi của thị trường bất động sản dân cư và thị trường trái phiếu doanh nghiệp, giúp thu nhập ngoài lãi (NFI) và phí dịch vụ ngân hàng đầu tư tăng tốc.

---
### ⚠️ CẢNH BÁO BẪY SỐ LIỆU ĐỊNH LƯỢNG (FILTER CAVEATS):
1. **Bẫy P/E thấp ở đỉnh chu kỳ:** Đặc biệt với nhóm Thép, Hóa chất, Cảng biển. Khi giá hàng hóa ở đỉnh, lợi nhuận đột biến làm P/E rơi xuống mức thấp lịch sử 3-4x. Cần nhìn vào P/B và chu kỳ vòng quay hàng tồn kho thay vì mua đuổi theo P/E.
2. **Kiểm tra Khoản phải thu khác:** Luôn đối soát BCTC quý để xác nhận doanh thu/lợi nhuận không bị ứ đọng tại mục Phải thu ngắn hạn của các bên liên quan.
3. **Đo lường cản trên đầu (Overhead Room):** Bắt buộc khoảng trống an toàn tới cản kháng cự cứng gần nhất phải $\ge 5.0\%$ để phòng vệ rủi ro kẹt hàng ngắn hạn T+2.5.

### 🛡️ CHIẾN LƯỢC GIẢI NGÂN & KẾ HOẠCH TRIPLE-BARRIER:
- **Vùng tích lũy giải ngân:** Mua thăm dò trong **Vùng Vàng Sweet Launch Zone (cách đáy $0.8\\% - 7.5\\%$)**. Tuyệt đối không mua đuổi các mã đã chạy quá $> 8.5\%$ từ nền.
- **Ngưỡng chặn lỗ cứng:** Kỷ luật cắt lỗ khi vi phạm mức $1.0 \\times \\text{ATR}(14)$ (tương đương biên độ $5.0\\% - 7.0\\%$).
- **Mục tiêu chốt lời:** Thiết lập mục tiêu Take Profit 1 & 2 đảm bảo tỷ số Lợi nhuận/Rủi ro $R:R \\ge 2.2\\text{x}$.

> ⚠️ **Khuyến cáo:** Nội dung phân tích trên do ORCA FA AI tổng hợp dựa trên dữ liệu báo cáo tài chính và biến động thị trường thời gian thực, chỉ mang tính chất tham khảo và nghiên cứu định lượng. Không được coi là lời mời chào mua bán chứng khoán hay cam kết lợi nhuận đầu tư.`
    },
    {
      id: "ORCA-SCR-GOLD-02",
      category: "screener_dividend_yield",
      q: "Lọc các mã có cổ tức tiền mặt trên 7% và nợ vay ròng an toàn để thay thế gửi tiết kiệm ngân hàng.",
      a: `### 🎯 BỘ TIÊU CHÍ SÀNG LỌC ĐÃ CHUẨN HÓA:
• **Tỷ suất cổ tức tiền mặt (Dividend Yield) ≥ 7.0%/năm:** Vượt trội so với mặt bằng lãi suất tiền gửi tiết kiệm ngân hàng 12 tháng (hiện quanh 5.0% - 5.5%/năm).
• **Cơ cấu vốn sạch (Net Cash):** Lượng tiền mặt và tiền gửi ngắn hạn lớn hơn tổng nợ vay tài chính, đảm bảo không có rủi ro áp lực lãi suất.
• **Tỷ lệ chi trả (Payout Ratio) an toàn 50% - 80%:** Doanh nghiệp trả cổ tức hoàn toàn từ lợi nhuận kinh doanh cốt lõi (Core EBIT), không phải vay nợ để trả cổ tức.
• **Lịch sử chi trả bền vững:** Duy trì cổ tức tiền mặt đều đặn tối thiểu 3 - 5 năm liên tiếp.

### 📊 BẢNG XẾP HẠNG TOP CỔ PHIẾU CỔ TỨC TIỀN MẶT BỀN VỮNG:
| Hạng | Mã CP | Tên Doanh Nghiệp | Ngành | Thị giá (VND) | Cổ tức (%) | P/E (x) | P/B (x) | ROE (%) | Tiền ròng (Tỷ) | F-Score | Vị thế Kỹ thuật |
| :---: | :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 🥇 1 | **VEA** | Tổng Công ty Máy Động Lực | Ô tô & Phụ tùng | 44.500đ | 10.2% | 8.8x | 2.1x | 24.5% | +13.500 | 8/9 | Tích lũy tạo nền |
| 🥈 2 | **DPM** | Đạm Phú Mỹ | Hóa chất & Phân bón | 33.200đ | 7.8% | 11.5x | 1.1x | 12.8% | +6.200 | 7/9 | Chân sóng phục hồi |
| 🥉 3 | **VNM** | Vinamilk | Tiêu dùng thực phẩm | 68.500đ | 6.2% | 14.2x | 3.1x | 22.4% | +2.100 | 8/9 | Tích lũy nền |
| 4 | **REE** | Cơ Điện Lạnh | Điện lực & Tiện ích | 65.200đ | 5.5% | 10.2x | 1.3x | 15.6% | +1.800 | 8/9 | Nền giá dài hạn |

---
### 🔬 ĐIỂM SÁNG ĐỘNG LỰC CỦA CÁC DOANH NGHIỆP CỔ TỨC TIỀN MẶT HÀNG ĐẦU:
• **VEA (Tỷ suất 10.2%/năm):** Cỗ máy in tiền mặt từ 3 liên doanh xe hàng đầu Việt Nam: Toyota (20%), Honda (30%) và Ford (25%). Hàng năm nhận cổ tức tiền mặt từ các liên doanh 5.000 - 7.000 tỷ VNĐ và trả gần như toàn bộ cho cổ đông.
• **DPM (Tỷ suất 7.8%/năm):** Bảng cân đối kế toán cực sạch với hơn 6.000 tỷ tiền gửi ngân hàng, nhà máy Đạm Phú Mỹ đã hết khấu hao lớn giúp tạo ra dòng tiền tự do dồi dào.
• **VNM (Tỷ suất 6.2%/năm):** Thương hiệu sữa quốc dân, Payout Ratio ~75% dòng tiền thật, thích hợp làm tài sản phòng thủ lõi cho danh mục hưu trí.

### ⚠️ LƯU Ý KHI ĐẦU TƯ CỔ TỨC:
1. **Ngày Giao Dịch Không Hưởng Quyền (GDKHQ):** Giá cổ phiếu sẽ bị điều chỉnh giảm tương ứng với giá trị cổ tức nhận được vào ngày GDKHQ theo quy định sàn HOSE/HNX. Nhà đầu tư tích sản dài hạn nên tận dụng nhịp điều chỉnh này để tái đầu tư cổ tức với mức giá chiết khấu.
2. **Thuế TNCN cổ tức:** Cổ tức bằng tiền mặt chịu thuế TNCN 5% khấu trừ trực tiếp tại nguồn.

> ⚠️ **Khuyến cáo:** Dữ liệu tính toán dựa trên mức chi trả cổ tức lịch sử và biến động thị giá thời gian thực, chỉ mang tính chất nghiên cứu định lượng.`
    },
    {
      id: "ORCA-SCR-GOLD-03",
      category: "screener_apex_confluence",
      q: "Tìm các mã bước vào Vùng Vàng Chân Sóng Apex (cách đáy 0.8% - 7.5%) có cản trên đầu Overhead Room >= 5% và R:R >= 2.2x.",
      a: `### 🎯 BỘ TIÊU CHÍ SÀNG LỌC 👑 CHÂN SÓNG APEX (APEX CONFLUENCE ENGINE):
• **Khóa Vùng Vàng (Sweet Launch Zone 0.8% - 7.5%):** Cổ phiếu vừa chớm đảo chiều thoát đáy và tái tích lũy an toàn trong phạm vi tối đa 7.5%. Tự động loại bỏ các mã chạy quá trớn (>8.5% Extended).
• **Cấu trúc Wyckoff Spring & Cạn Cung:** Kiểm định nhịp rũ bỏ quét thanh khoản cắt lỗ (Liquidity Sweep) rồi rút chân pin-bar kèm Volume cạn kiệt (Volume Dry Up).
• **Đo Lường Dư Địa Cản Trên Đầu (Overhead Room ≥ 5.0%):** Khoảng trống an toàn từ giá hiện tại tới các vùng kẹp hàng cản cứng (MA20/MA50) phải đủ lớn $\\ge 5.0\\%$ để không dính cản T+2.5.
• **Thiết lập Triple-Barrier Kỷ luật ($R:R \ge 2.2\text{x}$):** Đảm bảo lợi nhuận mục tiêu vượt trội so với rủi ro cắt lỗ ATR.

### 📊 BẢNG XẾP HẠNG TOP MÃ ĐẠT TIÊU CHÍ 👑 CHÂN SÓNG APEX:
| Hạng | Mã CP | Tên Doanh Nghiệp | Ngành | Thị giá (VND) | Khoảng cách Đáy (%) | Cản trên Overhead (%) | Điểm Mua (Buy Range) | Cắt Lỗ (SL ATR) | Mục tiêu (TP 1) | Tỷ số R:R |
| :---: | :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 🥇 1 | **HPG** | Tập đoàn Hòa Phát | Thép | 27.800đ | +2.1% (Chân sóng) | 7.8% | 27.300 - 27.800 | 26.200đ (-5.7%) | 31.500đ (+13.3%) | **2.33x** |
| 🥈 2 | **MBB** | Ngân hàng Quân Đội | Ngân hàng | 24.100đ | +3.2% (Vùng Vàng) | 6.5% | 23.800 - 24.200 | 22.800đ (-5.4%) | 27.200đ (+12.8%) | **2.37x** |
| 🥉 3 | **REE** | Cơ Điện Lạnh | Năng lượng | 65.200đ | +1.2% (Tích lũy) | 8.2% | 64.500 - 65.500 | 61.800đ (-5.2%) | 73.500đ (+12.7%) | **2.44x** |

---
### 🔬 KẾ HOẠCH HÀNH ĐỘNG THỰC CHIẾN (EXECUTION PLAYBOOK):
1. **Giải ngân chia 2 vị thế:** Giải ngân 40% vị thế thăm dò ngay trong Vùng Vàng; giải ngân nốt 60% khi cổ phiếu xác nhận cây nến Breakout vô hiệu hóa cản trên đầu kèm Volume đột biến gấp 1.5 lần bình quân 20 phiên ($V/V_{20} \\ge 1.5$).
2. **Kỷ luật Stop-Loss:** Nếu giá đóng cửa ngày xuyên thủng mốc Invalidation Point (ngưỡng cắt lỗ theo ATR), lập tức hạ vị thế để bảo toàn vốn, tuyệt đối không trung bình giá xuống.

> ⚠️ **Khuyến cáo:** Dữ liệu tính toán từ mô hình định lượng vi cấu trúc thị trường Orca Apex, chỉ mang tính chất nghiên cứu khoa học đầu tư.`
    }
  ];
}

export function getCommodityMacroCases(): ExtensionCase[] {
  return [
    {
      id: "ORCA-COMM-GOLD-01",
      category: "commodity_oil_gas_transmission",
      q: "Giá dầu thô Brent tăng vượt 90 USD/thùng thì chuỗi cổ phiếu dầu khí PVD, PVS, BSR, PLX hưởng lợi hay chịu rủi ro như thế nào?",
      a: `### 🛢️ CƠ CHẾ TRUYỀN DẪN VĨ MÔ: GIÁ DẦU THÔ BRENT → TTCK VIỆT NAM
Khi giá dầu Brent thế giới duy trì trên vùng cao ($\\ge 85 - 90\\text{ USD/thùng}$), tác động lên nhóm cổ phiếu Dầu khí tại Việt Nam có sự **phân hóa sâu sắc theo chuỗi giá trị (Thượng nguồn / Trung nguồn / Hạ nguồn)**:

$$\\text{Biên Lợi Nhuận Gộp}_{t} = f(\\text{Giá Dầu Brent}_{t-1}, \\text{Giá Thuê Giàn}_{t}, \\text{Crack Spread}_{t})$$

---
### 📊 PHÂN TÍCH TÁC ĐỘNG TỪNG MÃ THEO CHUỖI GIÁ TRỊ:

| Mã CP | Vị trí Chuỗi Giá Trị | Mức Độ Hưởng Lợi | Cơ Chế Tác Động Cốt Lõi | Độ Trễ Phản Ánh Vào BCTC |
| :---: | :--- | :---: | :--- | :---: |
| **PVD** | Thượng nguồn (Khoan & Giàn khoan) | 🟢 **HƯỞNG LỢI MẠNH** | Giá thuê giàn khoan tự nâng (Jack-up) neo theo giá dầu thế giới; tăng từ 85.000 USD lên >110.000 USD/ngày; hiệu suất sử dụng giàn đạt 100%. | **2 - 4 Quý** (ký hợp đồng dài hạn) |
| **PVS** | Thượng nguồn (Dịch vụ Kỹ thuật & M&C) | 🟢 **HƯỞNG LỢI BỀN VỮNG** | Khối lượng công việc EPCI các đại dự án thượng nguồn (Lô B Ô Môn, Lạc Đà Vàng) và điện gió ngoài khơi tăng tốc nhờ nguồn vốn đầu tư E&P mở rộng. | **1 - 3 Năm** (theo tiến độ nghiệm thu) |
| **BSR** | Hạ nguồn (Lọc hóa dầu) | 🟡 **HAI MẶT (TÙY CRACK SPREAD)** | Hưởng lợi ngắn hạn nhờ hoàn nhập dự phòng giảm giá hàng tồn kho; tuy nhiên lợi nhuận thực tế phụ thuộc vào **Crack Spread** (chênh lệch giữa giá xăng dầu thành phẩm và giá dầu thô đầu vào). | **1 Quý** (vòng quay tồn kho ~30-45 ngày) |
| **PLX** | Hạ nguồn (Phân phối bán lẻ xăng dầu) | 🟡 **ỔN ĐỊNH / BIÊN CỐ ĐỊNH** | Hoạt động phân phối xăng dầu hưởng chi phí định mức theo Nghị định 80/2023; giá dầu tăng nhanh đột ngột có thể gây rủi ro trễ chu kỳ điều hành giá. | **1 - 2 Tháng** |

---
### 💡 KHUYẾN NGHỊ ĐỊNH LƯỢNG CHO NHÀ ĐẦU TƯ:
1. **Né bẫy mua đuổi theo phiên biến động giá dầu thế giới:** Giá dầu đêm qua tăng mạnh thì sáng hôm sau cổ phiếu dầu khí thường mở Gap ATO tăng hưng phấn rồi bị chốt lời intraday.
2. **Chiến lược đầu tư chuẩn:** Ưu tiên nhóm Thượng nguồn (PVS, PVD) có backlog công việc vững chắc cho chu kỳ 3 - 5 năm tới thay vì lướt sóng biến động ngắn hạn của giá dầu thô.

> ⚠️ **Khuyến cáo:** Báo cáo phân tích vĩ mô hàng hóa do Orca FA tổng hợp dựa trên dữ liệu chuỗi giá trị năng lượng thực tế.`
    },
    {
      id: "ORCA-COMM-GOLD-02",
      category: "commodity_steel_hrc_transmission",
      q: "Giá thép HRC và quặng sắt thế giới hạ nhiệt tác động thế nào tới biên lợi nhuận gộp của Hòa Phát (HPG), Hoa Sen (HSG) và Nam Kim (NKG)?",
      a: `### 🏭 CƠ CHẾ TRUYỀN DẪN: QUẶNG SẮT & THÉP CUỘN CÁN NÓNG (HRC) → NGÀNH THÉP VIỆT NAM
Ngành thép Việt Nam có sự đối lập rõ rệt giữa **Doanh nghiệp Thượng nguồn sản xuất thép thô khép kín (HPG)** và **Doanh nghiệp Hạ nguồn nhập HRC về cán tôn mạ xuất khẩu (HSG, NKG)**:

$$\\Delta \\text{Gross Margin}_{\\text{HPG}} = \\text{ASP (Giá Thép Xây Dựng/HRC)} - [\\text{Quặng Sắt} \\times 1.6 + \\text{Than Mỡ} \\times 0.7]$$
$$\\Delta \\text{Gross Margin}_{\\text{HSG, NKG}} = \\text{ASP (Tôn Mạ, Ống Thép)} - \\text{Giá Nhập HRC}_{t-2}$$

---
### 📊 BẢNG SO SÁNH TÁC ĐỘNG ĐỊNH LƯỢNG:

| Tiêu Chí | **HPG (Hòa Phát)** | **HSG (Hoa Sen) & NKG (Nam Kim)** |
| :--- | :--- | :--- |
| **Vị thế công nghệ** | Lò cao khép kín (BF-BOF), tự sản xuất từ quặng sắt thành phôi và HRC. | Mua thép cuộn HRC đầu vào để tẩy rỉ, cán nguội và mạ kẽm/mạ màu. |
| **Khi Quặng sắt & Than giảm** | 🟢 **Biên lợi nhuận gộp mở rộng mạnh:** Chi phí sản xuất thép lỏng giảm nhanh hơn giá bán thành phẩm. | ⚪ **Ít ảnh hưởng trực tiếp:** Phụ thuộc vào giá HRC của các nhà máy cán thép. |
| **Khi Giá HRC thế giới giảm** | 🟡 **Tác động vừa phải:** Giá bán HRC nội địa bị cạnh tranh nhưng HPG có biên tự chủ chi phí cực thấp (~11 - 13% biên gộp). | 🔴 **Rủi ro lớn trích lập hàng tồn kho:** Tồn kho HRC giá cao trong 60-90 ngày trước đó buộc phải trích lập dự phòng giảm giá, ăn mòn lợi nhuận quý. |
| **Độ trễ phản ánh vào BCTC** | **1 Quý** (Vòng quay nguyên liệu quặng sắt/than cốc ~45-60 ngày). | **1 - 2 Quý** (Độ trễ đơn hàng xuất khẩu đi Mỹ/EU và tồn kho HRC). |

---
### 🛡️ NGUYÊN TẮC HÀNH ĐỘNG KỶ LUẬT:
• **HPG:** Phù hợp cho chiến lược tích sản theo chu kỳ tăng trưởng công suất đại dự án Dung Quất 2.
• **HSG / NKG:** Chỉ giải ngân theo sóng hàng hóa khi giá HRC thế giới tạo đáy đi lên và biên chênh lệch (Spread Tôn - HRC) mở rộng vượt ngưỡng 120 USD/tấn.

> ⚠️ **Khuyến cáo:** Nội dung nghiên cứu vĩ mô chu kỳ hàng hóa do Orca FA tổng hợp chỉ mang tính chất tham khảo định lượng.`
    }
  ];
}

export function getForensicRiskCases(): ExtensionCase[] {
  return [
    {
      id: "ORCA-FRN-GOLD-01",
      category: "forensic_paper_profit_trap",
      q: "Vì sao doanh nghiệp bất động sản báo lãi đột biến nhưng dòng tiền thuần HĐKD (CFO) lại âm sâu? Nhận diện bẫy lợi nhuận giấy như thế nào?",
      a: `### 🚨 BÓC TÁCH PHÁP Y KẾ TOÁN: BẪY LỢI NHUẬN TRÊN GIẤY (ACCRUALS TRAP)
Trong kiểm toán và phân tích định chế, sự phân kỳ nghiêm trọng giữa **Lợi nhuận sau thuế (LNST)** trên Báo cáo Kết quả Kinh doanh và **Dòng tiền thuần từ Hoạt động Kinh doanh (CFO)** trên Báo cáo Lưu chuyển Tiền tệ là **Cờ Đỏ (Red Flag) số 1** cảnh báo rủi ro thanh khoản.

---
### 1. CÔNG THỨC TOÁN HỌC ĐO LƯỜNG TỶ LỆ DỒN TÍCH (SLOAN ACCRUAL RATIO)
$$\\text{Sloan Accrual Ratio} = \\frac{\\text{Net Income (LNST)} - \\text{CFO (Dòng tiền HĐKD)}}{\\text{Average Total Assets (Tổng Tài Sản Bình Quân)}}$$

- **Vùng An Toàn:** $\\text{Accrual Ratio} \\le 5.0\\%$ kèm $\\text{CFO} > 0$.
- **Vùng Cảnh Báo:** $5.0\\% < \\text{Accrual Ratio} \\le 10.0\\%$.
- **Vùng Nguy Hiểm Cực Đoan (Bẫy Lợi Nhuận Giấy):** $\\text{Accrual Ratio} > 10.0\\%$ hoặc $\\text{CFO} < 0$ liên tục từ 2 đến 4 quý.

---
### 2. BẢN CHẤT CÁC THỦ THUẬT LÀM ĐẸP BCTC KHI DÒNG TIỀN ÂM:
1. **Lợi nhuận tài chính từ đánh giá lại tài sản hoặc chuyển nhượng cổ phần nội bộ:** Doanh nghiệp bán dự án hoặc cổ phần công ty con cho một đối tác liên quan với giá định giá cao ngất ngưởng. Kế toán ghi nhận khoản lãi hàng trăm tỷ vào Báo cáo KQKD nhưng bên mua **chưa trả tiền**, toàn bộ số tiền đó nằm ở mục **"Khoản phải thu ngắn hạn khác"** trên Bảng Cân đối Kế toán.
2. **Ghi nhận doanh thu trước khi đủ điều kiện bàn giao:** Bàn giao dự án trên giấy hoặc ép ghi nhận doanh thu xây lắp để hoàn thành kế hoạch ĐHCĐ.
3. **Chi phí lãi vay được vốn hóa vào Hàng tồn kho:** Thay vì hạch toán chi phí tài chính làm giảm lợi nhuận, doanh nghiệp vốn hóa hàng trăm tỷ lãi vay vào giá trị dự án dở dang, che giấu gánh nặng nợ thực tế.

---
### 3. HẬU QUẢ VÀ KỊCH BẢN THIỆT HẠI:
• **Mất khả năng thanh toán nợ đáo hạn:** Lợi nhuận không quy đổi thành tiền mặt, doanh nghiệp không có tiền trả gốc và lãi trái phiếu/ngân hàng.
• **Hiện tượng "Kẹt sàn T+2.5":** Khi sự thật về dòng tiền vỡ lở, cổ phiếu thường mất thanh khoản trắng bảng bên mua liên tiếp, nhà đầu tư không thể thoát hàng.

### 🛡️ KHUYẾN NGHỊ HÀNH ĐỘNG DỨT KHOÁT:
- **Kiên quyết ĐỨNG NGOÀI:** Tuyệt đối không mua vì chỉ số P/E thấp khi $\\text{CFO}$ âm sâu.
- **Tiêu chuẩn vàng:** Chỉ giải ngân vào doanh nghiệp có tỷ số $\\text{CFO} / \\text{LNST} \\ge 0.8$ liên tục trong 3 năm.

> ⚠️ **Khuyến cáo:** Báo cáo pháp y kế toán do Orca FA AI thực hiện độc lập dựa trên nguyên tắc kiểm toán chuẩn mực quốc tế.`
    }
  ];
}
