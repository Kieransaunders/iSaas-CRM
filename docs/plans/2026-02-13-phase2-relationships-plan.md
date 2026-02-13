# Phase 2: Relationship Management — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable linking contacts and companies to deals (with optional roles/relationship types) via junction tables, and allow cross-navigation between all entity detail modals.

**Architecture:** The `dealContacts` and `dealCompanies` junction tables already exist in the Convex schema with full indexes (`by_deal`, `by_contact`, `by_company`, `by_deal_contact`, `by_deal_company`). We add 8 new backend functions (4 mutations, 4 queries) in a new `convex/crm/relationships.ts` file following the existing authz pattern (`requireCrmUser` + `assertCanWrite` + `ensureSameOrgEntity`). On the frontend, we install `cmdk` and add a shadcn `Command` component to power searchable comboboxes for linking entities, then update 3 existing detail modals with new tabs and cross-navigation callbacks.

**Tech Stack:** Convex (backend mutations/queries), React + shadcn/ui (Popover + Command combobox, Tabs, Badge), cmdk (searchable combobox), TanStack Router (existing)

---

### Task 1: Backend — `linkContactToDeal` and `unlinkContactFromDeal` mutations

**Files:**
- Create: `convex/crm/relationships.ts`

**Step 1:** Create the relationships module with deal-contact link/unlink mutations.

```typescript
// convex/crm/relationships.ts
import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertCanWrite, ensureSameOrgEntity, requireCrmUser } from './authz';

export const linkContactToDeal = mutation({
  args: {
    dealId: v.id('deals'),
    contactId: v.id('contacts'),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, role: userRole } = await requireCrmUser(ctx);
    assertCanWrite(userRole);

    ensureSameOrgEntity(orgId, await ctx.db.get(args.dealId), 'Deal not found');
    ensureSameOrgEntity(orgId, await ctx.db.get(args.contactId), 'Contact not found');

    // Prevent duplicate links
    const existing = await ctx.db
      .query('dealContacts')
      .withIndex('by_deal_contact', (q) =>
        q.eq('dealId', args.dealId).eq('contactId', args.contactId),
      )
      .first();

    if (existing) {
      throw new ConvexError('Contact is already linked to this deal');
    }

    return await ctx.db.insert('dealContacts', {
      orgId,
      dealId: args.dealId,
      contactId: args.contactId,
      role: args.role,
      createdAt: Date.now(),
    });
  },
});

export const unlinkContactFromDeal = mutation({
  args: {
    dealId: v.id('deals'),
    contactId: v.id('contacts'),
  },
  handler: async (ctx, args) => {
    const { orgId, role: userRole } = await requireCrmUser(ctx);
    assertCanWrite(userRole);

    ensureSameOrgEntity(orgId, await ctx.db.get(args.dealId), 'Deal not found');

    const link = await ctx.db
      .query('dealContacts')
      .withIndex('by_deal_contact', (q) =>
        q.eq('dealId', args.dealId).eq('contactId', args.contactId),
      )
      .first();

    if (!link) {
      throw new ConvexError('Link not found');
    }

    await ctx.db.delete(link._id);
  },
});
```

**Step 2:** Verify the file compiles.
```bash
cd /Users/boss/Develpment/iSaas-CRM && npx convex typecheck
```

**Step 3:** Commit.
```bash
git add convex/crm/relationships.ts && git commit -m "feat: add linkContactToDeal and unlinkContactFromDeal mutations"
```

---

### Task 2: Backend — `listDealContacts` and `listContactDeals` queries

**Files:**
- Modify: `convex/crm/relationships.ts`

**Step 1:** Append the two query functions to `convex/crm/relationships.ts` after the existing mutations.

