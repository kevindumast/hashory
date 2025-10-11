"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isConvexConfigured } from "@/convex/client";

export function ClerkUserSync() {
  const { isLoaded, user } = useUser();
  const upsertUser = useMutation(api.users.upsertUser);
  const syncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isConvexConfigured) {
      return;
    }
    if (!isLoaded) {
      return;
    }
    if (!user) {
      syncedUserIdRef.current = null;
      return;
    }
    if (syncedUserIdRef.current === user.id) {
      return;
    }

    const runSync = async () => {
      try {
        const fallbackName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
        const displayName =
          user.fullName ??
          user.username ??
          (fallbackName.length > 0 ? fallbackName : undefined);

        await upsertUser({
          clerkId: user.id,
          email: user.primaryEmailAddress?.emailAddress ?? undefined,
          displayName,
          avatarUrl: user.imageUrl ?? undefined,
        });
        syncedUserIdRef.current = user.id;
      } catch (error) {
        console.error("Failed to sync Clerk user to Convex", error);
      }
    };

    void runSync();
  }, [isLoaded, upsertUser, user]);

  return null;
}
