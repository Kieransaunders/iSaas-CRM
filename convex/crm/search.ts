// convex/crm/search.ts
import { v } from 'convex/values';
import { query } from '../_generated/server';
import { requireCrmUser } from './authz';

export const globalSearch = query({
  args: {
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);

    const searchQuery = args.query.trim().toLowerCase();
    if (searchQuery.length === 0) {
      return { deals: [], contacts: [], companies: [] };
    }

    // Fetch all entities for this org (small team assumption: <1000 records per type)
    const [allDeals, allContacts, allCompanies] = await Promise.all([
      ctx.db
        .query('deals')
        .withIndex('by_org', (q) => q.eq('orgId', orgId))
        .collect(),
      ctx.db
        .query('contacts')
        .withIndex('by_org', (q) => q.eq('orgId', orgId))
        .collect(),
      ctx.db
        .query('companies')
        .withIndex('by_org', (q) => q.eq('orgId', orgId))
        .collect(),
    ]);

    // Prefix match on title/name fields, return top 5 per type
    const deals = allDeals
      .filter((d) => d.title.toLowerCase().includes(searchQuery))
      .slice(0, 5)
      .map((d) => ({ _id: d._id, title: d.title, value: d.value, status: d.status }));

    const contacts = allContacts
      .filter((c) => {
        const fullName = `${c.firstName} ${c.lastName ?? ''}`.toLowerCase();
        return fullName.includes(searchQuery) || (c.email?.toLowerCase().includes(searchQuery) ?? false);
      })
      .slice(0, 5)
      .map((c) => ({
        _id: c._id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
      }));

    const companies = allCompanies
      .filter((c) => c.name.toLowerCase().includes(searchQuery))
      .slice(0, 5)
      .map((c) => ({ _id: c._id, name: c.name, industry: c.industry }));

    return { deals, contacts, companies };
  },
});
