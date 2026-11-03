import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { TaxReportView } from "@/components/dashboard/tax-report-view";
import { TaxStepTracker } from "@/components/dashboard/onboarding";
import { TaxSimulator } from "@/components/dashboard/tax-simulator";
import { ForeignAccounts } from "@/components/dashboard/foreign-accounts";

export default async function TaxReportPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <>
      <TaxStepTracker />
      <TaxReportView />
      <div className="space-y-14 p-6 md:p-8">
        <TaxSimulator />
        <ForeignAccounts />
      </div>
    </>
  );
}
