import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";

/**
 * Start impersonating a user
 * Only available to admins
 */
export const startImpersonating = mutation({
    args: {
        targetUserId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new ConvexError("Not authenticated");
        }

        const adminRecord = await ctx.db
            .query("users")
            .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", identity.subject))
            .unique();

        if (!adminRecord || adminRecord.role !== "admin") {
            throw new ConvexError("Only admins can impersonate users");
        }

        const targetUser = await ctx.db.get('users', args.targetUserId);
        if (!targetUser) {
            throw new ConvexError("Target user not found");
        }

        if (targetUser.orgId !== adminRecord.orgId) {
            throw new ConvexError("Cannot impersonate a user from a different organization");
        }

        // Don't allow impersonating yourself (waste of a field)
        if (args.targetUserId === adminRecord._id) {
            return;
        }

        await ctx.db.patch('users', adminRecord._id, {
            impersonatingUserId: args.targetUserId,
        });
    },
});

/**
 * Stop impersonating
 */
export const stopImpersonating = mutation({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new ConvexError("Not authenticated");
        }

        const adminRecord = await ctx.db
            .query("users")
            .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", identity.subject))
            .unique();

        if (!adminRecord) {
            throw new ConvexError("User not found");
        }

        await ctx.db.patch('users', adminRecord._id, {
            impersonatingUserId: undefined,
        });
    },
});

/**
 * Get the current impersonation status for the authenticated user
 */
export const getImpersonationStatus = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", identity.subject))
            .unique();

        if (!user?.impersonatingUserId) return null;

        const targetUser = await ctx.db.get('users', user.impersonatingUserId);
        return targetUser;
    },
});

/**
 * Detect WorkOS AuthKit impersonation via the `act` claim on the JWT.
 * Returns impersonation info if the current session is an impersonated session.
 *
 * WorkOS AuthKit sets `act.sub` to the impersonator's user ID when
 * a platform admin impersonates a user from the WorkOS Dashboard.
 */
export const getWorkosImpersonationStatus = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        // WorkOS AuthKit impersonation: check for `act` claim
        // The identity object from Convex may expose custom claims
        // Check if the token has an `act` (actor) claim indicating impersonation
        const tokenData = identity as Record<string, unknown>;
        const actClaim = tokenData.act as { sub?: string } | undefined;

        if (!actClaim?.sub) {
            return null;
        }

        // Get the impersonated user's info
        const impersonatedUser = await ctx.db
            .query("users")
            .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", identity.subject))
            .unique();

        if (!impersonatedUser) return null;

        return {
            isWorkosImpersonation: true,
            impersonatedUser: {
                firstName: impersonatedUser.firstName,
                lastName: impersonatedUser.lastName,
                email: impersonatedUser.email,
                role: impersonatedUser.role,
            },
            impersonatorId: actClaim.sub,
        };
    },
});
