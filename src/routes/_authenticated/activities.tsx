import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/_authenticated/activities')({
  component: ActivitiesPage,
});

function ActivitiesPage() {
  const activities = useQuery(api.crm.activities.listOrgActivities);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activities</h1>
        <p className="text-muted-foreground">Recent timeline events across your CRM workspace.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>{activities?.length ?? 0} entries</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {activities === undefined || activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            activities.map(
              (activity: { _id: string; title: string; type: string; body?: string; createdAt: number }) => (
                <div key={activity._id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{activity.title}</p>
                    <Badge variant="secondary">{activity.type}</Badge>
                  </div>
                  {activity.body && <p className="mt-2 text-sm text-muted-foreground">{activity.body}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</p>
                </div>
              ),
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
