import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { Loader2, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DealDetailModal } from '@/components/crm/deal-detail-modal';

export const Route = createFileRoute('/_authenticated/deals')({
  component: DealsPage,
});

function DealsPage() {
  const ensureDefaultPipeline = useMutation(api.crm.pipelines.ensureDefaultPipeline);
  const createDeal = useMutation(api.crm.deals.createDeal);

  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const stages = useQuery(
    api.crm.pipelines.listStagesByPipeline,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );
  const deals = useQuery(api.crm.deals.listDeals);

  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [stageId, setStageId] = useState('');
  const [selectedDealId, setSelectedDealId] = useState<Id<'deals'> | null>(null);

  useEffect(() => {
    if (defaultPipeline === null) {
      ensureDefaultPipeline().catch((error) => {
        console.error('Failed to create default pipeline:', error);
      });
    }
  }, [defaultPipeline, ensureDefaultPipeline]);

  const canSubmit = useMemo(
    () => title.trim().length > 0 && stageId.length > 0 && !!defaultPipeline,
    [title, stageId, defaultPipeline],
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!defaultPipeline || !canSubmit) return;

    await createDeal({
      pipelineId: defaultPipeline._id,
      stageId: stageId as Id<'pipelineStages'>,
      title: title.trim(),
      value: value ? Number(value) : undefined,
      currency: 'USD',
    });

    setTitle('');
    setValue('');
  };

  if (defaultPipeline === undefined || deals === undefined || stages === undefined) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Deals</h1>
        <p className="text-muted-foreground">Create and manage opportunities in your CRM.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New deal</CardTitle>
          <CardDescription>Add a deal to the current pipeline.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="deal-title">Title</Label>
              <Input
                id="deal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Website redesign"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deal-value">Value (USD)</Label>
              <Input
                id="deal-value"
                type="number"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="12000"
              />
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
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
            <div className="md:col-span-3">
              <Button type="submit" disabled={!canSubmit}>
                <Plus className="mr-2 h-4 w-4" />
                Create deal
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All deals</CardTitle>
          <CardDescription>{deals.length} deals in this workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {deals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deals yet. Create your first one above.</p>
          ) : (
            deals.map((deal: { _id: Id<'deals'>; title: string; value?: number }) => (
              <button
                key={deal._id}
                type="button"
                onClick={() => setSelectedDealId(deal._id)}
                className="flex w-full items-center justify-between rounded-md border p-3 text-left hover:bg-muted"
              >
                <span className="font-medium">{deal.title}</span>
                <span className="text-muted-foreground text-sm">
                  {deal.value ? `$${deal.value.toLocaleString()}` : 'No value'}
                </span>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <DealDetailModal dealId={selectedDealId} onClose={() => setSelectedDealId(null)} stages={stages ?? []} />
    </div>
  );
}
