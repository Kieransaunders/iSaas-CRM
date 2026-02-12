import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertCanWrite, requireCrmUser } from './authz';

export const listCompanies = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireCrmUser(ctx);
    return await ctx.db
      .query('companies')
      .withIndex('by_org', (q) => q.eq('orgId', orgId))
      .collect();
  },
});

export const createCompany = mutation({
  args: {
    name: v.string(),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    industry: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, role, userRecord } = await requireCrmUser(ctx);
    assertCanWrite(role);

    const now = Date.now();
    return await ctx.db.insert('companies', {
      orgId,
      name: args.name,
      website: args.website,
      phone: args.phone,
      industry: args.industry,
      notes: args.notes,
      ownerUserId: userRecord._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});
