export default function Loading() {
  return (
    <div className="stock-workspace animate-fade-in py-10 flex flex-col items-center justify-center gap-2">
      <div className="size-5 rounded-full border-2 border-accent-primary border-t-transparent animate-spin" />
      <span className="text-[12px] text-text-muted font-medium">Đang tải Thông tin Doanh nghiệp…</span>
    </div>
  );
}
