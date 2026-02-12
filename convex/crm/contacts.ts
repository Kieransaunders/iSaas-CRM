import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertCanWrite, requireCrmUser } from './authz';

export const listContacts = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireCrmUser(ctx);
    return await ctx.db
      .query('contacts')
      .withIndex('by_org', (q) => q.eq('orgId', orgId))
      .collect();
  },
});

export const createContact = mutation({
  args: {
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, role, userRecord } = await requireCrmUser(ctx);
    assertCanWrite(role);

    const now = Date.now();
    return await ctx.db.insert('contacts', {
      orgId,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      phone: args.phone,
      title: args.title,
      ownerUserId: userRecord._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});
