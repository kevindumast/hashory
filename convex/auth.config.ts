export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN || "https://upward-kid-24.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};
