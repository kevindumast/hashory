import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AuditView } from "@/components/dashboard/audit-view";

export const metadata: Metadata = {
  title: "Dossier de contrôle",
};

export default async function AuditPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <AuditView />;
}
