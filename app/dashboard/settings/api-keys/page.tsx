import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ApiKeysView } from "@/components/dashboard/api-keys-view";

export const metadata = { title: "Clés d'API" };

export default async function ApiKeysPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return <ApiKeysView />;
}
