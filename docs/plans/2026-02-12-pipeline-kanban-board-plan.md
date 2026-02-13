# Pipeline Kanban Board Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-quality Kanban pipeline board with drag-and-drop, colorful stage columns, minimal deal cards, and a deal detail modal.

**Architecture:** Single Convex subscription (`getPipelineBoard`) powers the board. `@dnd-kit` handles drag-and-drop with optimistic updates on `moveDealToStage`. Deal detail opens in a shadcn Dialog modal with Info/Activity/Contacts tabs.

**Tech Stack:** React 19, TanStack Router, Convex (real-time), @dnd-kit, Tailwind CSS 4, shadcn/ui (Radix), Lucide icons

---

## Task 1: Install @dnd-kit packages

**Files:** `package.json`

**Step 1: Install dependencies**

Run:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Step 2: Verify installation**

Run:
```bash
node -e "require('@dnd-kit/core'); console.log('ok')"
```
Expected: `ok`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit for pipeline drag-and-drop"
```

---

## Task 2: Create stage colors utility

**Files:**
- Create: `src/lib/stage-colors.ts`

**Step 1: Create the utility file**

```typescript
// src/lib/stage-colors.ts

/** Default stage color map keyed by stage name */
const stageColorMap: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  'Qualification': {
    bg: 'bg-blue-50',
    border: 'border-t-blue-500',
    text: 'text-blue-600',
    badge: 'bg-blue-100 text-blue-700',
  },
  'Discovery': {
    bg: 'bg-violet-50',
    border: 'border-t-violet-500',
    text: 'text-violet-600',
    badge: 'bg-violet-100 text-violet-700',
  },
  'Proposal': {
    bg: 'bg-amber-50',
    border: 'border-t-amber-500',
    text: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
  },
  'Negotiation': {
    bg: 'bg-orange-50',
    border: 'border-t-orange-500',
    text: 'text-orange-600',
    badge: 'bg-orange-100 text-orange-700',
  },
  'Closed Won': {
    bg: 'bg-emerald-50',
    border: 'border-t-emerald-500',
    text: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
  },
};

const fallbackColors = {
  bg: 'bg-slate-50',
  border: 'border-t-slate-400',
  text: 'text-slate-600',
  badge: 'bg-slate-100 text-slate-700',
};

export function getStageColors(stageName: string) {
  return stageColorMap[stageName] ?? fallbackColors;
}

