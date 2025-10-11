import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const matchProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/convex(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  const session = await auth();
  const pathname = request.nextUrl.pathname;

  const isApiRoute = pathname.startsWith("/api") && !pathname.startsWith("/api/binance");
  const requiresAuth = matchProtectedRoute(request) || isApiRoute;

  if (requiresAuth && !session.userId) {
    return session.redirectToSignIn();
  }
});

export const config = {
  matcher: ["/((?!_next|static|.*\\..*).*)", "/"],
};