```typescript
export const listDealContacts = query({
  args: {
    dealId: v.id('deals'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.dealId), 'Deal not found');

    const links = await ctx.db
      .query('dealContacts')
      .withIndex('by_deal', (q) => q.eq('dealId', args.dealId))
      .collect();

    const contacts = await Promise.all(
      links.map(async (link) => {
        const contact = await ctx.db.get(link.contactId);
        if (!contact) return null;
        return {
          _id: contact._id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          role: link.role,
          linkId: link._id,
        };
      }),
    );

    return contacts.filter(Boolean);
  },
});

export const listContactDeals = query({
  args: {
    contactId: v.id('contacts'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.contactId), 'Contact not found');

    const links = await ctx.db
      .query('dealContacts')
      .withIndex('by_contact', (q) => q.eq('contactId', args.contactId))
      .collect();

    const deals = await Promise.all(
      links.map(async (link) => {
        const deal = await ctx.db.get(link.dealId);
        if (!deal) return null;
        return {
          _id: deal._id,
          title: deal.title,
          value: deal.value,
          currency: deal.currency,
          status: deal.status,
          role: link.role,
          linkId: link._id,
        };
      }),
    );

    return deals.filter(Boolean);
  },
});
```

**Step 2:** Verify.
```bash
cd /Users/boss/Develpment/iSaas-CRM && npx convex typecheck
```

**Step 3:** Commit.
```bash
git add convex/crm/relationships.ts && git commit -m "feat: add listDealContacts and listContactDeals queries"
```

---

### Task 3: Backend — `linkCompanyToDeal` and `unlinkCompanyFromDeal` mutations

**Files:**
- Modify: `convex/crm/relationships.ts`

**Step 1:** Append the company link/unlink mutations to `convex/crm/relationships.ts`.

```typescript
export const linkCompanyToDeal = mutation({
  args: {
    dealId: v.id('deals'),
    companyId: v.id('companies'),
    relationshipType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, role: userRole } = await requireCrmUser(ctx);
    assertCanWrite(userRole);

    ensureSameOrgEntity(orgId, await ctx.db.get(args.dealId), 'Deal not found');
    ensureSameOrgEntity(orgId, await ctx.db.get(args.companyId), 'Company not found');

    // Prevent duplicate links
    const existing = await ctx.db
      .query('dealCompanies')
      .withIndex('by_deal_company', (q) =>
        q.eq('dealId', args.dealId).eq('companyId', args.companyId),
      )
      .first();

    if (existing) {
      throw new ConvexError('Company is already linked to this deal');
    }

    return await ctx.db.insert('dealCompanies', {
      orgId,
      dealId: args.dealId,
      companyId: args.companyId,
      relationshipType: args.relationshipType,
      createdAt: Date.now(),
    });
  },
});

export const unlinkCompanyFromDeal = mutation({
  args: {
    dealId: v.id('deals'),
    companyId: v.id('companies'),
  },
  handler: async (ctx, args) => {
    const { orgId, role: userRole } = await requireCrmUser(ctx);
    assertCanWrite(userRole);

    ensureSameOrgEntity(orgId, await ctx.db.get(args.dealId), 'Deal not found');

    const link = await ctx.db
      .query('dealCompanies')
      .withIndex('by_deal_company', (q) =>
        q.eq('dealId', args.dealId).eq('companyId', args.companyId),
      )
      .first();

    if (!link) {
      throw new ConvexError('Link not found');
    }

    await ctx.db.delete(link._id);
  },
});
```

**Step 2:** Verify.
```bash
cd /Users/boss/Develpment/iSaas-CRM && npx convex typecheck
```

**Step 3:** Commit.
```bash
git add convex/crm/relationships.ts && git commit -m "feat: add linkCompanyToDeal and unlinkCompanyFromDeal mutations"
```

---

### Task 4: Backend — `listDealCompanies` and `listCompanyDeals` queries

**Files:**
- Modify: `convex/crm/relationships.ts`

**Step 1:** Append the company query functions to `convex/crm/relationships.ts`.

