# Phase 4: Team Management & Impersonation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable full team CRUD (list/invite/role-change/remove members), ownership-based filtering ("All" / "Mine" toggle) on CRM entity lists, owner assignment in detail modals, and WorkOS AuthKit-based platform superadmin impersonation detection with a prominent banner.

**Architecture:** Backend functions split across `convex/users/` (listOrgMembers, updateUserRole) and `convex/invitations/` (existing send/revoke/list pattern). Org member removal is a Convex action that calls WorkOS to delete the membership then soft-deletes locally. CRM list queries (`listContacts`, `listCompanies`, `listDeals`) gain an optional `ownerFilter` arg (`"all"` | `"mine"`) to support server-side ownership filtering using existing `by_org_owner` indexes. WorkOS AuthKit impersonation is detected by inspecting the `act` claim on the JWT identity -- when present, a non-dismissible top banner shows the impersonated user info and a "Stop Session" link that redirects to the WorkOS-provided session end URL.

**Tech Stack:** Convex queries/mutations/actions, `@workos-inc/node` SDK, WorkOS AuthKit (`act` claim detection), shadcn/ui (Table, Dialog, Select, Badge, Avatar, ToggleGroup), `lucide-react` icons, TanStack Router.

---

### Task 1: Backend — `listOrgMembers` query (update existing)

**Files:**
- Modify: `convex/users/queries.ts`

**Step 1:** The `listOrgMembers` query already exists in `convex/users/queries.ts` but is admin-only. Update it to be accessible by all authenticated org members (staff and admin alike) so the owner dropdown in detail modals can show the member list. Also exclude soft-deleted users from the default return and add a `profilePictureUrl` field to support avatar display.

```ts
// convex/users/queries.ts
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

    // Only admin can request removed users
    const showRemoved = args.includeRemoved && isAdmin;

    const users = await ctx.db
      .query("users")
      .withIndex("by_org", (q) => q.eq("orgId", currentUser.orgId))
      .collect();

    const enrichedUsers = users
      .filter((user) => showRemoved || !user.deletedAt)
      .map((user) => {
        const status = user.deletedAt ? "removed" : "active";
        const displayName =
          user.firstName && user.lastName
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

    // Sort: active users first, then removed users; within each group, by name
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
```

**Step 2:** Verify compilation.

```bash
npx convex typecheck
```

**Step 3:** Commit.

```bash
git add convex/users/queries.ts
git commit -m "feat: update listOrgMembers to support all org members and avatar data

Make listOrgMembers accessible to all authenticated org members (not just
admins) so the owner dropdown can display the member list. Add optional
includeRemoved flag (admin-only). Include profilePictureUrl, isCurrentUser
flag, and improved sorting."
```

---

### Task 2: Backend — `updateUserRole` mutation

**Files:**
- Modify: `convex/users/manage.ts`

**Step 1:** Add an `updateUserRole` mutation to `convex/users/manage.ts`. Admin-only, cannot change own role, cannot change during impersonation, validates role values.

```ts
// Add to convex/users/manage.ts (after the existing restoreUser mutation)

/**
 * Update a user's role within the organization
 * Admin-only: cannot change own role, only staff<->admin transitions allowed
 */
export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    newRole: v.union(v.literal("admin"), v.literal("staff")),
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

    if (currentUser.role !== "admin") {
      throw new ConvexError("Admin role required to change user roles");
    }

    // Block role changes during impersonation
    if (currentUser.impersonatingUserId) {
      throw new ConvexError("Cannot change roles while impersonating a user");
    }

    // Prevent changing own role
    if (args.userId === currentUser._id) {
      throw new ConvexError("Cannot change your own role");
    }

    const targetUser = await ctx.db.get("users", args.userId);
    if (!targetUser) {
      throw new ConvexError("User not found");
    }

    if (targetUser.orgId !== currentUser.orgId) {
      throw new ConvexError("Cannot change role of user in another organization");
    }

    if (targetUser.deletedAt) {
      throw new ConvexError("Cannot change role of a removed user");
    }

    // Only allow staff <-> admin transitions (not client)
    if (targetUser.role === "client") {
      throw new ConvexError("Cannot change client role via this endpoint");
    }

    if (targetUser.role === args.newRole) {
      return { success: true }; // No-op
    }

    await ctx.db.patch("users", args.userId, {
      role: args.newRole,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
```

**Step 2:** Verify compilation.

```bash
npx convex typecheck
```

**Step 3:** Commit.

```bash
git add convex/users/manage.ts
git commit -m "feat: add updateUserRole mutation for admin role management

Admin-only mutation that allows changing staff<->admin roles. Blocks
changing own role, changing client roles, and role changes during
impersonation sessions."
```

---

### Task 3: Backend — `removeOrgMember` action (WorkOS removal + local update)

**Files:**
- Modify: `convex/users/manageActions.ts`

