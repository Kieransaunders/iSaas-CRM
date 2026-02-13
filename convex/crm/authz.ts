import { ConvexError } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';

type Ctx = QueryCtx | MutationCtx;

export type CrmRole = 'admin' | 'staff' | 'client';

export type CrmAuthContext = {
  orgId: Id<'orgs'>;
  role: CrmRole;
  userRecord: Doc<'users'>;
};

export async function requireCrmUser(ctx: Ctx): Promise<CrmAuthContext> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError('Not authenticated');
  }

  const userRecord = await ctx.db
    .query('users')
    .withIndex('by_workos_user_id', (q) => q.eq('workosUserId', identity.subject))
    .first();

  if (!userRecord?.orgId || !userRecord.role) {
    throw new ConvexError('User is not associated with a CRM workspace');
  }

  return {
    orgId: userRecord.orgId,
    role: userRecord.role as CrmRole,
    userRecord,
  };
}

export function assertCanWrite(role: CrmRole) {
  if (role === 'client') {
    throw new ConvexError('Clients have read-only CRM access in v1');
  }
}

export function ensureSameOrgEntity<T extends { orgId: Id<'orgs'> } | null>(
  orgId: Id<'orgs'>,
  entity: T,
  notFoundMessage: string,
) {
  if (!entity) {
    throw new ConvexError(notFoundMessage);
  }
  if (entity.orgId !== orgId) {
    throw new ConvexError('Access denied');
  }
  return entity;
}

/**
 * Check if the current session is impersonated (either local or WorkOS AuthKit).
 * Returns true if the `act` claim is present on the JWT identity,
 * OR if the user has `impersonatingUserId` set.
 */
export async function isImpersonatedSession(ctx: Ctx): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;

  // Check WorkOS AuthKit impersonation
  const tokenData = identity as Record<string, unknown>;
  const actClaim = tokenData.act as { sub?: string } | undefined;
  if (actClaim?.sub) return true;

  // Check local impersonation
  const user = await ctx.db
    .query('users')
    .withIndex('by_workos_user_id', (q) => q.eq('workosUserId', identity.subject))
    .first();

  return !!user?.impersonatingUserId;
}

/**
 * Throw if the current session is impersonated.
 * Use this to guard sensitive operations like billing, org deletion, role changes.
 */
export async function blockDuringImpersonation(ctx: Ctx): Promise<void> {
  const impersonated = await isImpersonatedSession(ctx);
  if (impersonated) {
    throw new ConvexError('This action is not allowed during an impersonation session');
  }
}
