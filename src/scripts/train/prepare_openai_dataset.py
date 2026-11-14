import json
import os

def create_openai_finetune_set(reports_file='src/data/reports/parsed_knowledge_base.json', output_file='src/data/training/orca_fin_data.jsonl'):
    if not os.path.exists('src/data/training'):
        os.makedirs('src/data/training')
        
    with open(reports_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    with open(output_file, 'w', encoding='utf-8') as f:
        for entry in data:
            if entry.get('ticker') and entry.get('recommendation'):
                training_entry = {
                    "messages": [
                        {"role": "system", "content": "Ban la chuyen gia tai chinh Orca AI, chuyen phan tich thi truong Viet Nam."},
                        {"role": "user", "content": f"Phan tich co phieu {entry['ticker']} dua tren bao cao phan tich."},
                        {"role": "assistant", "content": f"Khuyen nghi cho {entry['ticker']} la {entry['recommendation']}. Gia muc tieu: {entry['target_price'] or 'Chua xac dinh'}."}
                    ]
                }
                f.write(json.dumps(training_entry, ensure_ascii=False) + '\n')
    
    print("Success: Dataset ready.")

if __name__ == '__main__':
    create_openai_finetune_set()
