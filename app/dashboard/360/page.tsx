import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Overview360 } from "./overview-360";

export const metadata: Metadata = {
  title: "Vue 360",
};

export default async function Overview360Page() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <Overview360 />;
}