```typescript
export const listDealCompanies = query({
  args: {
    dealId: v.id('deals'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.dealId), 'Deal not found');

    const links = await ctx.db
      .query('dealCompanies')
      .withIndex('by_deal', (q) => q.eq('dealId', args.dealId))
      .collect();

    const companies = await Promise.all(
      links.map(async (link) => {
        const company = await ctx.db.get(link.companyId);
        if (!company) return null;
        return {
          _id: company._id,
          name: company.name,
          website: company.website,
          industry: company.industry,
          relationshipType: link.relationshipType,
          linkId: link._id,
        };
      }),
    );

    return companies.filter(Boolean);
  },
});

export const listCompanyDeals = query({
  args: {
    companyId: v.id('companies'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    ensureSameOrgEntity(orgId, await ctx.db.get(args.companyId), 'Company not found');

    const links = await ctx.db
      .query('dealCompanies')
      .withIndex('by_company', (q) => q.eq('companyId', args.companyId))
      .collect();

    const deals = await Promise.all(
      links.map(async (link) => {
        const deal = await ctx.db.get(link.dealId);
        if (!deal) return null;
        return {
          _id: deal._id,
          title: deal.title,
          value: deal.value,
          currency: deal.currency,
          status: deal.status,
          relationshipType: link.relationshipType,
          linkId: link._id,
        };
      }),
    );

    return deals.filter(Boolean);
  },
});
```

**Step 2:** Verify the full file compiles.
```bash
cd /Users/boss/Develpment/iSaas-CRM && npx convex typecheck
```

**Step 3:** Commit.
```bash
git add convex/crm/relationships.ts && git commit -m "feat: add listDealCompanies and listCompanyDeals queries"
```

---

### Task 5: Install `cmdk` and add shadcn `Command` UI component

**Files:**
- Create: `src/components/ui/command.tsx`

**Step 1:** Install the `cmdk` package.
```bash
cd /Users/boss/Develpment/iSaas-CRM && npm install cmdk
```

**Step 2:** Create the shadcn Command component at `src/components/ui/command.tsx`. This follows the latest shadcn pattern used in the existing codebase (radix-ui unified package, function component exports, `data-slot` attributes, `cn` utility).

```tsx
// src/components/ui/command.tsx
"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
}) {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:border-b [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex items-center border-b px-3"
    >
      <SearchIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
```

**Step 3:** Verify it compiles.
```bash
cd /Users/boss/Develpment/iSaas-CRM && npx tsc --noEmit
```

**Step 4:** Commit.
```bash
git add package.json package-lock.json src/components/ui/command.tsx && git commit -m "feat: install cmdk and add shadcn Command component for combobox"
```

---

### Task 6: UI — Update deal detail modal Contacts tab

**Files:**
- Modify: `src/components/crm/deal-detail-modal.tsx`

**Step 1:** Add imports at the top of `src/components/crm/deal-detail-modal.tsx`. Add these to the existing import block:

```typescript
import { Check, ChevronsUpDown, X } from 'lucide-react';
```

Add new imports after the existing ones:

```typescript
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
```

**Step 2:** Update the `DealDetailModalProps` type to include cross-navigation callbacks:

```typescript
type DealDetailModalProps = {
  dealId: Id<'deals'> | null;
  onClose: () => void;
  stages: Array<{ _id: Id<'pipelineStages'>; name: string }>;
  onOpenContact?: (contactId: Id<'contacts'>) => void;
  onOpenCompany?: (companyId: Id<'companies'>) => void;
};
```

**Step 3:** Inside the component function, destructure the new props:

```typescript
export function DealDetailModal({ dealId, onClose, stages, onOpenContact, onOpenCompany }: DealDetailModalProps) {
```

**Step 4:** Add new queries and mutations after the existing ones (after `const deleteDeal = ...`):

```typescript
  const dealContacts = useQuery(api.crm.relationships.listDealContacts, dealId ? { dealId } : 'skip');
  const dealCompanies = useQuery(api.crm.relationships.listDealCompanies, dealId ? { dealId } : 'skip');
  const allContacts = useQuery(api.crm.contacts.listContacts);
  const allCompanies = useQuery(api.crm.companies.listCompanies);

  const linkContact = useMutation(api.crm.relationships.linkContactToDeal);
  const unlinkContact = useMutation(api.crm.relationships.unlinkContactFromDeal);
  const linkCompany = useMutation(api.crm.relationships.linkCompanyToDeal);
  const unlinkCompany = useMutation(api.crm.relationships.unlinkCompanyFromDeal);

  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);
  const [companyPopoverOpen, setCompanyPopoverOpen] = useState(false);
  const [contactRole, setContactRole] = useState('');
  const [companyRelType, setCompanyRelType] = useState('');
```

