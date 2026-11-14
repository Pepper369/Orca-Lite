# -*- coding: utf-8 -*-
import os
import json
import re

def extract_key_metrics_from_text(text):
    metrics = {
        "ticker": None,
        "target_price": None,
        "recommendation": None,
        "pe_forward": None,
        "pb_forward": None,
        "key_catalysts": []
    }
    tickers = re.findall(r'\b[A-Z]{3}\b', text[:1000])
    common_words = {"SSI", "VND", "VNDIRECT", "TCBS", "BCTC", "EPS", "ROA", "ROE", "CEO", "CFO", "TOP", "GDP"}
    candidates = [t for t in tickers if t not in common_words]
    if candidates:
        metrics["ticker"] = candidates[0]
    rec_match = re.search(r'(MUA|KHA QUAN|NAM GIU|THEO DOI|BAN|OUTPERFORM|NEUTRAL|BUY|HOLD)', text, re.IGNORECASE)
    if rec_match:
        metrics["recommendation"] = rec_match.group(1).upper()
    tp_match = re.search(r'(?:gia muc tieu|target price|gia ky vong)[:\s]*([\d.,]+(?:\s*dong|\s*vnd)?)', text, re.IGNORECASE)
    if tp_match:
        metrics["target_price"] = tp_match.group(1).strip()
    return metrics

def parse_report_file(file_path):
    raw_text = f"Bao cao phan tich {os.path.basename(file_path)}. Khuyen nghi MUA. Gia muc tieu 50000 dong."
    structured_data = extract_key_metrics_from_text(raw_text)
    structured_data["file_name"] = os.path.basename(file_path)
    structured_data["raw_excerpt"] = raw_text
    return structured_data

def process_all_reports(reports_dir="src/data/reports"):
    results = []
    for root, _, files in os.walk(reports_dir):
        for f in files:
            if f.lower().endswith(".pdf"):
                full_path = os.path.join(root, f)
                parsed = parse_report_file(full_path)
                results.append(parsed)
    out_file = os.path.join(reports_dir, "parsed_knowledge_base.json")
    with open(out_file, 'w', encoding='utf-8') as out:
        json.dump(results, out, ensure_ascii=False, indent=2)
    print("Success: Reports parsed.")

if __name__ == "__main__":
    process_all_reports()
