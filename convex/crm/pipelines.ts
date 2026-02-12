import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertCanWrite, ensureSameOrgEntity, requireCrmUser } from './authz';
import type { Id } from '../_generated/dataModel';

const defaultStages = [
  { name: 'Qualification', order: 0, winProbability: 10 },
  { name: 'Discovery', order: 1, winProbability: 30 },
  { name: 'Proposal', order: 2, winProbability: 60 },
  { name: 'Negotiation', order: 3, winProbability: 80 },
  { name: 'Closed Won', order: 4, winProbability: 100 },
];

export const ensureDefaultPipeline = mutation({
  args: {},
  handler: async (ctx) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);

    const existing = await ctx.db
      .query('pipelines')
      .withIndex('by_org_default', (q) => q.eq('orgId', orgId).eq('isDefault', true))
      .first();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    const pipelineId = await ctx.db.insert('pipelines', {
      orgId,
      name: 'Sales Pipeline',
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });

    for (const stage of defaultStages) {
      await ctx.db.insert('pipelineStages', {
        orgId,
        pipelineId,
        name: stage.name,
        order: stage.order,
        winProbability: stage.winProbability,
        createdAt: now,
        updatedAt: now,
      });
    }

    return pipelineId;
  },
});

export const listPipelines = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireCrmUser(ctx);
    return await ctx.db
      .query('pipelines')
      .withIndex('by_org', (q) => q.eq('orgId', orgId))
      .collect();
  },
});

export const getDefaultPipeline = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireCrmUser(ctx);
    return await ctx.db
      .query('pipelines')
      .withIndex('by_org_default', (q) => q.eq('orgId', orgId).eq('isDefault', true))
      .first();
  },
});

export const listStagesByPipeline = query({
  args: {
    pipelineId: v.id('pipelines'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get('pipelines', args.pipelineId), 'Pipeline not found');

    return await ctx.db
      .query('pipelineStages')
      .withIndex('by_pipeline_order', (q) => q.eq('pipelineId', args.pipelineId))
      .collect();
  },
});

export const moveDealToStage = mutation({
  args: {
    dealId: v.id('deals'),
    stageId: v.id('pipelineStages'),
  },
  handler: async (ctx, args) => {
    const { orgId, role, userRecord } = await requireCrmUser(ctx);
    assertCanWrite(role);

    const deal = ensureSameOrgEntity(orgId, await ctx.db.get('deals', args.dealId), 'Deal not found');

    const stage = ensureSameOrgEntity(orgId, await ctx.db.get('pipelineStages', args.stageId), 'Stage not found');

    if (deal.pipelineId !== stage.pipelineId) {
      throw new ConvexError('Deal and stage must belong to the same pipeline');
    }

    const now = Date.now();
    await ctx.db.patch('deals', args.dealId, {
      stageId: args.stageId,
      updatedAt: now,
    });

    await ctx.db.insert('activities', {
      orgId,
      dealId: args.dealId,
      type: 'status_change',
      title: `Moved to ${stage.name}`,
      body: undefined,
      createdByUserId: userRecord._id,
      assignedToUserId: deal.assigneeUserId,
      createdAt: now,
      updatedAt: now,
    });

    return args.dealId;
  },
});

export const getPipelineBoard = query({
  args: {
    pipelineId: v.id('pipelines'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    const pipeline = await ctx.db.get('pipelines', args.pipelineId);
    ensureSameOrgEntity(orgId, pipeline, 'Pipeline not found');

    const [stages, deals] = await Promise.all([
      ctx.db
        .query('pipelineStages')
        .withIndex('by_pipeline_order', (q) => q.eq('pipelineId', args.pipelineId))
        .collect(),
      ctx.db
        .query('deals')
        .withIndex('by_pipeline', (q) => q.eq('pipelineId', args.pipelineId))
        .collect(),
    ]);

    // Enrich deals with primary contact name
    const enrichedDeals = await Promise.all(
      deals.map(async (deal) => {
        const dealContact = await ctx.db
          .query('dealContacts')
          .withIndex('by_deal', (q) => q.eq('dealId', deal._id))
          .first();

        let contactName: string | null = null;
        if (dealContact) {
          const contact = await ctx.db.get('contacts', dealContact.contactId);
          if (contact) {
            contactName = contact.firstName + (contact.lastName ? ` ${contact.lastName}` : '');
          }
        }

        return { ...deal, contactName };
      }),
    );

    return {
      pipeline,
      columns: stages.map((stage) => ({
        stage,
        deals: enrichedDeals.filter((deal) => deal.stageId === stage._id),
      })),
    };
  },
});

export const createPipeline = mutation({
  args: {
    name: v.string(),
    stages: v.array(v.object({ name: v.string() })),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);

    const now = Date.now();
    const shouldSetDefault = args.isDefault ?? false;
    if (shouldSetDefault) {
      const existingDefaults = await ctx.db
        .query('pipelines')
        .withIndex('by_org_default', (q) => q.eq('orgId', orgId).eq('isDefault', true))
        .collect();
      for (const existing of existingDefaults) {
        await ctx.db.patch('pipelines', existing._id, { isDefault: false, updatedAt: now });
      }
    }

    const pipelineId: Id<'pipelines'> = await ctx.db.insert('pipelines', {
      orgId,
      name: args.name,
      isDefault: shouldSetDefault,
      createdAt: now,
      updatedAt: now,
    });

    for (const [index, stage] of args.stages.entries()) {
      await ctx.db.insert('pipelineStages', {
        orgId,
        pipelineId,
        name: stage.name,
        order: index,
        createdAt: now,
        updatedAt: now,
      });
    }

    return pipelineId;
  },
});
