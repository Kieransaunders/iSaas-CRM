# CRM Expansion Design — From MVP to Awesome SaaS Starter

**Date:** 2026-02-13
**Status:** Draft — Awaiting Approval
**Target:** Small teams (2-10 people), SaaS CRM starter template

## Overview

Expand the existing CRM from Phase 1 (core CRUD) into a complete, polished SaaS CRM starter with: relationship management, search, team management, custom fields, org inbox, email sequences, AI assistants, pipeline customization, CSV import/export, dashboard/reporting, and form builder integration.

---

## Phase 2: Relationship Management

**Goal:** Link contacts and companies to deals with roles.

### Deal-Contact Linking
- Deal detail modal → Contacts tab → "Link contact" combobox
- Optional role: Decision Maker, Champion, Influencer, User
- Creates `dealContacts` junction row
- "Unlink" (X icon) removes junction

### Deal-Company Linking
- Deal detail modal → Company tab → "Link company" combobox
- Optional relationship: Customer, Partner, Vendor
- Creates `dealCompanies` junction row

### Cross-Navigation
- All entity names are clickable → open the appropriate detail modal

### Backend
| Function | Type | Description |
|----------|------|-------------|
| `linkContactToDeal` | mutation | Create dealContacts row |
| `unlinkContactFromDeal` | mutation | Remove dealContacts row |
| `listDealContacts` | query | Contacts for a deal with roles |
| `listContactDeals` | query | Deals for a contact |
| `linkCompanyToDeal` | mutation | Create dealCompanies row |
| `unlinkCompanyFromDeal` | mutation | Remove dealCompanies row |
| `listDealCompanies` | query | Companies for a deal |
| `listCompanyDeals` | query | Deals for a company |

---

## Phase 3: Search & Filtering

**Goal:** Make it fast to find anything.

### Global Search (Cmd-K)
- shadcn `CommandDialog` triggered by Cmd-K
- Searches deals, contacts, companies by name/title
- Results grouped by entity type with icons
- Click opens detail modal
- Backend: `globalSearch(query)` — prefix match, top 5 per type

### Per-List Filtering (Client-Side)
**Deals:** Search title, status toggle (Open/Won/Lost), stage dropdown, owner dropdown, sort (created, value, close date)
**Contacts:** Search name/email, company dropdown, owner dropdown, sort (name, created)
**Companies:** Search name, industry dropdown, owner dropdown, sort (name, created)

---

## Phase 4: Team Management & Impersonation

**Goal:** Full team CRUD, ownership, and platform admin support capabilities.

### Members Section (Settings, admin-only)
- Table: Avatar, Name, Email, Role badge, Joined date
- Role dropdown (admin can change staff↔admin, not own role)
- Remove member with confirmation
- "Invite" button → dialog (email + role)
- Sends via WorkOS, shows pending invitations with revoke

### Ownership & Assignment
- "All" | "Mine" toggle on deals, contacts, companies lists (default: Mine)
- Owner dropdown in detail modals
- Small owner avatar on pipeline deal cards

### Platform Superadmin Impersonation (WorkOS AuthKit)
- Enable WorkOS User Impersonation in dashboard (per-environment)
- Impersonation initiated from WorkOS Dashboard → Users → Impersonate
- Requires mandatory reason (audit logged)
- 60-minute session limit
- App detects impersonation via `act` claim in access token / `impersonator` field in auth response
- **Impersonation banner:** Prominent top banner when session is active, showing impersonated user name and "Stop Session" button
- **Restricted actions during impersonation:** Block billing changes, org deletion, role changes

### Backend
| Function | Type | Description |
|----------|------|-------------|
| `listOrgMembers` | query | Users in current org |
| `updateUserRole` | mutation | Admin-only role change |
| `removeOrgMember` | action | WorkOS removal + local update |
| `inviteMember` | action | WorkOS invitation + pending record |
| `listPendingInvitations` | query | Pending invites for org |
| `revokeInvitation` | action | Revoke via WorkOS + delete record |
| `isImpersonating` | query | Check if current session is impersonated |