**Step 5:** Replace the Contacts `TabsContent` placeholder (the one with "No contacts linked yet. Contact linking will be available in Phase 2.") with:

```tsx
              <TabsContent value="contacts" className="mt-4 space-y-4">
                {/* Link contact combobox */}
                <div className="flex items-center gap-2">
                  <Popover open={contactPopoverOpen} onOpenChange={setContactPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Plus className="h-3.5 w-3.5" />
                        Link Contact
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search contacts..." />
                        <CommandList>
                          <CommandEmpty>No contacts found.</CommandEmpty>
                          <CommandGroup>
                            {(allContacts ?? [])
                              .filter(
                                (c) => !dealContacts?.some((dc) => dc._id === c._id),
                              )
                              .map((contact) => (
                                <CommandItem
                                  key={contact._id}
                                  value={`${contact.firstName} ${contact.lastName ?? ''} ${contact.email ?? ''}`}
                                  onSelect={async () => {
                                    if (!dealId) return;
                                    await linkContact({
                                      dealId,
                                      contactId: contact._id,
                                      role: contactRole || undefined,
                                    });
                                    setContactPopoverOpen(false);
                                    setContactRole('');
                                  }}
                                >
                                  <span>
                                    {contact.firstName}
                                    {contact.lastName ? ` ${contact.lastName}` : ''}
                                  </span>
                                  {contact.email ? (
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      {contact.email}
                                    </span>
                                  ) : null}
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                      <div className="border-t px-3 py-2">
                        <Select value={contactRole} onValueChange={setContactRole}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Role (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Decision Maker">Decision Maker</SelectItem>
                            <SelectItem value="Champion">Champion</SelectItem>
                            <SelectItem value="Influencer">Influencer</SelectItem>
                            <SelectItem value="User">User</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Linked contacts list */}
                {dealContacts === undefined ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : dealContacts.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No contacts linked yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dealContacts.map((contact) => (
                      <div
                        key={contact._id}
                        className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="text-sm font-medium text-foreground hover:text-orange-600 hover:underline"
                            onClick={() => onOpenContact?.(contact._id)}
                          >
                            {contact.firstName}
                            {contact.lastName ? ` ${contact.lastName}` : ''}
                          </button>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {contact.email ? <span>{contact.email}</span> : null}
                            {contact.title ? <span>{contact.title}</span> : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {contact.role ? (
                            <Badge variant="secondary" className="text-xs">
                              {contact.role}
                            </Badge>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              if (!dealId) return;
                              await unlinkContact({ dealId, contactId: contact._id });
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
```

**Step 6:** Verify the app compiles.
```bash
cd /Users/boss/Develpment/iSaas-CRM && npx tsc --noEmit
```

**Step 7:** Commit.
```bash
git add src/components/crm/deal-detail-modal.tsx && git commit -m "feat: add contact linking UI to deal detail modal Contacts tab"
```

---

### Task 7: UI — Update deal detail modal Company tab

**Files:**
- Modify: `src/components/crm/deal-detail-modal.tsx`

**Step 1:** Replace the Company `TabsContent` placeholder (the one with "No companies linked yet. Company linking will be available in Phase 2.") with:

