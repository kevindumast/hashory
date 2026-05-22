import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { TransactionsPageClient } from "@/app/dashboard/transactions-page-client";

export default async function TransactionsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return <TransactionsPageClient />;
}
