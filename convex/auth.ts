import { auth } from "@clerk/nextjs/server";

export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("User is not authenticated.");
  }
  return userId;
}

export async function optionalUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}