```tsx
              <TabsContent value="company" className="mt-4 space-y-4">
                {/* Link company combobox */}
                <div className="flex items-center gap-2">
                  <Popover open={companyPopoverOpen} onOpenChange={setCompanyPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Plus className="h-3.5 w-3.5" />
                        Link Company
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search companies..." />
                        <CommandList>
                          <CommandEmpty>No companies found.</CommandEmpty>
                          <CommandGroup>
                            {(allCompanies ?? [])
                              .filter(
                                (c) => !dealCompanies?.some((dc) => dc._id === c._id),
                              )
                              .map((company) => (
                                <CommandItem
                                  key={company._id}
                                  value={`${company.name} ${company.industry ?? ''}`}
                                  onSelect={async () => {
                                    if (!dealId) return;
                                    await linkCompany({
                                      dealId,
                                      companyId: company._id,
                                      relationshipType: companyRelType || undefined,
                                    });
                                    setCompanyPopoverOpen(false);
                                    setCompanyRelType('');
                                  }}
                                >
                                  <span>{company.name}</span>
                                  {company.industry ? (
                                    <span className="ml-auto text-xs text-muted-foreground">
                                      {company.industry}
                                    </span>
                                  ) : null}
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                      <div className="border-t px-3 py-2">
                        <Select value={companyRelType} onValueChange={setCompanyRelType}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Relationship (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Customer">Customer</SelectItem>
                            <SelectItem value="Partner">Partner</SelectItem>
                            <SelectItem value="Vendor">Vendor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Linked companies list */}
                {dealCompanies === undefined ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : dealCompanies.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No companies linked yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dealCompanies.map((company) => (
                      <div
                        key={company._id}
                        className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="text-sm font-medium text-foreground hover:text-orange-600 hover:underline"
                            onClick={() => onOpenCompany?.(company._id)}
                          >
                            {company.name}
                          </button>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {company.website ? <span>{company.website}</span> : null}
                            {company.industry ? <span>{company.industry}</span> : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {company.relationshipType ? (
                            <Badge variant="secondary" className="text-xs">
                              {company.relationshipType}
                            </Badge>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={async () => {
                              if (!dealId) return;
                              await unlinkCompany({ dealId, companyId: company._id });
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
```

**Step 2:** Verify.
```bash
cd /Users/boss/Develpment/iSaas-CRM && npx tsc --noEmit
```

**Step 3:** Commit.
```bash
git add src/components/crm/deal-detail-modal.tsx && git commit -m "feat: add company linking UI to deal detail modal Company tab"
```

---

### Task 8: UI — Add Deals tab to contact detail modal

**Files:**
- Modify: `src/components/crm/contact-detail-modal.tsx`

**Step 1:** Add the new imports at the top of the file. Add `DollarSign` to the lucide import:

```typescript
import { Building2, DollarSign, Loader2, Mail, Phone, Plus, Trash2, User } from 'lucide-react';
```

**Step 2:** Update the `ContactDetailModalProps` type to include cross-navigation:

```typescript
type ContactDetailModalProps = {
  contactId: Id<'contacts'> | null;
  onClose: () => void;
  onOpenDeal?: (dealId: Id<'deals'>) => void;
  onOpenCompany?: (companyId: Id<'companies'>) => void;
};
```

**Step 3:** Destructure the new props in the component:

```typescript
export function ContactDetailModal({ contactId, onClose, onOpenDeal, onOpenCompany }: ContactDetailModalProps) {
```

**Step 4:** Add the deals query after the existing queries:

```typescript
  const contactDeals = useQuery(api.crm.relationships.listContactDeals, contactId ? { contactId } : 'skip');
```

**Step 5:** Add a "Deals" tab trigger to the `TabsList`. Change the `TabsList` to include the new tab:

```tsx
              <TabsList>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="deals">Deals</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
```

**Step 6:** Add the Deals `TabsContent` between the Info and Activity tab contents:

```tsx
              <TabsContent value="deals" className="mt-4">
                {contactDeals === undefined ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : contactDeals.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No deals linked to this contact.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {contactDeals.map((deal) => (
                      <div
                        key={deal._id}
                        className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="text-sm font-medium text-foreground hover:text-orange-600 hover:underline"
                            onClick={() => onOpenDeal?.(deal._id)}
                          >
                            {deal.title}
                          </button>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {deal.value ? (
                              <span className="flex items-center gap-0.5">
                                <DollarSign className="h-3 w-3" />
                                {deal.value.toLocaleString()} {deal.currency ?? 'USD'}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {deal.role ? (
                            <Badge variant="secondary" className="text-xs">
                              {deal.role}
                            </Badge>
                          ) : null}
                          <Badge
                            variant={
                              deal.status === 'won'
                                ? 'default'
                                : deal.status === 'lost'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                            className="text-xs"
                          >
                            {deal.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
```

