import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

type AnyCtx = QueryCtx | MutationCtx | ActionCtx;

export async function requireIdentity(ctx: AnyCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("User is not authenticated.");
  }
  return identity;
}

export async function getOptionalIdentity(ctx: AnyCtx) {
  return ctx.auth.getUserIdentity();
}

export async function requireUserId(ctx: AnyCtx) {
  const identity = await requireIdentity(ctx);
  return identity.subject;
}

export async function optionalUserId(ctx: AnyCtx) {
  const identity = await getOptionalIdentity(ctx);
  return identity?.subject ?? null;
}
