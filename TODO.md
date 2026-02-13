# Current TODO - iSaaSIT CRM

**Active Phase:** Phase 3 - Search & Filtering (Completed)

## Immediate Next Tasks

### Phase 3 Complete ✅

All planned tasks are implemented:

- ✅ Added backend `globalSearch` query (`convex/crm/search.ts`)
- ✅ Added command palette UI (`src/components/crm/command-palette.tsx`)
- ✅ Wired Cmd/Ctrl+K and global search into `MainLayout`
- ✅ Added filter bars to contacts, companies, and deals pages

### Next Focus

- ⏳ Manual QA pass for Cmd+K search and all list filters
- ⏳ Pick next implementation phase from `docs/plans/2026-02-13-crm-expansion-design.md`

## Reference Documents

- **Full Plan:** `docs/plans/2026-02-13-phase2-relationships-plan.md`
- **Progress Tracker:** `PROGRESS.md`
- **Architecture:** `docs/plans/2026-02-13-crm-expansion-design.md`

## Status

- ✅ Phase 2 and Phase 3 code implementation complete
- 🚧 Waiting on manual verification and next phase selection

### Hotfixes Applied

- [x] Deal list rows now open the deal detail modal on `/deals`
- [x] Global Cmd/Ctrl+K search and list filtering UI added
- [x] Nested modal navigation now uses stack + breadcrumb jump (no forced root exit)
- [x] Contact and company modals updated to fixed-height two-pane layout
- [x] Linked record click/icon now opens the linked record from all CRM pages
- [x] Removed modal handoff flash by switching to single active modal state per page
- [x] Added intentional shrink-then-expand handoff animation for linked record modal transitions
- [x] Tuned modal handoff timing for a more cinematic feel

## Testing Checklist

After completing Phase 3:

- [x] Cmd/Ctrl+K opens command palette
- [ ] Search returns deals, contacts, and companies
- [ ] Selecting a search result opens the correct detail modal
- [ ] Contacts filter bar works (search, company filter, sort)
- [ ] Companies filter bar works (search, industry filter, sort)
- [ ] Deals filter bar works (search, status, stage, sort)
- [ ] Nested modal close exits to parent level first
- [ ] Breadcrumb jump returns to selected ancestor modal level
