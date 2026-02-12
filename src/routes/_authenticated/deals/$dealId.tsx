import { createFileRoute, useParams } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/_authenticated/deals/$dealId')({
  component: DealDetailPage,
});

function DealDetailPage() {
  const { dealId } = useParams({ from: '/_authenticated/deals/$dealId' });
  const typedDealId = dealId as Id<'deals'>;
  const deal = useQuery(api.crm.deals.getDeal, { dealId: typedDealId });
  const activities = useQuery(api.crm.activities.listDealActivities, { dealId: typedDealId });
  const stages = useQuery(api.crm.pipelines.listStagesByPipeline, deal ? { pipelineId: deal.pipelineId } : 'skip');

  const moveDealToStage = useMutation(api.crm.pipelines.moveDealToStage);
  const createActivity = useMutation(api.crm.activities.createActivity);

  const [activityType, setActivityType] = useState<'note' | 'call' | 'email' | 'meeting' | 'task'>('note');
  const [activityTitle, setActivityTitle] = useState('');
  const [activityBody, setActivityBody] = useState('');

  const handleActivitySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activityTitle.trim()) return;

    await createActivity({
      dealId: typedDealId,
      type: activityType,
      title: activityTitle.trim(),
      body: activityBody.trim() || undefined,
    });

    setActivityTitle('');
    setActivityBody('');
  };

  if (deal === undefined || activities === undefined || stages === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{deal.title}</h1>
          <p className="text-muted-foreground">Deal detail and activity timeline.</p>
        </div>
        <Badge>{deal.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deal overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Value</p>
            <p className="font-medium">{deal.value ? `$${deal.value.toLocaleString()}` : 'No value'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Stage</p>
            <Select
              value={deal.stageId}
              onValueChange={(nextStageId) => {
                moveDealToStage({ dealId: deal._id, stageId: nextStageId as Id<'pipelineStages'> }).catch((error) => {
                  console.error('Failed to move deal:', error);
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage: { _id: Id<'pipelineStages'>; name: string }) => (
                  <SelectItem key={stage._id} value={stage._id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Expected close</p>
            <p className="font-medium">
              {deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString() : 'Not set'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add activity</CardTitle>
            <CardDescription>Log calls, notes, meetings, and tasks for this deal.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleActivitySubmit}>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={activityType} onValueChange={(value) => setActivityType(value as typeof activityType)}>
                  <SelectTrigger>
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="activity-title">Title</Label>
                <Input
                  id="activity-title"
                  value={activityTitle}
                  onChange={(e) => setActivityTitle(e.target.value)}
                  placeholder="Sent proposal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="activity-body">Details</Label>
                <Textarea
                  id="activity-body"
                  value={activityBody}
                  onChange={(e) => setActivityBody(e.target.value)}
                  rows={4}
                  placeholder="Summary of conversation..."
                />
              </div>
              <Button type="submit" disabled={!activityTitle.trim()}>
                <Plus className="mr-2 h-4 w-4" />
                Add activity
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity timeline</CardTitle>
            <CardDescription>{activities.length} entries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activities yet.</p>
            ) : (
              activities.map(
                (activity: { _id: string; title: string; type: string; body?: string; createdAt: number }) => (
                  <div key={activity._id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{activity.title}</p>
                      <Badge variant="secondary">{activity.type}</Badge>
                    </div>
                    {activity.body && <p className="mt-2 text-sm text-muted-foreground">{activity.body}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(activity.createdAt).toLocaleString()}
                    </p>
                  </div>
                ),
              )
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