The existing `removeUser` action in `convex/users/manageActions.ts` already handles WorkOS user deletion + local soft-delete. However, it deletes the entire WorkOS user. For org member removal, we should remove the WorkOS *organization membership* rather than deleting the user entirely (the user may belong to other orgs). Add a `removeOrgMember` action alongside the existing `removeUser`.

**Step 1:** Add `removeOrgMember` action to `convex/users/manageActions.ts`.

```ts
// Add to convex/users/manageActions.ts (after the existing removeUser action)

/**
 * Remove a member from the organization.
 * Removes their WorkOS organization membership and soft-deletes them locally.
 * Admin-only action.
 */
export const removeOrgMember = action({
  args: {
    userId: v.id("users"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    const workosUserId = identity.subject;

    const currentUser = await ctx.runQuery(internal.users.internal.getUserByWorkosId, {
      workosUserId,
    });

    if (!currentUser?.orgId) {
      throw new ConvexError("User not in organization");
    }

    if (currentUser.role !== "admin") {
      throw new ConvexError("Admin role required to remove members");
    }

    const targetUser = await ctx.runQuery(internal.users.internal.getUserById, {
      userId: args.userId,
    });

    if (!targetUser) {
      throw new ConvexError("User not found");
    }

    if (targetUser.orgId !== currentUser.orgId) {
      throw new ConvexError("Cannot remove member from another organization");
    }

    if (targetUser._id === currentUser._id) {
      throw new ConvexError("Cannot remove yourself");
    }

    // Get the org's WorkOS org ID so we can find the membership
    const org = await ctx.runQuery(internal.orgs.get.getOrgByIdInternal, {
      orgId: currentUser.orgId,
    });

    if (!org) {
      throw new ConvexError("Organization not found");
    }

    // Remove WorkOS organization membership
    try {
      const workos = new WorkOS(process.env.WORKOS_API_KEY);

      // Find the membership for this user in this org
      const memberships = await workos.userManagement.listOrganizationMemberships({
        userId: targetUser.workosUserId,
        organizationId: org.workosOrgId,
        limit: 1,
      });

      if (memberships.data.length > 0) {
        await workos.userManagement.deleteOrganizationMembership(
          memberships.data[0].id
        );
      }
    } catch (error) {
      if (!isNonFatalWorkosError(error)) {
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new ConvexError(`Failed to remove member from WorkOS: ${message}`);
      }
    }

    // Soft-delete the user locally
    await ctx.runMutation(internal.users.internal.softDeleteUser, {
      userId: args.userId,
    });

    return { success: true };
  },
});
```

Note: This action requires `internal.orgs.get.getOrgByIdInternal` -- verify this internal query exists. If not, check for the equivalent and adjust the import path.

**Step 2:** Verify the internal query exists and compilation succeeds.

```bash
grep -r "getOrgByIdInternal" convex/orgs/
npx convex typecheck
```

**Step 3:** Commit.

```bash
git add convex/users/manageActions.ts
git commit -m "feat: add removeOrgMember action with WorkOS membership removal

Removes the WorkOS organization membership (not the entire user) and
soft-deletes the user record locally. More appropriate than deleteUser
for team management since the user may belong to other orgs."
```

---

### Task 4: Backend — `inviteMember` action (WorkOS invitation + pending record)

**Files:**
- No new files needed. The existing `convex/invitations/send.ts` already contains `sendInvitation` which does exactly this: validates admin role, checks usage caps, sends via WorkOS, stores a `pendingInvitations` record.

**Step 1:** Verify that the existing `sendInvitation` action covers the Phase 4 requirements. It accepts `email`, `role` (staff | client), and optional `customerId`. For team management, we will call it with `role: "staff"` and no `customerId`. No backend changes needed.

The only enhancement: allow inviting with `role: "admin"` in addition to `"staff"` and `"client"`. Currently the schema and action only accept `"staff" | "client"`.

Update `convex/invitations/send.ts` to accept `"admin"` as a role value:

```ts
// In convex/invitations/send.ts, update the args.role validator:
// Before:
//   role: v.union(v.literal('staff'), v.literal('client')),
// After:
    role: v.union(v.literal('admin'), v.literal('staff'), v.literal('client')),
```

Also update `convex/invitations/internal.ts` `storePendingInvitation` and the `pendingInvitations` schema to accept `"admin"`:

```ts
// In convex/schema.ts, update pendingInvitations.role:
// Before:
//   role: v.union(v.literal('staff'), v.literal('client')),
// After:
    role: v.union(v.literal('admin'), v.literal('staff'), v.literal('client')),
```

```ts
// In convex/invitations/internal.ts, update storePendingInvitation args.role:
// Before:
//   role: v.union(v.literal('staff'), v.literal('client')),
// After:
    role: v.union(v.literal('admin'), v.literal('staff'), v.literal('client')),
```

```ts
// In convex/users/sync.ts, update syncFromInvitation args.role:
// Before:
//   role: v.union(v.literal('staff'), v.literal('client')),
// After:
    role: v.union(v.literal('admin'), v.literal('staff'), v.literal('client')),
```

