import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertCanWrite, ensureSameOrgEntity, requireCrmUser } from './authz';

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

export const getContact = query({
  args: {
    contactId: v.id('contacts'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    const contact = await ctx.db.get(args.contactId);
    return ensureSameOrgEntity(orgId, contact, 'Contact not found');
  },
});

export const updateContact = mutation({
  args: {
    contactId: v.id('contacts'),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    companyId: v.optional(v.id('companies')),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.contactId), 'Contact not found');

    if (args.companyId) {
      ensureSameOrgEntity(orgId, await ctx.db.get(args.companyId), 'Company not found');
    }

    const { contactId, ...fields } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(contactId, patch);
    return contactId;
  },
});

export const deleteContact = mutation({
  args: {
    contactId: v.id('contacts'),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.contactId), 'Contact not found');

    // Remove from deal-contact junctions
    const dealContacts = await ctx.db
      .query('dealContacts')
      .withIndex('by_contact', (q) => q.eq('contactId', args.contactId))
      .collect();
    for (const dc of dealContacts) {
      await ctx.db.delete(dc._id);
    }

    await ctx.db.delete(args.contactId);
  },
});
