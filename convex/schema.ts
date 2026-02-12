import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  // Organizations - synced from WorkOS, extended with subscription data
  orgs: defineTable({
    // WorkOS organization ID (primary identifier)
    workosOrgId: v.string(),
    // Organization name (from WorkOS)
    name: v.string(),
    // Billing email (stored in WorkOS metadata)
    billingEmail: v.optional(v.string()),
    // Subscription data from billing provider
    subscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(
      v.union(
        v.literal('inactive'),
        v.literal('active'),
        v.literal('trialing'),
        v.literal('cancelled'),
        v.literal('past_due'),
        v.literal('unpaid'),
        v.literal('paused'),
      ),
    ),
    planId: v.optional(v.string()),
    // Trial end timestamp (for UI display of trial status)
    trialEndsAt: v.optional(v.number()),
    // Subscription end timestamp (set when cancelled, access until this date)
    endsAt: v.optional(v.number()),
    // Usage caps from plan metadata
    maxCustomers: v.number(),
    maxStaff: v.number(),
    maxClients: v.number(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workos_org_id', ['workosOrgId'])
    .index('by_subscription_id', ['subscriptionId']),

  // Legacy customers table from client-portal model (temporary)
  customers: defineTable({
    orgId: v.id('orgs'),
    name: v.string(),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['orgId'])
    .index('by_org_name', ['orgId', 'name']),

  // User profiles - extends WorkOS user data with app-specific fields
  users: defineTable({
    // WorkOS user ID
    workosUserId: v.string(),
    // Organization membership
    orgId: v.optional(v.id('orgs')),
    // Role: Admin, Staff, or Client
    role: v.optional(v.union(v.literal('admin'), v.literal('staff'), v.literal('client'))),
    // For Client users: which customer they belong to
    customerId: v.optional(v.id('customers')),
    // For Admin users: which user they are currently acting as
    impersonatingUserId: v.optional(v.id('users')),
    // Profile data (synced from WorkOS)
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    // Soft delete support
    deletedAt: v.optional(v.number()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workos_user_id', ['workosUserId'])
    .index('by_org', ['orgId'])
    .index('by_org_role', ['orgId', 'role'])
    .index('by_customer', ['customerId']),

  // Legacy assignments table from client-portal model (temporary)
  staffCustomerAssignments: defineTable({
    staffUserId: v.id('users'),
    customerId: v.id('customers'),
    orgId: v.id('orgs'),
    createdAt: v.number(),
  })
    .index('by_staff', ['staffUserId'])
    .index('by_customer', ['customerId'])
    .index('by_org', ['orgId'])
    // Prevent duplicate assignments
    .index('by_staff_customer', ['staffUserId', 'customerId']),

  // CRM companies
  companies: defineTable({
    orgId: v.id('orgs'),
    name: v.string(),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    industry: v.optional(v.string()),
    notes: v.optional(v.string()),
    ownerUserId: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['orgId'])
    .index('by_org_name', ['orgId', 'name'])
    .index('by_org_owner', ['orgId', 'ownerUserId']),

  // CRM contacts
  contacts: defineTable({
    orgId: v.id('orgs'),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    ownerUserId: v.optional(v.id('users')),
    companyId: v.optional(v.id('companies')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['orgId'])
    .index('by_org_name', ['orgId', 'firstName'])
    .index('by_org_owner', ['orgId', 'ownerUserId'])
    .index('by_org_company', ['orgId', 'companyId']),

  // CRM pipelines
  pipelines: defineTable({
    orgId: v.id('orgs'),
    name: v.string(),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['orgId'])
    .index('by_org_default', ['orgId', 'isDefault']),

  // CRM pipeline stages
  pipelineStages: defineTable({
    orgId: v.id('orgs'),
    pipelineId: v.id('pipelines'),
    name: v.string(),
    order: v.number(),
    winProbability: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['orgId'])
    .index('by_pipeline_order', ['pipelineId', 'order'])
    .index('by_org_pipeline', ['orgId', 'pipelineId']),

  // CRM deals
  deals: defineTable({
    orgId: v.id('orgs'),
    pipelineId: v.id('pipelines'),
    stageId: v.id('pipelineStages'),
    title: v.string(),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: v.union(v.literal('open'), v.literal('won'), v.literal('lost')),
    ownerUserId: v.optional(v.id('users')),
    assigneeUserId: v.optional(v.id('users')),
    expectedCloseDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['orgId'])
    .index('by_pipeline', ['pipelineId'])
    .index('by_pipeline_stage', ['pipelineId', 'stageId'])
    .index('by_org_owner', ['orgId', 'ownerUserId'])
    .index('by_org_assignee', ['orgId', 'assigneeUserId']),

  // CRM activity timeline entries
  activities: defineTable({
    orgId: v.id('orgs'),
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
    completedAt: v.optional(v.number()),
    createdByUserId: v.id('users'),
    assignedToUserId: v.optional(v.id('users')),
    emailMessageId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['orgId'])
    .index('by_deal_created', ['dealId', 'createdAt'])
    .index('by_contact_created', ['contactId', 'createdAt'])
    .index('by_company_created', ['companyId', 'createdAt'])
    .index('by_org_due', ['orgId', 'dueAt']),

  // Junction table between deals and contacts
  dealContacts: defineTable({
    orgId: v.id('orgs'),
    dealId: v.id('deals'),
    contactId: v.id('contacts'),
    role: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_org', ['orgId'])
    .index('by_deal', ['dealId'])
    .index('by_contact', ['contactId'])
    .index('by_deal_contact', ['dealId', 'contactId']),

  // Junction table between deals and companies
  dealCompanies: defineTable({
    orgId: v.id('orgs'),
    dealId: v.id('deals'),
    companyId: v.id('companies'),
    relationshipType: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_org', ['orgId'])
    .index('by_deal', ['dealId'])
    .index('by_company', ['companyId'])
    .index('by_deal_company', ['dealId', 'companyId']),

  // Pending invitations - tracks invitations sent via WorkOS
  pendingInvitations: defineTable({
    // WorkOS invitation ID
    workosInvitationId: v.string(),
    // Invited user's email
    email: v.string(),
    // Organization this invitation belongs to
    orgId: v.id('orgs'),
    // Role being invited
    role: v.union(v.literal('staff'), v.literal('client')),
    // For client invites: which customer they'll belong to
    customerId: v.optional(v.id('customers')),
    // User who sent the invitation
    inviterUserId: v.id('users'),
    // Timestamps
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_org', ['orgId'])
    .index('by_workos_id', ['workosInvitationId'])
    .index('by_email_org', ['email', 'orgId']),

  // Temporary: Keep numbers table from template until fully migrated
  numbers: defineTable({
    value: v.number(),
  }),
});
