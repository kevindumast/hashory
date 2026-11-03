import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { RecapClient } from "./recap-client";

export const metadata: Metadata = {
  title: "Rétrospective",
};

export default async function RecapPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <RecapClient />;
}
