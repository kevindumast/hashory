import { auth } from "@clerk/nextjs/server";

export function requireUserId() {
  const session = auth();
  if (!session?.userId) {
    throw new Error("User is not authenticated.");
  }
  return session.userId;
}

export function optionalUserId() {
  const session = auth();
  return session?.userId ?? null;
}
