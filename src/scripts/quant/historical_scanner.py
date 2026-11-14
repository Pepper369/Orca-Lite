import pandas as pd
from vnstock_data import Market
from datetime import datetime, timedelta
import os
import time

def scan_historical_data(save_dir="src/data/historical"):
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
        
    market = Market()
    print("[+] Đang lấy danh sách toàn bộ mã chứng khoán...")
    symbols = market.reference.listing_companies()['symbol'].unique().tolist()
    
    # Giới hạn thử nghiệm cho 20 mã tiêu biểu đầu tiên
    target_symbols = symbols[:20]
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=5*365)).strftime('%Y-%m-%d')
    
    print(f"[+] Bắt đầu quét 5 năm lịch sử cho {len(target_symbols)} mã...")
    
    master_df = []
    
    for symbol in target_symbols:
        try:
            print(f"    -> Đang quét: {symbol}")
            # Lấy dữ liệu OHLCV 5 năm
            df = market.equity(symbol=symbol, start_date=start_date, end_date=end_date)
            if df.empty: continue
            
            # Làm giàu dữ liệu: thêm Symbol
            df['symbol'] = symbol
            master_df.append(df)
            
            # Delay nhẹ để tránh áp lực API
            time.sleep(0.5)
        except Exception as e:
            print(f"       Lỗi quét {symbol}: {e}")
            
    if master_df:
        final_df = pd.concat(master_df)
        out_file = os.path.join(save_dir, "master_historical_5y.csv")
        final_df.to_csv(out_file, index=False)
        print(f"[OK] Đã xuất dữ liệu lịch sử thành công: {out_file}")

if __name__ == "__main__":
    scan_historical_data()
