import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/convex(.*)",
  "/api/(?!.*binance).*",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    const session = await auth();
    if (!session.userId) {
      return session.redirectToSignIn();
    }
  }
});

export const config = {
  matcher: ["/((?!_next|static|.*\\..*).*)", "/"],
};
