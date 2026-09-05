import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PerformanceClient } from "./performance-client";

export const metadata: Metadata = {
  title: "Performance et risque",
};

export default async function PerformancePage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return <PerformanceClient />;
}
