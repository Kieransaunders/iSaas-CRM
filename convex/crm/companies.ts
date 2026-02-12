import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertCanWrite, ensureSameOrgEntity, requireCrmUser } from './authz';

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

export const getCompany = query({
  args: {
    companyId: v.id('companies'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    const company = await ctx.db.get(args.companyId);
    return ensureSameOrgEntity(orgId, company, 'Company not found');
  },
});

export const updateCompany = mutation({
  args: {
    companyId: v.id('companies'),
    name: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    industry: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.companyId), 'Company not found');

    const { companyId, ...fields } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(companyId, patch);
    return companyId;
  },
});

export const deleteCompany = mutation({
  args: {
    companyId: v.id('companies'),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.companyId), 'Company not found');

    // Remove from deal-company junctions
    const dealCompanies = await ctx.db
      .query('dealCompanies')
      .withIndex('by_company', (q) => q.eq('companyId', args.companyId))
      .collect();
    for (const dc of dealCompanies) {
      await ctx.db.delete(dc._id);
    }

    // Unlink contacts that have this as primary company
    const contacts = await ctx.db
      .query('contacts')
      .withIndex('by_org_company', (q) => q.eq('orgId', orgId).eq('companyId', args.companyId))
      .collect();
    for (const contact of contacts) {
      await ctx.db.patch(contact._id, { companyId: undefined, updatedAt: Date.now() });
    }

    await ctx.db.delete(args.companyId);
  },
});