**Step 7:** Make the company name in the header clickable for cross-navigation. In the `DialogDescription`, replace the company name display:

Find:
```tsx
                  {companyName ? (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {companyName}
                    </span>
                  ) : null}
```

Replace with:
```tsx
                  {companyName && contact?.companyId ? (
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-orange-600 hover:underline"
                      onClick={() => onOpenCompany?.(contact.companyId!)}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      {companyName}
                    </button>
                  ) : null}
```

**Step 8:** Verify.
```bash
cd /Users/boss/Develpment/iSaas-CRM && npx tsc --noEmit
```

**Step 9:** Commit.
```bash
git add src/components/crm/contact-detail-modal.tsx && git commit -m "feat: add Deals tab and cross-navigation to contact detail modal"
```

---

### Task 9: UI — Add Deals tab to company detail modal

**Files:**
- Modify: `src/components/crm/company-detail-modal.tsx`

**Step 1:** Add `DollarSign` to the lucide import:

```typescript
import { DollarSign, Globe, Loader2, Phone, Plus, Trash2 } from 'lucide-react';
```

**Step 2:** Update the `CompanyDetailModalProps` type:

```typescript
type CompanyDetailModalProps = {
  companyId: Id<'companies'> | null;
  onClose: () => void;
  onOpenDeal?: (dealId: Id<'deals'>) => void;
  onOpenContact?: (contactId: Id<'contacts'>) => void;
};
```

**Step 3:** Destructure the new props:

```typescript
export function CompanyDetailModal({ companyId, onClose, onOpenDeal, onOpenContact }: CompanyDetailModalProps) {
```

**Step 4:** Add the deals query after the existing queries:

```typescript
  const companyDeals = useQuery(api.crm.relationships.listCompanyDeals, companyId ? { companyId } : 'skip');
```

**Step 5:** Add a "Deals" tab trigger to the `TabsList`. Update the existing `TabsList`:

```tsx
              <TabsList>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="contacts">Contacts ({companyContacts.length})</TabsTrigger>
                <TabsTrigger value="deals">Deals</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
```

**Step 6:** Add the Deals `TabsContent` between the Contacts and Activity tab contents:

```tsx
              <TabsContent value="deals" className="mt-4">
                {companyDeals === undefined ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : companyDeals.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No deals linked to this company.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {companyDeals.map((deal) => (
                      <div
                        key={deal._id}
                        className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="text-sm font-medium text-foreground hover:text-orange-600 hover:underline"
                            onClick={() => onOpenDeal?.(deal._id)}
                          >
                            {deal.title}
                          </button>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {deal.value ? (
                              <span className="flex items-center gap-0.5">
                                <DollarSign className="h-3 w-3" />
                                {deal.value.toLocaleString()} {deal.currency ?? 'USD'}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {deal.relationshipType ? (
                            <Badge variant="secondary" className="text-xs">
                              {deal.relationshipType}
                            </Badge>
                          ) : null}
                          <Badge
                            variant={
                              deal.status === 'won'
                                ? 'default'
                                : deal.status === 'lost'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                            className="text-xs"
                          >
                            {deal.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
```

**Step 7:** Make contact names in the Contacts tab clickable. In the existing Contacts `TabsContent`, replace the contact display `div` content:

Find the contact name display:
```tsx
                        <p className="font-medium">
                          {contact.firstName}
                          {contact.lastName ? ` ${contact.lastName}` : ''}
                        </p>
```

Replace with:
```tsx
                        <button
                          type="button"
                          className="font-medium text-foreground hover:text-orange-600 hover:underline"
                          onClick={() => onOpenContact?.(contact._id)}
                        >
                          {contact.firstName}
                          {contact.lastName ? ` ${contact.lastName}` : ''}
                        </button>
```

