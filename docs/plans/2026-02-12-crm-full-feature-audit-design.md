# CRM Full Feature Audit - Design Document

**Date:** 2026-02-12
**Status:** Approved
**Target User:** Small teams (2-10 people)
**Interaction Pattern:** Modal dialogs (consistent with existing deal detail modal)

## Overview

Round out the CRM from MVP to a complete small-team CRM. Six phases covering core CRUD, relationships, search, team management, reporting, and schema future-proofing.

---

## Phase 1: Core CRUD Completion

### Contact Detail Modal

Opened by clicking any contact row in the contacts list.

**Header:** Full name, title, email, phone — with inline edit capability.

**Tabs:**
- **Info** — Editable fields: first name, last name, email, phone, title, company (dropdown). Save/Cancel on change detection.
- **Deals** — Deals linked via `dealContacts`. Shows title, value, stage badge. Click opens deal modal. "Link to deal" button.
- **Activity** — Reuses `ActivityTimeline` component filtered by `contactId`. Quick-log footer.

**Actions:** Delete button with confirmation dialog (hard delete).

### Company Detail Modal

Same pattern as contact modal.

**Header:** Company name, industry badge, website link, phone.

**Tabs:**
- **Info** — Editable: name, website, phone, industry (preset dropdown: Technology, Healthcare, Finance, Retail, Manufacturing, Services, Other), notes textarea.
- **Contacts** — People at this company. "Add contact" button.
- **Deals** — Deals linked via `dealCompanies`.
- **Activity** — Timeline filtered by `companyId`.

### Deal Detail Modal Enhancement

Upgrade existing modal:
- **Info tab** fully editable (title, value, currency, expected close date, notes, status, assignee dropdown)
- **Contacts tab** shows LINKED contacts (via `dealContacts`), not all contacts. "Link contact" button.
- **Company tab** (new) showing linked companies. "Link company" button.
- Delete deal with confirmation.

### Backend Additions

| Function | Type | Description |
|----------|------|-------------|
| `getContact(contactId)` | query | Single contact with enriched data |
| `getCompany(companyId)` | query | Single company with enriched data |
| `updateContact(contactId, fields)` | mutation | Selective field update |
| `updateCompany(companyId, fields)` | mutation | Selective field update |
| `deleteContact(contactId)` | mutation | Hard delete + remove from dealContacts |
| `deleteCompany(companyId)` | mutation | Hard delete + remove from dealCompanies |
| `deleteDeal(dealId)` | mutation | Hard delete + remove junctions + activities |
| `listContactActivities(contactId)` | query | Activities for a contact |
| `listCompanyActivities(companyId)` | query | Activities for a company |

**Schema changes:**
- Add `by_contact_created` index on activities table
- Add `by_company_created` index on activities table
- Add `companyId: v.optional(v.id('companies'))` to contacts table (Phase 1, needed for detail modal)
- Add `emailMessageId: v.optional(v.string())` to activities table (future email prep)

### List Page Upgrades

Both contacts and companies list pages:
- Click-to-open (clicking a row opens detail modal)
- Proper table layout with columns (replace simple cards)
- Owner avatar/name column

---

## Phase 2: Relationship Management

### Contact-Company Linking

Direct `companyId` field on contacts (added in Phase 1 schema). Shown as dropdown in contact detail Info tab and as column in contacts list.

### Deal-Contact Linking

From deal detail modal Contacts tab:
- "Link contact" combobox/search dropdown
- Optional role: Decision Maker, Champion, Influencer, User
- Creates `dealContacts` row
- "Unlink" (X icon) removes junction record

**Backend:**
- `linkContactToDeal(dealId, contactId, role?)` mutation
- `unlinkContactFromDeal(dealId, contactId)` mutation
- `listDealContacts(dealId)` query — contacts with roles
- `listContactDeals(contactId)` query — deals for a contact

### Deal-Company Linking

Same pattern:
- "Link company" searchable dropdown
- Optional relationship type: Customer, Partner, Vendor
- Creates `dealCompanies` row

**Backend:**
- `linkCompanyToDeal(dealId, companyId, relationshipType?)` mutation
- `unlinkCompanyFromDeal(dealId, companyId)` mutation
- `listDealCompanies(dealId)` query
- `listCompanyDeals(companyId)` query

### Cross-Navigation

All entity names are clickable and open the corresponding detail modal.

---

## Phase 3: Search & Filtering

### Global Search (Command Palette)

- Command-K shortcut opens shadcn `CommandDialog`
- Searches deals, contacts, companies by name/title
- Results grouped by entity type with icons
- Click opens appropriate detail modal
- Backend: `globalSearch(query)` query with prefix matching, top 5 per type

