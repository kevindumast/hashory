import { ConvexReactClient } from "convex/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

export const convexClient = convexUrl
  ? new ConvexReactClient(convexUrl)
  : null;

export const isConvexConfigured = Boolean(convexClient);
