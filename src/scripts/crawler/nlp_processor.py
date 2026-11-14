import json
import random

# Gi? l?p mô hình Sentiment don gi?n (Dùng thu vi?n transformer th?c t? s? m?nh hon)
def analyze_sentiment(title):
    # M?t ví d? don gi?n: ki?m tra t? khóa tích c?c/tiêu c?c
    positive_words = ['tang', 'bùng n?', 'l?i nhu?n', 'k? l?c', 'd?t phá', 'h?p d?n']
    negative_words = ['gi?m', 'l?', 'ph?t', 'c?nh báo', 'v? n?', 'bán tháo']
    
    score = 0
    for word in positive_words:
        if word in title.lower(): score += 1
    for word in negative_words:
        if word in title.lower(): score -= 1
        
    if score > 0: return 'Tích c?c'
    if score < 0: return 'Tiêu c?c'
    return 'Trung tính'

def process_news():
    with open('src/data/news/news_library.json', 'r', encoding='utf-8') as f:
        news = json.load(f)
        
    for item in news:
        item['sentiment'] = analyze_sentiment(item['title'] or "")
        
    with open('src/data/news/news_library.json', 'w', encoding='utf-8') as f:
        json.dump(news, f, ensure_ascii=False, indent=4)
    print(f"Ðã c?p nh?t sentiment cho {len(news)} tin t?c.")

if __name__ == "__main__":
    process_news()