**Step 2:** Verify compilation and that the invitation flow still works.

```bash
npx convex typecheck
```

**Step 3:** Commit.

```bash
git add convex/schema.ts convex/invitations/send.ts convex/invitations/internal.ts convex/users/sync.ts
git commit -m "feat: allow admin role in invitation flow

Extend the pendingInvitations schema and invitation actions to accept
'admin' as a valid role, enabling admins to invite other admins directly
from the team management UI."
```

---

### Task 5: Backend — `listPendingInvitations` query and `revokeInvitation` action

**Files:**
- No new files needed. Both already exist:
  - `convex/invitations/queries.ts` exports `listPendingInvitations`
  - `convex/invitations/manage.ts` exports `revokeInvitation` and `resendInvitation`

**Step 1:** Verify the existing functions meet Phase 4 requirements:

- `listPendingInvitations`: Returns all pending invitations for the admin's org, enriched with customer name. This is sufficient.
- `revokeInvitation`: Checks admin role, verifies org ownership, revokes in WorkOS, deletes local record. This is sufficient.
- `resendInvitation`: Re-sends an expired/stale invitation. This is sufficient.

No code changes needed for this task. The existing implementations are complete.

**Step 2:** Verify by reading the existing code.

```bash
npx convex typecheck
```

**Step 3:** No commit needed -- existing code is sufficient.

---

### Task 6: Backend — CRM list queries with ownership filter

**Files:**
- Modify: `convex/crm/contacts.ts`
- Modify: `convex/crm/companies.ts`
- Modify: `convex/crm/deals.ts`

**Step 1:** Add an optional `ownerFilter` argument to `listContacts`, `listCompanies`, and `listDeals`. When set to `"mine"`, use the `by_org_owner` index to return only the current user's records.

```ts
// convex/crm/contacts.ts — update listContacts
export const listContacts = query({
  args: {
    ownerFilter: v.optional(v.union(v.literal('all'), v.literal('mine'))),
  },
  handler: async (ctx, args) => {
    const { orgId, userRecord } = await requireCrmUser(ctx);

    if (args.ownerFilter === 'mine') {
      return await ctx.db
        .query('contacts')
        .withIndex('by_org_owner', (q) =>
          q.eq('orgId', orgId).eq('ownerUserId', userRecord._id)
        )
        .collect();
    }

    return await ctx.db
      .query('contacts')
      .withIndex('by_org', (q) => q.eq('orgId', orgId))
      .collect();
  },
});
```

```ts
// convex/crm/companies.ts — update listCompanies
export const listCompanies = query({
  args: {
    ownerFilter: v.optional(v.union(v.literal('all'), v.literal('mine'))),
  },
  handler: async (ctx, args) => {
    const { orgId, userRecord } = await requireCrmUser(ctx);

    if (args.ownerFilter === 'mine') {
      return await ctx.db
        .query('companies')
        .withIndex('by_org_owner', (q) =>
          q.eq('orgId', orgId).eq('ownerUserId', userRecord._id)
        )
        .collect();
    }

    return await ctx.db
      .query('companies')
      .withIndex('by_org', (q) => q.eq('orgId', orgId))
      .collect();
  },
});
```

```ts
// convex/crm/deals.ts — update listDeals
export const listDeals = query({
  args: {
    ownerFilter: v.optional(v.union(v.literal('all'), v.literal('mine'))),
  },
  handler: async (ctx, args) => {
    const { orgId, userRecord } = await requireCrmUser(ctx);

    if (args.ownerFilter === 'mine') {
      return await ctx.db
        .query('deals')
        .withIndex('by_org_owner', (q) =>
          q.eq('orgId', orgId).eq('ownerUserId', userRecord._id)
        )
        .collect();
    }

    return await ctx.db
      .query('deals')
      .withIndex('by_org', (q) => q.eq('orgId', orgId))
      .collect();
  },
});
```

Also update `listDealsByPipeline` to support the same filter:

```ts
// convex/crm/deals.ts — update listDealsByPipeline
export const listDealsByPipeline = query({
  args: {
    pipelineId: v.id('pipelines'),
    ownerFilter: v.optional(v.union(v.literal('all'), v.literal('mine'))),
  },
  handler: async (ctx, args) => {
    const { orgId, userRecord } = await requireCrmUser(ctx);
    const pipeline = await ctx.db.get('pipelines', args.pipelineId);
    ensureSameOrgEntity(orgId, pipeline, 'Pipeline not found');

    const allDeals = await ctx.db
      .query('deals')
      .withIndex('by_pipeline', (q) => q.eq('pipelineId', args.pipelineId))
      .collect();

    if (args.ownerFilter === 'mine') {
      return allDeals.filter((d) => d.ownerUserId === userRecord._id);
    }

    return allDeals;
  },
});
```

**Step 2:** Verify all callers still work (they pass no args currently, which defaults to `undefined` / show all -- backwards compatible).

