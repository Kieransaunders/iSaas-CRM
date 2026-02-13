// src/routes/_authenticated/companies.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { FormEvent } from 'react';
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

const INDUSTRIES = ['Technology', 'Healthcare', 'Finance', 'Retail', 'Manufacturing', 'Services', 'Other'];

export const Route = createFileRoute('/_authenticated/companies')({
  component: CompaniesPage,
});

type SortOption = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc';
type ActiveModal =
  | { type: 'deal'; id: Id<'deals'> }
  | { type: 'contact'; id: Id<'contacts'> }
  | { type: 'company'; id: Id<'companies'> }
  | null;

function CompaniesPage() {
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine'>('mine');
  const companies = useQuery(api.crm.companies.listCompanies, { ownerFilter });
  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const stages = useQuery(
    api.crm.pipelines.listStagesByPipeline,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );
  const createCompany = useMutation(api.crm.companies.createCompany);

  // Form state
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const { activeModal, openModal, closeModal } = useModalTransition<ActiveModal>();

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('created-desc');

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;

    await createCompany({
      name: name.trim(),
      website: website.trim() || undefined,
    });

    setName('');
    setWebsite('');
  };

  // Client-side filtering and sorting
  const filteredCompanies = useMemo(() => {
    if (!companies) return [];

    let result = [...companies];

    // Search filter: match name
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }

    // Industry filter
    if (industryFilter !== 'all') {
      if (industryFilter === 'none') {
        result = result.filter((c) => !c.industry);
      } else {
        result = result.filter((c) => c.industry === industryFilter);
      }
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        case 'name-desc':
          return b.name.toLowerCase().localeCompare(a.name.toLowerCase());
        case 'created-desc':
          return b.createdAt - a.createdAt;
        case 'created-asc':
          return a.createdAt - b.createdAt;
        default:
          return 0;
      }
    });

    return result;
  }, [companies, searchQuery, industryFilter, sortBy]);

  const hasActiveFilters = searchQuery.trim().length > 0 || industryFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setIndustryFilter('all');
    setSortBy('created-desc');
    setOwnerFilter('mine');
  };

  const selectedDealId = activeModal?.type === 'deal' ? activeModal.id : null;
  const selectedContactId = activeModal?.type === 'contact' ? activeModal.id : null;
  const selectedCompanyId = activeModal?.type === 'company' ? activeModal.id : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
        <p className="text-muted-foreground">Manage account companies for your CRM workspace.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New company</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="company-name">Name</Label>
              <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-website">Website</Label>
              <Input
                id="company-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={!name.trim()}>
                Create company
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{ownerFilter === 'mine' ? 'My companies' : 'All companies'}</CardTitle>
              <CardDescription>
                {filteredCompanies.length}
                {hasActiveFilters ? ` of ${companies?.length ?? 0}` : ''} companies
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
              <ToggleGroupItem value="mine" aria-label="My companies" className="text-xs px-3">
                Mine
              </ToggleGroupItem>
              <ToggleGroupItem value="all" aria-label="All companies" className="text-xs px-3">
                All
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All industries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All industries</SelectItem>
                <SelectItem value="none">No industry</SelectItem>
                {INDUSTRIES.map((industry) => (
                  <SelectItem key={industry} value={industry}>
                    {industry}
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
                <SelectItem value="name-asc">Name A-Z</SelectItem>
                <SelectItem value="name-desc">Name Z-A</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!companies || companies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No companies yet.</p>
          ) : filteredCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No companies match your filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((company) => (
                  <TableRow
                    key={company._id}
                    className="cursor-pointer"
                    onClick={() => openModal({ type: 'company', id: company._id })}
                  >
                    <TableCell className="font-medium">{company.name}</TableCell>
                    <TableCell>
                      {company.website ? <span className="text-muted-foreground">{company.website}</span> : '—'}
                    </TableCell>
                    <TableCell>{company.industry ?? '—'}</TableCell>
                    <TableCell>{company.phone ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(company.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CompanyDetailModal
        companyId={selectedCompanyId}
        onClose={closeModal}
        onOpenDeal={(dealId) => openModal({ type: 'deal', id: dealId })}
        onOpenContact={(contactId) => openModal({ type: 'contact', id: contactId })}
      />
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
    </div>
  );
}
