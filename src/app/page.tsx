import { Dashboard } from "@/components/dashboard";
import { prewarmDashboardData } from "@/lib/services/server-prewarm";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Tổng quan thị trường",
};

export default async function HomePage() {
  const initialData = await prewarmDashboardData();

  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard initialData={initialData} />
    </Suspense>
  );
}
