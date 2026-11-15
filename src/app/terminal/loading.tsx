export default function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background-primary text-text-muted">
      <div className="flex flex-col items-center gap-2">
        <div className="size-6 rounded-full border-2 border-accent-primary border-t-transparent animate-spin" />
        <span className="text-[12px] font-medium">Khởi động ORCA Pro Terminal…</span>
      </div>
    </div>
  );
}
