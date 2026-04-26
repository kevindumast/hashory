---
name: Convex free tier optimization
description: ULTRA IMPORTANT — every change to oracly must minimize Convex bandwidth and function calls to stay under free tier monthly quotas
type: feedback
---

ULTRA IMPORTANT: oracly runs on Convex free tier. Every code change must be evaluated for its Convex cost (database bandwidth, function calls, action compute). Do not introduce patterns that increase consumption.

**Why:** User flagged on 2026-04-26 that database bandwidth hit 888.7 MB / 1 GB after a single ETH wallet sync ate ~500MB. They explicitly said: "garde en mémoire en ultra important qu'il faut optimiser au maximum l'application pour ne pas dépasser les quota par mois sur le mois gratuit". They are EU-region, where paid plans bill on-demand + 30% surcharge — so staying free is the goal.

**Free tier limits to respect:**
- Database Bandwidth: 1 GB/month (BINDING constraint — was at 89% on Apr 26)
- Function Calls: 1M/month
- Database Storage: 512 MB (currently 7.56 MB, plenty of room)
- Action Compute: 20 GB-hours
- File Storage: 1 GB

**How to apply:**

1. **Never write `ctx.db.query("table").collect()` without `.withIndex(...)`** — full table scans read every doc of every user, multiplied by every reactive subscription. This was the root cause of the 500 MB spike.

2. **Always paginate user-facing list queries**: when a `limit` arg exists, use `.order("desc").take(limit)` per index, not `.collect()` then `.slice()`. Loading 10k docs to slice the top 50 still pays bandwidth for 10k.

3. **Avoid N+1 inside actions**: when an action loops over API results and calls `ctx.runMutation` per item, batch into a single bulk mutation that takes an array. Each `runMutation` round-trip counts as a function call.

4. **Cursor-based syncs must trust the cursor**: if the upstream API filters by `startblock`/`startTime > cursor`, don't add a per-row dedup query inside the mutation — it doubles reads for nothing. Only dedup on initial sync (cursor null).

5. **Reactive queries multiply cost**: a `useQuery` on the dashboard re-runs on every doc inserted into its result set. During a sync that inserts 10k trades, a full-scan listByUser re-runs 10k times. Always scope queries to the smallest possible result set with indexes + limits.

6. **When designing a feature, do the bandwidth math**: estimate `(query result doc count) × (avg doc size) × (subscription frequency)`. If > 1 MB per dashboard load, redesign.

7. **Schema decisions**: prefer composite indexes (`by_integration_executedAt`) over post-fetch sorting; prefer storing computed aggregates in a small `analytics` row over recomputing from raw rows on every read.
