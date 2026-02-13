# Phase 5: Custom Fields — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let org admins define their own data fields on contacts, companies, and deals, with full CRUD on definitions and dynamic rendering in detail modals.

**Architecture:** A new `fieldDefinitions` table stores org-scoped field metadata (name, type, options, ordering). Each entity (contacts, companies, deals) gets a `customFields: v.optional(v.any())` column that stores a JSON object keyed by field definition ID (`{ [fieldDefId]: value }`). Field definitions are managed in Settings; values are rendered dynamically in detail modal Info tabs via shared `CustomFieldRenderer` (edit) and `CustomFieldDisplay` (read-only) components.

**Tech Stack:** Convex (backend mutations/queries), React, TanStack Router, shadcn/ui (Input, Textarea, Select, Checkbox, Label, Button, Card, Tabs, Table, Dialog, AlertDialog, Badge, Separator), Lucide icons, TypeScript.

---

### Task 1: Schema — Add `fieldDefinitions` table and `customFields` to entities

**Files:**
- Modify: `convex/schema.ts`

**Step 1:** Add the `fieldDefinitions` table to the schema, right after the `dealCompanies` table definition. This table stores org-scoped custom field definitions.

```typescript
  // Custom field definitions — org-scoped metadata for custom fields
  fieldDefinitions: defineTable({
    orgId: v.id('orgs'),
    // Which entity type this field belongs to
    entityType: v.union(v.literal('contacts'), v.literal('companies'), v.literal('deals')),
    // Display name shown in forms and tables
    name: v.string(),
    // Field data type
    fieldType: v.union(
      v.literal('text'),
      v.literal('textarea'),
      v.literal('number'),
      v.literal('date'),
      v.literal('select'),
      v.literal('multi-select'),
      v.literal('checkbox'),
      v.literal('url'),
    ),
    // Options for select and multi-select field types
    options: v.optional(v.array(v.string())),
    // Whether this field is required when editing
    isRequired: v.boolean(),
    // Display order (lower = higher in the form)
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['orgId'])
    .index('by_org_entity', ['orgId', 'entityType'])
    .index('by_org_entity_order', ['orgId', 'entityType', 'order']),
```

**Step 2:** Add `customFields: v.optional(v.any())` to the `contacts` table. Insert the field right before `createdAt`:

In the `contacts` table definition, add this line after `companyId`:
```typescript
    customFields: v.optional(v.any()),
```

**Step 3:** Add `customFields: v.optional(v.any())` to the `companies` table. Insert the field right before `createdAt`:

In the `companies` table definition, add this line after `ownerUserId`:
```typescript
    customFields: v.optional(v.any()),
```

**Step 4:** Add `customFields: v.optional(v.any())` to the `deals` table. Insert the field right before `createdAt`:

In the `deals` table definition, add this line after `notes`:
```typescript
    customFields: v.optional(v.any()),
```

**Verification:**
- Run `npx convex dev` and confirm the schema deploys without errors
- Check the Convex dashboard and verify the `fieldDefinitions` table exists
- Verify the `contacts`, `companies`, and `deals` tables now show `customFields` as an optional column

**Commit:**
```bash
git add convex/schema.ts
git commit -m "feat: add fieldDefinitions table and customFields column to contacts, companies, deals

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Backend — Field definition CRUD (`convex/crm/customFields.ts`)

**Files:**
- Create: `convex/crm/customFields.ts`

**Step 1:** Create the file with all four backend functions for managing field definitions. Follow the exact same auth patterns used in `convex/crm/contacts.ts` — use `requireCrmUser`, `assertCanWrite`, and `ensureSameOrgEntity` from `./authz`.

```typescript
import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertCanWrite, ensureSameOrgEntity, requireCrmUser } from './authz';

const entityTypeValidator = v.union(
  v.literal('contacts'),
  v.literal('companies'),
  v.literal('deals'),
);

const fieldTypeValidator = v.union(
  v.literal('text'),
  v.literal('textarea'),
  v.literal('number'),
  v.literal('date'),
  v.literal('select'),
  v.literal('multi-select'),
  v.literal('checkbox'),
  v.literal('url'),
);

export const listFieldDefinitions = query({
  args: {
    entityType: v.optional(entityTypeValidator),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);

    if (args.entityType) {
      return await ctx.db
        .query('fieldDefinitions')
        .withIndex('by_org_entity_order', (q) =>
          q.eq('orgId', orgId).eq('entityType', args.entityType!)
        )
        .collect();
    }

    return await ctx.db
      .query('fieldDefinitions')
      .withIndex('by_org', (q) => q.eq('orgId', orgId))
      .collect();
  },
});