---

## Phase 5: Custom Fields

**Goal:** Let org admins define their own data fields on contacts, companies, and deals.

### Architecture
- New `fieldDefinitions` table: org-scoped definitions specifying field name, type, entity, options
- `customFields` JSON blob stored on each entity (contacts, companies, deals)
- Schema: `customFields: v.optional(v.any())` on contacts, companies, deals tables

### Field Types Supported
- Text (single line)
- Textarea (multi line)
- Number
- Date
- Select (single, with options defined by admin)
- Multi-select
- Checkbox (boolean)
- URL

### Admin UI (Settings → Custom Fields)
- Table per entity type (Contacts, Companies, Deals)
- Add field: name, type, required toggle, options (for select types)
- Reorder fields (drag-drop)
- Delete field (with confirmation — data loss warning)

### Display
- Custom fields render below standard fields in Info tabs of detail modals
- Custom fields show as additional columns in list tables (admin-configurable which columns show)
- Edit mode: renders appropriate input for each field type

### Backend
| Function | Type | Description |
|----------|------|-------------|
| `listFieldDefinitions` | query | All field defs for current org |
| `createFieldDefinition` | mutation | Add new custom field |
| `updateFieldDefinition` | mutation | Rename, reorder, update options |
| `deleteFieldDefinition` | mutation | Remove field def (data remains in blobs) |

---

## Phase 6: Kanban Customization

**Goal:** Custom pipeline stages, multiple pipelines, stage automation.

### Multiple Pipelines
- Pipeline selector dropdown on `/pipeline` page
- "New Pipeline" button → dialog (name)
- Each pipeline has its own stages

### Custom Stages
- Settings → Pipelines section
- Drag-to-reorder stages within a pipeline
- Add/rename/delete stages
- Win probability per stage (optional percentage)
- Color assignment per stage

### Stage Automation Rules
- Per-stage rules configured in settings:
  - Auto-set status to "won" when moved to final stage
  - Auto-create activity when deal enters a stage
  - Auto-assign deal to specific team member on stage entry

### Backend
| Function | Type | Description |
|----------|------|-------------|
| `createPipeline` | mutation | New pipeline with default stages |
| `updatePipeline` | mutation | Rename pipeline |
| `deletePipeline` | mutation | Delete pipeline + all stages + unlink deals |
| `createStage` | mutation | Add stage to pipeline |
| `updateStage` | mutation | Rename, reorder, set probability/color |
| `deleteStage` | mutation | Remove stage (must move deals first) |
| `listStageAutomations` | query | Automation rules for a stage |
| `upsertStageAutomation` | mutation | Create/update automation rule |

---

## Phase 7: Org Inbox (Email Integration via WorkOS Pipes)

**Goal:** Shared team inbox at `sales@orgdomain.com` that auto-links emails to CRM contacts and deals.

### Architecture
- **WorkOS Pipes** handles OAuth connection to Gmail (Google Workspace)
- Org admin connects the shared mailbox via Pipes widget — Pipes manages tokens, refresh, and credential storage
- CRM reads/sends email via Gmail API using access tokens from Pipes
- No MX records, no SMTP config, no inbound webhook infrastructure needed
- **Gmail only for v1** — Microsoft 365 / Outlook support can be added later with the same pattern

### How It Works
1. Org admin goes to Settings → Inbox → clicks "Connect Email"
2. WorkOS Pipes widget opens → admin authorizes Gmail/Outlook for `sales@orgdomain.com`
3. Pipes stores OAuth tokens, handles automatic refresh
4. **Sync job** (Convex scheduled action) polls for new emails periodically:
   - Fetches new emails via Gmail API / Microsoft Graph using `workos.pipes.getAccessToken()`
   - Auto-matching: sender email matched against contacts table
   - **Known contact:** Create activity (type: 'email') linked to contact + any associated deals
   - **Unknown sender:** Auto-create contact with sender email/name, create activity, flag as "New Lead"
