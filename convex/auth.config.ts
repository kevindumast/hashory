export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN || "upward-kid-24.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
