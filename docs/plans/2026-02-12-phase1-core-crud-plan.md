# Phase 1: Core CRUD Completion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the CRUD lifecycle for contacts, companies, and deals — detail modals with editing, delete capability, and proper table list views.

**Architecture:** Modal-based detail views (matching existing `DealDetailModal` pattern). Backend follows existing Convex patterns in `convex/crm/` with `requireCrmUser` auth + `ensureSameOrgEntity` row-level security. All mutations use selective patching. Schema adds `companyId` to contacts and new activity indexes.

**Tech Stack:** Convex (backend), React 19, shadcn/ui (Dialog, Tabs, Table, AlertDialog, Textarea, Select), Lucide icons, TanStack Router

---

### Task 1: Schema Changes

**Files:**
- Modify: `convex/schema.ts`

**Step 1: Add `companyId` to contacts table and new activity indexes**

In `convex/schema.ts`, add `companyId` field to the contacts table and add two new indexes to the activities table:

```typescript
// In contacts table definition, after ownerUserId:
companyId: v.optional(v.id('companies')),

// In contacts table, add index:
.index('by_org_company', ['orgId', 'companyId'])

// In activities table, add indexes:
.index('by_contact_created', ['contactId', 'createdAt'])
.index('by_company_created', ['companyId', 'createdAt'])
```

Also add `emailMessageId` to activities table for future email integration:
```typescript
// In activities table definition, after assignedToUserId:
emailMessageId: v.optional(v.string()),
```

**Step 2: Push schema and verify**

Run: `npx convex dev` (should already be running — schema pushes automatically)
Expected: Schema accepted without errors. Check terminal for "Schema updated" message.

**Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add companyId to contacts, activity indexes, emailMessageId prep"
```

---

### Task 2: Contact Backend Functions

**Files:**
- Modify: `convex/crm/contacts.ts`

**Step 1: Add `getContact` query**

After `listContacts`, add:

```typescript
export const getContact = query({
  args: {
    contactId: v.id('contacts'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    const contact = await ctx.db.get(args.contactId);
    return ensureSameOrgEntity(orgId, contact, 'Contact not found');
  },
});
```

Note: Import `ensureSameOrgEntity` — update the import line to:
```typescript
import { assertCanWrite, ensureSameOrgEntity, requireCrmUser } from './authz';
```

**Step 2: Add `updateContact` mutation**

```typescript
export const updateContact = mutation({
  args: {
    contactId: v.id('contacts'),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    companyId: v.optional(v.id('companies')),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.contactId), 'Contact not found');

    if (args.companyId) {
      ensureSameOrgEntity(orgId, await ctx.db.get(args.companyId), 'Company not found');
    }

    const { contactId, ...fields } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(contactId, patch);
    return contactId;
  },
});
```

**Step 3: Add `deleteContact` mutation**

```typescript
export const deleteContact = mutation({
  args: {
    contactId: v.id('contacts'),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.contactId), 'Contact not found');

    // Remove from deal-contact junctions
    const dealContacts = await ctx.db
      .query('dealContacts')
      .withIndex('by_contact', (q) => q.eq('contactId', args.contactId))
      .collect();
    for (const dc of dealContacts) {
      await ctx.db.delete(dc._id);
    }

    await ctx.db.delete(args.contactId);
  },
});
```

**Step 4: Verify schema compiles**

Check the terminal running `npx convex dev` — should show no errors.

**Step 5: Commit**

```bash
git add convex/crm/contacts.ts
git commit -m "feat: add getContact, updateContact, deleteContact backend functions"
```

---

### Task 3: Company Backend Functions

**Files:**
- Modify: `convex/crm/companies.ts`

**Step 1: Add `getCompany` query**

Update import line and add after `listCompanies`:

```typescript
import { assertCanWrite, ensureSameOrgEntity, requireCrmUser } from './authz';

