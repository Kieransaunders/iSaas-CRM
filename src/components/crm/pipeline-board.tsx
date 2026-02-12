import { DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [activeDealId, setActiveDealId] = useState<Id<'deals'> | null>(null);
  const [dragSourceStageId, setDragSourceStageId] = useState<Id<'pipelineStages'> | null>(null);
  const [dragDestinationStageId, setDragDestinationStageId] = useState<Id<'pipelineStages'> | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    dealId: Id<'deals'>;
    destinationStageId: Id<'pipelineStages'>;
  } | null>(null);
  const isCommittingMoveRef = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!pendingMove) return;

    const currentStageId =
      columns.find((column) => column.deals.some((deal) => deal._id === pendingMove.dealId))?.stage._id ?? null;

    if (currentStageId === pendingMove.destinationStageId) {
      isCommittingMoveRef.current = false;
      setPendingMove(null);
    }
  }, [pendingMove, columns]);

  const setDragDestinationIfChanged = useCallback((next: Id<'pipelineStages'> | null) => {
    setDragDestinationStageId((previous) => (previous === next ? previous : next));
  }, []);

  const moveDealBetweenStages = useCallback(
    (columnState: Column[], dealId: Id<'deals'>, destinationStageId: Id<'pipelineStages'>) => {
      const sourceColumnIndex = columnState.findIndex((column) => column.deals.some((deal) => deal._id === dealId));
      const destinationColumnIndex = columnState.findIndex((column) => column.stage._id === destinationStageId);

      if (sourceColumnIndex === -1 || destinationColumnIndex === -1 || sourceColumnIndex === destinationColumnIndex) {
        return columnState;
      }

      const next = columnState.map((column) => ({ ...column, deals: [...column.deals] }));
      const movingDealIndex = next[sourceColumnIndex].deals.findIndex((deal) => deal._id === dealId);
      if (movingDealIndex === -1) return columnState;

      const [movedDeal] = next[sourceColumnIndex].deals.splice(movingDealIndex, 1);
      next[destinationColumnIndex].deals.push({ ...movedDeal, stageId: destinationStageId });
      return next;
    },
    [],
  );

  const findStageForDropTarget = useCallback((targetId: string, columnState: Column[]) => {
    const stageMatch = columnState.find((column) => column.stage._id === targetId);
    if (stageMatch) {
      return stageMatch.stage._id;
    }
    const dealMatch = columnState.find((column) => column.deals.some((deal) => deal._id === targetId));
    return dealMatch?.stage._id ?? null;
  }, []);

  const displayColumns = useMemo(() => {
    if (pendingMove) {
      return moveDealBetweenStages(columns, pendingMove.dealId, pendingMove.destinationStageId);
    }
    return columns;
  }, [columns, pendingMove, moveDealBetweenStages]);

  const findDealAndStage = useCallback(
    (dealId: string) => {
      for (const column of columns) {
        const deal = column.deals.find((item) => item._id === dealId);
        if (deal) {
          return { deal, stageName: column.stage.name };
        }
      }
      return null;
    },
    [columns],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const result = findDealAndStage(event.active.id as string);
      if (!result) return;
      setActiveCard(result);
      setActiveDealId(result.deal._id);
      setDragSourceStageId(result.deal.stageId);
      setDragDestinationIfChanged(null);
    },
    [findDealAndStage, setDragDestinationIfChanged],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const draggingDealId = active.id as Id<'deals'>;
      const overId = String(over.id);
      const overContainerId = over.data.current?.sortable?.containerId
        ? String(over.data.current.sortable.containerId)
        : null;

      const destinationStageId = findStageForDropTarget(overContainerId ?? overId, columns);
      const sourceStageId =
        dragSourceStageId ??
        columns.find((column) => column.deals.some((deal) => deal._id === draggingDealId))?.stage._id ??
        null;

      if (!destinationStageId || !sourceStageId || destinationStageId === sourceStageId) {
        setDragDestinationIfChanged(null);
        return;
      }

      setDragDestinationIfChanged(destinationStageId);
    },
    [columns, dragSourceStageId, findStageForDropTarget, setDragDestinationIfChanged],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveCard(null);
      setActiveDealId(null);

      if (isCommittingMoveRef.current) {
        return;
      }

      if (!over) {
        setDragDestinationIfChanged(null);
        setDragSourceStageId(null);
        return;
      }

      const activeDealId = active.id as Id<'deals'>;
      const overId = String(over.id);
      const overContainerId = over.data.current?.sortable?.containerId
        ? String(over.data.current.sortable.containerId)
        : null;

      const destinationStageId = findStageForDropTarget(overContainerId ?? overId, columns);
      const effectiveDestinationStageId = destinationStageId ?? dragDestinationStageId;
      const sourceStageId =
        dragSourceStageId ??
        columns.find((column) => column.deals.some((deal) => deal._id === activeDealId))?.stage._id ??
        null;

      if (effectiveDestinationStageId && effectiveDestinationStageId !== sourceStageId) {
        setPendingMove({
          dealId: activeDealId,
          destinationStageId: effectiveDestinationStageId,
        });
        isCommittingMoveRef.current = true;
        moveDeal({ dealId: activeDealId, stageId: effectiveDestinationStageId }).catch((error) => {
          console.error('Failed to move deal between stages:', error);
          isCommittingMoveRef.current = false;
          setPendingMove(null);
          setDragSourceStageId(null);
          setDragDestinationIfChanged(null);
        });
        setDragSourceStageId(null);
        setDragDestinationIfChanged(null);
        return;
      }

      if (!effectiveDestinationStageId) {
        console.error('Failed to resolve destination stage for drop target:', {
          overId,
          overContainerId,
        });
      }

      setDragSourceStageId(null);
      setDragDestinationIfChanged(null);
    },
    [columns, dragSourceStageId, dragDestinationStageId, moveDeal, findStageForDropTarget, setDragDestinationIfChanged],
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