**Step 8:** Verify.
```bash
cd /Users/boss/Develpment/iSaas-CRM && npx tsc --noEmit
```

**Step 9:** Commit.
```bash
git add src/components/crm/company-detail-modal.tsx && git commit -m "feat: add Deals tab and cross-navigation to company detail modal"
```

---

### Task 10: Cross-navigation — Wire up modal callbacks on pipeline page

**Files:**
- Modify: `src/routes/_authenticated/pipeline.tsx`

**Step 1:** Add imports for the contact and company detail modals:

```typescript
import { ContactDetailModal } from '@/components/crm/contact-detail-modal';
import { CompanyDetailModal } from '@/components/crm/company-detail-modal';
```

**Step 2:** Add state for the secondary modals inside `PipelinePage`, after the existing `selectedDealId` state:

```typescript
  const [selectedContactId, setSelectedContactId] = useState<Id<'contacts'> | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<Id<'companies'> | null>(null);
```

**Step 3:** Update the `DealDetailModal` usage to pass cross-navigation callbacks:

```tsx
      <DealDetailModal
        dealId={selectedDealId}
        onClose={() => setSelectedDealId(null)}
        stages={stages ?? []}
        onOpenContact={(contactId) => {
          setSelectedDealId(null);
          setSelectedContactId(contactId);
        }}
        onOpenCompany={(companyId) => {
          setSelectedDealId(null);
          setSelectedCompanyId(companyId);
        }}
      />
```

**Step 4:** Add the contact and company modals after the `DealDetailModal`:

```tsx
      <ContactDetailModal
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
        onOpenDeal={(dealId) => {
          setSelectedContactId(null);
          setSelectedDealId(dealId);
        }}
        onOpenCompany={(companyId) => {
          setSelectedContactId(null);
          setSelectedCompanyId(companyId);
        }}
      />

      <CompanyDetailModal
        companyId={selectedCompanyId}
        onClose={() => setSelectedCompanyId(null)}
        onOpenDeal={(dealId) => {
          setSelectedCompanyId(null);
          setSelectedDealId(dealId);
        }}
        onOpenContact={(contactId) => {
          setSelectedCompanyId(null);
          setSelectedContactId(contactId);
        }}
      />
```

**Step 5:** Verify.
```bash
cd /Users/boss/Develpment/iSaas-CRM && npx tsc --noEmit
```

**Step 6:** Commit.
```bash
git add src/routes/_authenticated/pipeline.tsx && git commit -m "feat: wire up cross-navigation between deal, contact, and company modals on pipeline page"
```

---

### Task 11: Cross-navigation — Wire up modal callbacks on contacts and companies pages

**Files:**
- Modify: `src/routes/_authenticated/contacts.tsx`
- Modify: `src/routes/_authenticated/companies.tsx`

**Step 1:** Update `src/routes/_authenticated/contacts.tsx`. Add imports:

```typescript
import { DealDetailModal } from '@/components/crm/deal-detail-modal';
import { CompanyDetailModal } from '@/components/crm/company-detail-modal';
```

Add state variables inside `ContactsPage` after `selectedContactId`:

```typescript
  const [selectedDealId, setSelectedDealId] = useState<Id<'deals'> | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<Id<'companies'> | null>(null);
```

Add query for stages (needed by DealDetailModal):

```typescript
  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const stages = useQuery(
    api.crm.pipelines.listStagesByPipeline,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );
```

Update the existing `ContactDetailModal` to pass callbacks:

```tsx
      <ContactDetailModal
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
        onOpenDeal={(dealId) => {
          setSelectedContactId(null);
          setSelectedDealId(dealId);
        }}
        onOpenCompany={(companyId) => {
          setSelectedContactId(null);
          setSelectedCompanyId(companyId);
        }}
      />
```

Add the two secondary modals after the `ContactDetailModal`:

