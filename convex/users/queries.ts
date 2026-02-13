import { ConvexError, v } from "convex/values";
import { query } from "../_generated/server";

/**
 * List all active members of the current user's organization.
 * Available to all authenticated org members (needed for owner dropdowns).
 * Admins additionally see removed (soft-deleted) users.
 */
export const listOrgMembers = query({
  args: {
    includeRemoved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    const workosUserId = identity.subject;

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", workosUserId))
      .first();

    if (!currentUser?.orgId) {
      throw new ConvexError("User not in organization");
    }

    const isAdmin = currentUser.role === "admin";
    const showRemoved = !!args.includeRemoved && isAdmin;

    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", currentUser.orgId))
      .collect();

    const enrichedUsers = users
      .filter((user) => showRemoved || !user.deletedAt)
      .map((user) => {
        const status = user.deletedAt ? "removed" : "active";
        const displayName = user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.firstName || user.email;

        return {
          _id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePictureUrl: user.profilePictureUrl,
          role: user.role,
          status,
          displayName,
          createdAt: user.createdAt,
          deletedAt: user.deletedAt,
          isCurrentUser: user._id === currentUser._id,
        };
      });

    enrichedUsers.sort((a, b) => {
      if (a.status === "active" && b.status === "removed") return -1;
      if (a.status === "removed" && b.status === "active") return 1;
      return a.displayName.localeCompare(b.displayName);
    });

    return enrichedUsers;
  },
});

/**
 * Get counts of organization members by role
 * Admin-only query for team page tab counts
 */
export const getOrgMemberCounts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    const workosUserId = identity.subject;

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", workosUserId))
      .first();

    if (!currentUser?.orgId) {
      return {
        staffCount: 0,
        clientCount: 0,
        pendingCount: 0,
        totalActive: 0,
      };
    }

    const orgId = currentUser.orgId;

    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    const activeUsers = users.filter((u) => !u.deletedAt);
    const staffCount = activeUsers.filter((u) => u.role === "staff").length;
    const clientCount = activeUsers.filter((u) => u.role === "client").length;

    const pendingInvitations = await ctx.db
      .query("pendingInvitations")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    return {
      staffCount,
      clientCount,
      pendingCount: pendingInvitations.length,
      totalActive: activeUsers.length,
    };
  },
});
