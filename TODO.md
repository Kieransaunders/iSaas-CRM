# Current TODO - iSaaSIT CRM

**Active Phase:** Phase 2 - Relationship Management (Frontend)

## Immediate Next Tasks

### 1. Install cmdk Package

```bash
npm install cmdk
```

### 2. Create Command Component

Create `src/components/ui/command.tsx` using the shadcn Command component pattern.

### 3. Update Deal Detail Modal

File: `src/components/crm/deal-detail-modal.tsx`

- Add imports for Command, Popover, Check, ChevronsUpDown, X icons
- Add cross-navigation props (onOpenContact, onOpenCompany)
- Replace Contacts tab placeholder with functional linking UI
- [x] Replace Company tab placeholder with functional linking UI

### 4. Update Contact Detail Modal

File: `src/components/crm/contact-detail-modal.tsx`

- Add Deals tab to show linked deals
- Add cross-navigation callbacks
- Make company name clickable

### 5. Update Company Detail Modal

File: `src/components/crm/company-detail-modal.tsx`

- Add Deals tab to show linked deals
- Add cross-navigation callbacks
- Make contact names clickable

### 6. Wire Up Cross-Navigation

Files: `pipeline.tsx`, `contacts.tsx`, `companies.tsx`

- Add state management for secondary modals
- Pass callback props to all modals
- Ensure smooth modal switching

## Reference Documents

- **Full Plan:** `docs/plans/2026-02-13-phase2-relationships-plan.md`
- **Progress Tracker:** `PROGRESS.md`
- **Architecture:** `docs/plans/2026-02-13-crm-expansion-design.md`

## Status

- ✅ Backend complete (convex/crm/relationships.ts)
- 🚧 Frontend pending (6 tasks + cross-navigation wiring)

### Hotfixes Applied

- [x] Deal list rows now open the deal detail modal on `/deals`
- ⏳ Phase 3 waiting

## Testing Checklist

After completing Phase 2:

- [ ] Can link/unlink contacts to deals
- [ ] Can link/unlink companies to deals
- [ ] Can navigate from deal → contact → back to deal
- [ ] Can navigate from deal → company → back to deal
- [ ] Can view deals from contact detail modal
- [ ] Can view deals from company detail modal
