# Current TODO - iSaaSIT CRM

**Active Phase:** Phase 5 - Team Management & Impersonation (Complete ✅)

## Summary

All Phase 5 tasks have been implemented:

### Backend Tasks (Complete ✅)

- ✅ Task 1: Updated `listOrgMembers` for all members + avatar data
- ✅ Task 2: Added `updateUserRole` mutation
- ✅ Task 3: Added `removeOrgMember` action (WorkOS membership removal)
- ✅ Task 4: Allowed admin role in invitation flow
- ✅ Task 5: Verified existing `listPendingInvitations` + `revokeInvitation`
- ✅ Task 6: Added `ownerFilter` arg to CRM list queries
- ✅ Task 14: Block restricted actions during impersonation

### UI Tasks (Complete ✅)

- ✅ Task 7: Members section in settings (table with role dropdown, remove button)
- ✅ Task 8: Invite member dialog (email + role fields)
- ✅ Task 9: Pending invitations list with revoke capability
- ✅ Task 10: "All" / "Mine" toggle on contacts, companies, deals, pipeline lists
- ✅ Task 11: Owner dropdown in deal, contact, company detail modals
- ✅ Task 12: Owner avatar on pipeline deal cards
- ✅ Task 13: Impersonation detection and banner (WorkOS AuthKit `act` claim)

## Files Modified

### Backend
- `convex/users/queries.ts`
- `convex/users/manage.ts`
- `convex/users/manageActions.ts`
- `convex/users/internal.ts`
- `convex/users/impersonate.ts`
- `convex/users/sync.ts`
- `convex/users/syncActions.ts`
- `convex/invitations/send.ts`
- `convex/invitations/internal.ts`
- `convex/crm/contacts.ts`
- `convex/crm/companies.ts`
- `convex/crm/deals.ts`
- `convex/crm/pipelines.ts`
- `convex/crm/authz.ts`
- `convex/workos/updateOrg.ts`
- `convex/schema.ts`
- `convex/webhooks/workosShared.ts`

### Frontend
- `src/routes/_authenticated/settings.tsx`
- `src/routes/_authenticated/contacts.tsx`
- `src/routes/_authenticated/companies.tsx`
- `src/routes/_authenticated/deals.tsx`
- `src/routes/_authenticated/pipeline.tsx`
- `src/routes/_authenticated/dashboard.tsx`
- `src/components/crm/deal-detail-modal.tsx`
- `src/components/crm/contact-detail-modal.tsx`
- `src/components/crm/company-detail-modal.tsx`
- `src/components/crm/deal-card.tsx`
- `src/components/layout/impersonation-banner.tsx`
- `src/components/ui/toggle.tsx` (new)
- `src/components/ui/toggle-group.tsx` (new)

## Next Steps

- Manual QA pass for team management features
- Test invitation flow end-to-end
- Verify ownership filtering works correctly
- Test impersonation detection and blocking
