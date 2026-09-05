import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { TaxReportView } from "@/components/dashboard/tax-report-view";
import { TaxStepTracker } from "@/components/dashboard/onboarding";
import { TaxSimulator } from "@/components/dashboard/tax-simulator";

export default async function TaxReportPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <>
      <TaxStepTracker />
      <TaxReportView />
      <div className="p-6 md:p-8">
        <TaxSimulator />
      </div>
    </>
  );
}
