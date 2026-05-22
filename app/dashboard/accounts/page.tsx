import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AccountsView } from "@/components/dashboard/accounts-view";

export default async function AccountsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return <AccountsView />;
}
