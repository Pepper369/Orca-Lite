# Orca Financial Fine-Tuned GGUF Model (`Qwen2.5-3B-Instruct` QLoRA — Không cần Ollama)

Thư mục này chứa tệp trọng số `.gguf` đã train từ Google Colab ([orca_fa_colab_training.ipynb](../notebooks/orca_fa_colab_training.ipynb)) trên bộ dữ liệu [orca_fin_data.jsonl](../src/data/training/orca_fin_data.jsonl).

## Cách 1: Chạy trên máy bằng `llama-server` đơn lẻ (Không cần Ollama)

Chỉ tốn ~2.2 GB RAM khi bật terminal, tắt là giải phóng 100% RAM (không có service chạy ngầm):

```powershell
powershell -ExecutionPolicy Bypass -File src/scripts/model/start_gguf_server.ps1
```

Sau đó thêm vào `.env.local`:

```env
LOCAL_GGUF_BASE_URL=http://127.0.0.1:8080/v1
LOCAL_GGUF_MODEL=orca-fa-qwen2.5-3b
LOCAL_GGUF_PRIORITY=primary
```

## Cách 2: Chạy trên Google Colab T4 GPU (0% CPU/RAM máy cá nhân)

Nếu máy không muốn gánh suy luận cục bộ, mở [orca_fa_colab_serve.ipynb](../notebooks/orca_fa_colab_serve.ipynb) trên Google Colab (T4 GPU), upload `orca-fa-qwen2.5-3b-q4_k_m.gguf` rồi dán URL tunnel vào `LOCAL_GGUF_BASE_URL` trong `.env.local`.
