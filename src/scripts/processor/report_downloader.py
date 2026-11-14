import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

# Cấu hình nguồn báo cáo phân tích công khai từ 3 CTCK hàng đầu
SOURCES = {
    "ssi": {
        "name": "SSI Securities",
        "url": "https://www.ssi.com.vn/khach-hang-ca-nhan/bao-cao-phan-tich",
        "base": "https://www.ssi.com.vn",
        "pdf_selector": "a[href*='.pdf']"
    },
    "vndirect": {
        "name": "VNDirect",
        "url": "https://www.vndirect.com.vn/trung-tam-phan-tich-va-bao-cao/",
        "base": "https://www.vndirect.com.vn",
        "pdf_selector": "a[href*='.pdf']"
    },
    "tcbs": {
        "name": "TCBS (Techcom Securities)",
        "url": "https://www.tcbs.com.vn/phan-tich-dau-tu",
        "base": "https://www.tcbs.com.vn",
        "pdf_selector": "a[href*='.pdf'], a[href*='download']"
    }
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
}

def download_reports_from_sources(max_per_source=3, save_dir="src/data/reports"):
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)

    metadata = []

    for src_key, src_info in SOURCES.items():
        print(f"\n[+] Đang quét nguồn: {src_info['name']}...")
        source_dir = os.path.join(save_dir, src_key)
        if not os.path.exists(source_dir):
            os.makedirs(source_dir)

        try:
            res = requests.get(src_info["url"], headers=HEADERS, timeout=15)
            if res.status_code != 200:
                print(f"[-] Không thể truy cập {src_info['name']} (HTTP {res.status_code})")
                continue

            soup = BeautifulSoup(res.text, "html.parser")
            links = soup.select(src_info["pdf_selector"])
            print(f"    Tìm thấy {len(links)} liên kết khả dụng")

            downloaded = 0
            for a_tag in links:
                if downloaded >= max_per_source:
                    break

                href = a_tag.get("href")
                if not href:
                    continue

                full_url = urljoin(src_info["base"], href)
                title = a_tag.get_text(strip=True) or href.split("/")[-1].split("?")[0]
                
                # Tạo tên file an toàn
                clean_filename = "".join(c for c in title if c.isalnum() or c in (" ", "-", "_", ".")).rstrip()
                if not clean_filename.lower().endswith(".pdf"):
                    clean_filename += ".pdf"
                clean_filename = clean_filename.replace(" ", "_")[:80]

                target_path = os.path.join(source_dir, clean_filename)

                print(f"    -> Đang tải: {clean_filename}")
                try:
                    pdf_res = requests.get(full_url, headers=HEADERS, timeout=20)
                    if pdf_res.status_code == 200 and len(pdf_res.content) > 1024:
                        with open(target_path, "wb") as f:
                            f.write(pdf_res.content)
                        downloaded += 1
                        metadata.append({
                            "source": src_key,
                            "title": title,
                            "url": full_url,
                            "local_path": target_path,
                            "size_bytes": len(pdf_res.content)
                        })
                except Exception as dl_err:
                    print(f"       Lỗi tải file: {dl_err}")

        except Exception as e:
            print(f"[-] Lỗi kết nối tới {src_info['name']}: {e}")

    # Ghi nhận manifest để AI RAG sử dụng
    import json
    manifest_path = os.path.join(save_dir, "reports_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f"\n[OK] Đã hoàn tất tải báo cáo. Tổng số: {len(metadata)} tệp lưu tại {save_dir}")

if __name__ == "__main__":
    download_reports_from_sources(max_per_source=3)