export const createFieldDefinition = mutation({
  args: {
    entityType: entityTypeValidator,
    name: v.string(),
    fieldType: fieldTypeValidator,
    options: v.optional(v.array(v.string())),
    isRequired: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);

    // Admin-only: only admins can manage field definitions
    if (role !== 'admin') {
      throw new Error('Only admins can manage custom field definitions');
    }

    // Validate that select/multi-select have options
    if (
      (args.fieldType === 'select' || args.fieldType === 'multi-select') &&
      (!args.options || args.options.length === 0)
    ) {
      throw new Error('Select and multi-select fields require at least one option');
    }

    // Calculate the next order value
    const existing = await ctx.db
      .query('fieldDefinitions')
      .withIndex('by_org_entity', (q) =>
        q.eq('orgId', orgId).eq('entityType', args.entityType)
      )
      .collect();
    const maxOrder = existing.reduce((max, f) => Math.max(max, f.order), -1);

    const now = Date.now();
    return await ctx.db.insert('fieldDefinitions', {
      orgId,
      entityType: args.entityType,
      name: args.name,
      fieldType: args.fieldType,
      options: args.options,
      isRequired: args.isRequired,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateFieldDefinition = mutation({
  args: {
    fieldDefinitionId: v.id('fieldDefinitions'),
    name: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);

    if (role !== 'admin') {
      throw new Error('Only admins can manage custom field definitions');
    }

    const fieldDef = await ctx.db.get(args.fieldDefinitionId);
    ensureSameOrgEntity(orgId, fieldDef, 'Field definition not found');

    const { fieldDefinitionId, ...fields } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) patch[key] = value;
    }

    await ctx.db.patch(fieldDefinitionId, patch);
    return fieldDefinitionId;
  },
});

export const deleteFieldDefinition = mutation({
  args: {
    fieldDefinitionId: v.id('fieldDefinitions'),
  },
  handler: async (ctx, args) => {
    const { orgId, role } = await requireCrmUser(ctx);
    assertCanWrite(role);

    if (role !== 'admin') {
      throw new Error('Only admins can manage custom field definitions');
    }

    const fieldDef = await ctx.db.get(args.fieldDefinitionId);
    ensureSameOrgEntity(orgId, fieldDef, 'Field definition not found');

    // Delete the definition. Data stored in entity customFields blobs is
    // intentionally left in place (orphaned keys are harmless and this avoids
    // scanning every entity row on deletion).
    await ctx.db.delete(args.fieldDefinitionId);
  },
});
```

**Verification:**
- Run `npx convex dev` and confirm no type errors
- In the Convex dashboard, call `crm.customFields.listFieldDefinitions` with `{}` args — should return empty array
- Call `crm.customFields.createFieldDefinition` with `{ entityType: "contacts", name: "LinkedIn", fieldType: "url", isRequired: false }` — should succeed
- Call `crm.customFields.listFieldDefinitions` with `{ entityType: "contacts" }` — should return the created definition
- Call `crm.customFields.updateFieldDefinition` with the returned ID and `{ name: "LinkedIn URL" }` — should succeed
- Call `crm.customFields.deleteFieldDefinition` with the ID — should succeed
- Confirm `listFieldDefinitions` returns empty again

**Commit:**
```bash
git add convex/crm/customFields.ts
git commit -m "feat: add field definition CRUD (list, create, update, delete)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Backend — Update `updateContact`, `updateCompany`, `updateDeal` to accept `customFields`

**Files:**
- Modify: `convex/crm/contacts.ts`
- Modify: `convex/crm/companies.ts`
- Modify: `convex/crm/deals.ts`

**Step 1:** In `convex/crm/contacts.ts`, add `customFields` to the `updateContact` args and handler.

Add this arg to the `updateContact` args object (after the `companyId` arg):
```typescript
    customFields: v.optional(v.any()),
```

The existing handler loop (`for (const [key, value] of Object.entries(fields))`) already handles any new keys generically, so `customFields` will be included in the patch automatically. No handler changes needed because the destructured `fields` will include `customFields`.

**Step 2:** In `convex/crm/companies.ts`, add `customFields` to the `updateCompany` args object (after the `notes` arg):

```typescript
    customFields: v.optional(v.any()),
```

Same as contacts — the existing handler loop already handles it.

**Step 3:** In `convex/crm/deals.ts`, add `customFields` to the `updateDeal` args object (after the `assigneeUserId` arg):

```typescript
    customFields: v.optional(v.any()),
```

The deals handler uses explicit `if (args.X !== undefined)` checks instead of a loop. Add this line after the `assigneeUserId` check:
```typescript
    if (args.customFields !== undefined) patch.customFields = args.customFields;
```

**Verification:**
- Run `npx convex dev` and confirm no type errors
- In the Convex dashboard, create a test contact, then call `updateContact` with `{ contactId: "<id>", customFields: { "test_field": "hello" } }` — should succeed
- Call `getContact` and verify the `customFields` blob is returned
- Repeat for a company and a deal

**Commit:**
```bash
git add convex/crm/contacts.ts convex/crm/companies.ts convex/crm/deals.ts
git commit -m "feat: accept customFields in updateContact, updateCompany, updateDeal

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: UI — Create `CustomFieldRenderer` component (edit mode inputs)

**Files:**
- Create: `src/components/crm/custom-field-renderer.tsx`

**Step 1:** Create the component. It takes a field definition, the current value, and an `onChange` callback. It renders the appropriate shadcn input component based on `fieldType`.

```tsx
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Id } from '../../../convex/_generated/dataModel';