```bash
npx convex typecheck
```

**Step 3:** Commit.

```bash
git add convex/crm/contacts.ts convex/crm/companies.ts convex/crm/deals.ts
git commit -m "feat: add ownerFilter arg to CRM list queries

Contacts, companies, and deals list queries now accept an optional
ownerFilter ('all' | 'mine') argument. When 'mine' is selected, queries
use the by_org_owner index for efficient filtering. Defaults to showing
all records (backwards compatible)."
```

---

### Task 7: UI — Members section in settings (table with role dropdown, remove button)

**Files:**
- Modify: `src/routes/_authenticated/settings.tsx`

**Step 1:** Add a "Team Members" card to the settings page that displays a table of org members. Each row shows avatar, name, email, role badge/dropdown, join date, and a remove button. Admin-only section (already gated by the existing `isAdmin` check).

Replace the full settings page content by adding the Members card between the Organization card and Notifications card:

```tsx
// Add these imports at the top of src/routes/_authenticated/settings.tsx
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, UserPlus, Mail, Clock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useAction } from 'convex/react';
// (useQuery and useAction already imported)
```

Then add the Members section component and render it inside the settings page `<div className="grid gap-6">` block, after the Organization card:

```tsx
{/* Team Members */}
<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-muted-foreground" />
        <CardTitle>Team Members</CardTitle>
      </div>
      <InviteMemberDialog />
    </div>
    <CardDescription>
      Manage your organization's team members and roles
    </CardDescription>
  </CardHeader>
  <CardContent>
    <MembersTable />
  </CardContent>
</Card>

{/* Pending Invitations */}
<Card>
  <CardHeader>
    <div className="flex items-center gap-2">
      <Mail className="h-5 w-5 text-muted-foreground" />
      <CardTitle>Pending Invitations</CardTitle>
    </div>
    <CardDescription>
      Invitations that haven't been accepted yet
    </CardDescription>
  </CardHeader>
  <CardContent>
    <PendingInvitationsTable />
  </CardContent>
</Card>
```

The `MembersTable` component:

```tsx
function MembersTable() {
  const members = useQuery(api.users.queries.listOrgMembers, { includeRemoved: true });
  const updateRole = useMutation(api.users.manage.updateUserRole);
  const removeMember = useAction(api.users.manageActions.removeOrgMember);
  const restoreUser = useMutation(api.users.manage.restoreUser);

  if (members === undefined) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">No team members found.</p>;
  }

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'staff') => {
    try {
      await updateRole({ userId: userId as any, newRole });
      toast.success('Role updated successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeMember({ userId: userId as any });
      toast.success('Member removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleRestore = async (userId: string) => {
    try {
      await restoreUser({ userId: userId as any });
      toast.success('Member restored');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore member');
    }
  };

  const getInitials = (firstName?: string, lastName?: string, email?: string) => {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (firstName) return firstName[0].toUpperCase();
    if (email) return email[0].toUpperCase();
    return '?';
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member._id} className={member.status === 'removed' ? 'opacity-50' : ''}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={member.profilePictureUrl} />
                  <AvatarFallback className="text-xs">
                    {getInitials(member.firstName, member.lastName, member.email)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{member.displayName}</p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
                {member.isCurrentUser && (
                  <Badge variant="outline" className="text-xs">You</Badge>
                )}
                {member.status === 'removed' && (
                  <Badge variant="destructive" className="text-xs">Removed</Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              {member.isCurrentUser || member.status === 'removed' || member.role === 'client' ? (
                <Badge variant="secondary" className="capitalize">
                  {member.role}
                </Badge>
              ) : (
                <Select
                  value={member.role || 'staff'}
                  onValueChange={(value) =>
                    handleRoleChange(member._id, value as 'admin' | 'staff')
                  }
                >
                  <SelectTrigger className="w-[110px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(member.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell className="text-right">
              {member.isCurrentUser ? null : member.status === 'removed' ? (
                <Button variant="ghost" size="sm" onClick={() => handleRestore(member._id)}>
                  Restore
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove member</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove {member.displayName} from the organization?
                        They will lose access to all CRM data. This action can be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => handleRemove(member._id)}
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

**Step 2:** Verify the shadcn Avatar component is installed. If not:

```bash
ls src/components/ui/avatar.tsx || npx shadcn@latest add avatar
npx tsc --noEmit
```

**Step 3:** Commit.

```bash
git add src/routes/_authenticated/settings.tsx
git commit -m "feat: add team members table to settings page

Displays all org members with avatar, name, email, role dropdown (admin
can change staff<->admin), join date, and remove/restore buttons. Includes
confirmation dialog for member removal."
```

---

### Task 8: UI — Invite member dialog (email + role fields, send via WorkOS)

**Files:**
- Modify: `src/routes/_authenticated/settings.tsx`

**Step 1:** Add the `InviteMemberDialog` component to the settings page. It renders a button that opens a dialog with email and role fields. On submit, calls the existing `sendInvitation` action.

```tsx
// Add this component in src/routes/_authenticated/settings.tsx

function InviteMemberDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'staff'>('staff');
  const [isSending, setIsSending] = useState(false);
  const sendInvitation = useAction(api.invitations.send.sendInvitation);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSending(true);
    try {
      await sendInvitation({
        email: email.trim().toLowerCase(),
        role,
      });
      toast.success(`Invitation sent to ${email}`);
      setEmail('');
      setRole('staff');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            Send an email invitation to join your organization.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'staff')}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Admins can manage team members and organization settings. Staff can manage CRM data.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!email.trim() || isSending}>
              {isSending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Send Invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Also add these imports at the top of the settings file (if not already present):

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
```

**Step 2:** Verify the page renders and the dialog opens.

```bash
npx tsc --noEmit
```

**Step 3:** Commit.

```bash
git add src/routes/_authenticated/settings.tsx
git commit -m "feat: add invite member dialog to settings page

Dialog with email and role fields that sends a WorkOS invitation. Role
options are Staff and Admin with a description of each."
```

---

### Task 9: UI — Pending invitations list with revoke capability

**Files:**
- Modify: `src/routes/_authenticated/settings.tsx`

**Step 1:** Add the `PendingInvitationsTable` component that shows all pending invitations with email, role, sent date, expiry status, and revoke/resend buttons.

```tsx
// Add this component in src/routes/_authenticated/settings.tsx

function PendingInvitationsTable() {
  const invitations = useQuery(api.invitations.queries.listPendingInvitations);
  const revokeInvitation = useAction(api.invitations.manage.revokeInvitation);
  const resendInvitation = useAction(api.invitations.manage.resendInvitation);

  if (invitations === undefined) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invitations.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending invitations.</p>;
  }

  const handleRevoke = async (invitationId: string) => {
    try {
      await revokeInvitation({ invitationId: invitationId as any });
      toast.success('Invitation revoked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke invitation');
    }
  };

  const handleResend = async (invitationId: string) => {
    try {
      await resendInvitation({ invitationId: invitationId as any });
      toast.success('Invitation resent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend invitation');
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Sent</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => {
          const isExpired = invitation.expiresAt < Date.now();
          return (
            <TableRow key={invitation._id}>
              <TableCell className="font-medium">{invitation.email}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="capitalize">
                  {invitation.role}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(invitation.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                {isExpired ? (
                  <Badge variant="destructive" className="text-xs">Expired</Badge>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right space-x-2">
                {isExpired && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResend(invitation._id)}
                  >
                    Resend
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                      Revoke
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke invitation</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to revoke the invitation for {invitation.email}?
                        They will no longer be able to join using this invitation link.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => handleRevoke(invitation._id)}
                      >
                        Revoke
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

**Step 2:** Verify the page compiles.

```bash
npx tsc --noEmit
```

**Step 3:** Commit.

```bash
git add src/routes/_authenticated/settings.tsx
git commit -m "feat: add pending invitations table to settings page

Shows all pending invitations with email, role, sent date, expiry status,
and revoke/resend action buttons with confirmation dialogs."
```

---

### Task 10: UI — "All" / "Mine" toggle on contacts, companies, deals lists

**Files:**
- Modify: `src/routes/_authenticated/contacts.tsx`
- Modify: `src/routes/_authenticated/companies.tsx`
- Modify: `src/routes/_authenticated/deals.tsx`
- Modify: `src/routes/_authenticated/pipeline.tsx`

**Step 1:** Install the shadcn `toggle-group` component if not present:

```bash
ls src/components/ui/toggle-group.tsx || npx shadcn@latest add toggle-group
```

**Step 2:** Add an ownership toggle to each list page. The toggle defaults to `"mine"` and passes the value to the corresponding Convex query.

For `contacts.tsx`, add the toggle in the filter bar area, above the existing search/filter controls:

```tsx
// Add import at top:
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// Add state:
const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine'>('mine');

// Update the query call to pass ownerFilter:
const contacts = useQuery(api.crm.contacts.listContacts, { ownerFilter });
```

Add the toggle UI in the filter bar, before the search input:

```tsx
<ToggleGroup
  type="single"
  value={ownerFilter}
  onValueChange={(v) => { if (v) setOwnerFilter(v as 'all' | 'mine'); }}
  className="shrink-0"
>
  <ToggleGroupItem value="mine" aria-label="My contacts" className="text-xs px-3">
    Mine
  </ToggleGroupItem>
  <ToggleGroupItem value="all" aria-label="All contacts" className="text-xs px-3">
    All
  </ToggleGroupItem>
</ToggleGroup>
```

Apply the same pattern to `companies.tsx`:

```tsx
const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine'>('mine');
const companies = useQuery(api.crm.companies.listCompanies, { ownerFilter });
// Same ToggleGroup UI in filter bar
```

Apply the same pattern to `deals.tsx`:

```tsx
const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine'>('mine');
const deals = useQuery(api.crm.deals.listDeals, { ownerFilter });
// Same ToggleGroup UI in filter bar
```

Apply the same pattern to `pipeline.tsx`. The pipeline board uses `getPipelineBoard` -- we need to check if this query also needs updating. If `getPipelineBoard` internally calls `listDealsByPipeline`, update it to accept and pass through the `ownerFilter`. Otherwise, filter client-side from the board data.

For `pipeline.tsx`:

```tsx
const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine'>('mine');
// Pass ownerFilter to the pipeline board query
// The pipeline board query likely needs to be updated too
```

Also update the CardTitle/header text to reflect the toggle:

```tsx
<CardTitle>{ownerFilter === 'mine' ? 'My contacts' : 'All contacts'}</CardTitle>
```

**Step 3:** Verify all pages compile and the toggle controls data flow.

```bash
npx tsc --noEmit
```

**Step 4:** Commit.

```bash
git add src/routes/_authenticated/contacts.tsx src/routes/_authenticated/companies.tsx src/routes/_authenticated/deals.tsx src/routes/_authenticated/pipeline.tsx src/components/ui/toggle-group.tsx
git commit -m "feat: add All/Mine ownership toggle to CRM list pages

Contacts, companies, deals, and pipeline pages now have a toggle group
that filters records by the current user's ownership. Defaults to 'Mine'
for a focused view. Passes ownerFilter to server-side Convex queries."
```

---

### Task 11: UI — Owner dropdown in detail modals

**Files:**
- Modify: `src/components/crm/deal-detail-modal.tsx`
- Modify: `src/components/crm/contact-detail-modal.tsx`
- Modify: `src/components/crm/company-detail-modal.tsx`

**Step 1:** Add an owner assignment dropdown to each detail modal's Info tab. The dropdown shows all active org members (fetched via `listOrgMembers`) and updates the entity's `ownerUserId` on selection change.

For each modal, add:

```tsx
// Add to imports:
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// Add query inside the component:
const orgMembers = useQuery(api.users.queries.listOrgMembers, {});
```

Then in the Info tab, add an Owner field (after other info fields):

```tsx
{/* Owner Assignment */}
<div className="space-y-1">
  <Label className="text-xs text-muted-foreground">Owner</Label>
  <Select
    value={deal.ownerUserId ?? 'unassigned'}
    onValueChange={async (value) => {
      try {
        await updateDeal({
          dealId: deal._id,
          ownerUserId: value === 'unassigned' ? undefined : value as any,
        });
      } catch (err) {
        // Handle error
      }
    }}
  >
    <SelectTrigger className="w-full h-9">
      <SelectValue placeholder="Unassigned" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="unassigned">Unassigned</SelectItem>
      {orgMembers?.map((member) => (
        <SelectItem key={member._id} value={member._id}>
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              <AvatarImage src={member.profilePictureUrl} />
              <AvatarFallback className="text-[10px]">
                {member.displayName[0]}
              </AvatarFallback>
            </Avatar>
            {member.displayName}
          </div>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

Apply the same pattern to `contact-detail-modal.tsx` (using `updateContact` with `ownerUserId`) and `company-detail-modal.tsx` (using `updateCompany` with `ownerUserId`).

**Step 2:** Ensure the update mutations (`updateDeal`, `updateContact`, `updateCompany`) accept `ownerUserId` as an optional field. Check existing implementations:

The `updateDeal` mutation in `convex/crm/deals.ts` should already accept `ownerUserId` based on the schema. Verify, and if not, add:

```ts
// In the updateDeal args, add:
ownerUserId: v.optional(v.id('users')),
```

And in the handler, include it in the patch:

```ts
if (args.ownerUserId !== undefined) {
  updates.ownerUserId = args.ownerUserId;
}
```

Do the same for `updateContact` and `updateCompany`.

**Step 3:** Verify compilation.

```bash
npx tsc --noEmit
npx convex typecheck
```

**Step 4:** Commit.

```bash
git add src/components/crm/deal-detail-modal.tsx src/components/crm/contact-detail-modal.tsx src/components/crm/company-detail-modal.tsx convex/crm/deals.ts convex/crm/contacts.ts convex/crm/companies.ts
git commit -m "feat: add owner dropdown to deal, contact, and company detail modals

Each detail modal's Info tab now includes an Owner dropdown showing all
active org members with avatars. Selecting a member updates the entity's
ownerUserId. Unassigned is also an option."
```

---

### Task 12: UI — Small owner avatar on pipeline deal cards

**Files:**
- Modify: `src/components/crm/deal-card.tsx`
- Modify: `src/components/crm/pipeline-board.tsx` (or wherever `DealCardData` is enriched with owner info)

**Step 1:** Extend the `DealCardData` type to include owner info and render a small avatar on each deal card.

```tsx
// Update DealCardData in deal-card.tsx:
export type DealCardData = {
  _id: Id<'deals'>;
  title: string;
  value?: number;
  contactName: string | null;
  stageId: Id<'pipelineStages'>;
  status: 'open' | 'won' | 'lost';
  ownerName?: string;
  ownerAvatarUrl?: string;
};
```

Add the avatar to the card JSX, at the bottom right:

```tsx
// Add import:
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// In the card JSX, after the contact name line:
{deal.ownerName && (
  <div className="mt-1.5 flex justify-end">
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar className="h-5 w-5">
          <AvatarImage src={deal.ownerAvatarUrl} />
          <AvatarFallback className="text-[9px]">
            {deal.ownerName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
          </AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {deal.ownerName}
      </TooltipContent>
    </Tooltip>
  </div>
)}
```

**Step 2:** Update the pipeline board data enrichment to include owner info when building `DealCardData` objects. In the `getPipelineBoard` query or wherever deals are mapped to `DealCardData`, look up the owner user record:

```ts
// In the pipeline board query or the component that creates DealCardData:
// For each deal, if deal.ownerUserId is set, look up the user:
const ownerUser = deal.ownerUserId ? await ctx.db.get(deal.ownerUserId) : null;
// Include in the card data:
ownerName: ownerUser
  ? `${ownerUser.firstName ?? ''} ${ownerUser.lastName ?? ''}`.trim() || ownerUser.email
  : undefined,
ownerAvatarUrl: ownerUser?.profilePictureUrl,
```

**Step 3:** Verify the pipeline page renders correctly with avatars.

```bash
npx tsc --noEmit
```

**Step 4:** Commit.

```bash
git add src/components/crm/deal-card.tsx src/components/crm/pipeline-board.tsx convex/crm/pipelines.ts
git commit -m "feat: show owner avatar on pipeline deal cards

Deal cards in the Kanban board now display a small avatar of the assigned
owner in the bottom-right corner with a tooltip showing the full name."
```

---

### Task 13: UI — Impersonation detection and banner (WorkOS AuthKit `act` claim)

**Files:**
- Modify: `src/components/layout/impersonation-banner.tsx`
- Modify: `convex/users/impersonate.ts`

**Step 1:** WorkOS AuthKit impersonation sets an `act` (actor) claim on the JWT when a platform admin is impersonating a user. The Convex auth identity may expose this as a custom claim. Update the impersonation detection to check for the `act` claim in addition to the existing local impersonation mechanism.

First, update `convex/users/impersonate.ts` to add a new query that checks both local impersonation and WorkOS AuthKit impersonation:

```ts
// Add to convex/users/impersonate.ts

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
```

**Step 2:** Update the `ImpersonationBanner` component to detect both local impersonation and WorkOS AuthKit impersonation. The WorkOS impersonation banner should be non-dismissible and show a "Stop Session" button that ends the impersonation session.

```tsx
// src/components/layout/impersonation-banner.tsx
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
  // Check local (admin-to-staff) impersonation
  const impersonatedUser = useQuery(api.users.impersonate.getImpersonationStatus);
  const stopImpersonating = useMutation(api.users.impersonate.stopImpersonating);

  // Check WorkOS AuthKit impersonation (platform admin)
  const workosImpersonation = useQuery(api.users.impersonate.getWorkosImpersonationStatus);

  // WorkOS AuthKit impersonation takes priority
  if (workosImpersonation) {
    const user = workosImpersonation.impersonatedUser;
    const displayName = user.firstName
      ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
      : user.email;

    const handleStopSession = () => {
      // WorkOS AuthKit impersonation session can be ended by navigating to
      // the WorkOS session end URL or by clearing the session cookie.
      // The standard approach is to redirect to the auth provider's logout
      // endpoint which terminates the impersonation session.
      window.location.href = '/api/auth/signout';
    };

    return (
      <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between animate-in fade-in slide-in-from-top duration-300">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          <span>
            Platform admin session — viewing as{' '}
            <span className="font-bold">{displayName}</span> ({user.role})
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleStopSession}
          className="h-8 gap-2 bg-background border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
        >
          <XCircle className="h-4 w-4" />
          Stop Session
        </Button>
      </div>
    );
  }

  // Local impersonation (admin impersonating another org member)
  if (!impersonatedUser) return null;

  const handleStop = async () => {
    try {
      await stopImpersonating();
      toast.success("Stopped impersonating");
      window.location.reload();
    } catch (error) {
      toast.error("Failed to stop impersonating");
    }
  };

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between animate-in fade-in slide-in-from-top duration-300">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <UserCheck className="h-4 w-4" />
        <span>
          Viewing as{' '}
          <span className="font-bold">
            {impersonatedUser.firstName || impersonatedUser.email}
          </span>{' '}
          ({impersonatedUser.role})
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleStop}
        className="h-8 gap-2 bg-background border-primary/30 hover:bg-primary/5 hover:text-primary transition-colors"
      >
        <XCircle className="h-4 w-4" />
        Stop Impersonating
      </Button>
    </div>
  );
}
```

**Step 3:** Verify the banner renders correctly and both impersonation paths are handled.

```bash
npx tsc --noEmit
```

**Step 4:** Commit.

```bash
git add src/components/layout/impersonation-banner.tsx convex/users/impersonate.ts
git commit -m "feat: detect WorkOS AuthKit impersonation via act claim

Add getWorkosImpersonationStatus query that checks for the JWT act claim
set by WorkOS AuthKit during platform admin impersonation. Update the
ImpersonationBanner to show an amber-colored warning banner for WorkOS
impersonation sessions with a Stop Session button, distinct from the
local admin-to-staff impersonation banner."
```

---

### Task 14: Backend — Block restricted actions during impersonation

**Files:**
- Modify: `convex/crm/authz.ts`

**Step 1:** Add a helper function to `authz.ts` that checks if the current session is an impersonated session and blocks restricted actions (billing changes, org deletion, role changes).

```ts
// Add to convex/crm/authz.ts

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
```

**Step 2:** Add `blockDuringImpersonation()` calls to sensitive mutations:

- `convex/users/manage.ts` — `updateUserRole` (already blocked via `impersonatingUserId` check, but add the `act` claim check too)
- `convex/users/manage.ts` — `removeUser`
- `convex/workos/updateOrg.ts` — `updateOrganization`
- `convex/invitations/send.ts` — `sendInvitation` (optional -- debatable whether invites should be blocked)

Example usage in `updateUserRole`:

```ts
// At the top of the handler, after auth check:
await blockDuringImpersonation(ctx);
```

Note: For actions (which use `ActionCtx` not `QueryCtx`/`MutationCtx`), you cannot call `blockDuringImpersonation` directly since it accesses `ctx.db`. Instead, add an internal query `isImpersonatedSession` and call it via `ctx.runQuery` in actions.

**Step 3:** Verify compilation.

```bash
npx convex typecheck
```

**Step 4:** Commit.

```bash
git add convex/crm/authz.ts convex/users/manage.ts convex/workos/updateOrg.ts
git commit -m "feat: block sensitive actions during impersonation sessions

Add blockDuringImpersonation guard to authz.ts that checks both WorkOS
AuthKit act claim and local impersonation. Applied to role changes,
member removal, and org updates."
```

---

## Summary of all tasks

| Task | Type | File(s) | Description |
|------|------|---------|-------------|
| 1 | Backend | `convex/users/queries.ts` | Update `listOrgMembers` for all members + avatar data |
| 2 | Backend | `convex/users/manage.ts` | Add `updateUserRole` mutation |
| 3 | Backend | `convex/users/manageActions.ts` | Add `removeOrgMember` action (WorkOS membership removal) |
| 4 | Backend | `convex/schema.ts`, `convex/invitations/send.ts`, `convex/invitations/internal.ts`, `convex/users/sync.ts` | Allow admin role in invitation flow |
| 5 | Backend | (none) | Verify existing `listPendingInvitations` + `revokeInvitation` |
| 6 | Backend | `convex/crm/contacts.ts`, `convex/crm/companies.ts`, `convex/crm/deals.ts` | Add `ownerFilter` arg to list queries |
| 7 | UI | `src/routes/_authenticated/settings.tsx` | Members table with role dropdown + remove button |
| 8 | UI | `src/routes/_authenticated/settings.tsx` | Invite member dialog |
| 9 | UI | `src/routes/_authenticated/settings.tsx` | Pending invitations table with revoke |
| 10 | UI | `src/routes/_authenticated/contacts.tsx`, `companies.tsx`, `deals.tsx`, `pipeline.tsx` | All/Mine toggle |
| 11 | UI | `src/components/crm/deal-detail-modal.tsx`, `contact-detail-modal.tsx`, `company-detail-modal.tsx`, `convex/crm/deals.ts`, `contacts.ts`, `companies.ts` | Owner dropdown in detail modals |
| 12 | UI | `src/components/crm/deal-card.tsx`, `pipeline-board.tsx`, `convex/crm/pipelines.ts` | Owner avatar on deal cards |
| 13 | UI + Backend | `src/components/layout/impersonation-banner.tsx`, `convex/users/impersonate.ts` | WorkOS AuthKit impersonation detection + banner |
| 14 | Backend | `convex/crm/authz.ts`, `convex/users/manage.ts`, `convex/workos/updateOrg.ts` | Block restricted actions during impersonation |

## Dependency order

Tasks can be executed in this order (some are parallelizable):

1. Tasks 1-5 (backend) can be done in sequence
2. Task 6 (backend owner filter) is independent
3. Tasks 7-9 (settings UI) depend on Tasks 1-5
4. Task 10 (toggle) depends on Task 6
5. Task 11 (owner dropdown) depends on Task 1 and Task 6
6. Task 12 (deal card avatar) depends on Task 11
7. Tasks 13-14 (impersonation) are independent of all other tasks
