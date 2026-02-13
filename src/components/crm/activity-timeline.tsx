import { ArrowRightLeft, Calendar, CheckSquare, Mail, Phone, StickyNote } from 'lucide-react';
import type { ElementType } from 'react';
import type { Id } from '../../../convex/_generated/dataModel';
import { activityTypeColors } from '@/lib/stage-colors';
import { cn } from '@/lib/utils';

type Activity = {
  _id: Id<'activities'>;
  type: 'note' | 'call' | 'email' | 'meeting' | 'task' | 'status_change';
  title: string;
  body?: string;
  createdAt: number;
};

const activityIcons: Record<string, ElementType> = {
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
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
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
    return <p className="py-4 text-center text-sm text-muted-foreground">No activities yet.</p>;
  }

  return (
    <div className="relative space-y-6 pl-10">
      <div className="absolute bottom-2 left-4 top-2 w-0.5 bg-border" />

      {activities.map((activity) => {
        const Icon = activityIcons[activity.type] ?? StickyNote;
        const typeColors = activityTypeColors[activity.type] ?? activityTypeColors.note;

        return (
          <div key={activity._id} className="relative">
            <div
              className={cn(
                'absolute -left-10 flex h-8 w-8 items-center justify-center rounded-full shadow-lg',
                typeColors.bg,
                typeColors.shadow,
              )}
            >
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>

            <div>
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground">{activity.title}</h4>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatRelativeTime(activity.createdAt)}
                </span>
              </div>
              {activity.body ? (
                <div className="mt-2 rounded-md border border-border/70 bg-muted/25 p-2.5">
                  <p className="line-clamp-3 text-sm italic text-muted-foreground">{activity.body}</p>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
