import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertCanWrite, ensureSameOrgEntity, requireCrmUser } from './authz';

export const listDealActivities = query({
  args: {
    dealId: v.id('deals'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get('deals', args.dealId), 'Deal not found');

    const activities = await ctx.db
      .query('activities')
      .withIndex('by_deal_created', (q) => q.eq('dealId', args.dealId))
      .order('desc')
      .collect();

    return activities;
  },
});

export const listOrgActivities = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireCrmUser(ctx);
    return await ctx.db
      .query('activities')
      .withIndex('by_org', (q) => q.eq('orgId', orgId))
      .order('desc')
      .take(100);
  },
});

export const listContactActivities = query({
  args: {
    contactId: v.id('contacts'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.contactId), 'Contact not found');

    return await ctx.db
      .query('activities')
      .withIndex('by_contact_created', (q) => q.eq('contactId', args.contactId))
      .order('desc')
      .collect();
  },
});

export const listCompanyActivities = query({
  args: {
    companyId: v.id('companies'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.companyId), 'Company not found');

    return await ctx.db
      .query('activities')
      .withIndex('by_company_created', (q) => q.eq('companyId', args.companyId))
      .order('desc')
      .collect();
  },
});

export const createActivity = mutation({
  args: {
    dealId: v.optional(v.id('deals')),
    contactId: v.optional(v.id('contacts')),
    companyId: v.optional(v.id('companies')),
    type: v.union(
      v.literal('note'),
      v.literal('call'),
      v.literal('email'),
      v.literal('meeting'),
      v.literal('task'),
      v.literal('status_change'),
    ),
    title: v.string(),
    body: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    assignedToUserId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const { orgId, role, userRecord } = await requireCrmUser(ctx);
    assertCanWrite(role);

    if (args.dealId) {
      ensureSameOrgEntity(orgId, await ctx.db.get('deals', args.dealId), 'Deal not found');
    }

    const now = Date.now();
    return await ctx.db.insert('activities', {
      orgId,
      dealId: args.dealId,
      contactId: args.contactId,
      companyId: args.companyId,
      type: args.type,
      title: args.title,
      body: args.body,
      dueAt: args.dueAt,
      completedAt: undefined,
      createdByUserId: userRecord._id,
      assignedToUserId: args.assignedToUserId,
      createdAt: now,
      updatedAt: now,
    });
  },
});
