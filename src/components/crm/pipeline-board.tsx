import { DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { useCallback, useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import type { Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { DealCard } from './deal-card';
import type { DealCardData } from './deal-card';
import { StageColumn } from './stage-column';

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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const displayColumns = localColumns ?? columns;

  useEffect(() => {
    if (!activeCard) {
      setLocalColumns(null);
    }
  }, [columns, activeCard]);

  const findDealAndStage = useCallback(
    (dealId: string) => {
      for (const column of displayColumns) {
        const deal = column.deals.find((item) => item._id === dealId);
        if (deal) {
          return { deal, stageName: column.stage.name };
        }
      }
      return null;
    },
    [displayColumns],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const result = findDealAndStage(event.active.id as string);
      if (!result) return;
      setActiveCard(result);
      setLocalColumns(columns.map((column) => ({ ...column, deals: [...column.deals] })));
    },
    [findDealAndStage, columns],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || !localColumns) return;

      const activeDealId = active.id as string;
      const overId = over.id as string;

      let sourceColumnIndex = -1;
      let destinationColumnIndex = -1;

      for (let index = 0; index < localColumns.length; index++) {
        const column = localColumns[index];
        if (column.deals.some((deal) => deal._id === activeDealId)) sourceColumnIndex = index;
        if (column.stage._id === overId || column.deals.some((deal) => deal._id === overId)) {
          destinationColumnIndex = index;
        }
      }

      if (sourceColumnIndex === -1 || destinationColumnIndex === -1 || sourceColumnIndex === destinationColumnIndex) {
        return;
      }

      setLocalColumns((previous) => {
        if (!previous) return previous;

        const next = previous.map((column) => ({ ...column, deals: [...column.deals] }));
        const movingDealIndex = next[sourceColumnIndex].deals.findIndex((deal) => deal._id === activeDealId);
        if (movingDealIndex === -1) return previous;

        const [movedDeal] = next[sourceColumnIndex].deals.splice(movingDealIndex, 1);
        next[destinationColumnIndex].deals.push(movedDeal);
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

      let destinationStageId: Id<'pipelineStages'> | null = null;
      for (const column of localColumns) {
        if (column.stage._id === overId || column.deals.some((deal) => deal._id === overId)) {
          destinationStageId = column.stage._id;
          break;
        }
      }

      let sourceStageId: Id<'pipelineStages'> | null = null;
      for (const column of columns) {
        if (column.deals.some((deal) => deal._id === activeDealId)) {
          sourceStageId = column.stage._id;
          break;
        }
      }

      if (destinationStageId && destinationStageId !== sourceStageId) {
        moveDeal({ dealId: activeDealId, stageId: destinationStageId }).catch(() => {
          setLocalColumns(null);
        });
        return;
      }

      setLocalColumns(null);
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
      <div className="flex gap-4 overflow-x-auto px-1 pb-4">
        {displayColumns.map((column) => (
          <StageColumn
            key={column.stage._id}
            stageId={column.stage._id}
            stageName={column.stage.name}
            deals={column.deals}
            onDealClick={onDealClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeCard ? (
          <div className="rotate-[2deg] opacity-90">
            <DealCard deal={activeCard.deal} stageName={activeCard.stageName} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
