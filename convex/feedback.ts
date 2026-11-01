import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireUserId } from "./auth";
import {
  FEEDBACK_LIMIT_PER_HOUR,
  feedbackError,
  feedbackIssue,
  feedbackPage,
  type FeedbackKind,
} from "../lib/feedback";

const DEFAULT_REPO = "kevindumast/hashory";

/** Enregistre un bug ou une idée, puis le recopie en issue GitHub en arrière-plan. */
export const send = mutation({
  args: {
    kind: v.string(),
    title: v.string(),
    body: v.string(),
    page: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await requireUserId(ctx);

    const error = feedbackError(args);
    if (error) throw new ConvexError({ message: error });

    const recent = await ctx.db
      .query("feedback")
      .withIndex("by_user_created", (q) => q.eq("clerkId", clerkId).gte("createdAt", Date.now() - 3_600_000))
      .take(FEEDBACK_LIMIT_PER_HOUR);
    if (recent.length >= FEEDBACK_LIMIT_PER_HOUR) {
      throw new ConvexError({ message: "Beaucoup de retours d'un coup ! Réessayez dans une heure." });
    }

    const feedbackId = await ctx.db.insert("feedback", {
      clerkId,
      kind: args.kind as FeedbackKind,
      title: args.title.trim(),
      body: args.body.trim(),
      page: feedbackPage(args.page) ?? undefined,
      userAgent: args.userAgent?.slice(0, 300),
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.feedback.createIssue, { feedbackId });
    return feedbackId;
  },
});

export const getInternal = internalQuery({
  args: { feedbackId: v.id("feedback") },
  handler: (ctx, { feedbackId }) => ctx.db.get(feedbackId),
});

export const setIssue = internalMutation({
  args: { feedbackId: v.id("feedback"), issueNumber: v.number(), issueUrl: v.string() },
  handler: async (ctx, { feedbackId, ...issue }) => {
    await ctx.db.patch(feedbackId, issue);
  },
});

/**
 * Crée l'issue sur le dépôt du projet. Sans jeton GitHub (développement),
 * le retour reste seulement en base.
 */
export const createIssue = internalAction({
  args: { feedbackId: v.id("feedback") },
  handler: async (ctx, { feedbackId }) => {
    const token = process.env.GITHUB_FEEDBACK_TOKEN;
    const repo = process.env.GITHUB_FEEDBACK_REPO || DEFAULT_REPO;
    if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return;

    const row = await ctx.runQuery(internal.feedback.getInternal, { feedbackId });
    if (!row || row.issueNumber) return;

    const issue = feedbackIssue({
      id: row._id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      page: row.page ?? null,
      userId: row.clerkId,
      userAgent: row.userAgent ?? null,
    });

    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(issue),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("Issue GitHub non créée", res.status, await res.text());
      return;
    }
    const data = (await res.json()) as { number: number; html_url: string };
    await ctx.runMutation(internal.feedback.setIssue, {
      feedbackId,
      issueNumber: data.number,
      issueUrl: data.html_url,
    });
  },
});