export type FieldDefinition = {
  _id: Id<'fieldDefinitions'>;
  name: string;
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multi-select' | 'checkbox' | 'url';
  options?: string[];
  isRequired: boolean;
  order: number;
};

type CustomFieldRendererProps = {
  field: FieldDefinition;
  value: unknown;
  onChange: (fieldId: Id<'fieldDefinitions'>, value: unknown) => void;
};

export function CustomFieldRenderer({ field, value, onChange }: CustomFieldRendererProps) {
  const fieldId = field._id;

  switch (field.fieldType) {
    case 'text':
      return (
        <div className="space-y-2">
          <Label>
            {field.name}
            {field.isRequired && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Input
            value={(value as string) ?? ''}
            onChange={(e) => onChange(fieldId, e.target.value)}
            placeholder={`Enter ${field.name.toLowerCase()}`}
          />
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-2">
          <Label>
            {field.name}
            {field.isRequired && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Textarea
            value={(value as string) ?? ''}
            onChange={(e) => onChange(fieldId, e.target.value)}
            placeholder={`Enter ${field.name.toLowerCase()}`}
            rows={3}
          />
        </div>
      );

    case 'number':
      return (
        <div className="space-y-2">
          <Label>
            {field.name}
            {field.isRequired && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Input
            type="number"
            value={value != null ? String(value) : ''}
            onChange={(e) => onChange(fieldId, e.target.value ? Number(e.target.value) : null)}
            placeholder={`Enter ${field.name.toLowerCase()}`}
          />
        </div>
      );

    case 'date':
      return (
        <div className="space-y-2">
          <Label>
            {field.name}
            {field.isRequired && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Input
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(fieldId, e.target.value || null)}
          />
        </div>
      );

    case 'select':
      return (
        <div className="space-y-2">
          <Label>
            {field.name}
            {field.isRequired && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Select
            value={(value as string) ?? ''}
            onValueChange={(v) => onChange(fieldId, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.name.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'multi-select': {
      const selectedValues = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-2">
          <Label>
            {field.name}
            {field.isRequired && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <div className="flex flex-wrap gap-1.5 rounded-md border p-2 min-h-[38px]">
            {(field.options ?? []).map((option) => {
              const isSelected = selectedValues.includes(option);
              return (
                <Badge
                  key={option}
                  variant={isSelected ? 'default' : 'outline'}
                  className="cursor-pointer select-none"
                  onClick={() => {
                    const next = isSelected
                      ? selectedValues.filter((v) => v !== option)
                      : [...selectedValues, option];
                    onChange(fieldId, next);
                  }}
                >
                  {option}
                </Badge>
              );
            })}
          </div>
        </div>
      );
    }

    case 'checkbox':
      return (
        <div className="flex items-center gap-2 py-2">
          <Checkbox
            id={`custom-field-${fieldId}`}
            checked={!!value}
            onCheckedChange={(checked) => onChange(fieldId, !!checked)}
          />
          <Label htmlFor={`custom-field-${fieldId}`} className="cursor-pointer">
            {field.name}
            {field.isRequired && <span className="ml-1 text-destructive">*</span>}
          </Label>
        </div>
      );

    case 'url':
      return (
        <div className="space-y-2">
          <Label>
            {field.name}
            {field.isRequired && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Input
            type="url"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(fieldId, e.target.value)}
            placeholder="https://example.com"
          />
        </div>
      );

    default:
      return null;
  }
}
```

**Verification:**
- Run `npx tsc --noEmit` — no type errors
- Visually confirm the component can be imported in another file without errors (will be wired in Tasks 7-9)

**Commit:**
```bash
git add src/components/crm/custom-field-renderer.tsx
git commit -m "feat: add CustomFieldRenderer component for edit-mode custom field inputs

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: UI — Create `CustomFieldDisplay` component (read-only display)

**Files:**
- Create: `src/components/crm/custom-field-display.tsx`

**Step 1:** Create the component. It takes the list of field definitions and the entity's `customFields` blob and renders each field's value in read-only mode.

```tsx
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ExternalLink } from 'lucide-react';
import type { FieldDefinition } from './custom-field-renderer';

type CustomFieldDisplayProps = {
  fieldDefinitions: FieldDefinition[];
  customFields: Record<string, unknown> | undefined;
};

function formatValue(field: FieldDefinition, value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">--</span>;
  }

  switch (field.fieldType) {
    case 'text':
    case 'textarea':
    case 'number':
      return <span>{String(value)}</span>;

    case 'date':
      return <span>{value ? new Date(value as string).toLocaleDateString() : '--'}</span>;

    case 'select':
      return (
        <Badge variant="secondary" className="text-xs">
          {String(value)}
        </Badge>
      );

    case 'multi-select': {
      const values = Array.isArray(value) ? (value as string[]) : [];
      if (values.length === 0) return <span className="text-muted-foreground">--</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="text-xs">
              {v}
            </Badge>
          ))}
        </div>
      );
    }

    case 'checkbox':
      return <span>{value ? 'Yes' : 'No'}</span>;

    case 'url':
      return (
        <a
          href={String(value).startsWith('http') ? String(value) : `https://${String(value)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-orange-600 underline hover:text-orange-700"
        >
          {String(value)}
          <ExternalLink className="h-3 w-3" />
        </a>
      );

    default:
      return <span>{String(value)}</span>;
  }
}

export function CustomFieldDisplay({ fieldDefinitions, customFields }: CustomFieldDisplayProps) {
  if (!fieldDefinitions || fieldDefinitions.length === 0) {
    return null;
  }

  // Sort by order
  const sorted = [...fieldDefinitions].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground">Custom Fields</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((field) => {
          const value = customFields?.[field._id];
          return (
            <div key={field._id} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{field.name}</Label>
              <div className="text-sm font-medium">{formatValue(field, value)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Verification:**
- Run `npx tsc --noEmit` — no type errors
- Confirm the component renders nothing if `fieldDefinitions` is empty (graceful fallback)

**Commit:**
```bash
git add src/components/crm/custom-field-display.tsx
git commit -m "feat: add CustomFieldDisplay component for read-only custom field values

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: UI — Settings Custom Fields admin page

**Files:**
- Modify: `src/routes/_authenticated/settings.tsx`

**Step 1:** Add imports at the top of the file. Add these to the existing imports:

```tsx
import { useMutation, useQuery } from 'convex/react';
// Add to existing lucide imports:
import { ChevronDown, ChevronUp, List, Plus, Trash2 } from 'lucide-react';
// Add new UI imports:
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
```

Note: `useQuery` and `useMutation` are already imported from the existing settings page; keep the existing import if already present and just add the missing ones.

**Step 2:** Create the `CustomFieldsSection` component as a sub-component inside the settings file (or as a separate component — below shows it inline in settings.tsx). Add this component definition before the `SettingsPage` function:

```tsx
const ENTITY_TYPES = [
  { value: 'contacts' as const, label: 'Contacts' },
  { value: 'companies' as const, label: 'Companies' },
  { value: 'deals' as const, label: 'Deals' },
] as const;

type EntityType = 'contacts' | 'companies' | 'deals';

const FIELD_TYPES = [
  { value: 'text' as const, label: 'Text' },
  { value: 'textarea' as const, label: 'Textarea' },
  { value: 'number' as const, label: 'Number' },
  { value: 'date' as const, label: 'Date' },
  { value: 'select' as const, label: 'Select' },
  { value: 'multi-select' as const, label: 'Multi-select' },
  { value: 'checkbox' as const, label: 'Checkbox' },
  { value: 'url' as const, label: 'URL' },
] as const;

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multi-select' | 'checkbox' | 'url';

function CustomFieldsSection() {
  const fieldDefinitions = useQuery(api.crm.customFields.listFieldDefinitions, {});
  const createField = useMutation(api.crm.customFields.createFieldDefinition);
  const updateField = useMutation(api.crm.customFields.updateFieldDefinition);
  const deleteField = useMutation(api.crm.customFields.deleteFieldDefinition);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addEntityType, setAddEntityType] = useState<EntityType>('contacts');
  const [addName, setAddName] = useState('');
  const [addFieldType, setAddFieldType] = useState<FieldType>('text');
  const [addRequired, setAddRequired] = useState(false);
  const [addOptions, setAddOptions] = useState('');

  const resetAddForm = () => {
    setAddName('');
    setAddFieldType('text');
    setAddRequired(false);
    setAddOptions('');
  };

  const handleCreate = async () => {
    if (!addName.trim()) return;

    const options =
      addFieldType === 'select' || addFieldType === 'multi-select'
        ? addOptions
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
        : undefined;

    await createField({
      entityType: addEntityType,
      name: addName.trim(),
      fieldType: addFieldType,
      isRequired: addRequired,
      options,
    });

    resetAddForm();
    setIsAddDialogOpen(false);
  };

  const handleMoveUp = async (fieldDefId: string, currentOrder: number, entityType: EntityType) => {
    const entityFields = (fieldDefinitions ?? [])
      .filter((f) => f.entityType === entityType)
      .sort((a, b) => a.order - b.order);

    const currentIndex = entityFields.findIndex((f) => f._id === fieldDefId);
    if (currentIndex <= 0) return;

    const above = entityFields[currentIndex - 1];
    // Swap orders
    await updateField({ fieldDefinitionId: fieldDefId as any, order: above.order });
    await updateField({ fieldDefinitionId: above._id, order: currentOrder });
  };

  const handleMoveDown = async (fieldDefId: string, currentOrder: number, entityType: EntityType) => {
    const entityFields = (fieldDefinitions ?? [])
      .filter((f) => f.entityType === entityType)
      .sort((a, b) => a.order - b.order);

    const currentIndex = entityFields.findIndex((f) => f._id === fieldDefId);
    if (currentIndex >= entityFields.length - 1) return;

    const below = entityFields[currentIndex + 1];
    // Swap orders
    await updateField({ fieldDefinitionId: fieldDefId as any, order: below.order });
    await updateField({ fieldDefinitionId: below._id, order: currentOrder });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <List className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Custom Fields</CardTitle>
          </div>
          <Button
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
            className="bg-orange-500 text-white hover:bg-orange-600"
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Field
          </Button>
        </div>
        <CardDescription>
          Define custom data fields for contacts, companies, and deals
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {ENTITY_TYPES.map(({ value: entityType, label }) => {
          const fields = (fieldDefinitions ?? [])
            .filter((f) => f.entityType === entityType)
            .sort((a, b) => a.order - b.order);

          return (
            <div key={entityType}>
              <h4 className="mb-2 text-sm font-semibold">{label}</h4>
              {fields.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No custom fields defined for {label.toLowerCase()}.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Name</TableHead>
                      <TableHead className="w-[120px]">Type</TableHead>
                      <TableHead className="w-[100px]">Required</TableHead>
                      <TableHead className="w-[200px]">Options</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field._id}>
                        <TableCell className="font-medium">{field.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {field.fieldType}
                          </Badge>
                        </TableCell>
                        <TableCell>{field.isRequired ? 'Yes' : 'No'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {field.options?.join(', ') ?? '--'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={index === 0}
                              onClick={() => handleMoveUp(field._id, field.order, entityType)}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={index === fields.length - 1}
                              onClick={() => handleMoveDown(field._id, field.order, entityType)}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete custom field</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete the &quot;{field.name}&quot; field?
                                    Existing data stored in this field on {label.toLowerCase()} will become
                                    inaccessible. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteField({ fieldDefinitionId: field._id })}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {entityType !== 'deals' && <Separator className="mt-4" />}
            </div>
          );
        })}
      </CardContent>

      {/* Add field dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Field</DialogTitle>
            <DialogDescription>
              Create a new custom field for an entity type.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Entity Type</Label>
              <Select value={addEntityType} onValueChange={(v) => setAddEntityType(v as EntityType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Field Name</Label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g., LinkedIn URL"
              />
            </div>
            <div className="space-y-2">
              <Label>Field Type</Label>
              <Select value={addFieldType} onValueChange={(v) => setAddFieldType(v as FieldType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(addFieldType === 'select' || addFieldType === 'multi-select') && (
              <div className="space-y-2">
                <Label>Options (comma-separated)</Label>
                <Input
                  value={addOptions}
                  onChange={(e) => setAddOptions(e.target.value)}
                  placeholder="Option 1, Option 2, Option 3"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="add-required"
                checked={addRequired}
                onCheckedChange={setAddRequired}
              />
              <Label htmlFor="add-required">Required field</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetAddForm(); setIsAddDialogOpen(false); }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!addName.trim()}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              Create Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
```

**Step 3:** Add the `<CustomFieldsSection />` component inside the `SettingsPage` render, inside the `<div className="grid gap-6">` container, right after the Organization `<Card>` and before the Notifications `<Card>`:

```tsx
        {/* Custom Fields (admin only) */}
        <CustomFieldsSection />
```

**Verification:**
- Run `npx tsc --noEmit` — no type errors
- Navigate to `/settings` in the browser (logged in as admin)
- Verify the "Custom Fields" card appears between Organization and Notifications
- Click "Add Field" — the dialog should open
- Create a test field (e.g., "LinkedIn" of type "url" on Contacts)
- Verify it appears in the Contacts section table
- Test reorder buttons (up/down) with 2+ fields
- Test delete with confirmation dialog
- Verify non-admin users do NOT see the mutation succeed (they can see the card but create/update/delete will fail)

**Commit:**
```bash
git add src/routes/_authenticated/settings.tsx
git commit -m "feat: add Custom Fields admin section to Settings page

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: UI — Wire custom fields into contact detail modal Info tab

**Files:**
- Modify: `src/components/crm/contact-detail-modal.tsx`

**Step 1:** Add imports at the top of the file:

```tsx
import { CustomFieldRenderer } from './custom-field-renderer';
import { CustomFieldDisplay } from './custom-field-display';
import type { FieldDefinition } from './custom-field-renderer';
```

**Step 2:** Inside the `ContactDetailModal` component, add a query to fetch field definitions for contacts, and add state for custom field editing. Place these after the existing query/mutation declarations (around line 73):

```tsx
  const fieldDefinitions = useQuery(api.crm.customFields.listFieldDefinitions, { entityType: 'contacts' });
  const [editCustomFields, setEditCustomFields] = useState<Record<string, unknown>>({});
```

**Step 3:** In the `handleStartEdit` function, initialize `editCustomFields` from the contact's existing custom fields. Add this line after `setEditCompanyId(contact.companyId ?? '');`:

```tsx
    setEditCustomFields(
      (contact as unknown as { customFields?: Record<string, unknown> }).customFields ?? {}
    );
```

**Step 4:** Create a handler for custom field changes. Add this after `handleStartEdit`:

```tsx
  const handleCustomFieldChange = (fieldId: string, value: unknown) => {
    setEditCustomFields((prev) => ({ ...prev, [fieldId]: value }));
  };
```

**Step 5:** In the `handleSave` function, include `customFields` in the `updateContact` call. Change the `await updateContact({...})` call to include custom fields:

```tsx
    await updateContact({
      contactId,
      firstName: editFirstName.trim(),
      lastName: editLastName.trim() || undefined,
      email: editEmail.trim() || undefined,
      phone: editPhone.trim() || undefined,
      title: editTitle.trim() || undefined,
      companyId: editCompanyId ? (editCompanyId as Id<'companies'>) : undefined,
      customFields: editCustomFields,
    });
```

**Step 6:** In the **edit mode** section of the Info tab (inside `{isEditing ? ( ... ) : ( ... )}`), add the custom field renderers right before the Save/Cancel buttons div. Insert after the last `</div>` of the grid fields and before `<div className="flex gap-2">`:

```tsx
                      {/* Custom Fields - Edit Mode */}
                      {fieldDefinitions && fieldDefinitions.length > 0 && (
                        <div className="space-y-3 border-t pt-4">
                          <h4 className="text-sm font-medium text-muted-foreground">Custom Fields</h4>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {[...fieldDefinitions]
                              .sort((a, b) => a.order - b.order)
                              .map((field) => (
                                <CustomFieldRenderer
                                  key={field._id}
                                  field={field as FieldDefinition}
                                  value={editCustomFields[field._id]}
                                  onChange={handleCustomFieldChange}
                                />
                              ))}
                          </div>
                        </div>
                      )}
```

**Step 7:** In the **read-only mode** section (the `else` branch), add the `CustomFieldDisplay` component right before the Edit button. Insert before `<Button variant="outline" onClick={handleStartEdit}>`:

```tsx
                      {/* Custom Fields - Read-only Mode */}
                      {fieldDefinitions && fieldDefinitions.length > 0 && (
                        <div className="border-t pt-4">
                          <CustomFieldDisplay
                            fieldDefinitions={fieldDefinitions as FieldDefinition[]}
                            customFields={
                              (contact as unknown as { customFields?: Record<string, unknown> }).customFields
                            }
                          />
                        </div>
                      )}
```

**Verification:**
- Run `npx tsc --noEmit` — no type errors
- Create a custom field for contacts in Settings (e.g., "LinkedIn" of type "url")
- Open a contact detail modal — the custom field should appear in read-only mode (showing "--")
- Click Edit — the custom field input should appear (URL input in this case)
- Enter a value, save — verify the value persists on reload
- Switch back to read-only — the value should display as a clickable link

**Commit:**
```bash
git add src/components/crm/contact-detail-modal.tsx
git commit -m "feat: wire custom fields into contact detail modal Info tab (edit + read)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: UI — Wire custom fields into company detail modal Info tab

**Files:**
- Modify: `src/components/crm/company-detail-modal.tsx`

**Step 1:** Add imports at the top of the file:

```tsx
import { CustomFieldRenderer } from './custom-field-renderer';
import { CustomFieldDisplay } from './custom-field-display';
import type { FieldDefinition } from './custom-field-renderer';
```

**Step 2:** Inside the `CompanyDetailModal` component, add a query and state. Place these after the existing query/mutation declarations (around line 66):

```tsx
  const fieldDefinitions = useQuery(api.crm.customFields.listFieldDefinitions, { entityType: 'companies' });
  const [editCustomFields, setEditCustomFields] = useState<Record<string, unknown>>({});
```

**Step 3:** In the `handleStartEditing` function, initialize `editCustomFields`. Add this line after `setEditNotes(company.notes ?? '');`:

```tsx
    setEditCustomFields(
      (company as unknown as { customFields?: Record<string, unknown> }).customFields ?? {}
    );
```

**Step 4:** Create a handler for custom field changes. Add this after `handleStartEditing`:

```tsx
  const handleCustomFieldChange = (fieldId: string, value: unknown) => {
    setEditCustomFields((prev) => ({ ...prev, [fieldId]: value }));
  };
```

**Step 5:** In the `handleSave` function, include `customFields` in the `updateCompany` call:

```tsx
    await updateCompany({
      companyId,
      name: editName.trim(),
      website: editWebsite.trim() || undefined,
      phone: editPhone.trim() || undefined,
      industry: editIndustry || undefined,
      notes: editNotes.trim() || undefined,
      customFields: editCustomFields,
    });
```

**Step 6:** In the **edit mode** section of the Info tab, add custom field renderers right before the Save/Cancel buttons. Insert after the Notes `<Textarea>` div and before `<div className="flex gap-2">`:

```tsx
                      {/* Custom Fields - Edit Mode */}
                      {fieldDefinitions && fieldDefinitions.length > 0 && (
                        <div className="space-y-3 border-t pt-4">
                          <h4 className="text-sm font-medium text-muted-foreground">Custom Fields</h4>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {[...fieldDefinitions]
                              .sort((a, b) => a.order - b.order)
                              .map((field) => (
                                <CustomFieldRenderer
                                  key={field._id}
                                  field={field as FieldDefinition}
                                  value={editCustomFields[field._id]}
                                  onChange={handleCustomFieldChange}
                                />
                              ))}
                          </div>
                        </div>
                      )}
```

**Step 7:** In the **read-only mode** section, add `CustomFieldDisplay` right before the Edit button. Insert before `<Button variant="outline" onClick={handleStartEditing}>`:

```tsx
                      {/* Custom Fields - Read-only Mode */}
                      {fieldDefinitions && fieldDefinitions.length > 0 && (
                        <div className="border-t pt-4">
                          <CustomFieldDisplay
                            fieldDefinitions={fieldDefinitions as FieldDefinition[]}
                            customFields={
                              (company as unknown as { customFields?: Record<string, unknown> }).customFields
                            }
                          />
                        </div>
                      )}
```

**Verification:**
- Run `npx tsc --noEmit` — no type errors
- Create a custom field for companies in Settings (e.g., "Employee Count" of type "number")
- Open a company detail modal — the custom field should appear in read-only mode
- Click Edit — a number input should appear
- Enter a value, save — verify the value persists
- Verify read-only display shows the number

**Commit:**
```bash
git add src/components/crm/company-detail-modal.tsx
git commit -m "feat: wire custom fields into company detail modal Info tab (edit + read)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: UI — Wire custom fields into deal detail modal Info tab

**Files:**
- Modify: `src/components/crm/deal-detail-modal.tsx`

**Step 1:** Add imports at the top of the file:

```tsx
import { CustomFieldRenderer } from './custom-field-renderer';
import { CustomFieldDisplay } from './custom-field-display';
import type { FieldDefinition } from './custom-field-renderer';
```

**Step 2:** Inside the `DealDetailModal` component, add a query and state. Place these after the existing query/mutation declarations (around line 77):

```tsx
  const fieldDefinitions = useQuery(api.crm.customFields.listFieldDefinitions, { entityType: 'deals' });
  const [editCustomFields, setEditCustomFields] = useState<Record<string, unknown>>({});
```

**Step 3:** In the `startEditing` function, initialize `editCustomFields`. Add this line after the `setEditFields({...})` call and before `setIsEditing(true)`:

```tsx
    setEditCustomFields(
      (deal as unknown as { customFields?: Record<string, unknown> }).customFields ?? {}
    );
```

**Step 4:** Create a handler for custom field changes. Add this after `startEditing`:

```tsx
  const handleCustomFieldChange = (fieldId: string, value: unknown) => {
    setEditCustomFields((prev) => ({ ...prev, [fieldId]: value }));
  };
```

**Step 5:** In the `handleSave` function, include `customFields` in the updates object. The deal modal uses an explicit `updates` object pattern. Add this line right before the `// Only call mutation if something actually changed` comment:

```tsx
    // Always include custom fields if they exist
    const currentCustomFields = (deal as unknown as { customFields?: Record<string, unknown> }).customFields ?? {};
    if (JSON.stringify(editCustomFields) !== JSON.stringify(currentCustomFields)) {
      updates.customFields = editCustomFields;
    }
```

**Step 6:** In the **edit mode** section of the Info tab, add custom field renderers. The deal edit mode has a Notes textarea followed by Save/Cancel buttons. Insert right before `<div className="flex gap-2">` (the Save/Cancel container):

```tsx
                      {/* Custom Fields - Edit Mode */}
                      {fieldDefinitions && fieldDefinitions.length > 0 && (
                        <div className="space-y-3 border-t pt-4">
                          <h4 className="text-sm font-medium text-muted-foreground">Custom Fields</h4>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {[...fieldDefinitions]
                              .sort((a, b) => a.order - b.order)
                              .map((field) => (
                                <CustomFieldRenderer
                                  key={field._id}
                                  field={field as FieldDefinition}
                                  value={editCustomFields[field._id]}
                                  onChange={handleCustomFieldChange}
                                />
                              ))}
                          </div>
                        </div>
                      )}
```

**Step 7:** In the **read-only mode** section, add `CustomFieldDisplay`. The deal read-only mode shows Value, Close Date, Status, Notes, then an Edit button. Insert right before `<Button variant="outline" onClick={startEditing}>`:

```tsx
                      {/* Custom Fields - Read-only Mode */}
                      {fieldDefinitions && fieldDefinitions.length > 0 && (
                        <div className="border-t pt-4">
                          <CustomFieldDisplay
                            fieldDefinitions={fieldDefinitions as FieldDefinition[]}
                            customFields={
                              (deal as unknown as { customFields?: Record<string, unknown> }).customFields
                            }
                          />
                        </div>
                      )}
```

**Verification:**
- Run `npx tsc --noEmit` — no type errors
- Create a custom field for deals in Settings (e.g., "Source" of type "select" with options "Inbound, Outbound, Referral")
- Open a deal detail modal — the custom field should appear in read-only mode
- Click Edit — a select dropdown should appear with the three options
- Select a value, save — verify the value persists
- Verify read-only display shows the selected value as a badge
- Test with a multi-select field — verify badges are clickable to toggle and display correctly
- Test with a checkbox field — verify it renders as a checkbox in edit and "Yes"/"No" in read-only

**Commit:**
```bash
git add src/components/crm/deal-detail-modal.tsx
git commit -m "feat: wire custom fields into deal detail modal Info tab (edit + read)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Summary

| Task | Description | Files | Type |
|------|-------------|-------|------|
| 1 | Schema: `fieldDefinitions` table + `customFields` on entities | `convex/schema.ts` | Modify |
| 2 | Backend: Field definition CRUD | `convex/crm/customFields.ts` | Create |
| 3 | Backend: Accept `customFields` in update mutations | `convex/crm/contacts.ts`, `companies.ts`, `deals.ts` | Modify |
| 4 | UI: `CustomFieldRenderer` (edit inputs) | `src/components/crm/custom-field-renderer.tsx` | Create |
| 5 | UI: `CustomFieldDisplay` (read-only) | `src/components/crm/custom-field-display.tsx` | Create |
| 6 | UI: Settings Custom Fields admin page | `src/routes/_authenticated/settings.tsx` | Modify |
| 7 | UI: Custom fields in contact detail modal | `src/components/crm/contact-detail-modal.tsx` | Modify |
| 8 | UI: Custom fields in company detail modal | `src/components/crm/company-detail-modal.tsx` | Modify |
| 9 | UI: Custom fields in deal detail modal | `src/components/crm/deal-detail-modal.tsx` | Modify |

**Total: 2 new files created, 7 existing files modified.**
