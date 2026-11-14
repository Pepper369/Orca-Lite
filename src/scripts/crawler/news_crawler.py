import json
import requests
from bs4 import BeautifulSoup
from datetime import datetime

# Danh sách các ngu?n tin c?n l?y tin
SOURCES = {
    "cafef": "https://cafef.vn/thi-truong-chung-khoan.chn",
    "vietstock": "https://vietstock.vn/chung-khoan.htm"
}

def crawl_news():
    news_data = []
    for source, url in SOURCES.items():
        try:
            print(f"Ðang l?y tin t? {source}...")
            response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Logic don gi?n hóa d? l?y tiêu d? và link
            # Th?c t? s? c?n CSS selector c? th? cho t?ng ngu?n
            if source == "cafef":
                items = soup.select('.ul-image-list li h3 a')
            else:
                items = soup.select('.news-list li a')
                
            for item in items:
                news_data.append({
                    "source": source,
                    "title": item.get('title'),
                    "link": "https://cafef.vn" + item.get('href') if source == "cafef" else item.get('href'),
                    "timestamp": datetime.now().isoformat()
                })
        except Exception as e:
            print(f"L?i khi crawl {source}: {e}")
            
    # Luu vào t?p JSON
    with open('src/data/news/news_library.json', 'w', encoding='utf-8') as f:
        json.dump(news_data, f, ensure_ascii=False, indent=4)
    print(f"Ðã luu {len(news_data)} tin t?c.")

if __name__ == "__main__":
    crawl_news()