/** Activity type to color mapping for timeline icons */
export const activityTypeColors: Record<string, { bg: string; shadow: string }> = {
  call: { bg: 'bg-orange-500', shadow: 'shadow-orange-500/20' },
  email: { bg: 'bg-blue-500', shadow: 'shadow-blue-500/20' },
  note: { bg: 'bg-amber-500', shadow: 'shadow-amber-500/20' },
  meeting: { bg: 'bg-violet-500', shadow: 'shadow-violet-500/20' },
  task: { bg: 'bg-slate-500', shadow: 'shadow-slate-500/20' },
  status_change: { bg: 'bg-emerald-500', shadow: 'shadow-emerald-500/20' },
};
```

**Step 2: Commit**

```bash
git add src/lib/stage-colors.ts
git commit -m "feat: add stage color and activity color utilities"
```

---

## Task 3: Enrich getPipelineBoard with contact names

**Files:**
- Modify: `convex/crm/pipelines.ts` — the `getPipelineBoard` query (lines 130-158)

**Context:** The current query returns deals grouped by stage but with no contact info. We need to join via `dealContacts` (using `by_deal` index) → get first contact → return `contactName` per deal.

**Step 1: Update the getPipelineBoard handler**

Replace the existing `getPipelineBoard` function (lines 130-158) with:

```typescript
export const getPipelineBoard = query({
  args: {
    pipelineId: v.id('pipelines'),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireCrmUser(ctx);
    const pipeline = await ctx.db.get('pipelines', args.pipelineId);
    ensureSameOrgEntity(orgId, pipeline, 'Pipeline not found');

    const [stages, deals] = await Promise.all([
      ctx.db
        .query('pipelineStages')
        .withIndex('by_pipeline_order', (q) => q.eq('pipelineId', args.pipelineId))
        .collect(),
      ctx.db
        .query('deals')
        .withIndex('by_pipeline', (q) => q.eq('pipelineId', args.pipelineId))
        .collect(),
    ]);

    // Enrich deals with primary contact name
    const enrichedDeals = await Promise.all(
      deals.map(async (deal) => {
        const dealContact = await ctx.db
          .query('dealContacts')
          .withIndex('by_deal', (q) => q.eq('dealId', deal._id))
          .first();

        let contactName: string | null = null;
        if (dealContact) {
          const contact = await ctx.db.get('contacts', dealContact.contactId);
          if (contact) {
            contactName = contact.firstName + (contact.lastName ? ` ${contact.lastName}` : '');
          }
        }

        return { ...deal, contactName };
      }),
    );

    return {
      pipeline,
      columns: stages.map((stage) => ({
        stage,
        deals: enrichedDeals.filter((deal) => deal.stageId === stage._id),
      })),
    };
  },
});
```

**Step 2: Verify Convex compiles**

Run:
```bash
npx convex dev --once
```
Expected: No errors. Types regenerated.

**Step 3: Commit**

```bash
git add convex/crm/pipelines.ts
git commit -m "feat: enrich pipeline board query with contact names"
```

---

## Task 4: Create DealCard component

**Files:**
- Create: `src/components/crm/deal-card.tsx`

**Context:** Draggable card using `@dnd-kit/sortable`. Shows deal title, value (colored by stage), and contact name. On click opens the deal detail modal (handled by parent via callback).

**Step 1: Create the component**

```tsx
// src/components/crm/deal-card.tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { getStageColors } from '@/lib/stage-colors';
import { GripVertical } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';

export type DealCardData = {
  _id: Id<'deals'>;
  title: string;
  value?: number;
  contactName: string | null;
  stageId: Id<'pipelineStages'>;
  status: 'open' | 'won' | 'lost';
};

type DealCardProps = {
  deal: DealCardData;
  stageName: string;
  onClick: (dealId: Id<'deals'>) => void;
};

export function DealCard({ deal, stageName, onClick }: DealCardProps) {
  const colors = getStageColors(stageName);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal._id, data: { deal } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-md border bg-white p-3 shadow-sm transition-all',
        'hover:shadow-md hover:border-orange-200 cursor-pointer',
        isDragging && 'opacity-50 shadow-lg rotate-[2deg] z-50',
      )}
      onClick={() => onClick(deal._id)}
    >
      <div
        className="absolute left-0 top-0 bottom-0 flex items-center px-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-slate-300" />
      </div>
      <div className="pl-4">
        <p className="font-medium text-sm text-slate-900 truncate">{deal.title}</p>
        <p className={cn('text-sm font-semibold mt-0.5', colors.text)}>
          {deal.value ? `$${deal.value.toLocaleString()}` : '—'}
        </p>
        <p className="text-xs text-slate-400 mt-1 truncate">
          {deal.contactName ?? 'No contact'}
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
mkdir -p src/components/crm
git add src/components/crm/deal-card.tsx
git commit -m "feat: add draggable DealCard component"
```

---

## Task 5: Create StageColumn component

**Files:**
- Create: `src/components/crm/stage-column.tsx`

**Context:** A droppable column using `@dnd-kit/sortable`. Shows color bar header with stage name, deal count, and total value. Contains DealCard children.

**Step 1: Create the component**

```tsx
// src/components/crm/stage-column.tsx
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { getStageColors } from '@/lib/stage-colors';
import { DealCard } from './deal-card';
import type { DealCardData } from './deal-card';
import type { Id } from '../../../convex/_generated/dataModel';

type StageColumnProps = {
  stageId: Id<'pipelineStages'>;
  stageName: string;
  deals: DealCardData[];
  onDealClick: (dealId: Id<'deals'>) => void;
};

