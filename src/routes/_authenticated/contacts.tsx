// src/routes/_authenticated/contacts.tsx
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

export const Route = createFileRoute('/_authenticated/contacts')({
  component: ContactsPage,
});

type SortOption = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc';
type ActiveModal =
  | { type: 'deal'; id: Id<'deals'> }
  | { type: 'contact'; id: Id<'contacts'> }
  | { type: 'company'; id: Id<'companies'> }
  | null;

function ContactsPage() {
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine'>('mine');
  const contacts = useQuery(api.crm.contacts.listContacts, { ownerFilter });
  const companies = useQuery(api.crm.companies.listCompanies, { ownerFilter });
  const defaultPipeline = useQuery(api.crm.pipelines.getDefaultPipeline);
  const stages = useQuery(
    api.crm.pipelines.listStagesByPipeline,
    defaultPipeline ? { pipelineId: defaultPipeline._id } : 'skip',
  );
  const createContact = useMutation(api.crm.contacts.createContact);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const { activeModal, openModal, closeModal } = useModalTransition<ActiveModal>();

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('created-desc');

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!firstName.trim()) return;

    await createContact({
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      email: email.trim() || undefined,
    });

    setFirstName('');
    setLastName('');
    setEmail('');
  };

  // Client-side filtering and sorting
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];

    let result = [...contacts];

    // Search filter: match name or email
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((c) => {
        const fullName = `${c.firstName} ${c.lastName ?? ''}`.toLowerCase();
        return fullName.includes(q) || (c.email?.toLowerCase().includes(q) ?? false);
      });
    }

    // Company filter
    if (companyFilter !== 'all') {
      if (companyFilter === 'none') {
        result = result.filter((c) => !c.companyId);
      } else {
        result = result.filter((c) => c.companyId === companyFilter);
      }
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name-asc': {
          const nameA = `${a.firstName} ${a.lastName ?? ''}`.toLowerCase();
          const nameB = `${b.firstName} ${b.lastName ?? ''}`.toLowerCase();
          return nameA.localeCompare(nameB);
        }
        case 'name-desc': {
          const nameA = `${a.firstName} ${a.lastName ?? ''}`.toLowerCase();
          const nameB = `${b.firstName} ${b.lastName ?? ''}`.toLowerCase();
          return nameB.localeCompare(nameA);
        }
        case 'created-desc':
          return b.createdAt - a.createdAt;
        case 'created-asc':
          return a.createdAt - b.createdAt;
        default:
          return 0;
      }
    });

    return result;
  }, [contacts, searchQuery, companyFilter, sortBy]);

  const hasActiveFilters = searchQuery.trim().length > 0 || companyFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setCompanyFilter('all');
    setSortBy('created-desc');
    setOwnerFilter('mine');
  };

  const selectedDealId = activeModal?.type === 'deal' ? activeModal.id : null;
  const selectedContactId = activeModal?.type === 'contact' ? activeModal.id : null;
  const selectedCompanyId = activeModal?.type === 'company' ? activeModal.id : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
        <p className="text-muted-foreground">People linked to your deals and companies.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New contact</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="first-name">First name</Label>
              <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last name</Label>
              <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={!firstName.trim()}>
                Create contact
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{ownerFilter === 'mine' ? 'My contacts' : 'All contacts'}</CardTitle>
              <CardDescription>
                {filteredContacts.length}
                {hasActiveFilters ? ` of ${contacts?.length ?? 0}` : ''} contacts
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
              <ToggleGroupItem value="mine" aria-label="My contacts" className="text-xs px-3">
                Mine
              </ToggleGroupItem>
              <ToggleGroupItem value="all" aria-label="All contacts" className="text-xs px-3">
                All
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                <SelectItem value="none">No company</SelectItem>
                {companies?.map((company) => (
                  <SelectItem key={company._id} value={company._id}>
                    {company.name}
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
          {!contacts || contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts yet.</p>
          ) : filteredContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts match your filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts.map((contact) => (
                  <TableRow
                    key={contact._id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openModal({ type: 'contact', id: contact._id })}
                  >
                    <TableCell className="font-medium">
                      {contact.firstName}
                      {contact.lastName ? ` ${contact.lastName}` : ''}
                    </TableCell>
                    <TableCell>{contact.email ?? '—'}</TableCell>
                    <TableCell>{contact.phone ?? '—'}</TableCell>
                    <TableCell>
                      {contact.companyId ? (companies?.find((c) => c._id === contact.companyId)?.name ?? '—') : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(contact.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ContactDetailModal
        contactId={selectedContactId}
        onClose={closeModal}
        onOpenDeal={(dealId) => openModal({ type: 'deal', id: dealId })}
        onOpenCompany={(companyId) => openModal({ type: 'company', id: companyId })}
      />
      <DealDetailModal
        dealId={selectedDealId}
        onClose={closeModal}
        stages={stages ?? []}
        onOpenContact={(contactId) => openModal({ type: 'contact', id: contactId })}
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
