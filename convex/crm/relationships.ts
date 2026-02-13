import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertCanWrite, ensureSameOrgEntity, requireCrmUser } from './authz';

export const linkContactToDeal = mutation({
  args: {
    dealId: v.id('deals'),
    contactId: v.id('contacts'),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, role: userRole } = await requireCrmUser(ctx);
    assertCanWrite(userRole);

    ensureSameOrgEntity(orgId, await ctx.db.get('deals', args.dealId), 'Deal not found');
    ensureSameOrgEntity(orgId, await ctx.db.get('contacts', args.contactId), 'Contact not found');

    const existing = await ctx.db
      .query('dealContacts')
      .withIndex('by_deal_contact', (q) => q.eq('dealId', args.dealId).eq('contactId', args.contactId))
      .first();

    if (existing) {
      throw new ConvexError('Contact is already linked to this deal');
    }

    return await ctx.db.insert('dealContacts', {
      orgId,
      dealId: args.dealId,
      contactId: args.contactId,
      role: args.role,
      createdAt: Date.now(),
    });
  },
});

export const unlinkContactFromDeal = mutation({
  args: {
    dealId: v.id('deals'),
    contactId: v.id('contacts'),
  },
  handler: async (ctx, args) => {
    const { orgId, role: userRole } = await requireCrmUser(ctx);
    assertCanWrite(userRole);

    ensureSameOrgEntity(orgId, await ctx.db.get('deals', args.dealId), 'Deal not found');

    const link = await ctx.db
      .query('dealContacts')
      .withIndex('by_deal_contact', (q) => q.eq('dealId', args.dealId).eq('contactId', args.contactId))
      .first();

    if (!link) {
      throw new ConvexError('Link not found');
    }

    await ctx.db.delete('dealContacts', link._id);
  },
});

export const listDealContacts = query({
  args: {
    dealId: v.id('deals'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get('deals', args.dealId), 'Deal not found');

    const links = await ctx.db
      .query('dealContacts')
      .withIndex('by_deal', (q) => q.eq('dealId', args.dealId))
      .collect();

    const contacts = await Promise.all(
      links.map(async (link) => {
        const contact = await ctx.db.get('contacts', link.contactId);
        if (!contact) return null;
        return {
          _id: contact._id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          role: link.role,
          linkId: link._id,
        };
      }),
    );

    return contacts.filter((contact) => contact !== null);
  },
});

export const listContactDeals = query({
  args: {
    contactId: v.id('contacts'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get('contacts', args.contactId), 'Contact not found');

    const links = await ctx.db
      .query('dealContacts')
      .withIndex('by_contact', (q) => q.eq('contactId', args.contactId))
      .collect();

    const deals = await Promise.all(
      links.map(async (link) => {
        const deal = await ctx.db.get('deals', link.dealId);
        if (!deal) return null;
        return {
          _id: deal._id,
          title: deal.title,
          value: deal.value,
          currency: deal.currency,
          status: deal.status,
          role: link.role,
          linkId: link._id,
        };
      }),
    );

    return deals.filter((deal) => deal !== null);
  },
});

export const linkCompanyToDeal = mutation({
  args: {
    dealId: v.id('deals'),
    companyId: v.id('companies'),
    relationshipType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, role: userRole } = await requireCrmUser(ctx);
    assertCanWrite(userRole);

    ensureSameOrgEntity(orgId, await ctx.db.get('deals', args.dealId), 'Deal not found');
    ensureSameOrgEntity(orgId, await ctx.db.get('companies', args.companyId), 'Company not found');

    const existing = await ctx.db
      .query('dealCompanies')
      .withIndex('by_deal_company', (q) => q.eq('dealId', args.dealId).eq('companyId', args.companyId))
      .first();

    if (existing) {
      throw new ConvexError('Company is already linked to this deal');
    }

    return await ctx.db.insert('dealCompanies', {
      orgId,
      dealId: args.dealId,
      companyId: args.companyId,
      relationshipType: args.relationshipType,
      createdAt: Date.now(),
    });
  },
});

export const unlinkCompanyFromDeal = mutation({
  args: {
    dealId: v.id('deals'),
    companyId: v.id('companies'),
  },
  handler: async (ctx, args) => {
    const { orgId, role: userRole } = await requireCrmUser(ctx);
    assertCanWrite(userRole);

    ensureSameOrgEntity(orgId, await ctx.db.get('deals', args.dealId), 'Deal not found');

    const link = await ctx.db
      .query('dealCompanies')
      .withIndex('by_deal_company', (q) => q.eq('dealId', args.dealId).eq('companyId', args.companyId))
      .first();

    if (!link) {
      throw new ConvexError('Link not found');
    }

    await ctx.db.delete('dealCompanies', link._id);
  },
});

export const listDealCompanies = query({
  args: {
    dealId: v.id('deals'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.dealId), 'Deal not found');

    const links = await ctx.db
      .query('dealCompanies')
      .withIndex('by_deal', (q) => q.eq('dealId', args.dealId))
      .collect();

    const companies = await Promise.all(
      links.map(async (link) => {
        const company = await ctx.db.get(link.companyId);
        if (!company) return null;
        return {
          _id: company._id,
          name: company.name,
          website: company.website,
          industry: company.industry,
          relationshipType: link.relationshipType,
          linkId: link._id,
        };
      }),
    );

    return companies.filter((company) => company !== null);
  },
});