export const getCompany = query({
  args: {
    companyId: v.id('companies'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    const company = await ctx.db.get(args.companyId);
    return ensureSameOrgEntity(orgId, company, 'Company not found');
  },
});
```

**Step 2: Add `updateCompany` mutation**

```typescript
export const updateCompany = mutation({
  args: {
    companyId: v.id('companies'),
    name: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    industry: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.companyId), 'Company not found');

    const { companyId, ...fields } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(companyId, patch);
    return companyId;
  },
});
```

**Step 3: Add `deleteCompany` mutation**

```typescript
export const deleteCompany = mutation({
  args: {
    companyId: v.id('companies'),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.companyId), 'Company not found');

    // Remove from deal-company junctions
    const dealCompanies = await ctx.db
      .query('dealCompanies')
      .withIndex('by_company', (q) => q.eq('companyId', args.companyId))
      .collect();
    for (const dc of dealCompanies) {
      await ctx.db.delete(dc._id);
    }

    // Unlink contacts that have this as primary company
    const contacts = await ctx.db
      .query('contacts')
      .withIndex('by_org_company', (q) => q.eq('orgId', orgId).eq('companyId', args.companyId))
      .collect();
    for (const contact of contacts) {
      await ctx.db.patch(contact._id, { companyId: undefined, updatedAt: Date.now() });
    }

    await ctx.db.delete(args.companyId);
  },
});
```

**Step 4: Verify no errors in Convex dev terminal**

**Step 5: Commit**

```bash
git add convex/crm/companies.ts
git commit -m "feat: add getCompany, updateCompany, deleteCompany backend functions"
```

---

### Task 4: Activity Queries for Contacts and Companies

**Files:**
- Modify: `convex/crm/activities.ts`

**Step 1: Add `listContactActivities` query**

```typescript
export const listContactActivities = query({
  args: {
    contactId: v.id('contacts'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.contactId), 'Contact not found');

    return await ctx.db
      .query('activities')
      .withIndex('by_contact_created', (q) => q.eq('contactId', args.contactId))
      .order('desc')
      .collect();
  },
});
```

Note: Add `ensureSameOrgEntity` to the import line:
```typescript
import { assertCanWrite, ensureSameOrgEntity, requireCrmUser } from './authz';
```

**Step 2: Add `listCompanyActivities` query**

```typescript
export const listCompanyActivities = query({
  args: {
    companyId: v.id('companies'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.companyId), 'Company not found');

    return await ctx.db
      .query('activities')
      .withIndex('by_company_created', (q) => q.eq('companyId', args.companyId))
      .order('desc')
      .collect();
  },
});
```

**Step 3: Commit**

```bash
git add convex/crm/activities.ts
git commit -m "feat: add listContactActivities, listCompanyActivities queries"
```

---

### Task 5: Deal Delete Mutation

**Files:**
- Modify: `convex/crm/deals.ts`

**Step 1: Add `deleteDeal` mutation**

```typescript
export const deleteDeal = mutation({
  args: {
    dealId: v.id('deals'),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);
    ensureSameOrgEntity(orgId, await ctx.db.get('deals', args.dealId), 'Deal not found');

    // Remove deal-contact junctions
    const dealContacts = await ctx.db
      .query('dealContacts')
      .withIndex('by_deal', (q) => q.eq('dealId', args.dealId))
      .collect();
    for (const dc of dealContacts) {
      await ctx.db.delete(dc._id);
    }

    // Remove deal-company junctions
    const dealCompanies = await ctx.db
      .query('dealCompanies')
      .withIndex('by_deal', (q) => q.eq('dealId', args.dealId))
      .collect();
    for (const dc of dealCompanies) {
      await ctx.db.delete(dc._id);
    }

    // Remove activities linked to this deal
    const activities = await ctx.db
      .query('activities')
      .withIndex('by_deal_created', (q) => q.eq('dealId', args.dealId))
      .collect();
    for (const activity of activities) {
      await ctx.db.delete(activity._id);
    }

    await ctx.db.delete(args.dealId);
  },
});
```

Note: Verify that `ensureSameOrgEntity` is already imported in `deals.ts` — it should be.

**Step 2: Also add `assigneeUserId` to `updateDeal` args**

In the existing `updateDeal` mutation args, add:
```typescript
assigneeUserId: v.optional(v.id('users')),
```

And in the handler's patch logic, add:
```typescript
if (args.assigneeUserId !== undefined) patch.assigneeUserId = args.assigneeUserId;
```

**Step 3: Commit**

```bash
git add convex/crm/deals.ts
git commit -m "feat: add deleteDeal mutation, add assigneeUserId to updateDeal"
```

---

### Task 6: Contact Detail Modal Component

**Files:**
- Create: `src/components/crm/contact-detail-modal.tsx`

**Step 1: Create the contact detail modal**

This follows the exact same pattern as `deal-detail-modal.tsx`. Key features:
- Dialog wrapper, opens when `contactId` is non-null
- Header with name, title, email
- Three tabs: Info (editable form), Deals (linked deals list), Activity (timeline)
- Footer with activity quick-log
- Delete button with AlertDialog confirmation

```tsx
import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Building2, Loader2, Mail, Phone, Plus, Trash2, User } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivityTimeline } from './activity-timeline';