### Per-List Filtering

Client-side filtering (sufficient for <1000 records per small team).

**Deals:**
- Search by title (text input)
- Status toggle: Open / Won / Lost
- Stage dropdown
- Owner/assignee dropdown
- Sort: Created date, Value, Expected close date

**Contacts:**
- Search by name or email (text input)
- Company dropdown
- Owner dropdown
- Sort: Name, Created date

**Companies:**
- Search by name (text input)
- Industry dropdown
- Owner dropdown
- Sort: Name, Created date

---

## Phase 4: Team Management

### Members Section in Settings (admin-only)

**Members List:**
- Table: Avatar, Name, Email, Role badge, Joined date
- Role dropdown per row (admin can change staff↔admin, not own role)
- Remove member button with confirmation
- Member count display

**Invite Members:**
- "Invite" button → dialog with Email + Role (staff/admin) fields
- Sends via WorkOS
- Shows pending invitations with revoke capability

### Ownership & Assignment

**"My/All" Toggle:**
- Top of deals, contacts, companies lists: "All" | "Mine" toggle
- "Mine" = `ownerUserId` matches current user
- Default to "Mine"

**Owner in Detail Modals:**
- Owner dropdown showing team members
- Updates `ownerUserId` on change

**Pipeline Board:**
- "All deals" | "My deals" toggle
- Small owner avatar on deal cards

### Backend Additions

| Function | Type | Description |
|----------|------|-------------|
| `listOrgMembers()` | query | Users in current org |
| `updateUserRole(userId, role)` | mutation | Admin-only role change |
| `removeOrgMember(userId)` | action | WorkOS removal + local update |
| `inviteMember(email, role)` | action | WorkOS invitation + pendingInvitation |
| `listPendingInvitations()` | query | Pending invites for org |
| `revokeInvitation(invitationId)` | action | Revoke via WorkOS + delete record |

---

## Phase 5: Dashboard & Reporting

### Enhanced Dashboard

**Metric Cards (4):**
1. **Pipeline Value** — Sum of open deal values + deal count
2. **Won This Month** — Won deal count + value for current month
3. **Conversion Rate** — Won / (Won + Lost) % for last 30 days
4. **Upcoming Tasks** — Activities with type='task', dueAt in next 7 days, not completed

**Existing sections enhanced:**
- Recent Activity: add type icon, linked entity name, relative time
- Quick Actions: keep as-is

**New section:**
- **Deals Closing Soon** — Open deals with expectedCloseDate in next 30 days, sorted soonest first. Title, value, stage badge, days remaining.

### Reports Page (`/reports`)

New sidebar nav item between Activities and Settings.

**Sales Funnel:**
- Horizontal bar chart: deal count and value per stage
- Uses stage colors from `stage-colors.ts`

**Won/Lost Analysis:**
- Time chart: won vs lost per month (last 6 months)
- Win rate trend line
- Average deal size for won deals

**Pipeline by Owner:**
- Table: member name, # open deals, pipeline value, # won, # lost, win rate

**Activity Summary:**
- Activities per week (last 8 weeks)
- Breakdown by type

**Chart library:** Recharts (lightweight, React-native)

### Backend Additions

| Function | Type | Description |
|----------|------|-------------|
| `getDashboardMetrics()` | query | Pipeline value, won this month, conversion rate, upcoming tasks |
| `getDealsClosingSoon(days)` | query | Open deals closing within N days |
| `getSalesFunnel(pipelineId)` | query | Deal count/value per stage |
| `getWonLostByMonth(months)` | query | Won/lost grouped by month |
| `getPipelineByOwner()` | query | Per-member pipeline stats |
| `getActivitySummary(weeks)` | query | Activity counts by week and type |

---

## Phase 6: Schema Future-Proofing

Already handled:
- `companyId` on contacts — done in Phase 1
- `emailMessageId` on activities — done in Phase 1

No additional UI. When email integration arrives, it will create activity records with `type: 'email'`, populated `body`, and `emailMessageId` for deduplication.

---

## Implementation Order

| Phase | Dependencies | Estimated Scope |
|-------|-------------|-----------------|
| 1. Core CRUD | None | ~10 backend functions, 3 modal components, 2 list page rewrites |
| 2. Relationships | Phase 1 | ~8 backend functions, UI additions to existing modals |
| 3. Search & Filter | Phase 1 | 1 backend query, command palette component, filter bars |
| 4. Team Management | Phase 1 | ~6 backend functions, settings page additions, ownership UI |
| 5. Dashboard & Reports | Phases 1-4 | ~6 backend queries, dashboard rewrite, new reports route |
| 6. Schema Prep | None (done in Phase 1) | N/A |
