import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Id } from '../../../convex/_generated/dataModel';
import { getStageColors } from '@/lib/stage-colors';
import { cn } from '@/lib/utils';
import { DealCard } from './deal-card';
import type { DealCardData } from './deal-card';

type StageColumnProps = {
  stageId: Id<'pipelineStages'>;
  stageName: string;
  deals: DealCardData[];
  onDealClick: (dealId: Id<'deals'>) => void;
};

export function StageColumn({ stageId, stageName, deals, onDealClick }: StageColumnProps) {
  const colors = getStageColors(stageName);
  const { setNodeRef, isOver } = useDroppable({ id: stageId });

  const totalValue = deals.reduce((sum, deal) => sum + (deal.value ?? 0), 0);
  const dealIds = deals.map((deal) => deal._id);

  return (
    <div
      className={cn(
        'flex w-[280px] min-w-[280px] flex-col rounded-lg border border-border/80 border-t-[3px] bg-card/95 shadow-sm backdrop-blur',
        colors.border,
        isOver && 'ring-2 ring-orange-400/60 ring-offset-1 ring-offset-background',
      )}
    >
      <div className="border-b border-border/70 px-3 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{stageName}</h3>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', colors.badge)}>{deals.length}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {totalValue > 0 ? `$${totalValue.toLocaleString()}` : 'No value'}
        </p>
      </div>

      <div ref={setNodeRef} className="min-h-[120px] flex-1 space-y-2 overflow-y-auto p-2">
        <SortableContext items={dealIds} strategy={verticalListSortingStrategy}>
          {deals.map((deal) => (
            <DealCard key={deal._id} deal={deal} stageName={stageName} onClick={onDealClick} />
          ))}
        </SortableContext>
        {deals.length === 0 && (
          <div className="flex h-full min-h-[80px] items-center justify-center rounded-md border-2 border-dashed border-border/70 bg-muted/20">
            <p className="text-xs text-muted-foreground">Drag a deal here</p>
          </div>
        )}
      </div>
    </div>
  );
}
