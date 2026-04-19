import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SeasonalPageClient } from "./seasonal-client";

export default async function SeasonalPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <SeasonalPageClient />;
}