export function StageColumn({ stageId, stageName, deals, onDealClick }: StageColumnProps) {
  const colors = getStageColors(stageName);
  const { setNodeRef, isOver } = useDroppable({ id: stageId });

  const totalValue = deals.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const dealIds = deals.map((d) => d._id);

  return (
    <div
      className={cn(
        'flex flex-col w-[280px] min-w-[280px] rounded-lg bg-white shadow-sm border border-t-[3px]',
        colors.border,
        isOver && 'ring-2 ring-orange-300 ring-offset-1',
      )}
    >
      {/* Stage Header */}
      <div className="px-3 py-3 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-slate-800">{stageName}</h3>
          <span className={cn('text-xs font-bold rounded-full px-2 py-0.5', colors.badge)}>
            {deals.length}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          {totalValue > 0 ? `$${totalValue.toLocaleString()}` : 'No value'}
        </p>
      </div>

      {/* Droppable Card Area */}
      <div ref={setNodeRef} className="flex-1 p-2 space-y-2 min-h-[120px] overflow-y-auto">
        <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
          {deals.map((deal) => (
            <DealCard
              key={deal._id}
              deal={deal}
              stageName={stageName}
              onClick={onDealClick}
            />
          ))}
        </SortableContext>
        {deals.length === 0 && (
          <div className="flex items-center justify-center h-full min-h-[80px] border-2 border-dashed border-slate-200 rounded-md">
            <p className="text-xs text-slate-300">Drag a deal here</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/crm/stage-column.tsx
git commit -m "feat: add droppable StageColumn component"
```

---

## Task 6: Create PipelineBoard component (DnD context)

**Files:**
- Create: `src/components/crm/pipeline-board.tsx`

**Context:** Wraps all columns in a `DndContext`. Handles `onDragEnd` to call `moveDealToStage` mutation. Uses `DragOverlay` for the ghost card. Manages optimistic local state for snappy feel.

**Step 1: Create the component**

```tsx
// src/components/crm/pipeline-board.tsx
import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { StageColumn } from './stage-column';
import { DealCard } from './deal-card';
import type { DealCardData } from './deal-card';
import type { Id } from '../../../convex/_generated/dataModel';

type Column = {
  stage: {
    _id: Id<'pipelineStages'>;
    name: string;
    order: number;
  };
  deals: DealCardData[];
};

type PipelineBoardProps = {
  columns: Column[];
  onDealClick: (dealId: Id<'deals'>) => void;
};

export function PipelineBoard({ columns, onDealClick }: PipelineBoardProps) {
  const moveDeal = useMutation(api.crm.pipelines.moveDealToStage);
  const [activeCard, setActiveCard] = useState<{ deal: DealCardData; stageName: string } | null>(null);
  const [localColumns, setLocalColumns] = useState<Column[] | null>(null);

  // Use pointer sensor with a small activation distance to differentiate click vs drag
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const displayColumns = localColumns ?? columns;

  // Reset local state when server data updates and no drag is active
  if (localColumns && !activeCard) {
    setLocalColumns(null);
  }

  const findDealAndStage = useCallback(
    (dealId: string) => {
      for (const col of displayColumns) {
        const deal = col.deals.find((d) => d._id === dealId);
        if (deal) return { deal, stageName: col.stage.name };
      }
      return null;
    },
    [displayColumns],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const result = findDealAndStage(event.active.id as string);
      if (result) {
        setActiveCard(result);
        setLocalColumns(columns.map((c) => ({ ...c, deals: [...c.deals] })));
      }
    },
    [findDealAndStage, columns],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || !localColumns) return;

      const activeDealId = active.id as string;
      const overId = over.id as string;

      // Find which columns the active deal and the over target are in
      let sourceColIdx = -1;
      let destColIdx = -1;

      for (let i = 0; i < localColumns.length; i++) {
        if (localColumns[i].deals.some((d) => d._id === activeDealId)) sourceColIdx = i;
        if (localColumns[i].stage._id === overId || localColumns[i].deals.some((d) => d._id === overId)) {
          destColIdx = i;
        }
      }

      if (sourceColIdx === -1 || destColIdx === -1 || sourceColIdx === destColIdx) return;

      setLocalColumns((prev) => {
        if (!prev) return prev;
        const next = prev.map((c) => ({ ...c, deals: [...c.deals] }));
        const dealIdx = next[sourceColIdx].deals.findIndex((d) => d._id === activeDealId);
        if (dealIdx === -1) return prev;
        const [moved] = next[sourceColIdx].deals.splice(dealIdx, 1);
        next[destColIdx].deals.push(moved);
        return next;
      });
    },
    [localColumns],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveCard(null);

      if (!over || !localColumns) {
        setLocalColumns(null);
        return;
      }

      const activeDealId = active.id as Id<'deals'>;
      const overId = over.id as string;

      // Find destination stage
      let destStageId: Id<'pipelineStages'> | null = null;
      for (const col of localColumns) {
        if (col.stage._id === overId || col.deals.some((d) => d._id === overId)) {
          destStageId = col.stage._id;
          break;
        }
      }

      // Find source stage
      let sourceStageId: Id<'pipelineStages'> | null = null;
      for (const col of columns) {
        if (col.deals.some((d) => d._id === activeDealId)) {
          sourceStageId = col.stage._id;
          break;
        }
      }

      // Only call mutation if stage actually changed
      if (destStageId && destStageId !== sourceStageId) {
        moveDeal({ dealId: activeDealId, stageId: destStageId }).catch(() => {
          setLocalColumns(null);
        });
      } else {
        setLocalColumns(null);
      }
    },
    [localColumns, columns, moveDeal],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 px-1">
        {displayColumns.map((col) => (
          <StageColumn
            key={col.stage._id}
            stageId={col.stage._id}
            stageName={col.stage.name}
            deals={col.deals}
            onDealClick={onDealClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeCard ? (
          <div className="rotate-[2deg] opacity-90">
            <DealCard
              deal={activeCard.deal}
              stageName={activeCard.stageName}
              onClick={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/crm/pipeline-board.tsx
git commit -m "feat: add PipelineBoard with DnD context and optimistic moves"
```

---

## Task 7: Create ActivityTimeline component

**Files:**
- Create: `src/components/crm/activity-timeline.tsx`

**Context:** Reusable timeline matching the reference design (Contact Details screenshot). Vertical line, colored circle icons per activity type, title + timestamp. Will be used in deal detail modal and later in contact/company detail pages.

**Step 1: Create the component**

```tsx
// src/components/crm/activity-timeline.tsx
import { cn } from '@/lib/utils';
import { activityTypeColors } from '@/lib/stage-colors';
import { Phone, Mail, StickyNote, Calendar, CheckSquare, ArrowRightLeft } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';

type Activity = {
  _id: Id<'activities'>;
  type: 'note' | 'call' | 'email' | 'meeting' | 'task' | 'status_change';
  title: string;
  body?: string;
  createdAt: number;
};

const activityIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  note: StickyNote,
  meeting: Calendar,
  task: CheckSquare,
  status_change: ArrowRightLeft,
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type ActivityTimelineProps = {
  activities: Activity[];
};

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return <p className="text-sm text-slate-400 py-4 text-center">No activities yet.</p>;
  }

  return (
    <div className="relative space-y-6 pl-10">
      {/* Vertical line */}
      <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-200" />

      {activities.map((activity) => {
        const Icon = activityIcons[activity.type] ?? StickyNote;
        const typeColors = activityTypeColors[activity.type] ?? activityTypeColors.note;

        return (
          <div key={activity._id} className="relative">
            {/* Icon circle */}
            <div
              className={cn(
                'absolute -left-10 w-8 h-8 rounded-full flex items-center justify-center shadow-lg',
                typeColors.bg,
                typeColors.shadow,
              )}
            >
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>

            {/* Content */}
            <div>
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold text-sm text-slate-800">{activity.title}</h4>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {formatRelativeTime(activity.createdAt)}
                </span>
              </div>
              {activity.body && (
                <div className="mt-2 p-2.5 bg-slate-50 rounded-md border border-slate-100">
                  <p className="text-sm text-slate-600 italic line-clamp-3">{activity.body}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/crm/activity-timeline.tsx
git commit -m "feat: add reusable ActivityTimeline component"
```

---

## Task 8: Create DealDetailModal component

**Files:**
- Create: `src/components/crm/deal-detail-modal.tsx`

**Context:** Shadcn Dialog with three tabs (Info, Activity, Contacts). Fetches deal data, activities, and linked contacts via separate Convex queries (only when modal is open). Uses existing mutations for updating deals and logging activities.

**Step 1: Create the component**

```tsx
// src/components/crm/deal-detail-modal.tsx
import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Calendar, DollarSign, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStageColors } from '@/lib/stage-colors';
import { ActivityTimeline } from './activity-timeline';
import type { Id } from '../../../convex/_generated/dataModel';

type DealDetailModalProps = {
  dealId: Id<'deals'> | null;
  onClose: () => void;
  stages: Array<{ _id: Id<'pipelineStages'>; name: string }>;
};

export function DealDetailModal({ dealId, onClose, stages }: DealDetailModalProps) {
  const deal = useQuery(api.crm.deals.getDeal, dealId ? { dealId } : 'skip');
  const activities = useQuery(
    api.crm.activities.listDealActivities,
    dealId ? { dealId } : 'skip',
  );
  const dealContacts = useQuery(
    api.crm.contacts.listContacts,
  );
  const moveDeal = useMutation(api.crm.pipelines.moveDealToStage);
  const createActivity = useMutation(api.crm.activities.createActivity);
  const updateDeal = useMutation(api.crm.deals.updateDeal);

  const [activityTitle, setActivityTitle] = useState('');
  const [activityType, setActivityType] = useState<'note' | 'call' | 'email' | 'meeting' | 'task'>('note');

  if (!dealId) return null;

  const currentStage = stages.find((s) => s._id === deal?.stageId);
  const stageColors = currentStage ? getStageColors(currentStage.name) : null;

  const handleStageChange = async (newStageId: string) => {
    if (dealId && newStageId !== deal?.stageId) {
      await moveDeal({ dealId, stageId: newStageId as Id<'pipelineStages'> });
    }
  };

  const handleLogActivity = async () => {
    if (!activityTitle.trim()) return;
    await createActivity({
      dealId,
      type: activityType,
      title: activityTitle.trim(),
    });
    setActivityTitle('');
  };

  return (
    <Dialog open={!!dealId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        {!deal ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-xl">{deal.title}</DialogTitle>
                {currentStage && stageColors && (
                  <Badge className={cn('text-xs', stageColors.badge)}>
                    {currentStage.name}
                  </Badge>
                )}
                <Badge variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}>
                  {deal.status}
                </Badge>
              </div>
              <DialogDescription>
                <span className="flex items-center gap-4 mt-2">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    {deal.value ? `$${deal.value.toLocaleString()}` : 'No value'}
                  </span>
                  {deal.expectedCloseDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(deal.expectedCloseDate).toLocaleDateString()}
                    </span>
                  )}
                </span>
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="info" className="mt-4">
              <TabsList>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Stage</Label>
                    <Select value={deal.stageId} onValueChange={handleStageChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((stage) => (
                          <SelectItem key={stage._id} value={stage._id}>
                            {stage.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Value</Label>
                    <p className="text-sm font-medium py-2">
                      {deal.value ? `$${deal.value.toLocaleString()} ${deal.currency ?? 'USD'}` : '—'}
                    </p>
                  </div>
                </div>
                {deal.notes && (
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-md">{deal.notes}</p>
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

              <TabsContent value="contacts" className="mt-4">
                <p className="text-sm text-slate-400 text-center py-4">
                  Contact linking coming soon.
                </p>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-4">
              <div className="flex items-center gap-2 w-full">
                <Select value={activityType} onValueChange={(v) => setActivityType(v as typeof activityType)}>
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
                  onKeyDown={(e) => e.key === 'Enter' && handleLogActivity()}
                  className="flex-1"
                />
                <Button
                  onClick={handleLogActivity}
                  disabled={!activityTitle.trim()}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
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
```

**Step 2: Commit**

```bash
git add src/components/crm/deal-detail-modal.tsx
git commit -m "feat: add DealDetailModal with Info/Activity/Contacts tabs"
```

---

## Task 9: Rebuild Pipeline page route

**Files:**
- Modify: `src/routes/_authenticated/pipeline.tsx` (full rewrite)

**Context:** Wire all components together. Fetches pipeline data, renders PipelineHeader + PipelineBoard + DealDetailModal. Manages selected deal state.

**Step 1: Rewrite the pipeline route**

Replace the entire file with:

```tsx
// src/routes/_authenticated/pipeline.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { Loader2, Plus, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { PipelineBoard } from '@/components/crm/pipeline-board';
import { DealDetailModal } from '@/components/crm/deal-detail-modal';
import type { Id } from '../../../convex/_generated/dataModel';

export const Route = createFileRoute('/_authenticated/pipeline')({
  component: PipelinePage,
});

function PipelinePage() {
  const ensureDefaultPipeline = useMutation(api.crm.pipelines.ensureDefaultPipeline);
  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const board = useQuery(
    api.crm.pipelines.getPipelineBoard,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );
  const stages = useQuery(
    api.crm.pipelines.listStagesByPipeline,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );

  const [selectedDealId, setSelectedDealId] = useState<Id<'deals'> | null>(null);

  useEffect(() => {
    if (defaultPipeline === null) {
      ensureDefaultPipeline().catch((error) => {
        console.error('Failed to create default pipeline:', error);
      });
    }
  }, [defaultPipeline, ensureDefaultPipeline]);

  if (defaultPipeline === undefined || board === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Pipeline Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {board.pipeline?.name ?? 'Pipeline'}
          </h1>
          <p className="text-sm text-slate-500">
            {board.columns.reduce((sum, col) => sum + col.deals.length, 0)} deals across{' '}
            {board.columns.length} stages
          </p>
        </div>
        <Button className="bg-orange-500 hover:bg-orange-600 text-white" asChild>
          <a href="/deals">
            <Plus className="h-4 w-4 mr-1" />
            Add Deal
          </a>
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 -mx-4 px-4" style={{ background: '#f8f7f5' }}>
        <div className="py-4">
          <PipelineBoard
            columns={board.columns}
            onDealClick={setSelectedDealId}
          />
        </div>
      </div>

      {/* Deal Detail Modal */}
      <DealDetailModal
        dealId={selectedDealId}
        onClose={() => setSelectedDealId(null)}
        stages={stages ?? []}
      />
    </div>
  );
}
```

**Step 2: Verify the app compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/routes/_authenticated/pipeline.tsx
git commit -m "feat: rebuild pipeline page with Kanban board and deal modal"
```

---

## Task 10: Smoke test and final polish

**Step 1: Start the dev server**

Run:
```bash
npm run dev
```

**Step 2: Manual verification checklist**

- [ ] Pipeline page loads with default pipeline columns
- [ ] Columns show colored top borders (blue, violet, amber, orange, emerald)
- [ ] Stage headers show deal count and total value
- [ ] Deal cards show title, value (colored), and contact name
- [ ] Drag-and-drop moves cards between columns
- [ ] Ghost card appears while dragging with rotation
- [ ] Board updates in real-time after drop
- [ ] Click on deal card opens modal dialog
- [ ] Modal shows deal title, stage badge, status badge
- [ ] Info tab shows stage selector and deal value
- [ ] Activity tab shows timeline with colored icons
- [ ] Log activity from modal footer works
- [ ] Empty column shows "Drag a deal here" placeholder

**Step 3: Fix any issues found during testing**

Address visual or functional issues.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: pipeline kanban board - complete implementation"
```
