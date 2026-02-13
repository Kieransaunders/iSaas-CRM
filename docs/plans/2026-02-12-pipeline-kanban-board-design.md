# Pipeline Kanban Board Design

## Overview

Build a production-quality Kanban pipeline board as the centerpiece CRM screen. Clean & minimal layout with colorful visual cues inspired by Monday.com and Freshsales. Orange primary (`#f7951d`), warm background (`#f8f7f5`), Inter font.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Visual style | Clean + colorful (Monday.com/Freshsales) | User preference, matches existing design language |
| Drag-and-drop | Full DnD + click-to-open modal | Premium CRM feel, `@dnd-kit` works well with React 19 |
| Deal cards | Minimal (title, value, contact name) | Scannable board, detail modal carries the rest |
| Deal detail | Modal dialog (centered overlay) | Keeps board context, focused interaction |
| Column headers | Name + count + total value + color bar | Visual stage distinction, at-a-glance pipeline health |

## Architecture

### Component Tree

```
PipelinePage
├── PipelineHeader         — pipeline selector dropdown, "+ Add Deal" button
├── PipelineBoard          — horizontal scroll container
│   └── DndContext (@dnd-kit)
│       ├── StageColumn[]  — droppable zones
│       │   ├── StageHeader — 3px color bar + name + count + $total
│       │   └── DealCard[] — draggable minimal cards
│       └── DragOverlay    — ghost card while dragging
└── DealDetailModal        — shadcn Dialog on card click
```

### Convex Data Flow

1. `useQuery(getDefaultPipeline)` — gets pipeline ID
2. `useQuery(getPipelineBoard, { pipelineId })` — stages + deals + primary contact names (enriched query)
3. On drag-end — `useMutation(moveDealToStage)` with optimistic update (locally moves deal between columns before server confirms)
4. Convex real-time subscriptions auto-update board when other users make changes

Single subscription powers the entire board. No extra client-side queries.

### Backend Changes

Enrich `getPipelineBoard` in `convex/crm/pipelines.ts` to join primary contact name per deal via `dealContacts` junction table (uses existing `by_deal` index).

No schema changes needed.

## Visual Design

### Board Layout

- Full-width horizontal scroll container
- Warm background (`#f8f7f5`) behind columns
- Each column: fixed ~280px width, white background, subtle shadow, rounded-lg
- 3px colored top border per stage

### Stage Colors

| Stage | Color | Hex |
|-------|-------|-----|
| Qualification | Blue | `#3b82f6` |
| Discovery | Violet | `#8b5cf6` |
| Proposal | Amber | `#f59e0b` |
| Negotiation | Orange | `#f7951d` |
| Closed Won | Emerald | `#10b981` |

### Stage Header

- Stage name (semibold) + deal count badge + total value right-aligned
- Example: `Qualification  (4)  ·  $128,000`

### Deal Cards (Minimal)

- White card, subtle border, rounded-md, hover shadow lift
- Line 1: Deal title (medium weight, truncated)
- Line 2: Value in stage accent color (`$42,000`) or dash if none
- Line 3: Contact name in muted text, or "No contact"
- Cursor grab on hover, slight scale on drag start
- 2px orange left-border on hover

### Empty Column State

- Dashed border drop zone with muted text "Drag a deal here"

### Drag Overlay (Ghost Card)

- Slight rotation (2deg), elevated shadow, reduced opacity (0.9)

## Deal Detail Modal

Centered shadcn Dialog, max-w-2xl, scrollable body.

### Structure

```
DialogHeader
├── Deal title (editable inline)
├── Stage badge (colored, matches column)
└── Status badge (open/won/lost)

DialogBody
├── QuickStats row (value, expected close, owner avatar)
├── Tabs
│   ├── Info — value, currency, notes, stage dropdown
│   ├── Activity — timeline with color-coded icons
│   └── Contacts — linked contacts with link/unlink
DialogFooter
└── "Log Activity" primary orange button
```

### Activity Timeline

Reuses visual pattern from reference screens:
- Vertical line connector on left
- Colored circle icons per activity type (orange=call, blue=email, amber=note, green=deal)
- Title + timestamp right-aligned
- Expandable body with quote styling

## File Plan

| File | Action | Purpose |
|------|--------|---------|
| `convex/crm/pipelines.ts` | Modify | Enrich `getPipelineBoard` with contact name join |
| `src/routes/_authenticated/pipeline.tsx` | Rebuild | Full kanban board route |
| `src/components/crm/pipeline-board.tsx` | Create | Board + DndContext wrapper |
| `src/components/crm/stage-column.tsx` | Create | Droppable column with header + cards |
| `src/components/crm/deal-card.tsx` | Create | Draggable minimal card |
| `src/components/crm/deal-detail-modal.tsx` | Create | Modal with Info/Activity/Contacts tabs |
| `src/components/crm/activity-timeline.tsx` | Create | Reusable timeline component |
| `src/lib/stage-colors.ts` | Create | Stage color map + utility |

## Dependencies

- `@dnd-kit/core` — drag-and-drop primitives
- `@dnd-kit/sortable` — sortable within columns
- `@dnd-kit/utilities` — CSS utilities for transforms

## Not In Scope

- Schema changes (existing tables sufficient)
- Auth/onboarding (other developer)
- Other CRM screens (contacts, companies, dashboard — future)
- Custom pipeline creation UI (use existing `createPipeline` mutation later)