```tsx
      <DealDetailModal
        dealId={selectedDealId}
        onClose={() => setSelectedDealId(null)}
        stages={stages ?? []}
        onOpenContact={(contactId) => {
          setSelectedDealId(null);
          setSelectedContactId(contactId);
        }}
        onOpenCompany={(companyId) => {
          setSelectedDealId(null);
          setSelectedCompanyId(companyId);
        }}
      />

      <CompanyDetailModal
        companyId={selectedCompanyId}
        onClose={() => setSelectedCompanyId(null)}
        onOpenDeal={(dealId) => {
          setSelectedCompanyId(null);
          setSelectedDealId(dealId);
        }}
        onOpenContact={(contactId) => {
          setSelectedCompanyId(null);
          setSelectedContactId(contactId);
        }}
      />
```

**Step 2:** Update `src/routes/_authenticated/companies.tsx`. Add imports:

```typescript
import { DealDetailModal } from '@/components/crm/deal-detail-modal';
import { ContactDetailModal } from '@/components/crm/contact-detail-modal';
```

Add state variables inside `CompaniesPage` after `selectedCompanyId`:

```typescript
  const [selectedDealId, setSelectedDealId] = useState<Id<'deals'> | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<Id<'contacts'> | null>(null);
```

Add query for stages:

```typescript
  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const stages = useQuery(
    api.crm.pipelines.listStagesByPipeline,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );
```

Update the existing `CompanyDetailModal` to pass callbacks:

```tsx
      <CompanyDetailModal
        companyId={selectedCompanyId}
        onClose={() => setSelectedCompanyId(null)}
        onOpenDeal={(dealId) => {
          setSelectedCompanyId(null);
          setSelectedDealId(dealId);
        }}
        onOpenContact={(contactId) => {
          setSelectedCompanyId(null);
          setSelectedContactId(contactId);
        }}
      />
```

Add the two secondary modals after the `CompanyDetailModal`:

```tsx
      <DealDetailModal
        dealId={selectedDealId}
        onClose={() => setSelectedDealId(null)}
        stages={stages ?? []}
        onOpenContact={(contactId) => {
          setSelectedDealId(null);
          setSelectedContactId(contactId);
        }}
        onOpenCompany={(companyId) => {
          setSelectedDealId(null);
          setSelectedCompanyId(companyId);
        }}
      />

      <ContactDetailModal
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
        onOpenDeal={(dealId) => {
          setSelectedContactId(null);
          setSelectedDealId(dealId);
        }}
        onOpenCompany={(companyId) => {
          setSelectedContactId(null);
          setSelectedCompanyId(companyId);
        }}
      />
```

**Step 3:** Verify.
```bash
cd /Users/boss/Develpment/iSaas-CRM && npx tsc --noEmit
```

**Step 4:** Commit.
```bash
git add src/routes/_authenticated/contacts.tsx src/routes/_authenticated/companies.tsx && git commit -m "feat: wire up cross-navigation modals on contacts and companies pages"
```

---

### Summary of all files touched

| Action | File |
|--------|------|
| Create | `convex/crm/relationships.ts` |
| Create | `src/components/ui/command.tsx` |
| Modify | `src/components/crm/deal-detail-modal.tsx` |
| Modify | `src/components/crm/contact-detail-modal.tsx` |
| Modify | `src/components/crm/company-detail-modal.tsx` |
| Modify | `src/routes/_authenticated/pipeline.tsx` |
| Modify | `src/routes/_authenticated/contacts.tsx` |
| Modify | `src/routes/_authenticated/companies.tsx` |
| Modify | `package.json` (cmdk dependency) |

### New Convex functions

| Function | Type | File |
|----------|------|------|
| `linkContactToDeal` | mutation | `convex/crm/relationships.ts` |
| `unlinkContactFromDeal` | mutation | `convex/crm/relationships.ts` |
| `listDealContacts` | query | `convex/crm/relationships.ts` |
| `listContactDeals` | query | `convex/crm/relationships.ts` |
| `linkCompanyToDeal` | mutation | `convex/crm/relationships.ts` |
| `unlinkCompanyFromDeal` | mutation | `convex/crm/relationships.ts` |
| `listDealCompanies` | query | `convex/crm/relationships.ts` |
| `listCompanyDeals` | query | `convex/crm/relationships.ts` |