type ContactDetailModalProps = {
  contactId: Id<'contacts'> | null;
  onClose: () => void;
};

export function ContactDetailModal({ contactId, onClose }: ContactDetailModalProps) {
  const contact = useQuery(api.crm.contacts.getContact, contactId ? { contactId } : 'skip');
  const activities = useQuery(
    api.crm.activities.listContactActivities,
    contactId ? { contactId } : 'skip',
  );
  const companies = useQuery(api.crm.companies.listCompanies);

  const updateContact = useMutation(api.crm.contacts.updateContact);
  const deleteContact = useMutation(api.crm.contacts.deleteContact);
  const createActivity = useMutation(api.crm.activities.createActivity);

  const [isEditing, setIsEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    title: '',
    companyId: '' as string,
  });

  const [activityTitle, setActivityTitle] = useState('');
  const [activityType, setActivityType] = useState<'note' | 'call' | 'email' | 'meeting' | 'task'>('note');

  if (!contactId) return null;

  const startEditing = () => {
    if (!contact) return;
    setEditFields({
      firstName: contact.firstName,
      lastName: contact.lastName ?? '',
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      title: contact.title ?? '',
      companyId: contact.companyId ?? '',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!contact || !editFields.firstName.trim()) return;
    await updateContact({
      contactId,
      firstName: editFields.firstName.trim(),
      lastName: editFields.lastName.trim() || undefined,
      email: editFields.email.trim() || undefined,
      phone: editFields.phone.trim() || undefined,
      title: editFields.title.trim() || undefined,
      companyId: editFields.companyId
        ? (editFields.companyId as Id<'companies'>)
        : undefined,
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteContact({ contactId });
    onClose();
  };

  const handleLogActivity = async () => {
    if (!activityTitle.trim()) return;
    await createActivity({
      contactId,
      type: activityType,
      title: activityTitle.trim(),
    });
    setActivityTitle('');
  };

  const companyName = contact?.companyId && companies
    ? companies.find((c) => c._id === contact.companyId)?.name
    : null;

  return (
    <Dialog open={!!contactId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {!contact ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-xl">
                    {contact.firstName} {contact.lastName ?? ''}
                  </DialogTitle>
                  {contact.title && (
                    <Badge variant="secondary">{contact.title}</Badge>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete contact?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {contact.firstName} {contact.lastName ?? ''} and
                        remove them from all linked deals. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <DialogDescription>
                <span className="mt-1 flex flex-wrap items-center gap-4">
                  {contact.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {contact.email}
                    </span>
                  )}
                  {contact.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {contact.phone}
                    </span>
                  )}
                  {companyName && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {companyName}
                    </span>
                  )}
                </span>
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="info" className="mt-4">
              <TabsList>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4 space-y-4">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>First Name</Label>
                        <Input
                          value={editFields.firstName}
                          onChange={(e) => setEditFields({ ...editFields, firstName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Last Name</Label>
                        <Input
                          value={editFields.lastName}
                          onChange={(e) => setEditFields({ ...editFields, lastName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={editFields.email}
                          onChange={(e) => setEditFields({ ...editFields, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input
                          value={editFields.phone}
                          onChange={(e) => setEditFields({ ...editFields, phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input
                          value={editFields.title}
                          onChange={(e) => setEditFields({ ...editFields, title: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Company</Label>
                        <Select
                          value={editFields.companyId}
                          onValueChange={(value) => setEditFields({ ...editFields, companyId: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select company" />
                          </SelectTrigger>
                          <SelectContent>
                            {companies?.map((company) => (
                              <SelectItem key={company._id} value={company._id}>
                                {company.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSave} disabled={!editFields.firstName.trim()}>
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setIsEditing(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <InfoField icon={User} label="Name" value={`${contact.firstName} ${contact.lastName ?? ''}`} />
                      <InfoField icon={Mail} label="Email" value={contact.email} />
                      <InfoField icon={Phone} label="Phone" value={contact.phone} />
                      <InfoField icon={Building2} label="Company" value={companyName} />
                    </div>
                    {contact.title && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Title</p>
                        <p className="text-sm">{contact.title}</p>
                      </div>
                    )}
                    <Button variant="outline" size="sm" onClick={startEditing}>
                      Edit
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="activity" className="mt-4">
                {activities === undefined ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <ActivityTimeline activities={activities} />
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-4">
              <div className="flex w-full items-center gap-2">
                <Select value={activityType} onValueChange={(value) => setActivityType(value as typeof activityType)}>
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="task">Task</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Log an activity..."
                  value={activityTitle}
                  onChange={(e) => setActivityTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLogActivity();
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleLogActivity}
                  disabled={!activityTitle.trim()}
                  className="bg-orange-500 text-white hover:bg-orange-600"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoField({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: Check the terminal running `npm run dev` — no TypeScript errors.

**Step 3: Commit**

```bash
git add src/components/crm/contact-detail-modal.tsx
git commit -m "feat: add contact detail modal with edit, delete, activity logging"
```

---

### Task 7: Company Detail Modal Component

**Files:**
- Create: `src/components/crm/company-detail-modal.tsx`

**Step 1: Create the company detail modal**

Same pattern as contact modal. Tabs: Info (editable), Contacts (at this company), Activity (timeline).

```tsx
import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Building2, Globe, Loader2, Phone, Plus, Trash2 } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ActivityTimeline } from './activity-timeline';

const INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Finance',
  'Retail',
  'Manufacturing',
  'Services',
  'Other',
];

type CompanyDetailModalProps = {
  companyId: Id<'companies'> | null;
  onClose: () => void;
};

export function CompanyDetailModal({ companyId, onClose }: CompanyDetailModalProps) {
  const company = useQuery(api.crm.companies.getCompany, companyId ? { companyId } : 'skip');
  const activities = useQuery(
    api.crm.activities.listCompanyActivities,
    companyId ? { companyId } : 'skip',
  );
  const contacts = useQuery(api.crm.contacts.listContacts);

  const updateCompany = useMutation(api.crm.companies.updateCompany);
  const deleteCompany = useMutation(api.crm.companies.deleteCompany);
  const createActivity = useMutation(api.crm.activities.createActivity);

  const [isEditing, setIsEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    name: '',
    website: '',
    phone: '',
    industry: '',
    notes: '',
  });

  const [activityTitle, setActivityTitle] = useState('');
  const [activityType, setActivityType] = useState<'note' | 'call' | 'email' | 'meeting' | 'task'>('note');

  if (!companyId) return null;

  const startEditing = () => {
    if (!company) return;
    setEditFields({
      name: company.name,
      website: company.website ?? '',
      phone: company.phone ?? '',
      industry: company.industry ?? '',
      notes: company.notes ?? '',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!company || !editFields.name.trim()) return;
    await updateCompany({
      companyId,
      name: editFields.name.trim(),
      website: editFields.website.trim() || undefined,
      phone: editFields.phone.trim() || undefined,
      industry: editFields.industry || undefined,
      notes: editFields.notes.trim() || undefined,
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteCompany({ companyId });
    onClose();
  };

  const handleLogActivity = async () => {
    if (!activityTitle.trim()) return;
    await createActivity({
      companyId,
      type: activityType,
      title: activityTitle.trim(),
    });
    setActivityTitle('');
  };

  // Contacts at this company
  const companyContacts = contacts?.filter((c) => c.companyId === companyId) ?? [];

  return (
    <Dialog open={!!companyId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {!company ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-xl">{company.name}</DialogTitle>
                  {company.industry && (
                    <Badge variant="secondary">{company.industry}</Badge>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete company?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {company.name} and unlink it from all contacts and deals.
                        This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <DialogDescription>
                <span className="mt-1 flex flex-wrap items-center gap-4">
                  {company.website && (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3.5 w-3.5" />
                      <a href={company.website} target="_blank" rel="noreferrer" className="underline">
                        {company.website}
                      </a>
                    </span>
                  )}
                  {company.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {company.phone}
                    </span>
                  )}
                </span>
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="info" className="mt-4">
              <TabsList>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="contacts">
                  Contacts {companyContacts.length > 0 && `(${companyContacts.length})`}
                </TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4 space-y-4">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={editFields.name}
                          onChange={(e) => setEditFields({ ...editFields, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Website</Label>
                        <Input
                          value={editFields.website}
                          onChange={(e) => setEditFields({ ...editFields, website: e.target.value })}
                          placeholder="https://example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input
                          value={editFields.phone}
                          onChange={(e) => setEditFields({ ...editFields, phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Industry</Label>
                        <Select
                          value={editFields.industry}
                          onValueChange={(value) => setEditFields({ ...editFields, industry: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select industry" />
                          </SelectTrigger>
                          <SelectContent>
                            {INDUSTRIES.map((industry) => (
                              <SelectItem key={industry} value={industry}>
                                {industry}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={editFields.notes}
                        onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSave} disabled={!editFields.name.trim()}>
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setIsEditing(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <InfoField icon={Building2} label="Name" value={company.name} />
                      <InfoField icon={Globe} label="Website" value={company.website} />
                      <InfoField icon={Phone} label="Phone" value={company.phone} />
                      <InfoField
                        icon={Building2}
                        label="Industry"
                        value={company.industry}
                      />
                    </div>
                    {company.notes && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Notes</p>
                        <p className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                          {company.notes}
                        </p>
                      </div>
                    )}
                    <Button variant="outline" size="sm" onClick={startEditing}>
                      Edit
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="contacts" className="mt-4">
                {contacts === undefined ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : companyContacts.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No contacts at this company yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {companyContacts.map((contact) => (
                      <div
                        key={contact._id}
                        className="rounded-md border border-border/70 bg-muted/20 p-3"
                      >
                        <p className="text-sm font-medium">
                          {contact.firstName} {contact.lastName ?? ''}
                        </p>
                        {contact.email && (
                          <p className="text-xs text-muted-foreground">{contact.email}</p>
                        )}
                        {contact.title && (
                          <p className="text-xs text-muted-foreground">{contact.title}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="activity" className="mt-4">
                {activities === undefined ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : (
                  <ActivityTimeline activities={activities} />
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-4">
              <div className="flex w-full items-center gap-2">
                <Select value={activityType} onValueChange={(value) => setActivityType(value as typeof activityType)}>
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="task">Task</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Log an activity..."
                  value={activityTitle}
                  onChange={(e) => setActivityTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLogActivity();
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleLogActivity}
                  disabled={!activityTitle.trim()}
                  className="bg-orange-500 text-white hover:bg-orange-600"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoField({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  );
}
```

**Step 2: Verify compile**

**Step 3: Commit**

```bash
git add src/components/crm/company-detail-modal.tsx
git commit -m "feat: add company detail modal with edit, delete, contacts list, activity logging"
```

---

### Task 8: Enhance Deal Detail Modal

**Files:**
- Modify: `src/components/crm/deal-detail-modal.tsx`

**Step 1: Make Info tab fully editable**

Replace the current read-only Info tab with an editable form. Add:
- Editable title, value, currency, expected close date, notes, status, assignee
- Save/Cancel buttons that appear in edit mode
- Use the same edit pattern as contact/company modals

**Step 2: Add delete button**

Add AlertDialog-based delete confirmation to the header, same pattern as contact modal. Uses `deleteDeal` mutation.

**Step 3: Fix Contacts tab**

Replace the current tab that shows ALL contacts with one that shows only linked contacts (via `dealContacts`). For now, show placeholder text "No contacts linked yet" since the linking UI will come in Phase 2.

**Step 4: Add Company tab**

Add a fourth tab "Company" showing linked companies (via `dealCompanies`). Same placeholder approach.

**Step 5: Verify in browser**

Open a deal from the pipeline board, check all tabs render correctly. Test editing a field and saving.

**Step 6: Commit**

```bash
git add src/components/crm/deal-detail-modal.tsx
git commit -m "feat: enhance deal detail modal with full editing, delete, and company tab"
```

---

### Task 9: Upgrade Contacts List Page

**Files:**
- Modify: `src/routes/_authenticated/contacts.tsx`

**Step 1: Replace card list with table + click-to-open modal**

Replace the simple card list with a shadcn `Table` component. Add columns: Name, Email, Phone, Company, Created. Each row is clickable — opens the `ContactDetailModal`.

Add `selectedContactId` state that controls the modal. Import and render `ContactDetailModal`.

Keep the create form at the top (it works fine).

Key imports to add:
```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContactDetailModal } from '@/components/crm/contact-detail-modal';
```

The table body maps over contacts and renders clickable rows:
```tsx
<TableRow
  key={contact._id}
  className="cursor-pointer hover:bg-muted/50"
  onClick={() => setSelectedContactId(contact._id)}
>
```

Companies query is needed to resolve `companyId` to a name in the table.

**Step 2: Verify in browser**

Navigate to /contacts, check table renders, click a row to open detail modal.

**Step 3: Commit**

```bash
git add src/routes/_authenticated/contacts.tsx
git commit -m "feat: upgrade contacts list to table layout with click-to-open detail modal"
```

---

### Task 10: Upgrade Companies List Page

**Files:**
- Modify: `src/routes/_authenticated/companies.tsx`

**Step 1: Replace card list with table + click-to-open modal**

Same pattern as contacts page. Table columns: Name, Website, Industry, Phone, Created. Clickable rows open `CompanyDetailModal`.

Key imports:
```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompanyDetailModal } from '@/components/crm/company-detail-modal';
```

**Step 2: Verify in browser**

Navigate to /companies, check table renders, click a row to open detail modal.

**Step 3: Commit**

```bash
git add src/routes/_authenticated/companies.tsx
git commit -m "feat: upgrade companies list to table layout with click-to-open detail modal"
```

---

## Verification Checklist

After all 10 tasks are complete, verify:

- [ ] Can create, view, edit, and delete a contact
- [ ] Can create, view, edit, and delete a company
- [ ] Can view, edit, and delete a deal
- [ ] Contact detail modal shows Info and Activity tabs
- [ ] Company detail modal shows Info, Contacts, and Activity tabs
- [ ] Deal detail modal has editable Info, Activity, Contacts, and Company tabs
- [ ] Contacts list shows table with clickable rows
- [ ] Companies list shows table with clickable rows
- [ ] Deleting a contact removes it from deal junctions
- [ ] Deleting a company unlinks contacts and removes deal junctions
- [ ] Deleting a deal removes junctions and activities
- [ ] Activity logging works from all three detail modals
