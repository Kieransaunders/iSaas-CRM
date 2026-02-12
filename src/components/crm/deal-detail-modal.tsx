import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Calendar, DollarSign, Loader2, Plus } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getStageColors } from '@/lib/stage-colors';
import { cn } from '@/lib/utils';
import { ActivityTimeline } from './activity-timeline';

type DealDetailModalProps = {
  dealId: Id<'deals'> | null;
  onClose: () => void;
  stages: Array<{ _id: Id<'pipelineStages'>; name: string }>;
};

export function DealDetailModal({ dealId, onClose, stages }: DealDetailModalProps) {
  const deal = useQuery(api.crm.deals.getDeal, dealId ? { dealId } : 'skip');
  const activities = useQuery(api.crm.activities.listDealActivities, dealId ? { dealId } : 'skip');
  const contacts = useQuery(api.crm.contacts.listContacts);

  const moveDeal = useMutation(api.crm.pipelines.moveDealToStage);
  const createActivity = useMutation(api.crm.activities.createActivity);

  const [activityTitle, setActivityTitle] = useState('');
  const [activityType, setActivityType] = useState<'note' | 'call' | 'email' | 'meeting' | 'task'>('note');

  if (!dealId) return null;

  const currentStage = stages.find((stage) => stage._id === deal?.stageId);
  const stageColors = currentStage ? getStageColors(currentStage.name) : null;

  const handleStageChange = async (newStageId: string) => {
    if (!deal || newStageId === deal.stageId) return;
    await moveDeal({ dealId, stageId: newStageId as Id<'pipelineStages'> });
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {!deal ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-xl">{deal.title}</DialogTitle>
                {currentStage && stageColors ? (
                  <Badge className={cn('text-xs', stageColors.badge)}>{currentStage.name}</Badge>
                ) : null}
                <Badge
                  variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}
                >
                  {deal.status}
                </Badge>
              </div>
              <DialogDescription>
                <span className="mt-2 flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    {deal.value ? `$${deal.value.toLocaleString()}` : 'No value'}
                  </span>
                  {deal.expectedCloseDate ? (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(deal.expectedCloseDate).toLocaleDateString()}
                    </span>
                  ) : null}
                </span>
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="info" className="mt-4">
              <TabsList>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4 space-y-4">
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
                    <p className="py-2 text-sm font-medium">
                      {deal.value ? `$${deal.value.toLocaleString()} ${deal.currency ?? 'USD'}` : '—'}
                    </p>
                  </div>
                </div>

                {deal.notes ? (
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">{deal.notes}</p>
                  </div>
                ) : null}
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
                {contacts === undefined ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : contacts.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">No contacts found.</p>
                ) : (
                  <div className="space-y-2">
                    {contacts.slice(0, 5).map((contact) => (
                      <div key={contact._id} className="rounded-md border border-slate-200 p-2 text-sm">
                        {contact.firstName}
                        {contact.lastName ? ` ${contact.lastName}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-4">
              <div className="flex w-full items-center gap-2">
                <Select value={activityType} onValueChange={(value) => setActivityType(value as typeof activityType)}>
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
                  onChange={(event) => setActivityTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleLogActivity();
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleLogActivity}
                  disabled={!activityTitle.trim()}
                  className="bg-orange-500 text-white hover:bg-orange-600"
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
