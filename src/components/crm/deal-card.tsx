import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { getStageColors } from '@/lib/stage-colors';
import { cn } from '@/lib/utils';

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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal._id,
    data: { deal },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative cursor-pointer rounded-md border bg-white p-3 shadow-sm transition-all',
        'hover:border-orange-200 hover:shadow-md',
        isDragging && 'z-50 rotate-[2deg] opacity-50 shadow-lg',
      )}
      onClick={() => onClick(deal._id)}
    >
      <div
        className="absolute bottom-0 left-0 top-0 flex cursor-grab items-center px-0.5 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-slate-300" />
      </div>
      <div className="pl-4">
        <p className="truncate text-sm font-medium text-slate-900">{deal.title}</p>
        <p className={cn('mt-0.5 text-sm font-semibold', colors.text)}>
          {deal.value ? `$${deal.value.toLocaleString()}` : '—'}
        </p>
        <p className="mt-1 truncate text-xs text-slate-400">{deal.contactName ?? 'No contact'}</p>
      </div>
    </div>
  );
}
