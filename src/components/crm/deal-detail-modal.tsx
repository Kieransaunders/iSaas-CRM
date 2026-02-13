import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Calendar, DollarSign, Loader2, Plus, Trash2 } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
import { Textarea } from '@/components/ui/textarea';
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

  const moveDeal = useMutation(api.crm.pipelines.moveDealToStage);
  const createActivity = useMutation(api.crm.activities.createActivity);
  const updateDeal = useMutation(api.crm.deals.updateDeal);
  const deleteDeal = useMutation(api.crm.deals.deleteDeal);

  const [activityTitle, setActivityTitle] = useState('');
  const [activityType, setActivityType] = useState<'note' | 'call' | 'email' | 'meeting' | 'task'>('note');

  const [isEditing, setIsEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    title: '',
    value: '',
    currency: '',
    expectedCloseDate: '',
    notes: '',
    status: '' as 'open' | 'won' | 'lost',
  });

  if (!dealId) return null;

  const currentStage = stages.find((stage) => stage._id === deal?.stageId);
  const stageColors = currentStage ? getStageColors(currentStage.name) : null;

  const startEditing = () => {
    if (!deal) return;
    setEditFields({
      title: deal.title ?? '',
      value: deal.value != null ? String(deal.value) : '',
      currency: deal.currency ?? 'USD',
      expectedCloseDate: deal.expectedCloseDate
        ? new Date(deal.expectedCloseDate).toISOString().split('T')[0]
        : '',
      notes: deal.notes ?? '',
      status: deal.status ?? 'open',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!deal) return;

    const updates: Record<string, unknown> = { dealId };

    if (editFields.title !== deal.title) {
      updates.title = editFields.title;
    }

    const numericValue = editFields.value ? Number(editFields.value) : undefined;
    if (numericValue !== deal.value) {
      if (numericValue !== undefined) updates.value = numericValue;
    }

    if (editFields.currency !== (deal.currency ?? 'USD')) {
      updates.currency = editFields.currency;
    }

    if (editFields.status !== deal.status) {
      updates.status = editFields.status;
    }

    const newCloseDate = editFields.expectedCloseDate
      ? new Date(editFields.expectedCloseDate).getTime()
      : undefined;
    if (newCloseDate !== deal.expectedCloseDate) {
      if (newCloseDate !== undefined) updates.expectedCloseDate = newCloseDate;
    }

    if (editFields.notes !== (deal.notes ?? '')) {
      updates.notes = editFields.notes;
    }

    // Only call mutation if something actually changed
    if (Object.keys(updates).length > 1) {
      await updateDeal(updates as Parameters<typeof updateDeal>[0]);
    }

    setIsEditing(false);
  };

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

  const handleDelete = async () => {
    await deleteDeal({ dealId });
    onClose();
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
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete deal</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete &quot;{deal.title}&quot;? This will also remove all
                        associated activities, contact links, and company links. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
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
                <TabsTrigger value="company">Company</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4 space-y-4">
                {/* Stage selector always available */}
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
                </div>

                {isEditing ? (
                  /* ---- Edit mode ---- */
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-title">Title</Label>
                      <Input
                        id="edit-title"
                        value={editFields.title}
                        onChange={(e) => setEditFields({ ...editFields, title: e.target.value })}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="edit-value">Value</Label>
                        <Input
                          id="edit-value"
                          type="number"
                          value={editFields.value}
                          onChange={(e) => setEditFields({ ...editFields, value: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-currency">Currency</Label>
                        <Input
                          id="edit-currency"
                          value={editFields.currency}
                          onChange={(e) => setEditFields({ ...editFields, currency: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="edit-close-date">Expected Close Date</Label>
                        <Input
                          id="edit-close-date"
                          type="date"
                          value={editFields.expectedCloseDate}
                          onChange={(e) => setEditFields({ ...editFields, expectedCloseDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-status">Status</Label>
                        <Select
                          value={editFields.status}
                          onValueChange={(value) => setEditFields({ ...editFields, status: value as 'open' | 'won' | 'lost' })}
                        >
                          <SelectTrigger id="edit-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="won">Won</SelectItem>
                            <SelectItem value="lost">Lost</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-notes">Notes</Label>
                      <Textarea
                        id="edit-notes"
                        value={editFields.notes}
                        onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })}
                        rows={4}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleSave} className="bg-orange-500 text-white hover:bg-orange-600">
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setIsEditing(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ---- Read-only mode ---- */
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Value</Label>
                        <p className="py-2 text-sm font-medium">
                          {deal.value ? `$${deal.value.toLocaleString()} ${deal.currency ?? 'USD'}` : '—'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Expected Close Date</Label>
                        <p className="py-2 text-sm font-medium">
                          {deal.expectedCloseDate
                            ? new Date(deal.expectedCloseDate).toLocaleDateString()
                            : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Status</Label>
                      <div className="py-2">
                        <Badge
                          variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}
                        >
                          {deal.status}
                        </Badge>
                      </div>
                    </div>

                    {deal.notes ? (
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <p className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                          {deal.notes}
                        </p>
                      </div>
                    ) : null}

                    <Button variant="outline" onClick={startEditing}>
                      Edit
                    </Button>
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
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No contacts linked yet. Contact linking will be available in Phase 2.
                </p>
              </TabsContent>

              <TabsContent value="company" className="mt-4">
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No companies linked yet. Company linking will be available in Phase 2.
                </p>
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