5. Email stored as activity with `emailMessageId` for dedup (field already in schema)

### Inbox UI (`/inbox` — new route)
- Unified inbox view showing all synced emails
- Filter: All / Unread / Linked / Unlinked
- Click email → shows full thread + linked contact/deal
- Manual link button for unlinked emails
- Reply button (sends via connected email account's API)

### Outbound Email
- Sends via Gmail API / Microsoft Graph (same connected account)
- Send from detail modals (contact, deal) or from inbox
- Outbound emails also logged as activities
- No SMTP credentials needed — Pipes handles auth

### Settings → Inbox
- "Connect Email" button → WorkOS Pipes widget (Gmail / Microsoft 365)
- Connection status indicator (connected / needs reauth / disconnected)
- Auto-linking toggle
- New lead auto-creation toggle
- Sync frequency (every 1 / 5 / 15 minutes)

### Backend
| Function | Type | Description |
|----------|------|-------------|
| `syncInboxEmails` | scheduled action | Poll Gmail/Graph API for new emails, auto-link |
| `processInboundEmail` | mutation | Match sender, create activity, create lead |
| `listInboxEmails` | query | All email activities for org |
| `sendEmail` | action | Send via Gmail API / Graph using Pipes token |
| `getEmailAccessToken` | action | Get fresh token from WorkOS Pipes |
| `configureInbox` | mutation | Save inbox settings |
| `getInboxConfig` | query | Get current inbox config |

### Packages
```
@workos-inc/node (already installed — Pipes API included)
googleapis (Gmail API client — v1 only, add @microsoft/microsoft-graph-client later for Outlook)
```

---

## Phase 8: Email Templates & Sequences

**Goal:** Pre-built email templates and automated multi-step drip sequences.

### Email Templates
- Settings → Email Templates
- Create template: name, subject, body (with merge fields: `{{contact.firstName}}`, `{{deal.title}}`, etc.)
- Use template when composing email from any detail modal
- Template library per org

### Email Sequences
- Settings → Sequences
- Create sequence: name, trigger (manual enrollment or stage-based)
- Steps: delay (days) + template selection
- Enrollment: manually enroll a contact or auto-enroll when deal enters a stage
- Stop conditions: contact replies, deal status changes, manual unenrollment
- Sequence dashboard: enrolled contacts, step progress, open/reply rates (basic)

### Backend
| Function | Type | Description |
|----------|------|-------------|
| `listEmailTemplates` | query | Templates for org |
| `createEmailTemplate` | mutation | New template |
| `updateEmailTemplate` | mutation | Edit template |
| `deleteEmailTemplate` | mutation | Remove template |
| `listSequences` | query | Sequences for org |
| `createSequence` | mutation | New sequence with steps |
| `updateSequence` | mutation | Edit sequence |
| `enrollInSequence` | mutation | Add contact to sequence |
| `unenrollFromSequence` | mutation | Remove contact |
| `processSequenceSteps` | scheduled action | Cron job to send next steps |

### Schema Additions
- `emailTemplates` table: orgId, name, subject, body, mergeFields, createdAt, updatedAt
- `sequences` table: orgId, name, trigger, isActive, createdAt, updatedAt
- `sequenceSteps` table: sequenceId, order, delayDays, templateId
- `sequenceEnrollments` table: sequenceId, contactId, dealId?, currentStep, status (active/completed/stopped), enrolledAt

---

## Phase 9: CSV Import/Export

**Goal:** Bulk data operations for contacts, companies, and deals.

### Import
- Import button on contacts, companies, deals list pages
- Upload CSV → preview table showing mapped columns
- Column mapping UI: match CSV headers to CRM fields (including custom fields)
- Validation: required fields, email format, duplicate detection (by email for contacts)
- Import modes: "Create new" or "Update existing + create new"
- Progress indicator for large imports
- Summary: X created, Y updated, Z skipped (with downloadable error report)

### Export
- Export button on each list page
- Exports current filtered view (respects active filters)
- CSV download with all standard + custom fields
- Option to select which columns to include

### Backend
| Function | Type | Description |
|----------|------|-------------|
| `importContacts` | action | Batch create/update contacts from parsed CSV |
| `importCompanies` | action | Batch create/update companies |
| `importDeals` | action | Batch create/update deals |
| `exportContacts` | action | Generate CSV string |
| `exportCompanies` | action | Generate CSV string |
| `exportDeals` | action | Generate CSV string |

---

## Phase 10: Dashboard & Reporting

**Goal:** Actionable metrics and visual reports.

### Enhanced Dashboard
**Metric Cards (4):**
1. Pipeline Value — sum of open deal values + deal count
2. Won This Month — won deal count + value
3. Conversion Rate — won / (won + lost) % for last 30 days
4. Upcoming Tasks — activities with type='task', due in next 7 days

**New Sections:**
- Deals Closing Soon — open deals with expectedCloseDate in next 30 days
- Enhanced activity feed with type icons, entity links, relative time

### Reports Page (`/reports`)
New sidebar nav item.

- **Sales Funnel:** Horizontal bar chart — deal count/value per stage
- **Won/Lost Analysis:** Monthly trend (last 6 months), win rate line, avg deal size
- **Pipeline by Owner:** Table — member, open deals, pipeline value, won, lost, win rate
- **Activity Summary:** Weekly activity counts (last 8 weeks), breakdown by type

**Chart library:** Recharts

### Backend
| Function | Type | Description |
|----------|------|-------------|
| `getDashboardMetrics` | query | Pipeline value, won this month, conversion, tasks |
| `getDealsClosingSoon` | query | Open deals closing within N days |
| `getSalesFunnel` | query | Deal count/value per stage |
| `getWonLostByMonth` | query | Monthly won/lost data |
| `getPipelineByOwner` | query | Per-member stats |
| `getActivitySummary` | query | Weekly activity breakdown |

---

## Phase 11: AI Integration (Flowise + ElevenLabs)

**Goal:** Text-based AI assistant (Flowise) + voice AI agent (ElevenLabs), both customer-facing and internal.

### Flowise Text Chat

**Customer-Facing Widget (Landing Page / Public Site):**
- `flowise-embed-react` package → `<BubbleChat>` component on public pages
- Chatflow configured in Flowise dashboard for lead capture & FAQs
- Captures visitor info → creates contact + activity in CRM via Flowise tool calls
- Config via env vars: `VITE_FLOWISE_PUBLIC_CHATFLOW_ID`, `VITE_FLOWISE_API_HOST`

**Internal CRM Assistant (Authenticated Pages):**
- `<BubbleChat>` component in authenticated layout (every CRM page)
- Different chatflow ID — this one has CRM context tools
- Convex action proxies requests to Flowise (keeps API key server-side)
- Passes CRM context: current user, org, active deal/contact via `overrideConfig.vars`
- Use cases: "Summarize this deal", "Draft follow-up email", "What deals close this week?"

**Packages:**
```
npm install flowise-embed flowise-embed-react flowise-sdk
```

### ElevenLabs Voice Agent

**Customer-Facing Voice Widget:**
- ElevenLabs Conversational AI widget embedded on landing/public pages
- Visitors click to start voice conversation
- Agent answers questions, captures leads, routes to sales
- Lead data POSTed to CRM webhook → creates contact + activity

**Internal Voice Assistant:**
- Optional voice input in CRM assistant (microphone button in chat)
- ElevenLabs handles speech-to-text, Flowise processes the query, ElevenLabs speaks the response

**Configuration:**
- ElevenLabs agent ID stored in settings
- API key stored server-side (Convex env vars)
- Webhook URL for lead capture from voice conversations

### Settings → AI Assistants
- Enable/disable public chatbot
- Enable/disable internal assistant
- Enable/disable voice agent
- Flowise API host + chatflow IDs
- ElevenLabs agent ID
- Test connection buttons

### Backend
| Function | Type | Description |
|----------|------|-------------|
| `proxyFlowiseQuery` | action | Server-side call to Flowise with CRM context |
| `aiLeadWebhook` | httpAction | Receive lead data from AI agents |
| `getAiConfig` | query | AI assistant settings for org |
| `updateAiConfig` | mutation | Update AI settings |

---

## Phase 12: Form Builder Integration

**Goal:** External form builder tool submits data to CRM via webhook/API.

### Architecture
- CRM exposes a Convex HTTP endpoint per org for form submissions
- External form builder (separate project) POSTs to this endpoint
- Each form has a configuration in the CRM defining what entity to create

### Form Configuration (Settings → Forms)
- Create form config: name, entity action (create contact, create deal, create contact + deal, log activity)
- Field mapping: form field name → CRM field (including custom fields)
- API key generated per form config (for authentication)
- Webhook URL displayed for copy/paste into form builder

### Submission Processing
1. External form POST hits Convex HTTP endpoint with API key
2. Validate API key → look up form config
3. Map submitted fields to CRM fields
4. Execute configured action (create contact, deal, etc.)
5. Log activity: "Form submitted: {form_name}"
6. Return success/error response

### Backend
| Function | Type | Description |
|----------|------|-------------|
| `formSubmissionWebhook` | httpAction | Receive form data |
| `processFormSubmission` | mutation | Create entities per form config |
| `listFormConfigs` | query | All form configs for org |
| `createFormConfig` | mutation | New form config with field mappings |
| `updateFormConfig` | mutation | Edit form config |
| `deleteFormConfig` | mutation | Remove form config |
| `generateFormApiKey` | mutation | Create API key for form |

### Schema Additions
- `formConfigs` table: orgId, name, entityAction, fieldMappings, apiKey, isActive, createdAt, updatedAt

---

## WorkOS Connect (Bonus — Phase 4 Extension)

**Note:** WorkOS Connect is an OAuth/OIDC provider feature, not email. It allows third-party apps to authenticate against your CRM's user base.

**Use cases for a SaaS CRM:**
- Let customers build custom integrations that auth through your platform
- Allow partner tools (help desks, analytics) to use shared identity
- M2M (machine-to-machine) tokens for API integrations

**Implementation:** Create OAuth/M2M applications in WorkOS dashboard. Your CRM becomes the resource server. Third-party apps get tokens via authorization_code or client_credentials flows. Not critical for initial CRM rollout — can be added when integration ecosystem needs arise.

---

## Implementation Order

| Phase | Depends On | Scope |
|-------|-----------|-------|
| 2. Relationships | Phase 1 ✅ | ~8 backend functions, modal UI updates |
| 3. Search & Filter | Phase 1 ✅ | 1 backend query, Cmd-K component, filter bars |
| 4. Team + Impersonation | Phase 1 ✅ | ~7 backend functions, settings UI, ownership UI, impersonation banner |
| 5. Custom Fields | Phase 1 ✅ | ~4 backend functions, schema change, dynamic form rendering |
| 6. Kanban Customization | Phase 2 | ~8 backend functions, pipeline settings, automation rules |
| 7. Org Inbox | Phase 4 | ~6 backend functions, new route, email provider integration |
| 8. Email Templates | Phase 7 | ~10 backend functions, template editor, sequence engine |
| 9. CSV Import/Export | Phase 5 | ~6 backend actions, import wizard UI |
| 10. Dashboard & Reports | Phases 2-4 | ~6 queries, dashboard rewrite, reports route, Recharts |
| 11. AI Integration | Phase 7 | ~4 backend functions, Flowise + ElevenLabs embed |
| 12. Form Builder | Phase 5 | ~7 backend functions, settings UI, HTTP endpoint |

---

## New Sidebar Navigation (Final)

```
Dashboard          /dashboard
Pipeline           /pipeline
Deals              /deals
Contacts           /contacts
Companies          /companies
Inbox              /inbox          (Phase 7)
Activities         /activities
Reports            /reports        (Phase 10)
Settings           /settings       (expanded with Custom Fields, Pipelines, Inbox, Templates, Sequences, Forms, AI)
```
