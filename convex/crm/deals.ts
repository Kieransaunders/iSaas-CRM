import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertCanWrite, ensureSameOrgEntity, requireCrmUser } from './authz';

export const listDeals = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireCrmUser(ctx);
    return await ctx.db
      .query('deals')
      .withIndex('by_org', (q) => q.eq('orgId', orgId))
      .collect();
  },
});

export const listDealsByPipeline = query({
  args: {
    pipelineId: v.id('pipelines'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    const pipeline = await ctx.db.get('pipelines', args.pipelineId);
    ensureSameOrgEntity(orgId, pipeline, 'Pipeline not found');

    return await ctx.db
      .query('deals')
      .withIndex('by_pipeline', (q) => q.eq('pipelineId', args.pipelineId))
      .collect();
  },
});

export const getDeal = query({
  args: {
    dealId: v.id('deals'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    const deal = await ctx.db.get('deals', args.dealId);
    return ensureSameOrgEntity(orgId, deal, 'Deal not found');
  },
});

export const createDeal = mutation({
  args: {
    pipelineId: v.id('pipelines'),
    stageId: v.id('pipelineStages'),
    title: v.string(),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    expectedCloseDate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, role, userRecord } = await requireCrmUser(ctx);
    assertCanWrite(role);

    ensureSameOrgEntity(orgId, await ctx.db.get('pipelines', args.pipelineId), 'Pipeline not found');

    const stage = ensureSameOrgEntity(orgId, await ctx.db.get('pipelineStages', args.stageId), 'Stage not found');

    if (stage.pipelineId !== args.pipelineId) {
      throw new ConvexError('Stage does not belong to the selected pipeline');
    }

    const now = Date.now();
    const dealId = await ctx.db.insert('deals', {
      orgId,
      pipelineId: args.pipelineId,
      stageId: args.stageId,
      title: args.title,
      value: args.value,
      currency: args.currency,
      status: 'open',
      ownerUserId: userRecord._id,
      assigneeUserId: userRecord._id,
      expectedCloseDate: args.expectedCloseDate,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert('activities', {
      orgId,
      dealId,
      type: 'note',
      title: 'Deal created',
      body: args.notes,
      createdByUserId: userRecord._id,
      assignedToUserId: userRecord._id,
      createdAt: now,
      updatedAt: now,
    });

    return dealId;
  },
});

export const updateDeal = mutation({
  args: {
    dealId: v.id('deals'),
    title: v.optional(v.string()),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.optional(v.union(v.literal('open'), v.literal('won'), v.literal('lost'))),
    expectedCloseDate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);

    ensureSameOrgEntity(orgId, await ctx.db.get('deals', args.dealId), 'Deal not found');

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) patch.title = args.title;
    if (args.value !== undefined) patch.value = args.value;
    if (args.currency !== undefined) patch.currency = args.currency;
    if (args.status !== undefined) patch.status = args.status;
    if (args.expectedCloseDate !== undefined) patch.expectedCloseDate = args.expectedCloseDate;
    if (args.notes !== undefined) patch.notes = args.notes;

    await ctx.db.patch('deals', args.dealId, patch);
    return args.dealId;
  },
});
