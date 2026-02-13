// src/routes/_authenticated/deals.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CompanyDetailModal } from '@/components/crm/company-detail-modal';
import { ContactDetailModal } from '@/components/crm/contact-detail-modal';
import { DealDetailModal } from '@/components/crm/deal-detail-modal';
import { useModalTransition } from '@/hooks/use-modal-transition';

export const Route = createFileRoute('/_authenticated/deals')({
  component: DealsPage,
});

type StatusFilter = 'all' | 'open' | 'won' | 'lost';
type SortOption = 'created-desc' | 'created-asc' | 'value-desc' | 'value-asc' | 'close-date-asc' | 'close-date-desc';
type ActiveModal =
  | { type: 'deal'; id: Id<'deals'> }
  | { type: 'contact'; id: Id<'contacts'> }
  | { type: 'company'; id: Id<'companies'> }
  | null;

function DealsPage() {
  const ensureDefaultPipeline = useMutation(api.crm.pipelines.ensureDefaultPipeline);
  const createDeal = useMutation(api.crm.deals.createDeal);

  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine'>('mine');
  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const stages = useQuery(
    api.crm.pipelines.listStagesByPipeline,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );
  const deals = useQuery(api.crm.deals.listDeals, { ownerFilter });

  // Form state
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [stageId, setStageId] = useState('');
  const { activeModal, openModal, closeModal } = useModalTransition<ActiveModal>();

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('created-desc');

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

  // Client-side filtering and sorting
  const filteredDeals = useMemo(() => {
    if (!deals) return [];

    let result = [...deals];

    // Search filter: match title
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((d) => d.title.toLowerCase().includes(q));
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((d) => d.status === statusFilter);
    }

    // Stage filter
    if (stageFilter !== 'all') {
      result = result.filter((d) => d.stageId === stageFilter);
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'created-desc':
          return b.createdAt - a.createdAt;
        case 'created-asc':
          return a.createdAt - b.createdAt;
        case 'value-desc':
          return (b.value ?? 0) - (a.value ?? 0);
        case 'value-asc':
          return (a.value ?? 0) - (b.value ?? 0);
        case 'close-date-asc':
          return (a.expectedCloseDate ?? Number.MAX_SAFE_INTEGER) - (b.expectedCloseDate ?? Number.MAX_SAFE_INTEGER);
        case 'close-date-desc':
          return (b.expectedCloseDate ?? 0) - (a.expectedCloseDate ?? 0);
        default:
          return 0;
      }
    });

    return result;
  }, [deals, searchQuery, statusFilter, stageFilter, sortBy]);

  const hasActiveFilters = searchQuery.trim().length > 0 || statusFilter !== 'all' || stageFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setStageFilter('all');
    setSortBy('created-desc');
    setOwnerFilter('mine');
  };

  const selectedDealId = activeModal?.type === 'deal' ? activeModal.id : null;
  const selectedContactId = activeModal?.type === 'contact' ? activeModal.id : null;
  const selectedCompanyId = activeModal?.type === 'company' ? activeModal.id : null;

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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{ownerFilter === 'mine' ? 'My deals' : 'All deals'}</CardTitle>
              <CardDescription>
                {filteredDeals.length}
                {hasActiveFilters ? ` of ${deals.length}` : ''} deals
              </CardDescription>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-4 w-4" />
                Clear filters
              </Button>
            )}
          </div>
          {/* Filter bar */}
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap sm:items-center">
            <ToggleGroup
              type="single"
              value={ownerFilter}
              onValueChange={(v) => { if (v) setOwnerFilter(v as 'all' | 'mine'); }}
              className="shrink-0"
            >
              <ToggleGroupItem value="mine" aria-label="My deals" className="text-xs px-3">
                Mine
              </ToggleGroupItem>
              <ToggleGroupItem value="all" aria-label="All deals" className="text-xs px-3">
                All
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search deals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {/* Status toggle */}
            <div className="flex gap-1 rounded-md border p-1">
              {(['all', 'open', 'won', 'lost'] as const).map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2.5 text-xs capitalize"
                  onClick={() => setStatusFilter(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {stages.map((stage: { _id: Id<'pipelineStages'>; name: string }) => (
                  <SelectItem key={stage._id} value={stage._id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created-desc">Newest first</SelectItem>
                <SelectItem value="created-asc">Oldest first</SelectItem>
                <SelectItem value="value-desc">Highest value</SelectItem>
                <SelectItem value="value-asc">Lowest value</SelectItem>
                <SelectItem value="close-date-asc">Close date (soonest)</SelectItem>
                <SelectItem value="close-date-desc">Close date (latest)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {deals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deals yet. Create your first one above.</p>
          ) : filteredDeals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deals match your filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Close Date</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeals.map((deal) => {
                  const stage = stages.find((s: { _id: Id<'pipelineStages'> }) => s._id === deal.stageId);
                  return (
                    <TableRow
                      key={deal._id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openModal({ type: 'deal', id: deal._id })}
                    >
                      <TableCell className="font-medium">{deal.title}</TableCell>
                      <TableCell>{deal.value != null ? `$${deal.value.toLocaleString()}` : '—'}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'
                          }
                        >
                          {deal.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{stage?.name ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(deal.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DealDetailModal
        dealId={selectedDealId}
        onClose={closeModal}
        stages={stages ?? []}
        onOpenContact={(contactId) => openModal({ type: 'contact', id: contactId })}
        onOpenCompany={(companyId) => openModal({ type: 'company', id: companyId })}
      />
      <ContactDetailModal
        contactId={selectedContactId}
        onClose={closeModal}
        onOpenDeal={(dealId) => openModal({ type: 'deal', id: dealId })}
        onOpenCompany={(companyId) => openModal({ type: 'company', id: companyId })}
      />
      <CompanyDetailModal
        companyId={selectedCompanyId}
        onClose={closeModal}
        onOpenDeal={(dealId) => openModal({ type: 'deal', id: dealId })}
        onOpenContact={(contactId) => openModal({ type: 'contact', id: contactId })}
      />
    </div>
  );
}
